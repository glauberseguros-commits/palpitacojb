'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
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

function parseBool01(v) {
  const s = String(v ?? '').trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes' || s === 'y';
}

function parsePosInt(v, def, min, max) {
  const n = Number(String(v ?? '').trim());
  if (!Number.isFinite(n)) return def;
  const i = Math.trunc(n);
  if (Number.isFinite(min) && i < min) return min;
  if (Number.isFinite(max) && i > max) return max;
  return i;
}

/**
 * ✅ Hoje no fuso do Brasil (America/Sao_Paulo), em YYYY-MM-DD
 * - Sem libs externas
 * - Comparação lexicográfica funciona em ISO (YYYY-MM-DD)
 */
function todayYMDInSaoPaulo() {
  try {
    // en-CA formata como YYYY-MM-DD
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return fmt.format(new Date());
  } catch {
    // fallback: UTC (último recurso)
    return new Date().toISOString().slice(0, 10);
  }
}

function isFutureISODate(ymd) {
  if (!isISODate(ymd)) return false;
  const todayBR = todayYMDInSaoPaulo();
  return String(ymd) > String(todayBR);
}

/**
 * Day Status (cache em memória)
 * - Arquivo gerado: backend/data/day_status/<LOTTERY>.json
 * - Ex.: PT_RIO.json com { "YYYY-MM-DD": "normal|normal_partial|partial_hard|holiday_no_draw|incomplete" }
 */
const _dayStatusCache = new Map(); // lottery -> { loadedAt, map }
const DAY_STATUS_TTL_MS = 60_000; // 1 min (dev-friendly)

function readDayStatusMap(lottery, opts) {
  const key = upTrim(lottery || 'PT_RIO') || 'PT_RIO';
  const reload = !!(opts && opts.reload);

  const cached = _dayStatusCache.get(key);
  if (!reload && cached && Date.now() - cached.loadedAt < DAY_STATUS_TTL_MS) {
    return cached.map;
  }

  const p = path.join(__dirname, '..', 'data', 'day_status', `${key}.json`);
  let map = {};
  try {
    if (fs.existsSync(p)) {
      const raw = fs.readFileSync(p, 'utf8');
      const j = raw ? JSON.parse(raw) : {};
      if (j && typeof j === 'object') map = j;
    }
  } catch {
    map = {};
  }

  _dayStatusCache.set(key, { loadedAt: Date.now(), map });
  return map;
}

function shouldBlockDayStatus(dayStatus, strict) {
  // sempre bloqueia
  if (dayStatus === 'holiday_no_draw') return true;
  if (dayStatus === 'incomplete') return true;

  // modo estrito: só dias "completos" (normal / normal_partial)
  if (strict && dayStatus === 'partial_hard') return true;

  return false;
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

// GET /api/pitaco/results?date=YYYY-MM-DD&lottery=PT_RIO
// Opcional:
// - &strict=1              (exclui também partial_hard)
// - &reloadDayStatus=1     (recarrega arquivo day_status na hora)
// - &includePrizes=0|1     (default 1; 0 = não busca subcoleção prizes)
// - &limitDocs=120         (guard rail por dia; default 120; min 20 max 500)
router.get('/results', async (req, res) => {
  try {
    const date = String(req.query.date || '').trim();
    const lottery = upTrim(req.query.lottery || 'PT_RIO');
    const strict = parseBool01(req.query.strict);
    const reloadDayStatus = parseBool01(req.query.reloadDayStatus);

    const includePrizes = req.query.includePrizes == null
      ? true
      : parseBool01(req.query.includePrizes);

    const limitDocs = parsePosInt(req.query.limitDocs, 120, 20, 500);

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

    // ✅ HARD GUARD: bloqueia datas futuras (fuso Brasil)
    if (isFutureISODate(date)) {
      const todayBR = todayYMDInSaoPaulo();
      return res.json({
        ok: true,
        date,
        lottery,
        strict,
        includePrizes,
        limitDocs,
        dayStatus: '',
        blocked: true,
        blockedReason: 'future_date',
        todayBR,
        count: 0,
        draws: [],
      });
    }

    // ✅ lê day_status (hint) — MAS vamos confirmar no Firestore antes de bloquear
    const dayStatusMap = readDayStatusMap(lottery, { reload: reloadDayStatus });
    const dayStatus = String(dayStatusMap?.[date] || '').trim();

    const db = getDb();

    /**
     * Query mínima: SOMENTE date (evita índice composto)
     * (vamos usar tanto pro “confirmar bloqueio” quanto pro fluxo normal)
     */
    const snap = await db.collection('draws').where('date', '==', date).get();

    // filtra lottery em memória, sem bater prizes ainda
    const docsAll = snap.docs.filter((doc) => {
      const d = doc.data() || {};
      return upTrim(d.lottery_key) === lottery;
    });

    // Se day_status mandar bloquear, confirma:
    // - se NÃO tem docs => bloqueia
    // - se TEM docs => NÃO bloqueia (prioriza dado real)
    if (dayStatus && shouldBlockDayStatus(dayStatus, strict)) {
      if (!docsAll.length) {
        return res.json({
          ok: true,
          date,
          lottery,
          strict,
          includePrizes,
          limitDocs,
          dayStatus,
          blocked: true,
          blockedReason: 'day_status_confirmed_no_docs',
          count: 0,
          draws: [],
        });
      }
      // existe dado real -> segue o fluxo normal
    }

    // Guard rail: evita “flood” de subcoleções se algo vier muito sujo
    const docsFound = docsAll.length;
    const docs = docsAll.slice(0, limitDocs);
    const docsCapped = docs.length !== docsFound;

    // Se não incluir prizes, devolve só os docs (com close_hour normalizado)
    if (!includePrizes) {
      const drawsNoPrizes = docs.map((doc) => {
        const d = doc.data() || {};
        return {
          id: doc.id,
          ...d,
          close_hour: normalizeHHMM(d.close_hour),
          // se existir campo agregado, mantemos para debug/UX
          prizesCount: typeof d.prizesCount !== 'undefined' ? d.prizesCount : undefined,
        };
      });

      drawsNoPrizes.sort((a, b) => cmpHHMM(a.close_hour, b.close_hour));

      return res.json({
        ok: true,
        date,
        lottery,
        strict,
        includePrizes,
        limitDocs,
        docsFound,
        docsCapped,
        dayStatus,
        blocked: false,
        count: drawsNoPrizes.length,
        draws: drawsNoPrizes,
      });
    }

    // carrega prizes com concorrência limitada
    const draws = await mapWithConcurrency(docs, 6, async (doc) => {
      const d = doc.data() || {};

      const prizesSnap = await doc.ref
        .collection('prizes')
        .orderBy('position', 'asc')
        .get();

      return {
        id: doc.id,
        ...d,
        close_hour: normalizeHHMM(d.close_hour),
        prizes: prizesSnap.docs.map((p) => p.data()),
      };
    });

    // ordena por close_hour normalizado
    draws.sort((a, b) => cmpHHMM(a.close_hour, b.close_hour));

    return res.json({
      ok: true,
      date,
      lottery,
      strict,
      includePrizes,
      limitDocs,
      docsFound,
      docsCapped,
      dayStatus,
      blocked: false,
      count: draws.length,
      draws,
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || 'erro' });
  }
});

module.exports = router;
