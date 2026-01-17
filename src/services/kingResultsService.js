// src/services/kingResultsService.js
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

// ✅ corte seguro (modo auto) — acima disso, tende a ser "agregado" (sem prizes)
export const AGGREGATED_AUTO_DAYS = 60;

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

/**
 * Resolve qual lottery_key usar quando o usuário passar "RJ".
 * Para outros casos, mantemos o valor original (compatível com seu app atual).
 */
function resolveLotteryKeyForQuery(ufInput) {
  const uf = String(ufInput || "").trim();
  if (!uf) return "";
  if (uf.toUpperCase() === RJ_STATE_CODE) return RJ_LOTTERY_KEY;
  return uf;
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
  if (fieldName === "uf") return s.toUpperCase();
  if (fieldName === "lottery_key") return s.toUpperCase();
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
  const m = String(ymd || "")
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})$/);
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

/**
 * ✅ Bucket "09h", "11h"…
 */
function toHourBucket(value) {
  const s = String(value ?? "").trim();
  if (!s || s.toLowerCase() === "todos") return null;

  const mh = s.match(/^(\d{1,2})h$/i);
  if (mh) return `${pad2(mh[1])}h`;

  const m1 = s.match(/^(\d{1,2}):(\d{2})$/);
  if (m1) return `${pad2(m1[1])}h`;

  const m2 = s.match(/^(\d{1,2})$/);
  if (m2) return `${pad2(m2[1])}h`;

  const m3 = s.match(/^(\d{1,2}):(\d{2}):(\d{2})$/);
  if (m3) return `${pad2(m3[1])}h`;

  const m4 = s.match(/^(\d{3,4})$/);
  if (m4) return `${pad2(String(m4[1]).slice(0, -2))}h`;

  return null;
}

/* =========================
   ✅ FIX DEFINITIVO: filtro de horário (bucket vs exato)
========================= */

function resolveHourFilter({ closeHour = null, closeHourBucket = null }) {
  const bucket =
    toHourBucket(closeHourBucket) ||
    (closeHour && !String(closeHour).includes(":")
      ? toHourBucket(closeHour)
      : null);

  if (bucket) return { kind: "bucket", bucket, hhmm: null };

  const hhmm = closeHour ? normalizeHourLike(closeHour) : null;
  if (hhmm) return { kind: "exact", bucket: null, hhmm };

  return { kind: null, bucket: null, hhmm: null };
}

function drawPassesHourFilter(draw, hourFilter) {
  if (!hourFilter || !hourFilter.kind) return true;

  const raw =
    draw?.close_hour ??
    draw?.closeHour ??
    draw?.hour ??
    draw?.hora ??
    "";
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
  if (!input) return null;

  // Firestore Timestamp com toDate()
  if (typeof input === "object" && typeof input.toDate === "function") {
    const d = input.toDate();
    if (!Number.isNaN(d.getTime())) {
      return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(
        d.getDate()
      )}`;
    }
  }

  // Timestamp-like { seconds } / { _seconds }
  if (
    typeof input === "object" &&
    (Number.isFinite(Number(input.seconds)) ||
      Number.isFinite(Number(input._seconds)))
  ) {
    const sec = Number.isFinite(Number(input.seconds))
      ? Number(input.seconds)
      : Number(input._seconds);
    const d = new Date(sec * 1000);
    if (!Number.isNaN(d.getTime())) {
      return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(
        d.getDate()
      )}`;
    }
  }

  if (input instanceof Date && !Number.isNaN(input.getTime())) {
    return `${input.getFullYear()}-${pad2(input.getMonth() + 1)}-${pad2(
      input.getDate()
    )}`;
  }

  const s = String(input).trim();
  if (!s) return null;

  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;

  return null;
}

function normalizePositions(positions) {
  const arr =
    Array.isArray(positions) && positions.length
      ? positions
          .map(Number)
          .filter((n) => Number.isFinite(n) && n > 0)
      : null;

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

  // número puro
  if (typeof value === "number" && Number.isFinite(value)) {
    const n = Math.trunc(value);
    return n >= min && n <= max ? n : null;
  }

  const s = String(value).trim();
  if (!s) return null;

  // se for "02" etc
  if (/^\d+$/.test(s)) {
    const n = Number(s);
    return Number.isFinite(n) && n >= min && n <= max ? n : null;
  }

  // pega o primeiro número de 1-2 dígitos (evita capturar milhar 4 dígitos por engano)
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

    const ia = String(a?.drawId || a?.id || "");
    const ib = String(b?.drawId || b?.id || "");
    return ia.localeCompare(ib);
  });
}

/**
 * ✅ DEDUPE (premium/robusto)
 * - chave lógica: ymd + hour (NÃO inclui id)
 * - se não houver ymd/hour, cai no id/idx
 */
function dedupeDrawsLocal(draws) {
  const arr = Array.isArray(draws) ? draws : [];

  const byKey = new Map();
  const order = [];

  function score(d) {
    const prizesLen = Array.isArray(d?.prizes) ? d.prizes.length : 0;
    const pc = Number.isFinite(Number(d?.prizesCount))
      ? Number(d.prizesCount)
      : 0;
    const hasLogical = !!(d?.ymd && d?.close_hour);
    return prizesLen * 1_000_000 + pc * 1_000 + (hasLogical ? 10 : 0);
  }

  for (let i = 0; i < arr.length; i += 1) {
    const raw = arr[i] || {};

    const ymd = raw.ymd || normalizeToYMD(raw.date) || "";
    const hour = normalizeHourLike(raw.close_hour || raw.closeHour || "");

    const drawId = raw.drawId ?? raw.id ?? raw.__name__ ?? null;
    const idStr = drawId != null ? String(drawId) : "";

    const hasLogical = !!(ymd && hour);

    // ✅ chave lógica não inclui ID (evita duplicado por reimport/uf/lottery_key)
    const key = hasLogical ? `${ymd}__${hour}` : `id__${idStr || `idx_${i}`}`;

    const normalized = {
      ...raw,
      ymd: ymd || raw.ymd || null,
      close_hour: hour || raw.close_hour || raw.closeHour || "",
      closeHour: hour || raw.closeHour || raw.close_hour || "",
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
    while (idx < arr.length) {
      const current = idx++;
      results[current] = await mapper(arr[current], current);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, arr.length) }, worker)
  );
  return results;
}

/* =========================
   ✅ Leitura: prefere SERVIDOR
========================= */

async function safeGetDocsPreferServer(qRef) {
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

  // ✅ parse tolerante (aceita "GRUPO 23", "1º", "1°", etc)
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

async function fetchPrizesForDraw(drawId, positionsArr, embeddedPrizes) {
  const drawKey = String(drawId || "").trim();
  if (!drawKey) return [];

  if (Array.isArray(embeddedPrizes) && embeddedPrizes.length) {
    const normalized = embeddedPrizes.map((p, idx) =>
      normalizePrize(p, p?.prizeId ?? `emb_${idx}`)
    );

    // ✅ mantém só prizes válidos
    const cleaned = normalized.filter(
      (x) => isValidGrupo(x?.grupo) && isValidPosition(x?.position)
    );

    const allSorted = sortPrizesByPosition(cleaned);
    return filterPrizesByPositions(allSorted, positionsArr);
  }

  const allKey = prizesCacheKeyAll(drawKey);
  const cachedAll = cacheGet(PRIZES_CACHE, allKey);
  if (cachedAll) return filterPrizesByPositions(cachedAll, positionsArr);

  const prizesCol = collection(db, "draws", drawKey, "prizes");

  const { snap, error } = await safeGetDocsPreferServer(prizesCol);
  if (error) throw error;

  const allRaw = snap.docs.map((d) => normalizePrize(d.data(), d.id));

  // ✅ mantém só prizes válidos
  const all = allRaw.filter(
    (x) => isValidGrupo(x?.grupo) && isValidPosition(x?.position)
  );

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
  const hourNorm = normalizeHourLike(
    d.close_hour ?? d.closeHour ?? d.hour ?? d.hora ?? ""
  );

  const embeddedPrizes = Array.isArray(d.prizes) ? d.prizes : null;

  const ufRaw = d.uf ?? null;
  const lotteryKeyRaw = d.lottery_key ?? d.lotteryKey ?? d.lottery ?? null;

  return {
    drawId: doc.id,
    id: doc.id,

    date: d.date ?? d.data ?? d.dt ?? d.draw_date ?? d.close_date ?? null,
    ymd,

    close_hour: hourNorm,
    closeHour: hourNorm,

    uf: ufRaw,
    lottery_key: lotteryKeyRaw,

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
  return Array.isArray(extraOrderBy)
    ? extraOrderBy.filter(Boolean)
    : [extraOrderBy];
}

async function queryDrawsByField({
  fieldName,
  uf,
  extraWheres = [],
  extraOrderBy = null,
  extraLimit = null,
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
  return safeGetDocsPreferServer(qRef);
}

function extractUfParam(maybeUfOrObj) {
  if (!maybeUfOrObj) return "";
  if (typeof maybeUfOrObj === "string") return maybeUfOrObj;
  if (typeof maybeUfOrObj === "object" && typeof maybeUfOrObj.uf === "string")
    return maybeUfOrObj.uf;
  return String(maybeUfOrObj || "");
}

async function fetchDrawDocsPreferUf({
  uf,
  extraWheres = [],
  extraOrderBy = null,
  extraLimit = null,
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
    });

    if (!error && snap?.docs?.length)
      return { docs: snap.docs, usedField: "uf", error: null };
    if (error) return { docs: [], usedField: "uf", error };
  }

  // 2) fallback por lottery_key
  {
    const lotteryKey =
      ufUp === RJ_STATE_CODE ? RJ_LOTTERY_KEY : resolveLotteryKeyForQuery(ufTrim);

    const { snap, error } = await queryDrawsByField({
      fieldName: "lottery_key",
      uf: String(lotteryKey).toUpperCase(),
      extraWheres,
      extraOrderBy,
      extraLimit,
    });

    if (!error && snap?.docs?.length)
      return { docs: snap.docs, usedField: "lottery_key", error: null };
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

/**
 * ✅ COMPAT:
 * - aceita getKingBoundsByUf("RJ")
 * - aceita getKingBoundsByUf({ uf: "RJ" })
 */
export async function getKingBoundsByUf(ufOrObj) {
  const uf = String(extractUfParam(ufOrObj) || "").trim();
  if (!uf) throw new Error("Parâmetro obrigatório: uf");

  const SCAN_LIMIT = 50;
  const FALLBACK_EDGE_LIMIT = 600;

  let firstTryError = null;

  const DOC_ID = documentId();

  async function sampleEdgesByDocId(fieldName, ufValue) {
    const asc = await queryDrawsByField({
      fieldName,
      uf: ufValue,
      extraOrderBy: [orderBy(DOC_ID)],
      extraLimit: limit(FALLBACK_EDGE_LIMIT),
    });

    const last = await queryDrawsByField({
      fieldName,
      uf: ufValue,
      extraOrderBy: [orderBy(DOC_ID)],
      extraLimit: limitToLast(FALLBACK_EDGE_LIMIT),
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

    const {
      docs: minDocs,
      usedField: usedMin,
      error: eMin,
    } = await fetchDrawDocsPreferUf({
      uf,
      extraOrderBy: orderAsc,
      extraLimit: limit(SCAN_LIMIT),
    });

    const {
      docs: maxDocs,
      usedField: usedMax,
      error: eMax,
    } = await fetchDrawDocsPreferUf({
      uf,
      extraOrderBy: orderDesc,
      extraLimit: limit(SCAN_LIMIT),
    });

    if (eMin || eMax) {
      if (!isIndexError(eMin) && !isIndexError(eMax))
        firstTryError = eMin || eMax;
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
          source: `ymd_scan${SCAN_LIMIT}:${usedMin}/${usedMax}`,
        };
      }
    }
  }

  // 2) fallback robusto: bordas via documentId
  {
    const idxInfo = (() => {
      const code = String(firstTryError?.code || "");
      const msg = String(firstTryError?.message || "");
      if (!code && !msg) return "";
      return `:firstTryError=${code || "err"}`;
    })();

    const a = await sampleEdgesByDocId("uf", String(uf).toUpperCase());

    const ufUp = String(uf || "").trim().toUpperCase();
    const lotteryKey =
      ufUp === RJ_STATE_CODE ? RJ_LOTTERY_KEY : resolveLotteryKeyForQuery(uf);

    const b = a.ok
      ? null
      : await sampleEdgesByDocId(
          "lottery_key",
          String(lotteryKey).toUpperCase()
        );

    const merged = a.ok ? a.merged : b?.merged || [];
    const { minYmd, maxYmd } = pickMinMaxFromMapped(merged);

    return {
      ok: !!(minYmd && maxYmd),
      uf,
      minYmd: minYmd || null,
      maxYmd: maxYmd || null,
      source: `fallback_edges_docId_limit=${FALLBACK_EDGE_LIMIT}:${a.ok ? "uf" : "lottery_key"}:sampleCount=${
        merged.length
      }${idxInfo}`,
    };
  }
}

/* =========================
   API: Day
========================= */

function drawsCacheKeyDay({ uf, ymd, positionsArr, hourFilter }) {
  const p = positionsArr && positionsArr.length ? positionsArr.join(",") : "all";
  const h =
    hourFilter?.kind === "bucket"
      ? `bucket:${hourFilter.bucket}`
      : hourFilter?.kind === "exact"
      ? `exact:${hourFilter.hhmm}`
      : "all";
  return `day::${uf}::${ymd}::pos=${p}::h=${h}`;
}

export async function getKingResultsByDate({
  uf,
  date,
  closeHour = null,
  closeHourBucket = null,
  positions = null,
}) {
  if (!uf || !date) throw new Error("Parâmetros obrigatórios: uf e date");

  const positionsArr = normalizePositions(positions);
  const ymdDate = normalizeToYMD(date);
  if (!ymdDate) return [];

  const hourFilter = resolveHourFilter({ closeHour, closeHourBucket });

  const dayKey = drawsCacheKeyDay({
    uf,
    ymd: ymdDate,
    positionsArr,
    hourFilter,
  });
  const cached = cacheGet(DRAWS_CACHE, dayKey);
  if (cached) return cached;

  const docCandidates = [];

  // 1) tenta por ymd (melhor)
  {
    const { docs: found, error } = await fetchDrawDocsPreferUf({
      uf,
      extraWheres: [where("ymd", "==", ymdDate)],
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
      });
      if (error) throw error;
      if (found.length) docCandidates.push(...found);
    }
  }

  if (!docCandidates.length) return [];

  let baseAll = dedupeDrawsLocal(docCandidates.map(mapDrawDoc));
  baseAll = baseAll.filter((x) => (x.ymd || normalizeToYMD(x.date)) === ymdDate);

  const base = hourFilter?.kind
    ? baseAll.filter((d) => drawPassesHourFilter(d, hourFilter))
    : baseAll;
  const ordered = sortDrawsLocal(base);

  const results = await mapWithConcurrency(ordered, 6, async (item) => {
    const prizes = await fetchPrizesForDraw(item.drawId, positionsArr, item.prizes);
    return { ...item, prizes };
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

function drawsCacheKeyRange({ uf, from, to, positionsArr, hourFilter, mode }) {
  const p = positionsArr && positionsArr.length ? positionsArr.join(",") : "all";
  const h =
    hourFilter?.kind === "bucket"
      ? `bucket:${hourFilter.bucket}`
      : hourFilter?.kind === "exact"
      ? `exact:${hourFilter.hhmm}`
      : "all";
  const m = mode ? String(mode) : "detailed";
  return `range::${uf}::${from}..${to}::pos=${p}::h=${h}::mode=${m}`;
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
    uf,
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
  });

  if (error) {
    if (isIndexError(error)) {
      const days = daysBetweenInclusiveUTC(ymdFrom, ymdTo);
      const MAX_FALLBACK_DAYS = 31;

      if (Number.isFinite(days) && days > 0 && days <= MAX_FALLBACK_DAYS) {
        if (effectiveMode === "aggregated") {
          const rawCode = String(error?.code || "");
          const rawMsg = String(error?.message || "");
          throw new Error(
            `Firestore: falta índice composto para RANGE (campo ${usedField} + ymd).\n` +
              `Modo aggregated não usa fallback dia-a-dia.\n` +
              `Crie/valide o índice no console (Collection: draws | Fields: ${usedField} ASC, ymd ASC, __name__ (documentId) ASC).\n` +
              (rawCode || rawMsg ? `Detalhe: ${rawCode} ${rawMsg}` : "")
          );
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
        const base = hourFilter?.kind
          ? baseAll.filter((d) => drawPassesHourFilter(d, hourFilter))
          : baseAll;

        const out = dedupeDrawsLocal(sortDrawsLocal(base));
        cacheSet(DRAWS_CACHE, rangeKey, out);
        return out;
      }

      const rawCode = String(error?.code || "");
      const rawMsg = String(error?.message || "");

      throw new Error(
        `Firestore: falta índice composto para RANGE (campo ${usedField} + ymd).\n` +
          `Crie/valide o índice no console (Collection: draws | Fields: ${usedField} ASC, ymd ASC, __name__ (documentId) ASC).\n` +
          `Obs: fallback automático só é aplicado para ranges até ${MAX_FALLBACK_DAYS} dias e apenas no modo detailed.\n` +
          (rawCode || rawMsg ? `Detalhe: ${rawCode} ${rawMsg}` : "")
      );
    }

    throw error;
  }

  if (!docs || !docs.length) {
    const days = daysBetweenInclusiveUTC(ymdFrom, ymdTo);
    const MAX_EMPTY_RANGE_FALLBACK_DAYS = 120;

    if (Number.isFinite(days) && days > 0 && days <= MAX_EMPTY_RANGE_FALLBACK_DAYS) {
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
      const base = hourFilter?.kind
        ? baseAll.filter((d) => drawPassesHourFilter(d, hourFilter))
        : baseAll;

      const ordered = sortDrawsLocal(base);

      if (effectiveMode === "aggregated") {
        const out = dedupeDrawsLocal(
          ordered.map((d) => ({
            ...d,
            prizes: [],
            __mode: "aggregated",
          }))
        );
        cacheSet(DRAWS_CACHE, rangeKey, out);
        return out;
      }

      const conc = chooseRangeConcurrency(ordered.length);
      const results = await mapWithConcurrency(ordered, conc, async (item) => {
        const prizes = await fetchPrizesForDraw(item.drawId, positionsArr, item.prizes);
        return { ...item, prizes };
      });

      const out = dedupeDrawsLocal(results);
      cacheSet(DRAWS_CACHE, rangeKey, out);
      return out;
    }

    return [];
  }

  const baseAll = dedupeDrawsLocal(docs.map(mapDrawDoc));
  const base = hourFilter?.kind
    ? baseAll.filter((d) => drawPassesHourFilter(d, hourFilter))
    : baseAll;

  const ordered = sortDrawsLocal(base);

  if (effectiveMode === "aggregated") {
    const out = dedupeDrawsLocal(
      ordered.map((d) => ({
        ...d,
        prizes: Array.isArray(d?.prizes) ? d.prizes : [],
        __mode: "aggregated",
      }))
    );
    cacheSet(DRAWS_CACHE, rangeKey, out);
    return out;
  }

  const conc = chooseRangeConcurrency(ordered.length);

  const results = await mapWithConcurrency(ordered, conc, async (item) => {
    const prizes = await fetchPrizesForDraw(item.drawId, positionsArr, item.prizes);
    return { ...item, prizes };
  });

  const out = dedupeDrawsLocal(results);
  cacheSet(DRAWS_CACHE, rangeKey, out);
  return out;
}

/* =========================
   ✅ Hidratação de prizes (para UX no "Todos")
========================= */

export async function hydrateKingDrawsWithPrizes({
  draws,
  positions = null,
  concurrency = null,
}) {
  const arr = Array.isArray(draws) ? draws : [];
  if (!arr.length) return [];

  const positionsArr = normalizePositions(positions);

  const conc =
    Number.isFinite(Number(concurrency)) && Number(concurrency) > 0
      ? Number(concurrency)
      : chooseRangeConcurrency(arr.length);

  const results = await mapWithConcurrency(arr, conc, async (item) => {
    const prizes = await fetchPrizesForDraw(item.drawId, positionsArr, item.prizes);
    return { ...item, prizes, __mode: "detailed" };
  });

  return dedupeDrawsLocal(results);
}
