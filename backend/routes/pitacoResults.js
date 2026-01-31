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

function pad2(n) {
  return String(n).padStart(2, '0');
}

function normalizeHHMM(value) {
  const s = String(value ?? '').trim();
  if (!s) return '';

  if (isHHMM(s)) return s;

  // "10h" => "10:00"
  const m1 = s.match(/^(\d{1,2})h$/i);
  if (m1) return `${pad2(m1[1])}:00`;

  // "10" => "10:00"
  const m2 = s.match(/^(\d{1,2})$/);
  if (m2) return `${pad2(m2[1])}:00`;

  // "10:9" => "10:09"
  const m3 = s.match(/^(\d{1,2}):(\d{1,2})$/);
  if (m3) {
    const hh = pad2(m3[1]);
    const mm = pad2(m3[2]);
    return `${hh}:${mm}`;
  }

  return '';
}

function hourFromCloseHour(closeHour) {
  const s0 = String(closeHour ?? '').trim();
  if (!s0) return null;
  const m = s0.match(/(\d{1,2})/);
  if (!m) return null;
  const hh = Number(m[1]);
  if (!Number.isFinite(hh) || hh < 0 || hh > 23) return null;
  return pad2(hh);
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

function uniqSorted(arr) {
  return Array.from(new Set((Array.isArray(arr) ? arr : []).filter(Boolean))).sort();
}

function setDiff(a, bSet) {
  const out = [];
  for (const v of Array.isArray(a) ? a : []) {
    if (!bSet.has(v)) out.push(v);
  }
  return out;
}

function intersectToSet(a, bSet) {
  const out = new Set();
  for (const v of Array.isArray(a) ? a : []) {
    if (bSet.has(v)) out.add(v);
  }
  return out;
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
 * ============================
 * SLOT SCHEDULE (normalização)
 * ============================
 * Objetivo: gerar o "universo de slots" do dia (hard + soft), para nunca faltar horário.
 *
 * Fonte primária: backend/data/slot_schedule/<LOTTERY>.json
 * Fallback: regras PT_RIO (compat) com include09From (mesmo padrão do audit)
 */
const DEFAULT_SCHEDULE_DIR = path.join(__dirname, '..', 'data', 'slot_schedule');
const DEFAULT_GAPS_DIR = path.join(__dirname, '..', 'data', 'source_gaps');

function safeReadJson(p, fallback) {
  try {
    if (!fs.existsSync(p)) return fallback;
    const raw = fs.readFileSync(p, 'utf8');
    const j = JSON.parse(raw || '{}');
    return j && typeof j === 'object' ? j : fallback;
  } catch {
    return fallback;
  }
}

/**
 * schedule pode ser:
 * - array de ranges: [{from,to,hours:[...]}, ...]
 * - ou objeto com ranges: { ranges: [...] }
 * - ou schedule global (sem ranges): { hours:[...]} ou { hard:[...], soft:[...] }
 */
function normalizeHourList(arr) {
  const out = [];
  const seen = new Set();
  for (const v of Array.isArray(arr) ? arr : []) {
    const m = String(v ?? '').match(/\d{1,2}/);
    if (!m) continue;
    const hh = pad2(Number(m[0]));
    const n = Number(hh);
    if (!Number.isFinite(n) || n < 0 || n > 23) continue;
    if (!seen.has(hh)) {
      seen.add(hh);
      out.push(hh);
    }
  }
  return out.sort();
}

function shouldInclude09ForDate(ymd, include09FromYmd) {
  if (include09FromYmd && isISODate(include09FromYmd)) return ymd >= include09FromYmd;
  return false;
}

/**
 * Fallback hardcoded (compat) — PT_RIO
 * Retorna { hard:[], soft:[] }
 */
function expectedHoursPT_RIO_FALLBACK(ymd, include09FromYmd) {
  // dow SP (-03:00) no meio-dia evita edge de DST
  const d = new Date(`${ymd}T12:00:00-03:00`);
  const dow = d.getDay(); // 0=dom

  const has09 = shouldInclude09ForDate(ymd, include09FromYmd);

  const hardWeek = ['11', '14', '16', '18', '21'];
  const hardSun = ['11', '14', '16'];

  const hard = [];
  const soft = [];

  if (dow === 0) {
    hard.push(...hardSun);
    if (has09) soft.push('09'); // domingo 09 variável
    return { hard, soft, mode: 'fallback', scheduleFile: false };
  }

  if (has09) hard.push('09');
  hard.push(...hardWeek);

  return { hard, soft, mode: 'fallback', scheduleFile: false };
}

/**
 * Ranges: aceita:
 * - {from,to} ambos presentes
 * - from vazio => aberto pra trás
 * - to vazio   => aberto pra frente
 */
function pickRangeForDate(ranges, ymd) {
  for (const r of Array.isArray(ranges) ? ranges : []) {
    const from0 = String(r?.from || '').trim();
    const to0 = String(r?.to || '').trim();

    const hasFrom = isISODate(from0);
    const hasTo = isISODate(to0);

    // sem from/to => "default" range
    if (!hasFrom && !hasTo) return r;

    // aberto
    if (!hasFrom && hasTo) {
      if (ymd <= to0) return r;
      continue;
    }
    if (hasFrom && !hasTo) {
      if (ymd >= from0) return r;
      continue;
    }

    // fechado
    if (hasFrom && hasTo && ymd >= from0 && ymd <= to0) return r;
  }
  return null;
}

function parseScheduleGlobal(scheduleRaw) {
  const hard = normalizeHourList(scheduleRaw?.hard || scheduleRaw?.expectedHard || []);
  const soft = normalizeHourList(scheduleRaw?.soft || scheduleRaw?.expectedSoft || []);
  const hours = normalizeHourList(scheduleRaw?.hours || []);
  if (hours.length) return { hard: hours, soft: [], mode: 'schedule', scheduleFile: true };
  if (hard.length || soft.length) return { hard, soft, mode: 'schedule', scheduleFile: true };
  return null;
}

function getExpectedForDate(lotteryKey, ymd, include09FromYmdDefault) {
  const p = path.join(DEFAULT_SCHEDULE_DIR, `${lotteryKey}.json`);
  const scheduleRaw = safeReadJson(p, null);
  const scheduleFile = !!scheduleRaw;

  // 1) se schedule existir e for "global" (sem ranges), usa
  if (scheduleRaw) {
    const global = parseScheduleGlobal(scheduleRaw);
    // se for objeto com ranges, global pode vir vazio; aí seguimos pros ranges
    if (global && (global.hard.length || global.soft.length)) return global;
  }

  // 2) tenta ranges
  const ranges = Array.isArray(scheduleRaw) ? scheduleRaw : scheduleRaw?.ranges;
  const r = pickRangeForDate(ranges, ymd);

  if (r) {
    // ✅ Suporta schedule por dia da semana:
    // r.dow = { "0":{hard,soft}, "1":{...}, ... }
    // (usa meio-dia -03:00 pra evitar edge)
    if (r.dow && typeof r.dow === 'object') {
      const d = new Date(String(ymd) + 'T12:00:00-03:00');
      const dow = String(d.getDay()); // 0=dom
      const block = r.dow[dow] || r.dow[Number(dow)] || null;

      const hard = normalizeHourList(block?.hard || block?.expectedHard || []);
      const soft = normalizeHourList(block?.soft || block?.expectedSoft || []);
      const hours = normalizeHourList(block?.hours || []);

      if (hours.length) {
        return { hard: hours, soft: [], mode: 'schedule', scheduleFile: true };
      }
      return { hard, soft, mode: 'schedule', scheduleFile: true };
    }

    // formato antigo: hard/soft/hours direto no range
    const hard = normalizeHourList(r?.hard || r?.expectedHard || []);
    const soft = normalizeHourList(r?.soft || r?.expectedSoft || []);
    const hours = normalizeHourList(r?.hours || []);
    if (hours.length) {
      return { hard: hours, soft: [], mode: 'schedule', scheduleFile: true };
    }
    return { hard, soft, mode: 'schedule', scheduleFile: true };
  }

  // 3) fallback: PT_RIO (mantém consistência com seu audit)
  if (lotteryKey === 'PT_RIO') {
    return expectedHoursPT_RIO_FALLBACK(ymd, include09FromYmdDefault || '2024-01-05');
  }

  // 4) sem schedule e sem fallback conhecido: universo vazio
  return { hard: [], soft: [], mode: 'none', scheduleFile: scheduleFile };
}

/**
 * ============================
 * SOURCE GAPS (alinha com audit)
 * ============================
 * Arquivo: backend/data/source_gaps/<LOTTERY>.json
 * Aceita formatos comuns:
 * - { "YYYY-MM-DD": { removedHard:[18], removedSoft:[] } }
 * - { "YYYY-MM-DD": { removeHard:[...], removeSoft:[...] } }
 * - { "YYYY-MM-DD": { hard:[...], soft:[...] } }
 * - { "YYYY-MM-DD": [18] }  (interpreta como hard)
 */
const _gapsCache = new Map(); // lottery -> { loadedAt, map }
const GAPS_TTL_MS = 60_000;

function readGapsMap(lottery, opts) {
  const key = upTrim(lottery || 'PT_RIO') || 'PT_RIO';
  const reload = !!(opts && opts.reload);

  const cached = _gapsCache.get(key);
  if (!reload && cached && Date.now() - cached.loadedAt < GAPS_TTL_MS) {
    return cached.map;
  }

  const p = path.join(DEFAULT_GAPS_DIR, `${key}.json`);
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

  _gapsCache.set(key, { loadedAt: Date.now(), map });
  return map;
}

function normalizeGapEntry(entry) {
  // array => hard
  if (Array.isArray(entry)) {
    return {
      removedHard: normalizeHourList(entry),
      removedSoft: [],
    };
  }

  const obj = entry && typeof entry === 'object' ? entry : {};
  const hard =
    obj.removedHard ||
    obj.removeHard ||
    obj.hard ||
    obj.expectedRemovedHard ||
    [];
  const soft =
    obj.removedSoft ||
    obj.removeSoft ||
    obj.soft ||
    obj.expectedRemovedSoft ||
    [];

  return {
    removedHard: normalizeHourList(hard),
    removedSoft: normalizeHourList(soft),
  };
}

function getGapsForDate(lotteryKey, ymd, opts) {
  const map = readGapsMap(lotteryKey, opts);
  const entry = map?.[ymd];
  if (!entry) return { removedHard: [], removedSoft: [] };
  return normalizeGapEntry(entry);
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

/**
 * ============================
 * ROUTE
 * ============================
 */
// GET /api/pitaco/results?date=YYYY-MM-DD&lottery=PT_RIO
// Opcional:
// - &strict=1              (exclui também partial_hard)
// - &reloadDayStatus=1     (recarrega arquivo day_status na hora)
// - &reloadGaps=1          (recarrega arquivo source_gaps na hora)
// - &includePrizes=0|1     (default 1; 0 = não busca subcoleção prizes)
// - &limitDocs=120         (guard rail por dia; default 120; min 20 max 500)
//
// ✅ slots: universo normalizado do dia, com status (valid/gap/missing/soft_missing)
router.get('/results', async (req, res) => {
  try {
    const date = String(req.query.date || '').trim();
    const lottery = upTrim(req.query.lottery || 'PT_RIO');
    const strict = parseBool01(req.query.strict);
    const reloadDayStatus = parseBool01(req.query.reloadDayStatus);
    const reloadGaps = parseBool01(req.query.reloadGaps);

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
        slots: [],
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
          slots: [],
        });
      }
      // existe dado real -> segue o fluxo normal
    }

    // Guard rail: evita “flood” de subcoleções se algo vier muito sujo
    const docsFound = docsAll.length;
    const docs = docsAll.slice(0, limitDocs);
    const docsCapped = docs.length !== docsFound;

    // Esperado (universo) do dia — hard + soft (BASE schedule)
    // mantém consistência com audit: include09From default 2024-01-05
    const include09FromDefault = '2024-01-05';
    const expectedBase = getExpectedForDate(lottery, date, include09FromDefault);

    const baseHard = expectedBase?.hard || [];
    const baseSoft = expectedBase?.soft || [];

    // GAPS (source gaps) — alinha com audit
    const gaps = getGapsForDate(lottery, date, { reload: reloadGaps });
    const removedHardSet = new Set(gaps.removedHard || []);
    const removedSoftSet = new Set(gaps.removedSoft || []);

    // universo para exibir (mantém slots do schedule mesmo se gap)
    const scheduleAll = uniqSorted([...baseHard, ...baseSoft]);

    // esperado "válido" (depois de remover gaps)
    const expectedHard = setDiff(baseHard, removedHardSet);
    const expectedSoft = setDiff(baseSoft, removedSoftSet);
    const expectedAll = uniqSorted([...expectedHard, ...expectedSoft]);

    // contagens removidas (somente se estavam no schedule base)
    const removedHardApplied = intersectToSet(baseHard, removedHardSet);
    const removedSoftApplied = intersectToSet(baseSoft, removedSoftSet);

    // Se não incluir prizes, devolve só os docs (com close_hour normalizado) + slots
    if (!includePrizes) {
      const drawsNoPrizes = docs.map((doc) => {
        const d = doc.data() || {};
        return {
          id: doc.id,
          ...d,
          close_hour: normalizeHHMM(d.close_hour),
          prizesCount: typeof d.prizesCount !== 'undefined' ? d.prizesCount : undefined,
        };
      });

      drawsNoPrizes.sort((a, b) => cmpHHMM(a.close_hour, b.close_hour));

      // mapa hour -> draw (se houver duplicidade de hora, escolhe close_hour menor)
      const byHour = new Map();
      for (const dr of drawsNoPrizes) {
        const hh = hourFromCloseHour(dr?.close_hour);
        if (!hh) continue;
        const prev = byHour.get(hh);
        if (!prev) {
          byHour.set(hh, dr);
        } else {
          const a = String(prev.close_hour || '');
          const b = String(dr.close_hour || '');
          if (b && (!a || b < a)) byHour.set(hh, dr);
        }
      }

      const presentHours = uniqSorted(Array.from(byHour.keys()));

      const slots = scheduleAll.map((hh) => {
        const draw = byHour.get(hh) || null;

        const isSoft = baseSoft.includes(hh);
        const kind = isSoft ? 'soft' : 'hard';

        // GAP (escusado)
        if (removedHardApplied.has(hh) || removedSoftApplied.has(hh)) {
          return {
            hour: hh,
            kind,
            status: 'gap',
            reason: 'source_gap',
            draw: null,
          };
        }

        // válido
        if (draw) {
          return { hour: hh, kind, status: 'valid', draw };
        }

        // faltante (problema)
        if (expectedHard.includes(hh)) {
          return { hour: hh, kind: 'hard', status: 'missing', draw: null };
        }
        if (expectedSoft.includes(hh)) {
          return { hour: hh, kind: 'soft', status: 'soft_missing', draw: null };
        }

        // se chegou aqui, era um slot do schedule base, mas saiu do expected por alguma regra
        // (em tese só aconteceria por gap, já tratado). Mantemos como gap defensivo.
        return { hour: hh, kind, status: 'gap', reason: 'not_expected', draw: null };
      });

      const slotsSummary = {
        mode: expectedBase?.mode || 'none',
        scheduleFile: !!expectedBase?.scheduleFile,

        scheduleHard: baseHard.length,
        scheduleSoft: baseSoft.length,
        scheduleAll: scheduleAll.length,

        expectedHard: expectedHard.length,
        expectedSoft: expectedSoft.length,
        expectedAll: expectedAll.length,

        presentHours: presentHours.length,

        removedHard: removedHardApplied.size,
        removedSoft: removedSoftApplied.size,

        missingHard: slots.filter((s) => s.status === 'missing').length,
        missingSoft: slots.filter((s) => s.status === 'soft_missing').length,
      };

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

        // legado
        count: drawsNoPrizes.length,
        draws: drawsNoPrizes,

        // novo (alinhado com audit)
        expectedHard,
        expectedSoft,
        presentHours,
        slotsSummary,
        slots,
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

    // mapa hour -> draw (se houver duplicidade de hora, escolhe close_hour menor)
    const byHour = new Map();
    for (const dr of draws) {
      const hh = hourFromCloseHour(dr?.close_hour);
      if (!hh) continue;
      const prev = byHour.get(hh);
      if (!prev) {
        byHour.set(hh, dr);
      } else {
        const a = String(prev.close_hour || '');
        const b = String(dr.close_hour || '');
        if (b && (!a || b < a)) byHour.set(hh, dr);
      }
    }

    const presentHours = uniqSorted(Array.from(byHour.keys()));

    const slots = scheduleAll.map((hh) => {
      const draw = byHour.get(hh) || null;

      const isSoft = baseSoft.includes(hh);
      const kind = isSoft ? 'soft' : 'hard';

      // GAP (escusado)
      if (removedHardApplied.has(hh) || removedSoftApplied.has(hh)) {
        return {
          hour: hh,
          kind,
          status: 'gap',
          reason: 'source_gap',
          draw: null,
        };
      }

      if (draw) {
        return { hour: hh, kind, status: 'valid', draw };
      }

      if (expectedHard.includes(hh)) {
        return { hour: hh, kind: 'hard', status: 'missing', draw: null };
      }
      if (expectedSoft.includes(hh)) {
        return { hour: hh, kind: 'soft', status: 'soft_missing', draw: null };
      }

      return { hour: hh, kind, status: 'gap', reason: 'not_expected', draw: null };
    });

    const slotsSummary = {
      mode: expectedBase?.mode || 'none',
      scheduleFile: !!expectedBase?.scheduleFile,

      scheduleHard: baseHard.length,
      scheduleSoft: baseSoft.length,
      scheduleAll: scheduleAll.length,

      expectedHard: expectedHard.length,
      expectedSoft: expectedSoft.length,
      expectedAll: expectedAll.length,

      presentHours: presentHours.length,

      removedHard: removedHardApplied.size,
      removedSoft: removedSoftApplied.size,

      missingHard: slots.filter((s) => s.status === 'missing').length,
      missingSoft: slots.filter((s) => s.status === 'soft_missing').length,
    };

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

      // legado
      count: draws.length,
      draws,

      // novo (alinhado com audit)
      expectedHard,
      expectedSoft,
      presentHours,
      slotsSummary,
      slots,
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || 'erro' });
  }
});

module.exports = router;



