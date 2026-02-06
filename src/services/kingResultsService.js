// src/services/kingResultsService.js
/* =========================================================
   ✅ API-FIRST (Front) — chama teu BACKEND (Express)
   - Resolve os imports quebrados no app (getKingBoundsByUf, etc.)
   - Evita Firestore SDK no browser
   - Mantém compat com seu código atual (hooks/pages)
========================================================= */

export const AGGREGATED_AUTO_DAYS = 60;

// Federal (UI)
export const FEDERAL_DRAW_HOUR = "20:00";
export const FEDERAL_DRAW_BUCKET = "20h";
export const FEDERAL_DRAW_DOW = ["WEDNESDAY", "SATURDAY"];

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

  // dev
  if (typeof window !== "undefined" && /localhost|127\.0\.0\.1/i.test(window.location.host)) {
    return "http://127.0.0.1:3333";
  }

  // produção (mesma origem; exige que backend esteja no mesmo domínio OU via proxy)
  if (typeof window !== "undefined") return window.location.origin;

  return "http://127.0.0.1:3333";
}

async function apiGet(path, params = {}) {
  const base = getApiBase();
  const url = new URL(path, base);

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
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }

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
  // RJ -> PT_RIO
  // FEDERAL/BR -> FEDERAL
  // se já vier PT_RIO/PT_SP/etc, usa como lottery
  let lottery = key;
  if (lottery === "RJ") lottery = "PT_RIO";
  if (lottery === "BR" || lottery === "FEDERAL") lottery = "FEDERAL";

  try {
    // backend real
    const j = await apiGet("/api/bounds", { lottery });

    return {
      ok: !!j?.ok,
      uf: key || null,
      minYmd: j?.minYmd || null,
      maxYmd: j?.maxYmd || null,
      source: j?.source || "api_bounds",
    };
  } catch (e) {
    // fallback antigo (não quebra caso você reative depois)
    try {
      const j2 = await apiGet("/api/king/bounds", { uf: key });
      return {
        ok: !!j2?.ok,
        uf: key || null,
        minYmd: j2?.minYmd || null,
        maxYmd: j2?.maxYmd || null,
        source: j2?.source || "legacy_api_king_bounds",
      };
    } catch {
      return {
        ok: false,
        uf: key || null,
        minYmd: null,
        maxYmd: null,
        source: "front_fallback_no_bounds",
      };
    }
  }
}

// 2) Resultados por data (detalhado)
export async function getKingResultsByDate({ uf, date, closeHour = null, closeHourBucket = null, positions = null }) {
  if (!uf || !date) throw new Error("Parâmetros obrigatórios: uf e date");

  const j = await apiGet("/api/king/results/day", {
    uf,
    date,
    closeHour,
    closeHourBucket,
    positions: positions ? positions.join(",") : "",
  });

  // backend deve devolver { ok, draws: [...] } ou direto array
  if (Array.isArray(j)) return j;
  return j?.draws || j?.data || [];
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
}) {
  if (!uf || !dateFrom || !dateTo) throw new Error("Parâmetros obrigatórios: uf, dateFrom, dateTo");

  const j = await apiGet("/api/king/results/range", {
    uf,
    dateFrom,
    dateTo,
    closeHour,
    closeHourBucket,
    positions: positions ? positions.join(",") : "",
    mode,
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
  uf,            // no seu backend atual usa ?lottery=
  dateFrom,
  dateTo,
  baseDate = null,
  lotteries = null,
  prizePosition = 1,
  closeHour = null,
  closeHourBucket = null,
  chunkDays = 15,
}) {
  const lottery = (uf || "PT_RIO");
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
    closeHourBucket: args.closeHourBucket || args.hour || null,
    chunkDays: args.chunkDays || 15,
  });
  return rows;
}

export async function getLateSmart(args = {}) {
  return getLateFromApi(args);
}

