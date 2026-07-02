'use strict';

// -----------------------------------------------
// CONFIG
// -----------------------------------------------
var API_BASE = '/api';

// -----------------------------------------------
// COLUNAS DO KANBAN
// -----------------------------------------------
var COLUMNS = [
  { key: 'prospeccao',   label: 'Prospecção',              color: '#64748B' },
  { key: 'contato',      label: 'Contato',                 color: '#6366F1' },
  { key: 'proposta',     label: 'Proposta',                color: '#3B82F6' },
  { key: 'fechado',      label: 'Fechado',                 color: '#10B981' },
  { key: 'diagnostico',  label: 'Diagnóstico',             color: '#F59E0B' },
  { key: 'estruturacao', label: 'Estruturação de Crédito', color: '#1B9C9C' },
  { key: 'consultoria',  label: 'Consultoria',             color: '#0D1B3E' },
];

var SVC = {
  diagnostico:   'DIAG',
  monitoramento: 'MON',
  planejamento:  'PLAN',
  estruturacao:  'CRED',
  ma:            'M&A',
  tributaria:    'TRIB',
};

// -----------------------------------------------
// ESTADO
// -----------------------------------------------
var allCards    = [];
var draggedId   = null;
var usingMock   = false;

// -----------------------------------------------
// INIT
// -----------------------------------------------
document.addEventListener('DOMContentLoaded', function() {
  loadCards();
});

// Fechar modal com Escape
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') closeModal();
});

// -----------------------------------------------
// CARREGAR CARDS
// -----------------------------------------------
function loadCards() {
  fetch(API_BASE + '/cards')
    .then(function(res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .then(function(data) {
      allCards = data;
      usingMock = false;
      setConn(true);
      renderBoard(getFiltered());
      updateKPIs(allCards);
      populateFilterResponsavel();
    })
    .catch(function(err) {
      console.warn('[Boutique] loadCards:', err.message);
      allCards = [];
      usingMock = false;
      setConn(false);
      renderBoard([]);
      updateKPIs([]);
    });
}

// -----------------------------------------------
// CONEXÃO
// -----------------------------------------------
function setConn(online) {
  var dot   = document.getElementById('connDot');
  var label = document.getElementById('connLabel');
  dot.className    = 'conn-dot ' + (online ? 'online' : 'offline');
  label.textContent = online ? 'API Online' : 'Offline';
}

// -----------------------------------------------
// FILTROS
// -----------------------------------------------
function populateFilterResponsavel() {
  // opcional — não há filtro de responsável por ora
}

function getFiltered() {
  var q   = document.getElementById('filterBusca').value.trim().toLowerCase();
  var seg = document.getElementById('filterSeg').value;
  return allCards.filter(function(c) {
    if (q   && c.franqueadora.toLowerCase().indexOf(q) === -1) return false;
    if (seg && c.segmento !== seg) return false;
    return true;
  });
}

function applyFilters() {
  renderBoard(getFiltered());
  updateKPIs(allCards);
}

// -----------------------------------------------
// KPIs
// -----------------------------------------------
function updateKPIs(cards) {
  var total    = cards.length;
  var pipeline = cards.reduce(function(s, c) { return s + (Number(c.valorCredito) || 0); }, 0);
  var proposta = cards.filter(function(c) { return c.coluna === 'proposta'; })
                      .reduce(function(s, c) { return s + (Number(c.valorCredito) || 0); }, 0);
  var fechado  = cards.filter(function(c) { return c.coluna === 'fechado'; })
                      .reduce(function(s, c) { return s + (Number(c.valorCredito) || 0); }, 0);
  document.getElementById('kpiTotal').textContent    = total;
  document.getElementById('kpiPipeline').textContent = fmtBRL(pipeline);
  document.getElementById('kpiProposta').textContent = fmtBRL(proposta);
  document.getElementById('kpiFechado').textContent  = fmtBRL(fechado);
}

// -----------------------------------------------
// RENDER BOARD
// -----------------------------------------------
function renderBoard(cards) {
  var board = document.getElementById('board');
  board.innerHTML = '';
  COLUMNS.forEach(function(col) {
    var colCards = cards
      .filter(function(c) { return c.coluna === col.key; })
      .sort(function(a, b) { return (a.ordem || 0) - (b.ordem || 0); });
    board.appendChild(createColumn(col, colCards));
  });
}

function createColumn(col, cards) {
  var vol = cards.reduce(function(s, c) { return s + (Number(c.valorCredito) || 0); }, 0);

  var el = document.createElement('div');
  el.className = 'column';
  el.dataset.coluna = col.key;
  el.innerHTML =
    '<div class="col-hdr">' +
      '<div class="col-hdr-top">' +
        '<div class="col-title">' +
          '<span class="col-dot" style="background:' + col.color + '"></span>' +
          '<span class="col-name">' + col.label + '</span>' +
          '<span class="col-count" style="background:' + col.color + '">' + cards.length + '</span>' +
        '</div>' +
        '<button class="col-add" title="Adicionar card" onclick="openModal(null,\'' + col.key + '\')">+</button>' +
      '</div>' +
      '<div class="col-vol-lbl">Volume</div>' +
      '<div class="col-vol">' + fmtBRL(vol) + '</div>' +
    '</div>' +
    '<div class="col-body" id="col-' + col.key + '" data-coluna="' + col.key + '"></div>';

  var body = el.querySelector('.col-body');

  if (cards.length === 0) {
    body.innerHTML = '<div class="col-empty">Sem cards nesta fase</div>';
  } else {
    cards.forEach(function(c) { body.appendChild(createCard(c)); });
  }

  body.addEventListener('dragover',  handleDragOver);
  body.addEventListener('dragleave', handleDragLeave);
  body.addEventListener('drop',      handleDrop);

  return el;
}

// -----------------------------------------------
// RENDER CARD
// -----------------------------------------------
function createCard(card) {
  var el = document.createElement('div');
  el.className = 'card' + (isUrgente(card) ? ' urgente' : '');
  el.dataset.id = card.id;
  el.draggable  = true;

  var svcsHtml = (card.servicos || []).map(function(s) {
    return '<span class="svc-tag">' + (SVC[s] || s.toUpperCase()) + '</span>';
  }).join('');

  var urgHtml = isUrgente(card)
    ? '<span class="urg-tag">URGENTE</span>'
    : '';

  el.innerHTML =
    '<div class="card-name">' + esc(card.franqueadora) + '</div>' +
    (card.ceo ? '<div class="card-ceo">' + esc(card.ceo) + '</div>' : '') +
    '<div class="card-row">' +
      '<span class="card-val">' + fmtBRL(card.valorCredito) + '</span>' +
      '<span class="card-seg">' + esc(card.segmento) + '</span>' +
    '</div>' +
    (svcsHtml ? '<div class="card-svcs">' + svcsHtml + '</div>' : '') +
    '<div class="card-foot">' +
      '<span>' + esc(card.proximoPasso || '') + '</span>' +
      urgHtml +
    '</div>';

  el.addEventListener('click', function() { openModal(card); });
  el.addEventListener('dragstart', handleDragStart);
  el.addEventListener('dragend',   handleDragEnd);

  return el;
}

// -----------------------------------------------
// DRAG AND DROP
// -----------------------------------------------
function handleDragStart(e) {
  draggedId = e.currentTarget.dataset.id;
  e.currentTarget.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', draggedId);
}

function handleDragEnd(e) {
  e.currentTarget.classList.remove('dragging');
  draggedId = null;
  document.querySelectorAll('.col-body').forEach(function(c) { c.classList.remove('drag-over'); });
}

function handleDragOver(e) {
  e.preventDefault();
  e.currentTarget.classList.add('drag-over');
}

function handleDragLeave(e) {
  e.currentTarget.classList.remove('drag-over');
}

function handleDrop(e) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');

  var id     = e.dataTransfer.getData('text/plain') || draggedId;
  var newCol = e.currentTarget.dataset.coluna;
  if (!id || !newCol) return;

  var card = getCardById(id);
  if (!card || card.coluna === newCol) return;

  var prevCol = card.coluna;
  var newOrdem = allCards.filter(function(c) { return c.coluna === newCol; }).length;
  card.coluna = newCol;
  card.ordem  = newOrdem;

  renderBoard(getFiltered());
  updateKPIs(allCards);

  fetch(API_BASE + '/cards/' + id, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(card)
  })
  .then(function(res) {
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  })
  .then(function(updated) {
    var idx = allCards.findIndex(function(c) { return c.id === id; });
    if (idx !== -1) allCards[idx] = updated;
    showToast('Movido para ' + (COLUMNS.find(function(c) { return c.key === newCol; }) || {label: newCol}).label, 'success');
  })
  .catch(function(err) {
    console.error('[drop]', err);
    card.coluna = prevCol;
    renderBoard(getFiltered());
    updateKPIs(allCards);
    showToast('Erro ao mover card.', 'error');
  });
}

function getCardById(id) {
  for (var i = 0; i < allCards.length; i++) {
    if (allCards[i].id === String(id)) return allCards[i];
  }
  return null;
}

// -----------------------------------------------
// MODAL
// -----------------------------------------------
function openModal(card, defaultColuna) {
  var overlay = document.getElementById('modalOverlay');
  var form    = document.getElementById('cardForm');
  var title   = document.getElementById('modalTitle');
  var btnDel  = document.getElementById('btnDelete');

  form.reset();
  document.querySelectorAll('[name="servicos"]').forEach(function(cb) { cb.checked = false; });

  if (card) {
    title.textContent       = 'Editar Card';
    btnDel.style.display    = 'inline-flex';
    document.getElementById('fieldId').value           = card.id;
    document.getElementById('fieldColuna').value       = card.coluna;
    document.getElementById('fieldFranqueadora').value = card.franqueadora   || '';
    document.getElementById('fieldCeo').value          = card.ceo            || '';
    document.getElementById('fieldSegmento').value     = card.segmento       || '';
    document.getElementById('fieldFranquias').value    = card.numFranquias   || '';
    document.getElementById('fieldValor').value        = card.valorCredito   || '';
    document.getElementById('fieldEntrada').value      = card.dataEntrada    || '';
    document.getElementById('fieldFechamento').value   = card.dataFechamento || '';
    document.getElementById('fieldProxPasso').value    = card.proximoPasso   || '';
    document.getElementById('fieldObs').value          = card.observacoes    || '';
    (card.servicos || []).forEach(function(s) {
      var cb = document.querySelector('[name="servicos"][value="' + s + '"]');
      if (cb) cb.checked = true;
    });
  } else {
    title.textContent       = 'Novo Card';
    btnDel.style.display    = 'none';
    document.getElementById('fieldId').value     = '';
    document.getElementById('fieldColuna').value = defaultColuna || 'prospeccao';
    document.getElementById('fieldEntrada').value = new Date().toISOString().slice(0, 10);
  }

  overlay.classList.add('open');
  setTimeout(function() { document.getElementById('fieldFranqueadora').focus(); }, 50);
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
}

function handleOverlayClick(e) {
  if (e.target === document.getElementById('modalOverlay')) closeModal();
}

// -----------------------------------------------
// FORM SUBMIT — mesmo padrão do pipeline
// -----------------------------------------------
function handleFormSubmit(e) {
  e.preventDefault();

  var id = document.getElementById('fieldId').value;

  var servicos = [];
  document.querySelectorAll('[name="servicos"]:checked').forEach(function(cb) {
    servicos.push(cb.value);
  });

  var formData = {
    id:             id || null,
    coluna:         document.getElementById('fieldColuna').value || 'prospeccao',
    franqueadora:   document.getElementById('fieldFranqueadora').value.trim(),
    ceo:            document.getElementById('fieldCeo').value.trim(),
    segmento:       document.getElementById('fieldSegmento').value,
    numFranquias:   parseInt(document.getElementById('fieldFranquias').value, 10) || 0,
    valorCredito:   parseFloat(document.getElementById('fieldValor').value) || 0,
    dataEntrada:    document.getElementById('fieldEntrada').value,
    dataFechamento: document.getElementById('fieldFechamento').value,
    proximoPasso:   document.getElementById('fieldProxPasso').value.trim(),
    observacoes:    document.getElementById('fieldObs').value.trim(),
    servicos:       servicos,
  };

  saveCard(formData);
}

// -----------------------------------------------
// SAVE CARD
// -----------------------------------------------
function saveCard(formData) {
  var isNew = !formData.id;
  var url    = isNew ? API_BASE + '/cards' : API_BASE + '/cards/' + formData.id;
  var method = isNew ? 'POST' : 'PUT';

  fetch(url, {
    method:  method,
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(formData)
  })
  .then(function(res) {
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  })
  .then(function(saved) {
    if (isNew) {
      allCards.push(saved);
    } else {
      var idx = allCards.findIndex(function(c) { return c.id === saved.id; });
      if (idx !== -1) allCards[idx] = saved;
    }
    renderBoard(getFiltered());
    updateKPIs(allCards);
    closeModal();
    showToast(isNew ? 'Card criado com sucesso.' : 'Card atualizado.', 'success');
  })
  .catch(function(err) {
    console.error('[saveCard]', err);
    showToast('Erro ao salvar: ' + err.message, 'error');
  });
}

// -----------------------------------------------
// DELETE
// -----------------------------------------------
function handleDelete() {
  var id   = document.getElementById('fieldId').value;
  if (!id) return;
  var card = getCardById(id);
  var name = card ? card.franqueadora : 'este card';
  if (!confirm('Excluir "' + name + '"? Esta ação não pode ser desfeita.')) return;

  fetch(API_BASE + '/cards/' + id, { method: 'DELETE' })
    .then(function(res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      allCards = allCards.filter(function(c) { return c.id !== id; });
      renderBoard(getFiltered());
      updateKPIs(allCards);
      closeModal();
      showToast('Card excluído.', 'success');
    })
    .catch(function(err) {
      console.error('[delete]', err);
      showToast('Erro ao excluir: ' + err.message, 'error');
    });
}

// -----------------------------------------------
// TOAST
// -----------------------------------------------
var toastTimer = null;

function showToast(msg, type) {
  type = type || 'info';
  var t = document.getElementById('toast');
  t.textContent = msg;
  t.className   = 'toast ' + type + ' show';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function() { t.classList.remove('show'); }, 3000);
}

// -----------------------------------------------
// HELPERS
// -----------------------------------------------
function fmtBRL(val) {
  var v = Number(val) || 0;
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency', currency: 'BRL',
    minimumFractionDigits: 0, maximumFractionDigits: 0
  }).format(v);
}

function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function isUrgente(card) {
  if (!card.dataFechamento) return false;
  var diff = (new Date(card.dataFechamento + 'T00:00:00') - new Date()) / 86400000;
  return diff >= 0 && diff <= 7;
}
