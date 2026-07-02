const express = require('express');
const cors    = require('cors');
const { v4: uuidv4 } = require('uuid');
const fs   = require('fs');
const path = require('path');

const app  = express();
const PORT = process.env.PORT || 3001;

const DATA_DIR  = process.env.RAILWAY_VOLUME_MOUNT_PATH
  ? path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH)
  : path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'cards.json');
const PUBLIC_DIR = path.join(__dirname, 'public');

// ─── Bootstrap ───────────────────────────────────────────────────────────────
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

if (!fs.existsSync(DATA_FILE)) {
  const now = new Date().toISOString();
  const seed = {
    cards: [
      {
        id: uuidv4(),
        coluna: 'prospeccao',
        ordem: 0,
        franqueadora: 'Grupo Alimenta Brasil',
        ceo: 'Marcos Ferreira',
        segmento: 'Alimentação e Bebidas',
        numFranquias: 42,
        valorCredito: 3500000,
        servicos: ['diagnostico', 'estruturacao'],
        dataEntrada: now.slice(0, 10),
        dataFechamento: '',
        observacoes: 'Rede em expansão, buscando crédito para abertura de 15 novas unidades.',
        proximoPasso: 'Enviar proposta até 15/07',
        criadoEm: now,
        atualizadoEm: now
      },
      {
        id: uuidv4(),
        coluna: 'proposta',
        ordem: 0,
        franqueadora: 'VidaFit Franchising',
        ceo: 'Juliana Almeida',
        segmento: 'Saúde e Bem-estar',
        numFranquias: 18,
        valorCredito: 1200000,
        servicos: ['monitoramento', 'planejamento', 'tributaria'],
        dataEntrada: now.slice(0, 10),
        dataFechamento: '',
        observacoes: 'Proposta de consultoria financeira recorrente enviada. Aguardando retorno do board.',
        proximoPasso: 'Follow-up na reunião de 10/07',
        criadoEm: now,
        atualizadoEm: now
      }
    ],
    meta: { version: '1.0', lastUpdated: now }
  };
  fs.writeFileSync(DATA_FILE, JSON.stringify(seed, null, 2), 'utf-8');
  console.log('[Boutique] cards.json criado com 2 cards de exemplo.');
}

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(PUBLIC_DIR));

// ─── Helpers de persistência ──────────────────────────────────────────────────
function readData() {
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
}

function writeData(data) {
  data.meta.lastUpdated = new Date().toISOString();
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

// ─── Validação ────────────────────────────────────────────────────────────────
const VALID_COLUNAS = ['prospeccao', 'contato', 'proposta', 'fechado', 'diagnostico', 'estruturacao', 'consultoria'];

function validateCard(body) {
  if (!body.franqueadora || String(body.franqueadora).trim() === '') {
    return 'Campo "franqueadora" é obrigatório.';
  }
  if (body.coluna && !VALID_COLUNAS.includes(body.coluna)) {
    return `Coluna inválida. Valores aceitos: ${VALID_COLUNAS.join(', ')}`;
  }
  return null;
}

// ─── GET /api/cards ───────────────────────────────────────────────────────────
app.get('/api/cards', (req, res) => {
  try {
    const data = readData();
    res.json(data.cards);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao ler dados.', details: err.message });
  }
});

// ─── POST /api/cards ──────────────────────────────────────────────────────────
app.post('/api/cards', (req, res) => {
  const error = validateCard(req.body);
  if (error) return res.status(400).json({ error });

  try {
    const data = readData();
    const now  = new Date().toISOString();
    const coluna = req.body.coluna || 'prospeccao';

    const maxOrdem = data.cards
      .filter(c => c.coluna === coluna)
      .reduce((max, c) => Math.max(max, c.ordem ?? 0), -1);

    const newCard = {
      id:            uuidv4(),
      coluna,
      ordem:         maxOrdem + 1,
      franqueadora:  req.body.franqueadora.trim(),
      ceo:           req.body.ceo           ?? '',
      segmento:      req.body.segmento      ?? '',
      numFranquias:  Number(req.body.numFranquias)  || 0,
      valorCredito:  Number(req.body.valorCredito)  || 0,
      servicos:      Array.isArray(req.body.servicos) ? req.body.servicos : [],
      dataEntrada:   req.body.dataEntrada   || now.slice(0, 10),
      dataFechamento:req.body.dataFechamento ?? '',
      observacoes:   req.body.observacoes   ?? '',
      proximoPasso:  req.body.proximoPasso  ?? '',
      criadoEm:      now,
      atualizadoEm:  now
    };

    data.cards.push(newCard);
    writeData(data);
    res.status(201).json(newCard);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao criar card.', details: err.message });
  }
});

// ─── PUT /api/cards/:id ───────────────────────────────────────────────────────
app.put('/api/cards/:id', (req, res) => {
  const error = validateCard(req.body);
  if (error) return res.status(400).json({ error });

  try {
    const data  = readData();
    const index = data.cards.findIndex(c => c.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'Card não encontrado.' });

    const now     = new Date().toISOString();
    const current = data.cards[index];

    const updated = {
      ...current,
      coluna:         req.body.coluna         ?? current.coluna,
      ordem:          req.body.ordem          ?? current.ordem,
      franqueadora:   req.body.franqueadora.trim(),
      ceo:            req.body.ceo            ?? current.ceo,
      segmento:       req.body.segmento       ?? current.segmento,
      numFranquias:   Number(req.body.numFranquias)  || current.numFranquias,
      valorCredito:   Number(req.body.valorCredito)  || current.valorCredito,
      servicos:       Array.isArray(req.body.servicos) ? req.body.servicos : current.servicos,
      dataEntrada:    req.body.dataEntrada    ?? current.dataEntrada,
      dataFechamento: req.body.dataFechamento ?? current.dataFechamento,
      observacoes:    req.body.observacoes    ?? current.observacoes,
      proximoPasso:   req.body.proximoPasso   ?? current.proximoPasso,
      atualizadoEm:   now
    };

    data.cards[index] = updated;
    writeData(data);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar card.', details: err.message });
  }
});

// ─── DELETE /api/cards/:id ────────────────────────────────────────────────────
app.delete('/api/cards/:id', (req, res) => {
  try {
    const data  = readData();
    const index = data.cards.findIndex(c => c.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'Card não encontrado.' });

    const removed = data.cards.splice(index, 1)[0];
    writeData(data);
    res.json({ message: 'Card removido com sucesso.', card: removed });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao remover card.', details: err.message });
  }
});

// ─── Fallback SPA ─────────────────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Boutique Kanban rodando em http://localhost:${PORT}`);
});
