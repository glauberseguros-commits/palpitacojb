'use strict';

const express = require('express');
const { getDb } = require('../service/firebaseAdmin');

const router = express.Router();

/**
 * Helpers
 */
function isISODate(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '').trim());
}

function isHHMM(s) {
  return /^\d{2}:\d{2}$/.test(String(s || '').trim());
}

function normalizeHHMM(value) {
  const s = String(value ?? '').trim();
  if (!s) return '';

  if (isHHMM(s)) return s;

  // "10h" => "10:00"
  const m1 = s.match(/^(\d{1,2})h$/i);
  if (m1) return `${String(m1[1]).padStart(2, '0')}:00`;

  // "10" => "10:00"
  const m2 = s.match(/^(\d{1,2})$/);
  if (m2) return `${String(m2[1]).padStart(2, '0')}:00`;

  // "10:9" => "10:09"
  const m3 = s.match(/^(\d{1,2}):(\d{1,2})$/);
  if (m3) {
    const hh = String(m3[1]).padStart(2, '0');
    const mm = String(m3[2]).padStart(2, '0');
    return `${hh}:${mm}`;
  }

  return '';
}

function cmpHHMM(a, b) {
  return String(a || '').localeCompare(String(b || ''));
}

// GET /api/pitaco/results?date=2025-12-29&lottery=PT_RIO
router.get('/results', async (req, res) => {
  try {
    const date = String(req.query.date || '').trim();
    const lottery = String(req.query.lottery || 'PT_RIO').trim();

    if (!date) {
      return res.status(400).json({ ok: false, error: 'date obrigatório' });
    }

    // Se quiser manter compatível com legado, não obrigo ISO.
    // Mas se vier fora do padrão, aviso claramente:
    if (!isISODate(date)) {
      return res.status(400).json({ ok: false, error: 'date inválido (use YYYY-MM-DD)' });
    }

    if (!lottery) {
      return res.status(400).json({ ok: false, error: 'lottery obrigatório' });
    }

    const db = getDb();

    /**
     * Anti-índice composto:
     * - Firestore filtra SOMENTE por date
     * - lottery_key filtrado em memória
     */
    const snap = await db.collection('draws')
      .where('date', '==', date)
      .get();

    const draws = [];

    for (const doc of snap.docs) {
      const d = doc.data() || {};

      // Filtra lottery em memória (evita índice composto date+lottery_key)
      if (String(d.lottery_key || '').trim() !== lottery) continue;

      const prizesSnap = await doc.ref.collection('prizes')
        .orderBy('position', 'asc')
        .get();

      draws.push({
        id: doc.id,
        ...d,
        // normaliza close_hour para ordenação estável
        close_hour: normalizeHHMM(d.close_hour),
        prizes: prizesSnap.docs.map((p) => p.data()),
      });
    }

    // Ordenar por horário (HH:MM) já normalizado
    draws.sort((a, b) => cmpHHMM(a.close_hour, b.close_hour));

    return res.json({ ok: true, date, lottery, draws });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || 'erro' });
  }
});

module.exports = router;
