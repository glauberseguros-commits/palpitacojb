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

function upTrim(v) {
  return String(v ?? '').trim().toUpperCase();
}

/**
 * Concorrência limitada (evita flood e acelera)
 */
async function mapWithConcurrency(items, limitN, mapper) {
  const arr = Array.isArray(items) ? items : [];
  const concurrency = Math.max(1, Number(limitN) || 6);
  const results = new Array(arr.length);
  let idx = 0;

  async function worker() {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const current = idx;
      idx += 1;
      if (current >= arr.length) break;
      results[current] = await mapper(arr[current], current);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, arr.length) }, () => worker())
  );
  return results;
}

// GET /api/pitaco/results?date=2025-12-29&lottery=PT_RIO
router.get('/results', async (req, res) => {
  try {
    const date = String(req.query.date || '').trim();
    const lottery = upTrim(req.query.lottery || 'PT_RIO');

    if (!date) {
      return res.status(400).json({ ok: false, error: 'date obrigatório' });
    }

    if (!isISODate(date)) {
      return res
        .status(400)
        .json({ ok: false, error: 'date inválido (use YYYY-MM-DD)' });
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
    const snap = await db.collection('draws').where('date', '==', date).get();

    // 1) filtra docs por lottery em memória, sem bater prizes ainda
    const docs = snap.docs.filter((doc) => {
      const d = doc.data() || {};
      return upTrim(d.lottery_key) === lottery;
    });

    // 2) busca prizes com concorrência limitada
    const draws = await mapWithConcurrency(docs, 6, async (doc) => {
      const d = doc.data() || {};

      const prizesSnap = await doc.ref
        .collection('prizes')
        .orderBy('position', 'asc')
        .get();

      return {
        id: doc.id,
        ...d,
        // normaliza close_hour para ordenação estável
        close_hour: normalizeHHMM(d.close_hour),
        prizes: prizesSnap.docs.map((p) => p.data()),
      };
    });

    // Ordenar por horário (HH:MM) já normalizado (vazio vai primeiro; se preferir, eu mando vazio pro fim)
    draws.sort((a, b) => cmpHHMM(a.close_hour, b.close_hour));

    return res.json({ ok: true, date, lottery, draws });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || 'erro' });
  }
});

module.exports = router;
