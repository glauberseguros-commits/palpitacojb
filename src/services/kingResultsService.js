import { apiUrl } from "../config/apiBase";
// src/services/kingResultsService.js
import { normalizeToYMD_SP } from "../utils/ymd";

import {
  collection,
  query,
  where,
  getDocs,
  getDocsFromServer,
  orderBy,
  limit,
  limitToLast,
  documentId,
} from "firebase/firestore";
import { db } from "./firebase";

/* =========================
   PERF: caches (memória)
========================= */

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 min
const PRIZES_CACHE = new Map(); // key -> { ts, data: prizesAllSorted }
const DRAWS_CACHE = new Map(); // key -> { ts, data: mappedDrawDocs[] }

// ✅ cache específico para ATRASADOS (Late)
const LATE_CACHE = new Map(); // key -> { ts, data: lateRows[] }

// ✅ corte seguro (modo auto) — acima disso, tende a ser "agregado" (sem prizes)
export const AGGREGATED_AUTO_DAYS = 60;

/**
 * ✅ Política padrão de leitura (custo vs frescor)
 * - "cache": tenta cache do SDK primeiro (getDocs); se vier vazio, tenta server
 * - "server": tenta server primeiro; se falhar, cai no cache
 *
 * (mantém compat e evita custo desnecessário)
 */
const DEFAULT_READ_POLICY = "cache"; // "cache" | "server"

function nowMs() {
  return Date.now();
}

function cacheGet(map, key) {
  const hit = map.get(key);
  if (!hit) return null;
  if (nowMs() - hit.ts > CACHE_TTL_MS) {
    map.delete(key);
    return null;
  }
  return hit.data;
}

function cacheSet(map, key, data) {
  map.set(key, { ts: nowMs(), data });
}

/* =========================
   ✅ REGRA DE NEGÓCIO (RJ x Federal)
========================= */



const RJ_STATE_CODE = "RJ";
const RJ_LOTTERY_KEY = "PT_RIO";

// ✅ chão histórico oficial do PT_RIO (NUNCA pode passar disso)
const PT_RIO_GLOBAL_MIN_YMD = "2022-06-07";

function applyBoundsFloor(scopeKey, boundsLike) {
  const min = String(boundsLike?.minYmd || "").trim();
  const max = String(boundsLike?.maxYmd || "").trim();

  // só aplica regra rígida no PT_RIO
  if (String(scopeKey || "") !== RJ_LOTTERY_KEY) {
    return { minYmd: isYMD(min) ? min : null, maxYmd: isYMD(max) ? max : null };
  }

  let outMin = isYMD(min) ? min : PT_RIO_GLOBAL_MIN_YMD;
  let outMax = isYMD(max) ? max : null;

  // ✅ se o backend/scan vier com min maior (ex: 2022-06-08), força voltar pra 2022-06-07
  if (isYMD(outMin) && outMin > PT_RIO_GLOBAL_MIN_YMD) outMin = PT_RIO_GLOBAL_MIN_YMD;

  // ✅ sanidade: se max < min, corrige max => min (evita UI travar)
  if (isYMD(outMax) && isYMD(outMin) && outMax < outMin) outMax = outMin;

  return { minYmd: outMin, maxYmd: outMax };
}
// ✅ Escopo canônico para Federal no app
const FEDERAL_SCOPE_CODE = "FEDERAL";

/**
 * ✅ Aliases tolerados (input do usuário / UI)
 */
const FEDERAL_INPUT_ALIASES = new Set([
  "FEDERAL",
  "FED",
  "LOT FEDERAL",
  "LOTERIA FEDERAL",
  "LOTERIA_FEDERAL",
  "LT_FEDERAL",
  "FED_BR",
]);

// ✅ Possíveis lottery_key no Firestore (tentativa em cascata)
const FEDERAL_LOTTERY_KEYS = ["FEDERAL", "LOTERIA_FEDERAL", "LT_FEDERAL", "FED"];

/**
 * (Opcional para UI) — regra de calendário do Federal
 * - 20h: quarta e sábado
 */
export const FEDERAL_DRAW_HOUR = "20:00";
export const FEDERAL_DRAW_BUCKET = "20h";
export const FEDERAL_DRAW_DOW = ["WEDNESDAY", "SATURDAY"]; // referência (UI)

/**
 * Detecta se o usuário está pedindo Federal (por input/alias).
 */
function isFederalInput(scopeInput) {
  const up = String(scopeInput || "").trim().toUpperCase();
  if (!up) return false;
  if (up === FEDERAL_SCOPE_CODE) return true;
  if (FEDERAL_INPUT_ALIASES.has(up)) return true;

  // normaliza espaços/underscores pra captar variações
  const compact = up.replace(/[\s_]+/g, " ").trim();
  return FEDERAL_INPUT_ALIASES.has(compact) || FEDERAL_INPUT_ALIASES.has(up.replace(/[\s_]+/g, "_"));
}

/**
 * Resolve qual lottery_key usar quando o usuário passar:
 * - "RJ" -> "PT_RIO"
 * - "FEDERAL"/aliases -> "FEDERAL" (canônico)
 * - outros -> mantém o valor original (compatível com seu app atual)
 */
function resolveLotteryKeyForQuery(ufInput) {
  const uf = String(ufInput || "").trim();
  if (!uf) return "";
  const up = uf.toUpperCase();

  if (up === RJ_STATE_CODE) return RJ_LOTTERY_KEY;
  if (isFederalInput(up)) return FEDERAL_SCOPE_CODE;

  return uf;
}

/**
 * ✅ Chave canônica para CACHE:
 * - "RJ" -> "PT_RIO"
 * - Federal (qualquer alias) -> "FEDERAL"
 * - outros -> UPPER(TRIM)
 */
function canonicalScopeKey(ufInput) {
  const s = String(ufInput || "").trim();
  if (!s) return "";
  const up = s.toUpperCase();

  if (up === RJ_STATE_CODE) return RJ_LOTTERY_KEY;
  if (isFederalInput(up)) return FEDERAL_SCOPE_CODE;

  return up;
}

/**
 * Quando for consultar por campo "uf", adiciona trava de lottery_key para RJ.
 * Isso elimina o vazamento de Federal para o Rio.
 */
function buildRJLockWhereIfNeeded(fieldName, ufInput) {
  const ufUp = String(ufInput || "").trim().toUpperCase();
  if (fieldName === "uf" && ufUp === RJ_STATE_CODE) {
    return [where("lottery_key", "==", RJ_LOTTERY_KEY)];
  }
  return [];
}

/* =========================
   ✅ FIX silencioso: normalizar valor do WHERE por campo
========================= */

function normalizeValueForField(fieldName, valueInput) {
  const s = String(valueInput || "").trim();
  if (!s) return "";

  if (fieldName === "uf") {
    const up = s.toUpperCase();
    if (isFederalInput(up)) return FEDERAL_SCOPE_CODE;
    return up;
  }

  if (fieldName === "lottery_key") {
    const up = s.toUpperCase();
    if (up === RJ_STATE_CODE) return RJ_LOTTERY_KEY; // ✅ PREVENTIVO: RJ -> PT_RIO
    if (isFederalInput(up)) return FEDERAL_SCOPE_CODE;
    return up;
  }

  return s;
}

/* =========================
   Utils
========================= */

function pad2(n) {
  return String(n).padStart(2, "0");
}

function isYMD(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || "").trim());
}

function ymdToBR(ymd) {
  const m = String(ymd || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/**
 * ✅ Normaliza "horário" para HH:MM
 */
function normalizeHourLike(value) {
  const s0 = String(value ?? "").trim();
  if (!s0) return "";

  const s = s0.replace(/\s+/g, "");

  const mhx = s.match(/^(\d{1,2})(?:h|hs|hr|hrs)$/i);
  if (mhx) return `${pad2(mhx[1])}:00`;

  const mISO = s.match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/);
  if (mISO) return `${pad2(mISO[1])}:${pad2(mISO[2])}`;

  const mHm = s.match(/^(\d{3,4})$/);
  if (mHm) {
    const hh = String(mHm[1]).slice(0, -2);
    const mm = String(mHm[1]).slice(-2);
    if (/^\d{1,2}$/.test(hh) && /^\d{2}$/.test(mm)) {
      return `${pad2(hh)}:${mm}`;
    }
  }

  const m2 = s.match(/^(\d{1,2})$/);
  if (m2) return `${pad2(m2[1])}:00`;

  return s0.trim();
}

function mhxToInt(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * ✅ Bucket "09h", "11h"…
 */
function toHourBucket(value) {
  const s = String(value ?? "").trim();
  if (!s || s.toLowerCase() === "todos") return null;

  const mh = s.match(/^(\d{1,2})h$/i);
  if (mh) return `${pad2(mhxToInt(mh[1]))}h`;

  const m1 = s.match(/^(\d{1,2}):(\d{2})$/);
  if (m1) return `${pad2(mhxToInt(m1[1]))}h`;

  const m2 = s.match(/^(\d{1,2})$/);
  if (m2) return `${pad2(mhxToInt(m2[1]))}h`;

  const m3 = s.match(/^(\d{1,2}):(\d{2}):(\d{2})$/);
  if (m3) return `${pad2(mhxToInt(m3[1]))}h`;

  const m4 = s.match(/^(\d{3,4})$/);
  if (m4) return `${pad2(mhxToInt(String(m4[1]).slice(0, -2)))}h`;

  return null;
}

/* =========================
   ✅ FIX DEFINITIVO: filtro de horário (bucket vs exato)
   - bucket SOMENTE via closeHourBucket
   - exact  SOMENTE via closeHour
   (elimina ambiguidade e "filtro fantasma")
========================= */

function resolveHourFilter({ closeHour = null, closeHourBucket = null }) {
  const bucket = toHourBucket(closeHourBucket);
  if (bucket) return { kind: "bucket", bucket, hhmm: null };

  const hhmm = closeHour ? normalizeHourLike(closeHour) : null;
  if (hhmm) return { kind: "exact", bucket: null, hhmm };

  return { kind: null, bucket: null, hhmm: null };
}

function drawPassesHourFilter(draw, hourFilter) {
  if (!hourFilter || !hourFilter.kind) return true;

  const raw = draw?.close_hour ?? draw?.closeHour ?? draw?.hour ?? draw?.hora ?? "";
  const norm = normalizeHourLike(raw);

  if (hourFilter.kind === "exact") {
    return norm === normalizeHourLike(hourFilter.hhmm);
  }

  if (hourFilter.kind === "bucket") {
    return toHourBucket(norm) === toHourBucket(hourFilter.bucket);
  }

  return true;
}

/* =========================
   Date utils
========================= */

function normalizeToYMD(input) {
  return normalizeToYMD_SP(input);
}

function normalizePositions(positions) {
  const arr =
    Array.isArray(positions) && positions.length ? positions.map(Number).filter((n) => Number.isFinite(n) && n > 0) : null;

  if (!arr || !arr.length) return null;
  return Array.from(new Set(arr)).sort((a, b) => a - b);
}

/* =========================
   ✅ Guards (evita GRUPO 00)
========================= */

function isValidGrupo(n) {
  return Number.isFinite(Number(n)) && Number(n) >= 1 && Number(n) <= 25;
}

function isValidPosition(n) {
  return Number.isFinite(Number(n)) && Number(n) >= 1 && Number(n) <= 10;
}

/* =========================
   ✅ Helpers de parsing (robusto p/ strings tipo "GRUPO 23", "1º")
========================= */

function extractIntInRange(value, min, max) {
  if (value === null || value === undefined) return null;

  if (typeof value === "number" && Number.isFinite(value)) {
    const n = Math.trunc(value);
    return n >= min && n <= max ? n : null;
  }

  const s = String(value).trim();
  if (!s) return null;

  if (/^\d+$/.test(s)) {
    const n = Number(s);
    return Number.isFinite(n) && n >= min && n <= max ? n : null;
  }

  const m = s.match(/(\d{1,2})/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

/* =========================
   ✅ Helpers de dígitos (REGRA GLOBAL 7º = CENTENA)
========================= */

function normalizeDigitsOnly(v) {
  const s = String(v ?? "").trim();
  if (!s) return "";
  return s.replace(/\D+/g, "");
}

function prizeWidthByPosition(position) {
  return Number(position) === 7 ? 3 : 4;
}

function toPrizeDigitsByPosition(input, position) {
  const digits = normalizeDigitsOnly(input);
  if (!digits) return null;

  const w = prizeWidthByPosition(position);

  if (w === 3) {
    const last3 = digits.slice(-3).padStart(3, "0");
    return /^\d{3}$/.test(last3) ? last3 : null;
  }

  const last4 = digits.slice(-4).padStart(4, "0");
  return /^\d{4}$/.test(last4) ? last4 : null;
}

function digitsToDezena2(numStr) {
  const s = String(numStr || "");
  if (!/^\d{2,4}$/.test(s)) return null;
  return s.slice(-2);
}

function digitsToCentena3(numStr) {
  const s = String(numStr || "");
  if (!/^\d{3,4}$/.test(s)) return null;
  return s.slice(-3);
}

function normalizeLotteryCodeAny(d) {
  const raw =
    d?.lottery_code ??
    d?.lotteryCode ??
    d?.lot_code ??
    d?.lotCode ??
    d?.lot ??
    d?.code ??
    null;
  const up = raw ? String(raw).trim().toUpperCase() : "";
  return up || "";
}

function sortDrawsLocal(draws) {
  const toNum = (h) => {
    const s = normalizeHourLike(h);
    const m = s.match(/^(\d{2}):(\d{2})$/);
    if (!m) return 0;
    return Number(m[1]) * 100 + Number(m[2]);
  };

  return [...(draws || [])].sort((a, b) => {
    const ya = String(a?.ymd || "");
    const yb = String(b?.ymd || "");
    if (ya !== yb) return ya.localeCompare(yb);

    const ha = toNum(a?.close_hour);
    const hb = toNum(b?.close_hour);
    if (ha !== hb) return ha - hb;

    // ✅ estabilidade: lottery_code
    const la = normalizeLotteryCodeAny(a);
    const lb = normalizeLotteryCodeAny(b);
    if (la !== lb) return la.localeCompare(lb);

    const ia = String(a?.drawId || a?.id || "");
    const ib = String(b?.drawId || b?.id || "");
    return ia.localeCompare(ib);
  });
}

function sortDrawsLocalDesc(draws) {
  const toNum = (h) => {
    const s = normalizeHourLike(h);
    const m = s.match(/^(\d{2}):(\d{2})$/);
    if (!m) return 0;
    return Number(m[1]) * 100 + Number(m[2]);
  };

  return [...(draws || [])].sort((a, b) => {
    const ya = String(a?.ymd || "");
    const yb = String(b?.ymd || "");
    if (ya !== yb) return yb.localeCompare(ya);

    const ha = toNum(a?.close_hour);
    const hb = toNum(b?.close_hour);
    if (ha !== hb) return hb - ha;

    // ✅ estabilidade: lottery_code
    const la = normalizeLotteryCodeAny(a);
    const lb = normalizeLotteryCodeAny(b);
    if (la !== lb) return lb.localeCompare(la);

    const ia = String(a?.drawId || a?.id || "");
    const ib = String(b?.drawId || b?.id || "");
    return ib.localeCompare(ia);
  });
}

/**
 * ✅ DEDUPE
 * - chave lógica: ymd + hour (+ lottery_code quando existir)
 * - se não houver ymd/hour, cai no id/idx
 *
 * ✅ FIX CRÍTICO:
 * Não colapsar dois draws distintos do mesmo dia/horário com lottery_code diferente.
 */
function dedupeDrawsLocal(draws) {
  const arr = Array.isArray(draws) ? draws : [];

  const byKey = new Map();
  const order = [];

  function score(d) {
    const prizesLen = Array.isArray(d?.prizes) ? d.prizes.length : 0;
    const pc = Number.isFinite(Number(d?.prizesCount)) ? Number(d.prizesCount) : 0;
    const hasLogical = !!(d?.ymd && d?.close_hour);
    return prizesLen * 1_000_000 + pc * 1_000 + (hasLogical ? 10 : 0);
  }

  for (let i = 0; i < arr.length; i += 1) {
    const raw = arr[i] || {};

    const ymd = raw.ymd || normalizeToYMD(raw.date) || "";
    const hour = normalizeHourLike(raw.close_hour || raw.closeHour || "");

    const lotCode = normalizeLotteryCodeAny(raw); // ✅ PT, PTM, etc.

    const drawId = raw.drawId ?? raw.id ?? raw.__name__ ?? null;
    const idStr = drawId != null ? String(drawId) : "";

    const hasLogical = !!(ymd && hour);

    // ✅ se houver lottery_code, entra na chave lógica
    const key = hasLogical ? (lotCode ? `${ymd}__${hour}__${lotCode}` : `${ymd}__${hour}`) : `id__${idStr || `idx_${i}`}`;

    const normalized = {
      ...raw,
      ymd: ymd || raw.ymd || null,
      close_hour: hour || raw.close_hour || raw.closeHour || "",
      closeHour: hour || raw.closeHour || raw.close_hour || "",
      lottery_code: lotCode || raw.lottery_code || raw.lotteryCode || null,
      drawId: raw.drawId || raw.id || raw.__name__ || null,
      id: raw.id || raw.drawId || raw.__name__ || null,
    };

    if (!byKey.has(key)) {
      byKey.set(key, normalized);
      order.push(key);
      continue;
    }

    const prev = byKey.get(key);
    if (score(normalized) > score(prev)) {
      byKey.set(key, normalized);
    }
  }

  return order.map((k) => byKey.get(k)).filter(Boolean);
}

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

  await Promise.all(Array.from({ length: Math.min(concurrency, arr.length) }, () => worker()));
  return results;
}

/* =========================
   ✅ Leitura: smart (custo baixo)
========================= */

async function safeGetDocsSmart(qRef, { policy = DEFAULT_READ_POLICY } = {}) {
  const p = String(policy || "cache").toLowerCase();

  if (p === "server") {
    try {
      const snap = await getDocsFromServer(qRef);
      return { snap, error: null, source: "server" };
    } catch (e) {
      try {
        const snap = await getDocs(qRef);
        return { snap, error: null, source: "cache_fallback" };
      } catch (e2) {
        return { snap: null, error: e2, source: "error" };
      }
    }
  }

  // ✅ cache-first:
  // - tenta getDocs (pode vir do cache do SDK)
  // - se vier vazio, tenta server uma vez (quando possível)
  try {
    const snapCache = await getDocs(qRef);
    if (snapCache?.docs?.length) return { snap: snapCache, error: null, source: "cache" };

    try {
      const snapServer = await getDocsFromServer(qRef);
      return { snap: snapServer, error: null, source: "server_fallback" };
    } catch (_e2) {
      return { snap: snapCache, error: null, source: "cache_empty" };
    }
  } catch (_e) {
    try {
      const snap = await getDocsFromServer(qRef);
      return { snap, error: null, source: "server_after_cache_error" };
    } catch (e2) {
      return { snap: null, error: e2, source: "error" };
    }
  }
}

function isIndexError(error) {
  const msg = String(error?.message || "").toLowerCase();
  const code = String(error?.code || "").toLowerCase();
  return (
    code.includes("failed-precondition") ||
    msg.includes("failed_precondition") ||
    (msg.includes("index") && msg.includes("create")) ||
    (msg.includes("requires") && msg.includes("index"))
  );
}

function getDocDateRaw(d) {
  if (!d) return null;
  return d.ymd ?? d.date ?? d.data ?? d.dt ?? d.draw_date ?? d.close_date ?? null;
}

/* =========================
   Prizes (ROBUSTO + CACHE)
========================= */

function normalizePrize(p, prizeId) {
  const rawGrupo =
    p?.grupo ??
    p?.group ??
    p?.grupo2 ??
    p?.group2 ??
    p?.animal_grupo ??
    p?.g ??
    p?.grupo_animal ??
    p?.grupoAnimal ??
    null;

  const rawPos =
    p?.position ??
    p?.posicao ??
    p?.pos ??
    p?.colocacao ??
    p?.place ??
    p?.premio ??
    p?.prize ??
    p?.p ??
    null;

  const rawMilhar =
    p?.milhar ??
    p?.milhar4 ??
    p?.numero ??
    p?.number ??
    p?.num ??
    p?.valor ??
    p?.n ??
    null;

  const grupo = extractIntInRange(rawGrupo, 1, 25);
  const position = extractIntInRange(rawPos, 1, 10);

  const numero = toPrizeDigitsByPosition(rawMilhar, position);
  const digitsLen = numero ? numero.length : null;

  const dezena2 = numero ? digitsToDezena2(numero) : null;
  const centena3 = numero ? digitsToCentena3(numero) : null;

  const milhar4 = numero && numero.length === 4 ? numero : null;

  return {
    prizeId: prizeId ?? p?.prizeId ?? null,
    ...p,

    grupo,
    position,

    numero: numero || null,
    digitsLen,

    milhar4: milhar4 || null,
    milhar: numero || p?.milhar || null,

    dezena2: dezena2 || null,
    centena3: centena3 || null,

    animal: p?.animal ?? p?.label ?? "",
  };
}

function sortPrizesByPosition(prizes) {
  return [...(prizes || [])].sort((a, b) => {
    const pa = Number.isFinite(Number(a?.position)) ? Number(a.position) : 999;
    const pb = Number.isFinite(Number(b?.position)) ? Number(b.position) : 999;
    return pa - pb;
  });
}

function prizesCacheKeyAll(drawId) {
  return `all::${String(drawId)}`;
}

function filterPrizesByPositions(prizesAllSorted, positionsArr) {
  if (!positionsArr || !positionsArr.length) return prizesAllSorted;
  const set = new Set(positionsArr.map(Number));
  return prizesAllSorted.filter((p) => set.has(Number(p.position)));
}

/**
 * ✅ FIX DEFINITIVO:
 * Se existir embeddedPrizes mas vier "agregado/incompleto" (sem grupo/posição válidos),
 * faz fallback e busca a subcollection draws/{id}/prizes.
 */
async function fetchPrizesForDraw(drawId, positionsArr, embeddedPrizes) {
  const drawKey = String(drawId || "").trim();
  if (!drawKey) return [];

  if (Array.isArray(embeddedPrizes) && embeddedPrizes.length) {
    const normalized = embeddedPrizes.map((p, idx) => normalizePrize(p, p?.prizeId ?? `emb_${idx}`));

    const cleaned = normalized.filter((x) => isValidGrupo(x?.grupo) && isValidPosition(x?.position));

    if (cleaned.length) {
      const allSorted = sortPrizesByPosition(cleaned);
      return filterPrizesByPositions(allSorted, positionsArr);
    }
  }

  const allKey = prizesCacheKeyAll(drawKey);
  const cachedAll = cacheGet(PRIZES_CACHE, allKey);
  if (cachedAll) return filterPrizesByPositions(cachedAll, positionsArr);

  const prizesCol = collection(db, "draws", drawKey, "prizes");

  // ✅ prizes: cache-first (custo baixo); se vazio, server fallback
  const { snap, error } = await safeGetDocsSmart(prizesCol, { policy: "cache" });
  if (error) throw error;

  const allRaw = snap.docs.map((d) => normalizePrize(d.data(), d.id));

  const all = allRaw.filter((x) => isValidGrupo(x?.grupo) && isValidPosition(x?.position));

  const allSorted = sortPrizesByPosition(all);
  cacheSet(PRIZES_CACHE, allKey, allSorted);

  return filterPrizesByPositions(allSorted, positionsArr);
}

/* =========================
   Map Draw
========================= */

function mapDrawDoc(doc) {
  const d = doc.data();

  const ymd = d.ymd || normalizeToYMD(getDocDateRaw(d));
  const hourNorm = normalizeHourLike(d.close_hour ?? d.closeHour ?? d.hour ?? d.hora ?? "");

  const embeddedPrizes = Array.isArray(d.prizes) ? d.prizes : null;

  const ufRaw = d.uf ?? null;
  const lotteryKeyRaw = d.lottery_key ?? d.lotteryKey ?? d.lottery ?? null;

  const lotteryCodeRaw =
    d.lottery_code ??
    d.lotteryCode ??
    d.lot_code ??
    d.lotCode ??
    d.lot ??
    d.code ??
    d.lottery_id ??
    d.lotteryId ??
    null;

  return {
    drawId: doc.id,
    id: doc.id,

    date: d.date ?? d.data ?? d.dt ?? d.draw_date ?? d.close_date ?? null,
    ymd,

    close_hour: hourNorm,
    closeHour: hourNorm,

    uf: ufRaw,
    lottery_key: lotteryKeyRaw,

    // ✅ exposto no draw mapeado
    lottery_code: lotteryCodeRaw ? String(lotteryCodeRaw).toUpperCase() : null,

    prizesCount: d.prizesCount,
    prizes: embeddedPrizes,
  };
}

/* =========================
   Compat: uf OU lottery_key
========================= */

function buildUfWhereClauses(fieldName, uf) {
  const normalized = normalizeValueForField(fieldName, uf);
  return [where(fieldName, "==", normalized)];
}

function normalizeOrderBys(extraOrderBy) {
  if (!extraOrderBy) return [];
  return Array.isArray(extraOrderBy) ? extraOrderBy.filter(Boolean) : [extraOrderBy];
}

async function queryDrawsByField({
  fieldName,
  uf,
  extraWheres = [],
  extraOrderBy = null,
  extraLimit = null,
  policy = DEFAULT_READ_POLICY,
}) {
  const drawsCol = collection(db, "draws");

  const parts = [
    drawsCol,
    ...buildUfWhereClauses(fieldName, uf),
    ...buildRJLockWhereIfNeeded(fieldName, uf),
    ...(extraWheres || []),
  ];

  const orderBys = normalizeOrderBys(extraOrderBy);
  for (const ob of orderBys) parts.push(ob);

  if (extraLimit) parts.push(extraLimit);

  const qRef = query(...parts);
  return safeGetDocsSmart(qRef, { policy });
}

function extractUfParam(maybeUfOrObj) {
  if (!maybeUfOrObj) return "";
  if (typeof maybeUfOrObj === "string") return maybeUfOrObj;
  if (typeof maybeUfOrObj === "object" && typeof maybeUfOrObj.uf === "string") return maybeUfOrObj.uf;
  return String(maybeUfOrObj || "");
}

async function fetchDrawDocsPreferUf({
  uf,
  extraWheres = [],
  extraOrderBy = null,
  extraLimit = null,
  policy = DEFAULT_READ_POLICY,
}) {
  const ufTrim = String(extractUfParam(uf) || "").trim();
  const ufUp = ufTrim.toUpperCase();

  // 1) tenta por uf
  {
    const { snap, error } = await queryDrawsByField({
      fieldName: "uf",
      uf: ufUp,
      extraWheres,
      extraOrderBy,
      extraLimit,
      policy,
    });

    if (!error && snap?.docs?.length) return { docs: snap.docs, usedField: "uf", error: null };
    if (error) return { docs: [], usedField: "uf", error };
  }

  // 2) fallback por lottery_key
  {
    // ✅ Federal: tenta em cascata por possíveis lottery_key (sem OR no Firestore)
    if (isFederalInput(ufUp)) {
      for (const lk of FEDERAL_LOTTERY_KEYS) {
        const { snap, error } = await queryDrawsByField({
          fieldName: "lottery_key",
          uf: lk,
          extraWheres,
          extraOrderBy,
          extraLimit,
          policy,
        });

        if (error) return { docs: [], usedField: "lottery_key", error };
        if (snap?.docs?.length) {
          return { docs: snap.docs, usedField: "lottery_key", error: null };
        }
      }

      return { docs: [], usedField: "lottery_key", error: null };
    }

    const lotteryKey = ufUp === RJ_STATE_CODE ? RJ_LOTTERY_KEY : resolveLotteryKeyForQuery(ufTrim);

    const { snap, error } = await queryDrawsByField({
      fieldName: "lottery_key",
      uf: String(lotteryKey).toUpperCase(),
      extraWheres,
      extraOrderBy,
      extraLimit,
      policy,
    });

    if (!error && snap?.docs?.length) return { docs: snap.docs, usedField: "lottery_key", error: null };
    if (error) return { docs: [], usedField: "lottery_key", error };
  }

  return { docs: [], usedField: "none", error: null };
}

/* =========================
   Bounds (min/max reais)
========================= */

function pickMinMaxFromMapped(mapped) {
  let minYmd = null;
  let maxYmd = null;

  for (const d of mapped) {
    const y = d?.ymd || normalizeToYMD(d?.date);
    if (!y || !isYMD(y)) continue;
    if (!minYmd || y < minYmd) minYmd = y;
    if (!maxYmd || y > maxYmd) maxYmd = y;
  }

  return { minYmd, maxYmd };
}

// ✅ bounds (robusto) — evita “maxYmd preso” por fallback baseado em docId
function utcTodayYmd() {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = pad2(d.getUTCMonth() + 1);
  const dd = pad2(d.getUTCDate());
  return `${y}-${m}-${dd}`;
}

function ymdToUTCDateLocal(ymd) {
  const m = String(ymd || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

function addDaysUTCLocal(ymd, days) {
  const dt = ymdToUTCDateLocal(ymd);
  if (!dt) return ymd;
  dt.setUTCDate(dt.getUTCDate() + Number(days || 0));
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

/**
 * ✅ “Prova de vida” do maxYmd sem depender de índice composto nem de docId:
 * tenta dias recentes (==) desc até achar pelo menos 1 draw.
 * (where ymd == dia) usa índice single-field e é MUITO estável.
 */
async function probeRecentMaxYmd(uf, lookbackDays = 45) {
  const base = utcTodayYmd();
  const n = Math.max(3, Math.min(120, Number(lookbackDays) || 45));

  for (let i = 0; i <= n; i += 1) {
    const day = addDaysUTCLocal(base, -i);
    const { docs, error } = await fetchDrawDocsPreferUf({
      uf,
      extraWheres: [where("ymd", "==", day)],
      policy: "server",
      extraLimit: limit(5),
    });
    if (error) return { ok: false, maxYmd: null, error };
    if (docs && docs.length) return { ok: true, maxYmd: day, error: null };
  }

  return { ok: false, maxYmd: null, error: null };
}

/**
 * ✅ COMPAT:
 * - aceita getKingBoundsByUf("RJ")
 * - aceita getKingBoundsByUf({ uf: "RJ" })
 * - aceita getKingBoundsByUf("FEDERAL") (se existir no Firestore)
 */
/**
 * ✅ API bounds (backend) — fonte única preferencial
 * - usa /api/bounds?lottery=...
 * - valida min/max
 * - retorna também minDocId/maxDocId quando existir
 */
async function fetchBoundsFromApi(ufOrObj) {
  const uf = String(extractUfParam(ufOrObj) || "").trim();
  if (!uf) return { ok: false, error: new Error("uf vazio") };

  // backend aceita ?lottery= e normaliza RJ/FEDERAL/aliases
  // aqui mandamos chave canônica (evita ambiguidade)
  const lot = canonicalScopeKey(uf) || String(uf).trim().toUpperCase();
  const url = apiUrl(`/api/bounds?lottery=${encodeURIComponent(lot)}`);
  try {
    const r = await fetch(url, { method: "GET" });
    const j = await r.json().catch(() => null);

    if (!r.ok || !j || !j.ok) {
      return {
        ok: false,
        error: new Error(`bounds api not ok: ${j?.message || r.status}`),
        payload: j || null,
      };
    }

    const minYmd = String(j.minYmd || "").trim();
    const maxYmd = String(j.maxYmd || "").trim();
    if (!isYMD(minYmd) || !isYMD(maxYmd)) {
      return {
        ok: false,
        error: new Error("bounds api retornou min/max inválidos"),
        payload: j,
      };
    }

    return {
      ok: true,
      uf,
      lottery: String(j.lottery || lot).trim(),
      minYmd,
      maxYmd,
      minDocId: j.minDocId || null,
      maxDocId: j.maxDocId || null,
      source: String(j.source || "api_bounds"),
    };
  } catch (e) {
    return { ok: false, error: e };
  }
}
export async function getKingBoundsByUf(ufOrObj) {
  const uf = String(extractUfParam(ufOrObj) || "").trim();
  if (!uf) throw new Error("Parâmetro obrigatório: uf");

  // ✅ 0) Preferencial: backend /api/bounds (mais barato e confiável)
  const apiTry = await fetchBoundsFromApi(ufOrObj);
  if (apiTry?.ok) {
    const scopeKey = canonicalScopeKey(uf);
    const floored = applyBoundsFloor(scopeKey, { minYmd: apiTry.minYmd, maxYmd: apiTry.maxYmd });

    return {
      ok: true,
      uf,

      minYmd: floored.minYmd,
      maxYmd: floored.maxYmd,


      // ✅ compat: UI antiga espera minDate/maxDate
      minDate: floored.minYmd,
      maxDate: floored.maxYmd,

      // extras (debug/auditoria)
      minDocId: apiTry.minDocId || null,
      maxDocId: apiTry.maxDocId || null,

      source: `api_bounds:${apiTry.source}`,
    };
  }

  const SCAN_LIMIT = 50;
  const FALLBACK_EDGE_LIMIT = 600;

  let firstTryError = null;

  const DOC_ID = documentId();

  async function sampleEdgesByDocId(fieldName, ufValue) {
    // ✅ bounds: server-first (frescor > custo)
    const asc = await queryDrawsByField({
      fieldName,
      uf: ufValue,
      extraOrderBy: [orderBy(DOC_ID)],
      extraLimit: limit(FALLBACK_EDGE_LIMIT),
      policy: "server",
    });

    const last = await queryDrawsByField({
      fieldName,
      uf: ufValue,
      extraOrderBy: [orderBy(DOC_ID)],
      extraLimit: limitToLast(FALLBACK_EDGE_LIMIT),
      policy: "server",
    });

    const mappedA = (asc?.snap?.docs || []).map(mapDrawDoc);
    const mappedB = (last?.snap?.docs || []).map(mapDrawDoc);

    const merged = dedupeDrawsLocal([...mappedA, ...mappedB]);

    return {
      merged,
      ok: merged.length > 0,
      errors: [asc?.error, last?.error].filter(Boolean),
      sources: [asc?.source, last?.source].filter(Boolean),
    };
  }

  // 1) tenta min/max via orderBy(ymd) + docId
  {
    const orderAsc = [orderBy("ymd", "asc"), orderBy(DOC_ID)];
    const orderDesc = [orderBy("ymd", "desc"), orderBy(DOC_ID)];

    const { docs: minDocs, usedField: usedMin, error: eMin } = await fetchDrawDocsPreferUf({
      uf,
      extraOrderBy: orderAsc,
      extraLimit: limit(SCAN_LIMIT),
      policy: "server",
    });

    const { docs: maxDocs, usedField: usedMax, error: eMax } = await fetchDrawDocsPreferUf({
      uf,
      extraOrderBy: orderDesc,
      extraLimit: limit(SCAN_LIMIT),
      policy: "server",
    });

    if (eMin || eMax) {
      if (!isIndexError(eMin) && !isIndexError(eMax)) firstTryError = eMin || eMax;
    }

    if (minDocs.length && maxDocs.length && !eMin && !eMax) {
      const mappedMin = minDocs.map(mapDrawDoc);
      const mappedMax = maxDocs.map(mapDrawDoc);

      const { minYmd } = pickMinMaxFromMapped(mappedMin);
      const { maxYmd } = pickMinMaxFromMapped(mappedMax);

      if (minYmd && maxYmd) {
        return {
          ok: true,
          uf,
          minYmd,
          maxYmd,

          // ✅ compat: UI antiga espera minDate/maxDate
          minDate: minYmd,
          maxDate: maxYmd,

          source: `ymd_scan${SCAN_LIMIT}:${usedMin}/${usedMax}`,
        };
      }
    }
  }

  // ✅ 1.5) “anti-trava”: acha maxYmd recente via probe (mesmo se índice faltar)
  const recentProbe = await probeRecentMaxYmd(uf, 60);
  const recentMaxYmd = recentProbe?.ok ? recentProbe.maxYmd : null;

  
  const scopeKeyBounds = canonicalScopeKey(uf);
// 2) fallback robusto: bordas via documentId (para min) + correção de max via probe
  {
    const idxInfo = (() => {
      const code = String(firstTryError?.code || "");
      const msg = String(firstTryError?.message || "");
      if (!code && !msg) return "";
      return `:firstTryError=${code || "err"}`;
    })();

    const a = await sampleEdgesByDocId("uf", String(uf).toUpperCase());

    const ufUp = String(uf || "").trim().toUpperCase();

    // ✅ Para Federal: tenta bordas por lottery_key em cascata
    if (!a.ok && isFederalInput(ufUp)) {
      for (const lk of FEDERAL_LOTTERY_KEYS) {
        const b = await sampleEdgesByDocId("lottery_key", lk);
        if (b.ok) {
          const mm = pickMinMaxFromMapped(b.merged);

          const maxFixed = recentMaxYmd && (!mm.maxYmd || recentMaxYmd > mm.maxYmd) ? recentMaxYmd : mm.maxYmd;

          const floored = applyBoundsFloor(scopeKeyBounds, {
            minYmd: mm.minYmd || null,
            maxYmd: maxFixed || null,
          });

          return {
            ok: !!(floored.minYmd && floored.maxYmd),
            uf,

            minYmd: floored.minYmd,
            maxYmd: floored.maxYmd,

            // ✅ compat: UI antiga espera minDate/maxDate
            minDate: floored.minYmd,
            maxDate: floored.maxYmd,

            source: `fallback_edges_docId_limit=${FALLBACK_EDGE_LIMIT}:lottery_key(${lk}):sampleCount=${b.merged.length}${
              recentMaxYmd ? ":max_probe" : ""
            }${idxInfo}`,
          };
        }
      }
    }

    const lotteryKey = ufUp === RJ_STATE_CODE ? RJ_LOTTERY_KEY : resolveLotteryKeyForQuery(uf);

    const b = a.ok ? null : await sampleEdgesByDocId("lottery_key", String(lotteryKey).toUpperCase());

    const merged = a.ok ? a.merged : b?.merged || [];
    const mm = pickMinMaxFromMapped(merged);

    const maxFixed = recentMaxYmd && (!mm.maxYmd || recentMaxYmd > mm.maxYmd) ? recentMaxYmd : mm.maxYmd;

    const floored = applyBoundsFloor(scopeKeyBounds, {
      minYmd: mm.minYmd || null,
      maxYmd: maxFixed || null,
    });

    return {
      ok: !!(floored.minYmd && floored.maxYmd),
      uf,

      minYmd: floored.minYmd,
      maxYmd: floored.maxYmd,

      // ✅ compat: UI antiga espera minDate/maxDate
      minDate: floored.minYmd,
      maxDate: floored.maxYmd,

      source: `fallback_edges_docId_limit=${FALLBACK_EDGE_LIMIT}:${a.ok ? "uf" : "lottery_key"}:sampleCount=${
        merged.length
      }${recentMaxYmd ? ":max_probe" : ""}${idxInfo}`,
    };
  }
}/* =========================
   API: Day
========================= */

function drawsCacheKeyDay({ scopeKey, ymd, positionsArr, hourFilter }) {
  const p = positionsArr && positionsArr.length ? positionsArr.join(",") : "all";
  const h =
    hourFilter?.kind === "bucket"
      ? `bucket:${hourFilter.bucket}`
      : hourFilter?.kind === "exact"
      ? `exact:${hourFilter.hhmm}`
      : "all";
  return `day::${scopeKey}::${ymd}::pos=${p}::h=${h}`;
}

export async function getKingResultsByDate({
  uf,
  date,
  closeHour = null,
  closeHourBucket = null,
  positions = null,
}) {
  if (!uf || !date) throw new Error("Parâmetros obrigatórios: uf e date");

  const scopeKey = canonicalScopeKey(uf);

  const positionsArr = normalizePositions(positions);
  const ymdDate = normalizeToYMD(date);
  if (!ymdDate) return [];

  const hourFilter = resolveHourFilter({ closeHour, closeHourBucket });

  const dayKey = drawsCacheKeyDay({ scopeKey, ymd: ymdDate, positionsArr, hourFilter });
  const cached = cacheGet(DRAWS_CACHE, dayKey);
  if (cached) return cached;

  const docCandidates = [];

  // 1) tenta por ymd (melhor)
  {
    const { docs: found, error } = await fetchDrawDocsPreferUf({
      uf,
      extraWheres: [where("ymd", "==", ymdDate)],
      policy: DEFAULT_READ_POLICY,
    });
    if (error) throw error;
    if (found.length) docCandidates.push(...found);
  }

  // 2) fallback por date (tenta o original)
  if (!docCandidates.length) {
    const rawDate = String(date || "").trim();
    if (rawDate) {
      const { docs: found, error } = await fetchDrawDocsPreferUf({
        uf,
        extraWheres: [where("date", "==", rawDate)],
        policy: DEFAULT_READ_POLICY,
      });
      if (error) throw error;
      if (found.length) docCandidates.push(...found);
    }
  }

  // 3) fallback por date usando ymdDate
  if (!docCandidates.length) {
    const { docs: found, error } = await fetchDrawDocsPreferUf({
      uf,
      extraWheres: [where("date", "==", ymdDate)],
      policy: DEFAULT_READ_POLICY,
    });
    if (error) throw error;
    if (found.length) docCandidates.push(...found);
  }

  // 4) fallback BR dd/mm/yyyy
  if (!docCandidates.length) {
    const brDate = ymdToBR(ymdDate);
    if (brDate) {
      const { docs: found, error } = await fetchDrawDocsPreferUf({
        uf,
        extraWheres: [where("date", "==", brDate)],
        policy: DEFAULT_READ_POLICY,
      });
      if (error) throw error;
      if (found.length) docCandidates.push(...found);
    }
  }

  if (!docCandidates.length) return [];

  let baseAll = dedupeDrawsLocal(docCandidates.map(mapDrawDoc));
  baseAll = baseAll.filter((x) => (x.ymd || normalizeToYMD(x.date)) === ymdDate);

  const base = hourFilter?.kind ? baseAll.filter((d) => drawPassesHourFilter(d, hourFilter)) : baseAll;
  const ordered = sortDrawsLocal(base);

  const results = await mapWithConcurrency(ordered, 6, async (item) => {
    const prizes = await fetchPrizesForDraw(item.drawId, positionsArr, item.prizes);
    const pc = Array.isArray(prizes) ? prizes.length : 0;
    return { ...item, prizes, prizesCount: pc, __mode: "detailed" };
  });

  const out = dedupeDrawsLocal(results);
  cacheSet(DRAWS_CACHE, dayKey, out);
  return out;
}

/* =========================
   API: Range
========================= */

function ymdToUTCDate(ymd) {
  const m = String(ymd || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

function addDaysUTC(ymd, days) {
  const dt = ymdToUTCDate(ymd);
  if (!dt) return ymd;
  dt.setUTCDate(dt.getUTCDate() + Number(days || 0));
  const y = dt.getUTCFullYear();
  const m = pad2(dt.getUTCMonth() + 1);
  const d = pad2(dt.getUTCDate());
  return `${y}-${m}-${d}`;
}

function daysBetweenInclusiveUTC(a, b) {
  const da = ymdToUTCDate(a);
  const db = ymdToUTCDate(b);
  if (!da || !db) return NaN;
  const ms = db.getTime() - da.getTime();
  return Math.floor(ms / 86400000) + 1;
}

function daysDiffUTC(fromYmd, toYmd) {
  const da = ymdToUTCDate(fromYmd);
  const db = ymdToUTCDate(toYmd);
  if (!da || !db) return NaN;
  const ms = db.getTime() - da.getTime();
  return Math.floor(ms / 86400000);
}

function drawsCacheKeyRange({ scopeKey, from, to, positionsArr, hourFilter, mode }) {
  const p = positionsArr && positionsArr.length ? positionsArr.join(",") : "all";
  const h =
    hourFilter?.kind === "bucket"
      ? `bucket:${hourFilter.bucket}`
      : hourFilter?.kind === "exact"
      ? `exact:${hourFilter.hhmm}`
      : "all";
  const m = mode ? String(mode) : "detailed";
  return `range::${scopeKey}::${from}..${to}::pos=${p}::h=${h}::mode=${m}`;
}

// ✅ mais estável no browser (evita flood/timeout)
function chooseRangeConcurrency(drawCount) {
  if (!Number.isFinite(drawCount)) return 6;
  if (drawCount <= 50) return 4;
  if (drawCount <= 300) return 6;
  if (drawCount <= 1200) return 8;
  return 10;
}

export function decideKingRangeMode({ dateFrom, dateTo, mode = "detailed" }) {
  const ymdFrom = normalizeToYMD(dateFrom);
  const ymdTo = normalizeToYMD(dateTo);
  if (!ymdFrom || !ymdTo) return "detailed";

  if (mode === "detailed" || mode === "aggregated") return mode;
  if (mode !== "auto") return "detailed";

  const days = daysBetweenInclusiveUTC(ymdFrom, ymdTo);
  if (!Number.isFinite(days) || days <= 0) return "detailed";
  return days >= AGGREGATED_AUTO_DAYS ? "aggregated" : "detailed";
}

/**
 * ✅ Fallback barato (SEM prizes): usado quando falta índice composto no RANGE,
 * ou quando você quer aggregated sem custo de hidratar.
 */
async function fetchDrawsDayNoPrizes({ uf, dayYmd }) {
  const { docs, error } = await fetchDrawDocsPreferUf({
    uf,
    extraWheres: [where("ymd", "==", dayYmd)],
    policy: DEFAULT_READ_POLICY,
  });
  if (error) throw error;
  if (!docs || !docs.length) return [];

  let baseAll = dedupeDrawsLocal(docs.map(mapDrawDoc));
  baseAll = baseAll.filter((x) => (x.ymd || normalizeToYMD(x.date)) === dayYmd);

  const ordered = sortDrawsLocal(baseAll);

  // ✅ prizesCount coerente no aggregated
  return ordered.map((d) => {
    const embedded = Array.isArray(d?.prizes) ? d.prizes : [];
    return { ...d, prizes: [], prizesCount: embedded.length || 0, __mode: "aggregated" };
  });
}

export async function getKingResultsByRange({
  uf,
  dateFrom,
  dateTo,
  closeHour = null,
  closeHourBucket = null,
  positions = null,
  mode = "detailed",
}) {
  if (!uf || !dateFrom || !dateTo) {
    throw new Error("Parâmetros obrigatórios: uf, dateFrom, dateTo");
  }

  const scopeKey = canonicalScopeKey(uf);

  const positionsArr = normalizePositions(positions);

  const ymdFrom = normalizeToYMD(dateFrom);
  const ymdTo = normalizeToYMD(dateTo);
  if (!ymdFrom || !ymdTo) return [];

  const hourFilter = resolveHourFilter({ closeHour, closeHourBucket });

  const effectiveMode = decideKingRangeMode({
    dateFrom: ymdFrom,
    dateTo: ymdTo,
    mode,
  });

  const rangeKey = drawsCacheKeyRange({
    scopeKey,
    from: ymdFrom,
    to: ymdTo,
    positionsArr,
    hourFilter,
    mode: effectiveMode,
  });
  const cached = cacheGet(DRAWS_CACHE, rangeKey);
  if (cached) return cached;

  const DOC_ID = documentId();
  const rangeOrder = [orderBy("ymd", "asc"), orderBy(DOC_ID)];

  const { docs, error, usedField } = await fetchDrawDocsPreferUf({
    uf,
    extraWheres: [where("ymd", ">=", ymdFrom), where("ymd", "<=", ymdTo)],
    extraOrderBy: rangeOrder,
    policy: DEFAULT_READ_POLICY,
  });

  if (error) {
    if (isIndexError(error)) {
      const days = daysBetweenInclusiveUTC(ymdFrom, ymdTo);
      const MAX_FALLBACK_DAYS = 31;

      if (Number.isFinite(days) && days > 0 && days <= MAX_FALLBACK_DAYS) {
        if (effectiveMode === "aggregated") {
          const all = [];
          for (let i = 0; i < days; i += 1) {
            const day = addDaysUTC(ymdFrom, i);
            const dayDraws = await fetchDrawsDayNoPrizes({ uf, dayYmd: day });
            if (dayDraws.length) all.push(...dayDraws);
          }

          const baseAll = dedupeDrawsLocal(all);
          const base = hourFilter?.kind ? baseAll.filter((d) => drawPassesHourFilter(d, hourFilter)) : baseAll;

          const out = dedupeDrawsLocal(sortDrawsLocal(base));
          cacheSet(DRAWS_CACHE, rangeKey, out);
          return out;
        }

        const all = [];
        for (let i = 0; i < days; i += 1) {
          const day = addDaysUTC(ymdFrom, i);
          const dayDraws = await getKingResultsByDate({
            uf,
            date: day,
            closeHour,
            closeHourBucket,
            positions: positionsArr,
          });
          if (Array.isArray(dayDraws) && dayDraws.length) all.push(...dayDraws);
        }

        const baseAll = dedupeDrawsLocal(all);
        const base = hourFilter?.kind ? baseAll.filter((d) => drawPassesHourFilter(d, hourFilter)) : baseAll;

        const out = dedupeDrawsLocal(sortDrawsLocal(base));
        cacheSet(DRAWS_CACHE, rangeKey, out);
        return out;
      }

      const rawCode = String(error?.code || "");
      const rawMsg = String(error?.message || "");

      throw new Error(
        `Firestore: falta índice composto para RANGE (campo ${usedField} + ymd).
` +
          `Crie/valide o índice no console (Collection: draws | Fields: ${usedField} ASC, ymd ASC, __name__ (documentId) ASC).
` +
          `Obs: fallback automático só é aplicado para ranges até ${MAX_FALLBACK_DAYS} dias.
` +
          (rawCode || rawMsg ? `Detalhe: ${rawCode} ${rawMsg}` : "")
      );
    }

    throw error;
  }

  if (!docs || !docs.length) {
    const days = daysBetweenInclusiveUTC(ymdFrom, ymdTo);
    const MAX_EMPTY_RANGE_FALLBACK_DAYS = 120;

    if (Number.isFinite(days) && days > 0 && days <= MAX_EMPTY_RANGE_FALLBACK_DAYS) {
      if (effectiveMode === "aggregated") {
        const all = [];
        for (let i = 0; i < days; i += 1) {
          const day = addDaysUTC(ymdFrom, i);
          const dayDraws = await fetchDrawsDayNoPrizes({ uf, dayYmd: day });
          if (dayDraws.length) all.push(...dayDraws);
        }

        const baseAll = dedupeDrawsLocal(all);
        const base = hourFilter?.kind ? baseAll.filter((d) => drawPassesHourFilter(d, hourFilter)) : baseAll;

        const out = dedupeDrawsLocal(sortDrawsLocal(base));
        cacheSet(DRAWS_CACHE, rangeKey, out);
        return out;
      }

      const all = [];
      for (let i = 0; i < days; i += 1) {
        const day = addDaysUTC(ymdFrom, i);
        const dayDraws = await getKingResultsByDate({
          uf,
          date: day,
          closeHour,
          closeHourBucket,
          positions: positionsArr,
        });
        if (Array.isArray(dayDraws) && dayDraws.length) all.push(...dayDraws);
      }

      const baseAll = dedupeDrawsLocal(all);
      const base = hourFilter?.kind ? baseAll.filter((d) => drawPassesHourFilter(d, hourFilter)) : baseAll;

      const ordered = sortDrawsLocal(base);

      const conc = chooseRangeConcurrency(ordered.length);
      const results = await mapWithConcurrency(ordered, conc, async (item) => {
        const prizes = await fetchPrizesForDraw(item.drawId, positionsArr, item.prizes);
        const pc = Array.isArray(prizes) ? prizes.length : 0;
        return { ...item, prizes, prizesCount: pc, __mode: "detailed" };
      });

      const out = dedupeDrawsLocal(results);
      cacheSet(DRAWS_CACHE, rangeKey, out);
      return out;
    }

    return [];
  }

  const baseAll = dedupeDrawsLocal(docs.map(mapDrawDoc));
  const base = hourFilter?.kind ? baseAll.filter((d) => drawPassesHourFilter(d, hourFilter)) : baseAll;

  const ordered = sortDrawsLocal(base);

  if (effectiveMode === "aggregated") {
    const out = dedupeDrawsLocal(
      ordered.map((d) => {
        const embedded = Array.isArray(d?.prizes) ? d.prizes : [];
        return {
          ...d,
          prizes: Array.isArray(d?.prizes) ? d.prizes : [],
          prizesCount: Number.isFinite(Number(d?.prizesCount)) ? Number(d.prizesCount) : embedded.length || 0,
          __mode: "aggregated",
        };
      })
    );
    cacheSet(DRAWS_CACHE, rangeKey, out);
    return out;
  }

  const conc = chooseRangeConcurrency(ordered.length);

  const results = await mapWithConcurrency(ordered, conc, async (item) => {
    const prizes = await fetchPrizesForDraw(item.drawId, positionsArr, item.prizes);
    const pc = Array.isArray(prizes) ? prizes.length : 0;
    return { ...item, prizes, prizesCount: pc, __mode: "detailed" };
  });

  const out = dedupeDrawsLocal(results);
  cacheSet(DRAWS_CACHE, rangeKey, out);
  return out;
}

/* =========================
   ✅ Hidratação de prizes (para UX no "Todos")
========================= */

export async function hydrateKingDrawsWithPrizes({ draws, positions = null, concurrency = null }) {
  const arr = Array.isArray(draws) ? draws : [];
  if (!arr.length) return [];

  const positionsArr = normalizePositions(positions);

  const conc =
    Number.isFinite(Number(concurrency)) && Number(concurrency) > 0
      ? Number(concurrency)
      : chooseRangeConcurrency(arr.length);

  const results = await mapWithConcurrency(arr, conc, async (item) => {
    const prizes = await fetchPrizesForDraw(item.drawId, positionsArr, item.prizes);
    const pc = Array.isArray(prizes) ? prizes.length : 0;
    return { ...item, prizes, prizesCount: pc, __mode: "detailed" };
  });

  return dedupeDrawsLocal(results);
}

/* =========================
   ✅ ATRASADOS (Late) — 100% baseado na SUA base
========================= */

function normalizeLotteriesList(lotteries) {
  const arr = Array.isArray(lotteries) ? lotteries : [];
  const cleaned = arr.map((x) => String(x ?? "").trim().toUpperCase()).filter(Boolean);
  return cleaned.length ? Array.from(new Set(cleaned)) : null;
}

function drawPassesLotteriesFilter(draw, lotteriesArr) {
  if (!lotteriesArr || !lotteriesArr.length) return true;
  const code = String(draw?.lottery_code ?? "").trim().toUpperCase();
  if (!code) return false;
  return lotteriesArr.includes(code);
}

function lateCacheKey({ scopeKey, fromYmd, toYmd, baseYmd, prizePosition, hourFilter, lotteriesArr, chunkDays }) {
  const h =
    hourFilter?.kind === "bucket"
      ? `bucket:${hourFilter.bucket}`
      : hourFilter?.kind === "exact"
      ? `exact:${hourFilter.hhmm}`
      : "all";
  const lots = lotteriesArr && lotteriesArr.length ? lotteriesArr.join(",") : "all";
  const cd = Number(chunkDays) || 15;
  const pos = Number(prizePosition) || 1;
  return `late::${scopeKey}::${fromYmd}..${toYmd}::base=${baseYmd}::pos=${pos}::h=${h}::lots=${lots}::chunk=${cd}`;
}

function hourToNumSafe(hhmm) {
  const s = normalizeHourLike(hhmm);
  const m = s.match(/^(\d{2}):(\d{2})$/);
  if (!m) return Number.POSITIVE_INFINITY; // null/invalid vai pro fim (ASC)
  return Number(m[1]) * 100 + Number(m[2]);
}

export async function getKingLateByRange({
  uf,
  dateFrom,
  dateTo,
  baseDate = null,
  lotteries = null,
  prizePosition = 1,
  closeHour = null,
  closeHourBucket = null,
  chunkDays = 15,
}) {
  if (!uf || !dateFrom || !dateTo) {
    throw new Error("Parâmetros obrigatórios: uf, dateFrom, dateTo");
  }

  const scopeKey = canonicalScopeKey(uf);

  const fromYmd = normalizeToYMD(dateFrom);
  const toYmd = normalizeToYMD(dateTo);
  if (!fromYmd || !toYmd) return [];

  const baseYmd = normalizeToYMD(baseDate) || toYmd;

  const hourFilter = resolveHourFilter({ closeHour, closeHourBucket });
  const lotteriesArr = normalizeLotteriesList(lotteries);

  const cacheKey = lateCacheKey({
    scopeKey,
    fromYmd,
    toYmd,
    baseYmd,
    prizePosition,
    hourFilter,
    lotteriesArr,
    chunkDays,
  });

  const cached = cacheGet(LATE_CACHE, cacheKey);
  if (cached) return cached;

  const posNum = Number(prizePosition) || 1;

  const lastSeen = new Map(); // grupo -> { ymd, hour, drawId, lottery_code }

  let cursorTo = toYmd;
  const chunk = Math.max(3, Math.min(60, Number(chunkDays) || 15));

  if (cursorTo < fromYmd) {
    const outEmpty = Array.from({ length: 25 }, (_, i) => ({
      pos: i + 1,
      grupo: i + 1,
      lastYmd: null,
      lastHour: null,
      lastDrawId: null,
      lastLottery: null,
      atrasoDias: null,
    }));
    cacheSet(LATE_CACHE, cacheKey, outEmpty);
    return outEmpty;
  }

  while (cursorTo >= fromYmd && lastSeen.size < 25) {
    let chunkFrom = addDaysUTC(cursorTo, -(chunk - 1));
    if (chunkFrom < fromYmd) chunkFrom = fromYmd;

    const draws = await getKingResultsByRange({
      uf,
      dateFrom: chunkFrom,
      dateTo: cursorTo,
      closeHour,
      closeHourBucket,
      positions: [posNum],
      mode: "detailed",
    });

    const desc = sortDrawsLocalDesc(dedupeDrawsLocal(draws));

    for (const d of desc) {
      if (!d) continue;

      if (hourFilter?.kind && !drawPassesHourFilter(d, hourFilter)) continue;
      if (lotteriesArr && !drawPassesLotteriesFilter(d, lotteriesArr)) continue;

      const ymd = d.ymd || normalizeToYMD(d.date);
      if (!ymd || !isYMD(ymd)) continue;

      const p = Array.isArray(d.prizes)
        ? d.prizes.find((x) => Number(x?.position) === posNum && isValidGrupo(x?.grupo))
        : null;

      const g = p?.grupo;
      if (!isValidGrupo(g)) continue;

      if (!lastSeen.has(g)) {
        lastSeen.set(g, {
          ymd,
          hour: d.close_hour || d.closeHour || "",
          drawId: d.drawId || d.id || null,
          lottery_code: d.lottery_code || null,
        });

        if (lastSeen.size >= 25) break;
      }
    }

    cursorTo = addDaysUTC(chunkFrom, -1);
  }

  const rows = [];
  for (let g = 1; g <= 25; g += 1) {
    const seen = lastSeen.get(g) || null;
    const lastYmd = seen?.ymd || null;
    const diff = lastYmd ? daysDiffUTC(lastYmd, baseYmd) : NaN;
    const atrasoDias = lastYmd && Number.isFinite(diff) ? Math.max(0, diff) : null;

    rows.push({
      pos: 0,
      grupo: g,
      lastYmd,
      lastHour: seen?.hour ? normalizeHourLike(seen.hour) : null,
      lastDrawId: seen?.drawId || null,
      lastLottery: seen?.lottery_code || null,
      atrasoDias,
    });
  }

  // ✅ CRITÉRIO DE DESEMPATE:
  // - atrasoDias DESC
  // - empate: lastHour ASC (09:00 antes de 21:00)
  // - depois: grupo ASC
  const sorted = [...rows].sort((a, b) => {
    const aa = Number.isFinite(Number(a?.atrasoDias)) ? Number(a.atrasoDias) : -1;
    const bb = Number.isFinite(Number(b?.atrasoDias)) ? Number(b.atrasoDias) : -1;
    if (bb !== aa) return bb - aa;

    const ha = hourToNumSafe(a?.lastHour);
    const hb = hourToNumSafe(b?.lastHour);
    if (ha !== hb) return ha - hb;

    return Number(a?.grupo || 0) - Number(b?.grupo || 0);
  });

  const out = sorted.map((r, idx) => ({ ...r, pos: idx + 1 }));

  cacheSet(LATE_CACHE, cacheKey, out);
  return out;
}










