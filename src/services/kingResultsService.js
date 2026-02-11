// src/services/kingResultsService.js
/* =========================================================
   ✅ API-FIRST (Front) — chama teu BACKEND (Express)
   - Resolve os imports quebrados no app (getKingBoundsByUf, etc.)
   - Evita Firestore SDK no browser
   - Mantém compat com seu código atual (hooks/pages)
========================================================= */

export const AGGREGATED_AUTO_DAYS = 60;

// Federal (UI)
/**
 * ✅ REGRA REAL DO FEDERAL (base Palpitaco)
 * - Slots válidos na base: 19:00 e 20:00
 * - NÃO aplicar filtro automático; só filtrar se o usuário escolher.
 */
export const FEDERAL_VALID_CLOSE_HOURS = ["19:00", "20:00"];

/* =========================
   API BASE
========================= */
// prioridade:
// 1) Vite: import.meta.env.VITE_API_BASE
// 2) CRA: process.env.REACT_APP_API_BASE
// 3) fallback: mesma origem (produção) OU localhost:3333 (dev)
function getApiBase() {
  const vite = typeof import.meta !== "undefined" ? import.meta.env?.VITE_API_BASE : undefined;
  const cra = typeof process !== "undefined" ? process.env?.REACT_APP_API_BASE : undefined;

  const v = String(vite || cra || "").trim();
  if (v) return v.replace(/\/+$/, "");

  if (typeof window !== "undefined") {
    const hostname = String(window.location.hostname || "").toLowerCase();

    // ✅ produção do seu front -> usa API pública
    if (hostname === "palpitacojb.com.br" || hostname.endsWith(".palpitacojb.com.br")) {
      return "https://api.palpitacojb.com.br";
    }

    // ✅ dev local/LAN -> backend local
    const isLocalhost =
      hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";

    const isLanIp =
      /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname) &&
      (hostname.startsWith("192.168.") ||
       hostname.startsWith("10.") ||
       /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname));

    if (isLocalhost || isLanIp) return "http://127.0.0.1:3333";

    return window.location.origin;
  }

  return "http://127.0.0.1:3333";
}

async function apiGet(path, params = {}) {
  const base = getApiBase();
  const url = new URL(path, base);

  // DEBUG (dev): expõe no window a última URL chamada
  if (typeof window !== "undefined") {
    window.__PALPITACO_API_BASE = base;
    window.__PALPITACO_LAST_URL = url.toString();
  }


  Object.entries(params || {}).forEach(([k, v]) => {
    if (v === undefined || v === null || v === "") return;
    if (Array.isArray(v)) {
      v.forEach((x) => url.searchParams.append(k, String(x)));
    } else {
      url.searchParams.set(k, String(v));
    }
  });

  const r = await fetch(url.toString(), {
    method: "GET",
    credentials: "include",
    headers: { "Accept": "application/json" },
  });

  const text = await r.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch (e) { json = null; }

  if (!r.ok) {
    const msg = (json && (json.message || json.error)) ? (json.message || json.error) : `HTTP ${r.status}`;
    throw new Error(msg);
  }

  return json;
}

/* =========================================================
   ✅ Compat exports que o app espera
========================================================= */

// 1) Bounds (min/max)
export async function getKingBoundsByUf({ uf } = {}) {
  const key = String(uf || "").trim().toUpperCase();

  // mapeia UF/alias -> lottery do backend
  let ufKey = key;
  if (ufKey === "RJ") ufKey = "PT_RIO";
  if (ufKey === "BR" || ufKey === "FEDERAL") ufKey = "FEDERAL";

  try {
    // ✅ bounds: endpoint único (backend expõe /api/bounds)
    // mantém uf + lottery por compat, mas o backend usa lottery como canônico
    const j = await apiGet("/api/bounds", { lottery: ufKey, uf: ufKey });
    return j;
  } catch (e) {
    return {
      ok: false,
      uf: key || null,
      minYmd: null,
      maxYmd: null,
      source: "front_fallback_no_bounds",
      error: String(e?.message || e || ""),
    };
  }
}
// 2) Resultados por data (detalhado)
export async function getKingResultsByDate({ uf, date, closeHour = null, closeHourBucket = null, positions = null, readPolicy = null }) {
  if (!uf || !date) throw new Error("Parâmetros obrigatórios: uf e date");

  const ufKey = normalizeLotteryKey(uf);

  const j = await apiGet("/api/king/draws/day", {
    uf: ufKey,
    lottery: ufKey,
    date: toYMD(date),
    closeHour,
    closeHourBucket,
    positions: normalizePositionsParam(positions),    includePrizes: (readPolicy === "server") ? 1 : 0,

  });

  if (Array.isArray(j)) return j;
  return j?.draws || j?.data || [];
}
function normalizePositionsParam(positions) {
  // Array -> "1,2,3"
  if (Array.isArray(positions) && positions.length) {
    const arr = positions
      .map((x) => Number(x))
      .filter((n) => Number.isFinite(n) && n > 0);
    return arr.length ? Array.from(new Set(arr)).sort((a,b)=>a-b).join(",") : "";
  }

  // Número único
  if (Number.isFinite(Number(positions))) {
    const n = Number(positions);
    return n > 0 ? String(n) : "";
  }

  // String: "1-5" / "1,2,3" / "1 2 3" / "1;2;3"
  if (typeof positions === "string") {
    const s = positions.trim();
    if (!s) return "";

    const mRange = s.match(/^(\d{1,2})\s*-\s*(\d{1,2})$/);
    if (mRange) {
      const a = Number(mRange[1]);
      const b = Number(mRange[2]);
      if (Number.isFinite(a) && Number.isFinite(b) && a > 0 && b > 0) {
        const from = Math.min(a, b);
        const to = Math.max(a, b);
        const out = [];
        for (let i = from; i <= to; i += 1) out.push(i);
        return out.join(",");
      }
      return "";
    }

    const parts = s.split(/[,\s;]+/g).filter(Boolean);
    const arr = parts
      .map((x) => Number(x))
      .filter((n) => Number.isFinite(n) && n > 0);

    return arr.length ? Array.from(new Set(arr)).sort((a,b)=>a-b).join(",") : "";
  }

  return "";
}
function normalizeLotteryKey(input) {
  const s = String(input ?? "").trim().toUpperCase();
  if (!s) return "";

  // RJ / PT Rio
  if (s === "RJ" || s === "RIO" || s === "PT_RIO" || s === "PT-RIO") return "PT_RIO";

  // Federal (aliases comuns)
  const fedAliases = new Set([
    "FEDERAL","FED","LOTERIA FEDERAL","LOTERIA_FEDERAL",
    "LOT FEDERAL","LT_FEDERAL","FED_BR","BR_FEDERAL"
  ]);

  if (fedAliases.has(s)) return "FEDERAL";
  const compact = s.replace(/[\s_]+/g, " ").trim();
  if (fedAliases.has(compact)) return "FEDERAL";
  const unders = s.replace(/[\s_]+/g, "_");
  if (fedAliases.has(unders)) return "FEDERAL";

  return s;
}



function toYMD(input) {
  const s = String(input || "").trim();
  if (!s) return s;

  // já está em YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // BR: DD/MM/YYYY
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;

  return s;
}
// 3) Resultados por range (detailed/aggregated/auto)
export async function getKingResultsByRange({
  uf,
  dateFrom,
  dateTo,
  closeHour = null,
  closeHourBucket = null,
  positions = null,
  mode = "detailed",
readPolicy = null,
  }) {
  const ufKey = normalizeLotteryKey(uf);

  if (!ufKey || !dateFrom || !dateTo)
    throw new Error("Parâmetros obrigatórios: uf, dateFrom, dateTo");

  const j = await apiGet("/api/king/draws/range", {
    uf: ufKey,
    lottery: ufKey,
    dateFrom: toYMD(dateFrom),
    dateTo: toYMD(dateTo),
    closeHour,
    closeHourBucket,
    positions: normalizePositionsParam(positions),
    mode,    includePrizes: ((mode === "detailed") || (readPolicy === "server")) ? 1 : 0,

  });

  if (Array.isArray(j)) return j;
  return j?.draws || j?.data || [];
}

// 4) Hidratar prizes (no front vira NO-OP: backend já deve mandar detalhado)
export async function hydrateKingDrawsWithPrizes({ draws }) {
  return Array.isArray(draws) ? draws : [];
}

// 5) Late (atrasados) — usa teu endpoint /api/lates (já existe e funciona)
export async function getKingLateByRange({
  uf = "PT_RIO",
  dateFrom,
  dateTo,
  baseDate = null,
  lotteries = null,
  prizePosition = 1,
  closeHour = null,
  closeHourBucket = null,
  chunkDays = 15,
}) {
  const lottery = normalizeLotteryKey(uf || "PT_RIO");
  const prize = String(prizePosition ?? 1);

  const j = await apiGet("/api/lates", {
    lottery,
    modality: "PT",
    prize,
    page: 1,
    pageSize: 25,
    baseDate: baseDate || "",
    closeHour: closeHour || "",
    closeHourBucket: closeHourBucket || "",
  });

  // compat: seu UI às vezes espera rows
  if (Array.isArray(j)) return j;
  return j?.rows || [];
}

/* =========================================================
   ✅ Mantém exports existentes do arquivo antigo (pra não quebrar outros imports)
   - getLateFromApi / getLateSmart agora chamam getKingLateByRange
========================================================= */

export async function getLateFromApi(args = {}) {
  const rows = await getKingLateByRange({
    uf: args.uf || args.lottery || "PT_RIO",
    dateFrom: args.dateFrom || args.from || "",
    dateTo: args.dateTo || args.to || "",
    baseDate: args.baseDate || args.base || null,
    lotteries: args.lotteries || null,
    prizePosition: args.prizePosition || args.prize || 1,
    closeHour: args.closeHour || null,
    closeHourBucket: (normalizeLotteryKey(args.uf || args.lottery || "") === "FEDERAL") ? (args.closeHourBucket || null) : (args.closeHourBucket || args.hour || null),
    chunkDays: args.chunkDays || 15,
  });
  return rows;
}

export async function getLateSmart(args = {}) {
  return getLateFromApi(args);
}


















