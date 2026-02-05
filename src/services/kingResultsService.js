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
   ✅ HTTP helper (para /api/lates)
========================= */

function isLocalhostHost(hostname) {
  const h = String(hostname || "").trim().toLowerCase();
  return h === "localhost" || h === "127.0.0.1" || h.endsWith(".local");
}

function getApiBase() {
  // 1) Vite env (se você quiser definir no front: VITE_API_BASE=http://127.0.0.1:3333)
  const envBase =
    (typeof import.meta !== "undefined" &&
      import.meta.env &&
      (import.meta.env.VITE_API_BASE || import.meta.env.VITE_BACKEND_URL)) ||
    "";

  const raw = String(envBase || "").trim();
  if (raw) return raw.replace(/\/+$/, "");

  // 2) fallback: local => 3333, produção => mesma origem
  const origin =
    typeof window !== "undefined" && window.location && window.location.origin
      ? window.location.origin
      : "";

  const hostname =
    typeof window !== "undefined" && window.location
      ? window.location.hostname
      : "";

  if (origin && isLocalhostHost(hostname)) return "http://127.0.0.1:3333";
  return (origin || "http://127.0.0.1:3333").replace(/\/+$/, "");
}

async function fetchJson(url, { timeoutMs = 15000 } = {}) {
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const t = controller
    ? setTimeout(() => controller.abort(), Math.max(1000, Number(timeoutMs) || 15000))
    : null;

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller ? controller.signal : undefined,
      credentials: "include",
    });

    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }

    if (!res.ok) {
      const msg =
        (json && (json.message || json.error)) ||
        text ||
        `HTTP ${res.status}`;
      throw new Error(`API error (${res.status}): ${msg}`);
    }

    return json;
  } finally {
    if (t) clearTimeout(t);
  }
}

/**
 * ✅ API: /api/lates (backend)
 * Retorno do backend (exemplo):
 * {
 *   ok:true, lottery, modality, prize, baseDate,
 *   page, pageSize, total,
 *   rows:[{pos,grupo,lastYmd,lastCloseHour,daysLate,lastDrawId,lastLottery}]
 * }
 *
 * A gente normaliza pro formato "Late" do front:
 * { pos, grupo, lastYmd, lastHour, lastDrawId, lastLottery, atrasoDias }
 */
export async function getLateFromApi({
  lottery = "PT_RIO",
  modality = "PT",
  prize = 1,
  page = 1,
  pageSize = 25,
  baseDate = null,
  hourBucket = null,
} = {}) {
  const base = getApiBase();

  const qs = new URLSearchParams();
  qs.set("lottery", String(lottery || "PT_RIO"));
  qs.set("modality", String(modality || "PT"));
  qs.set("prize", String(prize ?? 1));
  qs.set("page", String(page ?? 1));
  qs.set("pageSize", String(pageSize ?? 25));

  if (baseDate) qs.set("baseDate", String(baseDate));
  if (hourBucket) qs.set("hourBucket", String(hourBucket));

  const url = `${base}/api/lates?${qs.toString()}`;
  const data = await fetchJson(url, { timeoutMs: 20000 });

  const rowsRaw = Array.isArray(data?.rows) ? data.rows : [];
  const rows = rowsRaw.map((r, idx) => ({
    pos: Number(r?.pos) || idx + 1,
    grupo: Number(r?.grupo) || null,
    lastYmd: r?.lastYmd || null,
    lastHour: r?.lastCloseHour || r?.lastHour || null,
    lastDrawId: r?.lastDrawId || null,
    lastLottery: r?.lastLottery || null,
    atrasoDias:
      Number.isFinite(Number(r?.daysLate)) ? Number(r.daysLate) : null,
    // mantém os nomes do backend também (não atrapalha)
    daysLate: r?.daysLate ?? null,
    lastCloseHour: r?.lastCloseHour ?? null,
  }));

  return {
    ok: !!data?.ok,
    lottery: data?.lottery || lottery,
    modality: data?.modality || modality,
    prize: data?.prize || String(prize),
    baseDate: data?.baseDate || baseDate || null,
    hourBucket: data?.hourBucket ?? hourBucket ?? null,
    page: Number(data?.page) || Number(page) || 1,
    pageSize: Number(data?.pageSize) || Number(pageSize) || 25,
    total: Number(data?.total) || rows.length,
    rows,
    meta: data?.meta || null,
  };
}

/**
 * ✅ Compat: se você quiser chamar "late" e deixar ele tentar API primeiro
 * e cair no Firestore só se a API falhar.
 */
export async function getLateSmart({
  uf = "RJ",
  // API params
  lottery = "PT_RIO",
  modality = "PT",
  prize = 1,
  page = 1,
  pageSize = 25,
  baseDate = null,
  hourBucket = null,

  // Firestore fallback params (se precisar)
  dateFrom = null,
  dateTo = null,
  lotteries = null,
  prizePosition = 1,
  closeHour = null,
  closeHourBucket = null,
  chunkDays = 15,
} = {}) {
  try {
    return await getLateFromApi({
      lottery,
      modality,
      prize,
      page,
      pageSize,
      baseDate,
      hourBucket,
    });
  } catch (e) {
    // fallback para Firestore (formato antigo)
    if (dateFrom && dateTo) {
      const rows = await getKingLateByRange({
        uf,
        dateFrom,
        dateTo,
        baseDate,
        lotteries,
        prizePosition,
        closeHour,
        closeHourBucket,
        chunkDays,
      });
      return {
        ok: true,
        mode: "firestore_fallback",
        rows,
      };
    }
    throw e;
  }
}

/* =========================
   ✅ REGRA DE NEGÓCIO (RJ x Federal)
========================= */

const RJ_STATE_CODE = "RJ";
const RJ_LOTTERY_KEY = "PT_RIO";

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
  return (
    FEDERAL_INPUT_ALIASES.has(compact) ||
    FEDERAL_INPUT_ALIASES.has(up.replace(/[\s_]+/g, "_"))
  );
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

  const raw =
    draw?.close_hour ?? draw?.closeHour ?? draw?.hour ?? draw?.hora ?? "";
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
      return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
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
      return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
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
      ? positions.map(Number).filter((n) => Number.isFinite(n) && n > 0)
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

/* =========================
   (restante do seu arquivo original continua igual)
   ✅ A PARTIR DAQUI eu não alterei lógica — só mantive tudo como estava.
========================= */

// ... ✅ (mantive 100% do que você enviou a partir daqui sem mexer)
// Para não te entregar um “arquivo truncado” por limite de mensagem,
// me diz: você quer que eu te devolva o arquivo INTEIRO com TODO o restante
// (o trecho é MUITO grande), ou posso te devolver em 2 partes (Parte 1/2 e 2/2)?

/**
 * ⚠️ IMPORTANTE:
 * Eu já inseri a função getLateFromApi/getLateSmart no topo.
 * Agora o próximo passo é eu aplicar isso no Late.jsx.
 * Cola aqui o Late.jsx (completo) que eu te devolvo ele pronto chamando a API.
 */
