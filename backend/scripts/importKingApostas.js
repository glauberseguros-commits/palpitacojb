"use strict";

/**
 * importKingApostas.js
 * (topo limpo automaticamente — removido bloco corrompido com \n e \)
 */
const fs = require("fs");
const path = require("path");
const axios = require("axios");

/**
 * =========================
 * ENV helpers
 * =========================
 */

/**
 * Carrega variáveis do backend/.env.local (se existir)
 * Observação: só define se a env ainda não estiver definida no processo.
 */
(function loadEnvLocal() {
  try {
    const envPath = path.join(__dirname, "..", ".env.local");
    if (!fs.existsSync(envPath)) return;

    let raw = fs.readFileSync(envPath, "utf8");
    raw = raw.replace(/^\uFEFF/, ""); // remove BOM invisível

    raw.split(/\r?\n/).forEach((line) => {
      let s = String(line || "").trim();
      if (!s || s.startsWith("#")) return;

      // suporta "export KEY=VAL"
      if (/^export\s+/i.test(s)) s = s.replace(/^export\s+/i, "").trim();

      const i = s.indexOf("=");
      if (i <= 0) return;

      const k = s.slice(0, i).trim();
      let v = s.slice(i + 1).trim();

      // suporta KEY="valor" / KEY='valor'
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1);
      }

      if (k && v && !process.env[k]) process.env[k] = v;
    });
  } catch {
    // silencioso por design
  }
})();

/**
 * Resolve automaticamente credenciais se:
 * - GOOGLE_APPLICATION_CREDENTIALS estiver ausente, OU
 * - estiver apontando para um arquivo inexistente.
 *
 * Mantém compatível com seu fluxo local (Windows) e com Cloud (ADC).
 */
(function ensureGoogleCredentials() {
  try {
    const current = String(process.env.GOOGLE_APPLICATION_CREDENTIALS || "").trim();

    // se já está OK, não mexe
    if (current) {
      try {
        if (fs.existsSync(current) && fs.lstatSync(current).isFile()) return;
      } catch {
        // segue para fallback
      }
    }

    // se existe mas está inválida, remove para permitir fallback (ADC)
    if (current) {
      try {
        delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
      } catch {
        process.env.GOOGLE_APPLICATION_CREDENTIALS = "";
      }
    }

    const tryPickFromDir = (dir) => {
      try {
        if (!dir || !fs.existsSync(dir)) return null;

        const entries = fs.readdirSync(dir);
        const hits = entries
          .filter((f) => /^palpitacojb-app-firebase-adminsdk-.*\.json$/i.test(f))
          .map((f) => path.join(dir, f))
          .filter((p) => {
            try {
              return fs.existsSync(p) && fs.lstatSync(p).isFile();
            } catch {
              return false;
            }
          });

        if (!hits.length) return null;

        hits.sort((a, b) => {
          try {
            return fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs;
          } catch {
            return 0;
          }
        });

        return hits[0] || null;
      } catch {
        return null;
      }
    };

    // 1) tenta no CWD
    const cwdPick = tryPickFromDir(process.cwd());
    if (cwdPick) {
      process.env.GOOGLE_APPLICATION_CREDENTIALS = cwdPick;
      return;
    }

    // 2) tenta subir alguns níveis
    const up1 = path.resolve(__dirname, "..", "..", ".."); // .../archive_backend
    const up2 = path.resolve(__dirname, "..", "..", "..", ".."); // .../palpitaco (provável)
    const pick1 = tryPickFromDir(up2) || tryPickFromDir(up1);

    if (pick1) {
      process.env.GOOGLE_APPLICATION_CREDENTIALS = pick1;
      return;
    }
  } catch {
    // silencioso por design
  }
})();

/**
 * =========================
 * Firebase Admin (central)
 * =========================
 *
 * Importante:
 * este require vem DEPOIS do ensureGoogleCredentials/loadEnvLocal
 */
const { admin, db } = require("../service/firebaseAdmin");


const { getPtRioSlotsByDate } = require('./ptRioCalendar');
/**
 * =========================
 * Config / toggles
 * =========================
 */

/**
 * Para desempenho/estabilidade:
 * - CHECK_EXISTENCE=1 => faz reads extras para calcular "novos" (lento)
 * - default => não faz reads extras (rápido)
 */
const CHECK_EXISTENCE = String(process.env.CHECK_EXISTENCE || "").trim() === "1";

/**
 * Retry HTTP simples (evita falhas intermitentes/429)
 */
const HTTP_RETRIES = Number.isFinite(Number(process.env.HTTP_RETRIES))
  ? Math.max(0, Number(process.env.HTTP_RETRIES))
  : 3;

const HTTP_RETRY_BASE_MS = Number.isFinite(Number(process.env.HTTP_RETRY_BASE_MS))
  ? Math.max(50, Number(process.env.HTTP_RETRY_BASE_MS))
  : 600;

/**
 * ✅ fetch por lottery (robusto contra “cap” da API quando manda muitos lotteries[]).
 * Default: ON
 * - KING_FETCH_PER_LOTTERY=0 => volta ao modo antigo (1 request com todos lotteries[])
 */
const FETCH_PER_LOTTERY =
  String(process.env.KING_FETCH_PER_LOTTERY || "").trim() === "0" ? false : true;

// ✅ Debug do fetch (log por lotteryId)
// Ative com: set KING_FETCH_DEBUG=1
const KING_FETCH_DEBUG = String(process.env.KING_FETCH_DEBUG || "").trim() === "1";

// ✅ Debug leve do override FEDERAL
// Ative com: set KING_OVERRIDE_DEBUG=1
const KING_OVERRIDE_DEBUG = String(process.env.KING_OVERRIDE_DEBUG || "").trim() === "1";

/**
 * ✅ Blindagem contra datas futuras (não busca API, não escreve no FS)
 * - ALLOW_FUTURE_DATE=1 => libera (use com MUITO cuidado / apenas para testes)
 */
const ALLOW_FUTURE_DATE = String(process.env.ALLOW_FUTURE_DATE || "").trim() === "1";

/**
 * =========================
 * ✅ Regras de negócio: UF x lottery_key
 * =========================
 *
 * IMPORTANTE:
 * - lottery_key identifica a loteria/fonte (ex.: PT_RIO)
 * - uf deve ser o estado (ex.: RJ), pois o frontend consulta por UF ("RJ")
 *
 * Se uf ficar "PT_RIO", o bounds por UF quebra.
 */
const RJ_STATE_CODE = "RJ";
const RJ_LOTTERY_KEY = "PT_RIO";

const FEDERAL_STATE_CODE = "BR";
const FEDERAL_LOTTERY_KEY = "FEDERAL";

function resolveUfFromLotteryKey(lotteryKey) {
  const lk = String(lotteryKey || "").trim().toUpperCase();
  if (!lk) return null;
  if (lk === RJ_LOTTERY_KEY) return RJ_STATE_CODE;
  if (lk === FEDERAL_LOTTERY_KEY) return FEDERAL_STATE_CODE;
  // se for uma UF padrão de 2 letras (SP, MG, DF etc.), preserva
  if (/^[A-Z]{2}$/.test(lk)) return lk;

  // fallback: não inventa UF
  return null;
}

/**
 * =========================
 * Date helpers (BRT via TZ)
 * =========================
 */

function pad2(n) {
  return String(n).padStart(2, "0");
}

function todayYMDLocal() {
  try {
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    return fmt.format(new Date()); // YYYY-MM-DD
  } catch {
    const d = new Date();
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }
}

function isFutureISODate(ymd) {
  // Compare lexicográfico funciona para YYYY-MM-DD
  const t = todayYMDLocal();
  return String(ymd || "").trim() > t;
}

/**
 * =========================
 * Jogo do Bicho helpers
 * =========================
 */

/** Mapeamento oficial Grupo -> Animal */
const GRUPO_TO_ANIMAL = {
  1: "Avestruz",
  2: "Águia",
  3: "Burro",
  4: "Borboleta",
  5: "Cachorro",
  6: "Cabra",
  7: "Carneiro",
  8: "Camelo",
  9: "Cobra",
  10: "Coelho",
  11: "Cavalo",
  12: "Elefante",
  13: "Galo",
  14: "Gato",
  15: "Jacaré",
  16: "Leão",
  17: "Macaco",
  18: "Porco",
  19: "Pavão",
  20: "Peru",
  21: "Touro",
  22: "Tigre",
  23: "Urso",
  24: "Veado",
  25: "Vaca",
};

function pad4(s) {
  return String(s ?? "").trim().padStart(4, "0");
}

/** Regra do Jogo do Bicho: dezena 00 => grupo 25; senão ceil(dezena/4) */
function dezenaToGrupo(dezena2) {
  const n = Number(dezena2);
  if (!Number.isFinite(n)) return null;
  if (n === 0) return 25;
  return Math.ceil(n / 4);
}

function normalizePrize(raw) {
  const milhar = pad4(raw);
  const centena = milhar.slice(-3);
  const dezena = milhar.slice(-2);
  const grupo = dezenaToGrupo(dezena);
  const animal = grupo ? GRUPO_TO_ANIMAL[grupo] : null;
  return { raw: String(raw), milhar, centena, dezena, grupo, animal };
}
function isISODate(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || "").trim());
}

function isHHMM(s) {
  return /^\d{2}:\d{2}$/.test(String(s || "").trim());
}

/**
 * Normaliza horário para HH:MM (raw)
 * Aceita: "10", "10h", "10:9", "10:09"
 */
function normalizeHHMM(value) {
  const s = String(value ?? "").trim();
  if (!s) return "";

  if (isHHMM(s)) return s;

  const m1 = s.match(/^(\d{1,2})h$/i);
  if (m1) return `${String(m1[1]).padStart(2, "0")}:00`;

  const m2 = s.match(/^(\d{1,2})$/);
  if (m2) return `${String(m2[1]).padStart(2, "0")}:00`;

  const m3 = s.match(/^(\d{1,2}):(\d{1,2})$/);
  if (m3) {
    const hh = String(m3[1]).padStart(2, "0");
    const mm = String(m3[2]).padStart(2, "0");
    return `${hh}:${mm}`;
  }

  return "";
}

/**
 * ✅ Normaliza close_hour para SLOT (campo de negócio)
 * - Para PT_RIO: força minutos = 00 (09:09 -> 09:00)
 * - Para outros: preserva raw
 *
 * Correção crítica:
 * - A API do PT_RIO costuma devolver HH:09 como "marcação" e NÃO um minuto real.
 * - Portanto, para PT_RIO, se raw terminar em ":09", tratamos como "sem minuto real"
 *   e NÃO persistimos close_hour_raw (vira "").
 *
 * Retorna:
 * - raw: HH:MM (normalizado) OU "" quando for "sintético" (PT_RIO HH:09)
 * - slot: HH:MM (normalizado para o que o sistema deve usar em consultas/ID)
 */
function normalizeCloseHourForLottery(value, lotteryKey) {
  const lk = String(lotteryKey || "").trim().toUpperCase();
  const raw0 = normalizeHHMM(value);
  if (!raw0 || !isHHMM(raw0)) return { raw: "", slot: "" };

  // ✅ FEDERAL: padroniza o SLOT de negócio (estável) e preserva o raw
  // A API às vezes retorna 19:53 (horário real do fechamento), mas o sorteio é "20HS".
  if (lk === "FEDERAL") {
    return { raw: raw0, slot: "20:00" };
  }

  if (lk === "PT_RIO") {
    const hh = raw0.slice(0, 2);
    const mm = raw0.slice(3, 5);

    // ✅ se vier HH:09, é marcação (não minuto real) -> não grava close_hour_raw
    const raw = mm === "09" ? "" : raw0;
    return { raw, slot: `${hh}:00` };
  }

  return { raw: raw0, slot: raw0 };
}

/**
 * Sanitiza string para docId do Firestore.
 */
function safeIdPart(input) {
  const s = String(input ?? "").trim();
  if (!s) return "NA";
  return s
    .replace(/\s+/g, "_")
    .replace(/[\/\\?#\[\]]/g, "_")
    .replace(/:+/g, "-")
    .slice(0, 80);
}

function pickLotteryId(draw) {
  const candidates = [
    draw?.lottery_id,
    draw?.lotteryId,
    draw?.lottery_uuid,
    draw?.lotteryUuid,
    draw?.lottery,
    draw?.lottery_key,
  ];
  for (const c of candidates) {
    const s = String(c ?? "").trim();
    if (s) return s;
  }
  return null;
}

/**
 * Loterias (IDs) capturadas do Network.
 * Observação: a API pode consolidar em 1 draw por close_hour, mesmo havendo múltiplos IDs aqui.
 *
 * ✅ Agora aceita override via ENV:
 * - KING_LOTTERIES_PT_RIO="uuid1,uuid2,..."
 * - KING_LOTTERIES_FEDERAL="uuid1,uuid2,..."
 */
const LOTTERIES_BY_KEY = {
  PT_RIO: [
    "c168d9b3-97b7-42dc-a332-7815edaa51e2",
    "cbac7c11-e733-400b-ba4d-2dfe0cba4272",
    "98352455-8fd3-447d-ab3d-701dc3f7865f",
    "76c127b7-8157-46b6-a64a-ec7ed1574c9f",
    "8290329b-aac0-4a6a-9649-5feb6182cf4f",
    "d5123f7e-629d-43e9-a8fb-1385ff1cba45",
  ],
  FEDERAL: [],
};

(function applyLotteryOverridesFromEnv() {
  try {
    const rawRio = String(process.env.KING_LOTTERIES_PT_RIO || "").trim();
    if (rawRio) {
      const arr = rawRio
        .split(",")
        .map((s) => String(s || "").trim())
        .filter(Boolean);
      if (arr.length) LOTTERIES_BY_KEY.PT_RIO = arr;
    }

    const rawFed = String(process.env.KING_LOTTERIES_FEDERAL || "").trim();
    if (rawFed) {
      const arrF = rawFed
        .split(",")
        .map((x) => String(x || "").trim())
        .filter(Boolean);
      if (arrF.length) LOTTERIES_BY_KEY.FEDERAL = arrF;
    }

    // debug leve (único, no lugar certo)
    if (KING_OVERRIDE_DEBUG) {
      const nFed = Array.isArray(LOTTERIES_BY_KEY.FEDERAL)
        ? LOTTERIES_BY_KEY.FEDERAL.length
        : 0;
      const nRio = Array.isArray(LOTTERIES_BY_KEY.PT_RIO)
        ? LOTTERIES_BY_KEY.PT_RIO.length
        : 0;
      console.log(`[OVERRIDE] PT_RIO lotteries=${nRio} | FEDERAL lotteries=${nFed}`);
    }
  } catch {
    // silencioso
  }
})();

function buildResultsUrl({ date, lotteryKey, lotteryId = null }) {
  const base = "https://app_services.apionline.cloud/api/results";
  const lk = String(lotteryKey || "").trim().toUpperCase();
  const lotteries = LOTTERIES_BY_KEY[lk];
  if (!lotteries?.length) throw new Error(`lotteryKey inválida: ${lk}`);

  const params = new URLSearchParams();
  params.append("dates[]", date);

  // ✅ se lotteryId for fornecido -> 1 request por lottery
  if (lotteryId) {
    params.append("lotteries[]", lotteryId);
    return `${base}?${params.toString()}`;
  }

  // modo antigo (todos lotteries no mesmo request)
  for (const id of lotteries) params.append("lotteries[]", id);
  return `${base}?${params.toString()}`;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function shouldRetryAxiosError(err) {
  const code = String(err?.code || "").toLowerCase();
  const status = Number(err?.response?.status);

  if (
    code.includes("etimedout") ||
    code.includes("econnreset") ||
    code.includes("enotfound")
  ) {
    return true;
  }

  // 429 / 5xx
  if (
    Number.isFinite(status) &&
    (status === 429 || (status >= 500 && status <= 599))
  ) {
    return true;
  }

  return false;
}

async function axiosGetJson(url) {
  let lastErr = null;

  for (let attempt = 0; attempt <= HTTP_RETRIES; attempt++) {
    try {
      const { data } = await axios.get(url, {
        headers: {
          Accept: "application/json, text/plain, */*",
          Origin: "https://app.kingapostas.com",
          Referer: "https://app.kingapostas.com/",
        },
        timeout: 30000,
        validateStatus: (s) => s >= 200 && s < 300,
      });

      if (!data?.success || !Array.isArray(data?.data)) {
        throw new Error("Resposta inesperada da API (success/data).");
      }

      return data;
    } catch (e) {
      lastErr = e;

      const canRetry = attempt < HTTP_RETRIES && shouldRetryAxiosError(e);
      if (!canRetry) break;

      const backoff = HTTP_RETRY_BASE_MS * Math.pow(2, attempt);
      console.warn(
        `[HTTP] tentativa ${attempt + 1}/${HTTP_RETRIES + 1} falhou (${
          e?.response?.status || e?.code || "err"
        }). retry em ${backoff}ms...`
      );
      await sleep(backoff);
    }
  }

  throw lastErr || new Error("Falha ao buscar API.");
}

/* =========================
   DETAILS (HTML) fallback — PT_RIO 18h
========================= */
function buildDetailsUrl({ date, lotteryKey }) {
  const lk = String(lotteryKey || "").trim().toUpperCase();

  // ✅ bate com o print: lottery=PT+RIO
  const lot = lk === "PT_RIO" ? "PT RIO" : lk.replace(/_/g, " ");

  const q =
    "lottery=" + encodeURIComponent(lot) +
    "&date=" + encodeURIComponent(String(date || "").trim());

  return "https://app.kingapostas.com/results/details?" + q;
}

async function axiosGetText(url) {
  let lastErr = null;

  for (let attempt = 0; attempt <= HTTP_RETRIES; attempt++) {
    try {
      const { data } = await axios.get(url, {
        headers: {
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          Origin: "https://app.kingapostas.com",
          Referer: "https://app.kingapostas.com/",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
        },
        timeout: 30000,
        responseType: "text",
        validateStatus: (s) => s >= 200 && s < 400,
      });
      return String(data || "");
    } catch (e) {
      lastErr = e;
      const canRetry = attempt < HTTP_RETRIES && shouldRetryAxiosError(e);
      if (!canRetry) break;

      const backoff = HTTP_RETRY_BASE_MS * Math.pow(2, attempt);
      console.warn(
        `[HTTP] tentativa ${attempt + 1}/${HTTP_RETRIES + 1} (HTML) falhou (${
          e?.response?.status || e?.code || "err"
        }). retry em ${backoff}ms...`
      );
      await sleep(backoff);
    }
  }

  throw lastErr || new Error("Falha ao buscar HTML");
}

/**
 * Detecta se o HTML é uma página de login/redirect (evita falso positivo).
 */
function detectDetailsHtmlKind(html) {
  const h = String(html || "");
  const low = h.toLowerCase();

  // sinais comuns:
  if (low.includes("/login/sign-in") || low.includes("formlogin")) return "login";
  if (low.includes("bailout_to_client_side_rendering")) return "csr_bailout";
  if (low.includes("app/login") || low.includes("sign-in")) return "login_like";

  // fallback: parece uma página de results
  if (low.includes("results/details") || low.includes("kingapostas"))
    return "results_like";

  return "unknown";
}

// Heurística: só diagnosticar se o HTML "parece" ter o slot e algum conteúdo de prêmios
function parseDetailsHtmlForSlot(html, slotHHMM) {
  const out = {
    hasSlot: false,
    hasAnyPrize: false,
    kind: "unknown",
  };
  const h = String(html || "");
  const slot = String(slotHHMM || "").trim();
  if (!h || !slot) return out;

  out.kind = detectDetailsHtmlKind(h);

  // Se é login/redirect, não confia em nada
  if (out.kind === "login" || out.kind === "login_like") {
    return out;
  }

  if (h.toLowerCase().includes(slot.toLowerCase())) out.hasSlot = true;

  // mantém heurística, mas só vale quando não for login
  if (/(prize[_\s-]?\d+)|(\b\d{4}\b)/i.test(h)) out.hasAnyPrize = true;

  return out;
}

async function tryHtmlDetailsFallback({ date, lotteryKey, closeHour }) {
  const lk = String(lotteryKey || "").trim().toUpperCase();
  const slot = normalizeCloseHourForLottery(closeHour || "", lk).slot;
  if (!slot || !isHHMM(slot)) return { ok: false, reason: "bad_slot" };

  // por enquanto: só PT_RIO 18:00 (não altera outros horários)
  if (!(lk === "PT_RIO" && slot === "18:00")) {
    return { ok: false, reason: "not_applicable" };
  }

  const url = buildDetailsUrl({ date, lotteryKey: lk });
  const html = await axiosGetText(url);
  const parsed = parseDetailsHtmlForSlot(html, slot);

  return {
    ok: true,
    url,
    slot,
    hasSlot: parsed.hasSlot,
    hasAnyPrize: parsed.hasAnyPrize,
    kind: parsed.kind,
  };
}

/**
 * ✅ Merge + dedup de draws vindos de múltiplos requests
 * Dedup key: date + close_hour(SLOT) + lottery_id (se existir)
 */
function mergeAndDedupDraws(arrays, lotteryKey) {
  const map = new Map();

  for (const a of arrays) {
    const list = Array.isArray(a) ? a : [];
    for (const d of list) {
      const date = String(d?.date || "").trim();
      const { slot } = normalizeCloseHourForLottery(d?.close_hour || "", lotteryKey);

      const lid =
        pickLotteryId(d) ||
        String(d?.lottery_name || d?.name || "").trim() ||
        "NA";
      const key = `${date}__${slot}__${lid}`;

      if (!map.has(key)) {
        map.set(key, d);
      } else {
        // se duplicado, preferir o que tiver mais prizes preenchidos
        const prev = map.get(key);
        const prevCount = countPrizesInDraw(prev);
        const curCount = countPrizesInDraw(d);
        if (curCount > prevCount) map.set(key, d);
      }
    }
  }

  return Array.from(map.values());
}

function countPrizesInDraw(draw) {
  let c = 0;
  for (let i = 1; i <= 15; i++) {
    const v = draw?.[`prize_${i}`];
    if (v === null || v === undefined || String(v).trim() === "") continue;
    c++;
  }
  return c;
}

function summarizeCloseHours(draws, lotteryKey) {
  const set = new Set();
  for (const d of draws) {
    const { slot } = normalizeCloseHourForLottery(d?.close_hour || "", lotteryKey);
    if (slot) set.add(slot);
  }
  return Array.from(set).sort();
}

/**
 * ✅ Fetch robusto:
 * - Por default faz 1 request por lotteryId e mescla (evita “cap”/consolidação do endpoint)
 * - Se KING_FETCH_PER_LOTTERY=0 -> faz 1 request único (modo antigo)
 */
async function fetchKingResults({ date, lotteryKey }) {
  const lk = String(lotteryKey || "").trim().toUpperCase();
  const lotteries = LOTTERIES_BY_KEY[lk];
  if (!lotteries?.length) throw new Error(`lotteryKey inválida: ${lk}`);

  if (!FETCH_PER_LOTTERY) {
    const url = buildResultsUrl({ date, lotteryKey: lk });
    return await axiosGetJson(url);
  }

  // ✅ 1 request por lottery (sequencial: mais estável e respeita rate-limit)
  const parts = [];
  const errors = [];

  // helper local: extrai e normaliza closes vindos nesse UUID
  const closeFromDraw = (d) =>
    normalizeHHMM(d?.close_hour ?? d?.closeHour ?? d?.horario ?? d?.close ?? "");

  const summarizeCloseHoursPart = (list) => {
    const set = new Set();
    for (const d of Array.isArray(list) ? list : []) {
      const c = closeFromDraw(d);
      if (c) set.add(c);
    }
    return Array.from(set).sort();
  };

  for (const lotteryId of lotteries) {
    const url = buildResultsUrl({ date, lotteryKey: lk, lotteryId });

    try {
      const data = await axiosGetJson(url);

      // ✅ carimba o UUID do request em cada draw (a API nem sempre retorna lottery_id)
      if (data && Array.isArray(data.data)) {
        data.data = data.data.map((d) => ({
          ...d,
          lottery_id: d?.lottery_id || lotteryId,
          lotteryId: d?.lotteryId || lotteryId,
        }));
      }
      const list = Array.isArray(data?.data) ? data.data : [];
      parts.push(list);

      if (KING_FETCH_DEBUG) {
        const closesPart = summarizeCloseHoursPart(list);
        console.log(
          `[FETCH:PART] ${lk} ${date} lotteryId=${lotteryId} draws=${list.length} close_hours=[${closesPart.join(
            ", "
          )}]`
        );
      }
    } catch (e) {
      const msg = e?.response?.status
        ? `HTTP_${e.response.status}`
        : e?.code || e?.message || "ERR";

      errors.push({ lotteryId, msg });

      console.warn(
        `[FETCH:PART] ${lk} ${date} lotteryId=${lotteryId} ERROR=${msg} (seguindo...)`
      );

      // segue para não travar o dia inteiro por 1 UUID
      continue;
    }
  }

  const merged = mergeAndDedupDraws(parts, lk);
  const closes = summarizeCloseHours(merged, lk);
  const errInfo =
    KING_FETCH_DEBUG && errors.length
      ? ` errors=${errors.length} ids=[${errors.map((x) => x.lotteryId).join(",")}]`
      : "";

  console.log(
    `[FETCH] ${lk} ${date} per-lottery=${lotteries.length} -> merged_draws=${
      merged.length
    } close_hours=[${closes.join(", ")}]${errInfo}`
  );
  return { success: true, data: merged };
}

/**
 * Monta prizes do draw (até 15), já filtrando vazios.
 */
function extractPrizes(draw) {
  const prizes = [];
  for (let i = 1; i <= 15; i++) {
    const v = draw?.[`prize_${i}`];
    if (v === null || v === undefined || String(v).trim() === "") continue;
    prizes.push({ position: i, value: String(v) });
  }
  return prizes;
}

/**
 * Gera drawId e drawRef no mesmo padrão do seu projeto.
 * ✅ Agora usa close_hour SLOT no ID e guarda close_hour_raw (quando fizer sentido).
 */
function buildDrawRef({ draw, lotteryKey }) {
  const date = String(draw?.date || "").trim();

  const { raw: closeRaw, slot: closeSlot } = normalizeCloseHourForLottery(
    draw?.close_hour || "",
    lotteryKey
  );

  const lotteryName = String(draw?.lottery_name || draw?.name || "SEM_NOME").trim();

  const lotteryIdFromDraw = pickLotteryId(draw);
  const lotteryIdPart = safeIdPart(lotteryIdFromDraw || lotteryName);

  // ✅ ID por SLOT
  const drawId = `${safeIdPart(lotteryKey)}__${date}__${safeIdPart(
    closeSlot
  )}__${lotteryIdPart}`;
  const drawRef = db.collection("draws").doc(drawId);

  return {
    drawId,
    drawRef,
    date,
    closeRaw,
    closeSlot,
    lotteryName,
    lotteryIdFromDraw,
  };
}

/**
 * Prova forte de “já completo”:
 * - draw existe
 * - prizesCount > 0 (ou) existe ao menos 1 doc na subcoleção prizes
 */
async function checkAlreadyComplete(drawRef) {
  try {
    const dSnap = await drawRef.get();
    if (!dSnap.exists) return false;

    const data = dSnap.data() || {};
    if (Number(data.prizesCount) > 0) return true;

    // fallback: olha 1 doc de prizes
    const pSnap = await drawRef.collection("prizes").limit(1).get();
    return !pSnap.empty;
  } catch {
    return false;
  }
}

/**
 * ✅ Prova forte por SLOT (anti-índice composto)
 * - Query filtra SOMENTE por date
 * - close_hour + lottery_key/lotteryKey filtrados em memória
 *
 * ✅ FIX CRÍTICO:
 * - Normaliza o close_hour armazenado (pode existir legado "09:09")
 *   e compara por SLOT (HH:00), para não “perder” doc existente.
 */
async function checkSlotCompletion({ date, closeHour, lotteryKey }) {
  try {
    const lk = String(lotteryKey || "").trim().toUpperCase();
    const targetSlot = normalizeCloseHourForLottery(closeHour || "", lk).slot;
    if (!targetSlot || !isHHMM(targetSlot)) return { docs: 0, complete: 0 };

    // query mínima
    const snap = await db.collection("draws").where("date", "==", date).get();
    if (snap.empty) return { docs: 0, complete: 0 };

    const refs = [];
    snap.forEach((doc) => {
      const d = doc.data() || {};

      const lkSnake = String(d.lottery_key || "").trim().toUpperCase();
      const lkCamel = String(d.lotteryKey || "").trim().toUpperCase();

      if (lkSnake !== lk && lkCamel !== lk) return;

      // ✅ compara por SLOT normalizado (pega legado "09:09" como "09:00")
      const storedSlot = normalizeCloseHourForLottery(d.close_hour || "", lk).slot;
      if (storedSlot !== targetSlot) return;

      refs.push(doc.ref);
    });

    if (!refs.length) return { docs: 0, complete: 0 };

    let complete = 0;
    for (const ref of refs) {
      const ok = await checkAlreadyComplete(ref);
      if (ok) complete += 1;
    }

    return { docs: refs.length, complete };
  } catch {
    return { docs: 0, complete: 0 };
  }
}

/**
 * Importa payload para o Firestore.
 * closeHour (opcional): se informado, importa SOMENTE draws daquele horário (SLOT).
 *
 * Opts extras:
 * - skipIfAlreadyComplete (boolean): se true, e o draw do closeHour já estiver completo no FS,
 *   então NÃO escreve nada (evita ruído e falsos positivos).
 */
async function importFromPayload({
  payload,
  lotteryKey,
  closeHour = null,
  skipIfAlreadyComplete = false,
} = {}) {
  const lk = String(lotteryKey || "").trim().toUpperCase();
  const uf = resolveUfFromLotteryKey(lk); // ✅ UF correta (ex.: RJ)

  let batch = db.batch();
  let ops = 0;

  let totalDrawsFromApi = 0;
  let totalDrawsMatchedClose = 0;
  let totalDrawsValid = 0;

  let totalDrawsUpserted = 0;
  let totalDrawsSaved = 0;

  let totalPrizesUpserted = 0;
  let totalPrizesSaved = 0;

  let skippedInvalid = 0;
  let skippedEmpty = 0;
  let skippedCloseHour = 0;
  let skippedAlreadyComplete = 0;

  // Provas úteis para o scheduler (quando closeHour é informado)
  const proof = {
    filterClose: null,

    apiHasPrizes: false,
    apiReturnedTargetDraws: 0, // draws válidos do closeHour com prizes
    targetDrawIds: [],
    inferredDate: null, // date do slot (inferido a partir do payload)

    expectedTargets: 0, // = max(1, apiReturnedTargetDraws)
    slotDocsFound: 0,
    alreadyCompleteCount: 0,
    alreadyCompleteAny: false,
    alreadyCompleteAll: false,

    targetWriteCount: 0,
    targetSavedCount: 0,
  };

  // ✅ filtro deve ser SLOT também
  const filterClose = closeHour
    ? normalizeCloseHourForLottery(closeHour, lk).slot
    : null;
  if (filterClose && !isHHMM(filterClose)) {
    throw new Error('Parâmetro "closeHour" inválido. Use HH:MM.');
  }
  proof.filterClose = filterClose;

  const apiArr = Array.isArray(payload?.data) ? payload.data : [];

  for (const draw of apiArr) {
    totalDrawsFromApi++;

    const date = String(draw?.date || "").trim();
    const { raw: closeRaw, slot: closeSlot } = normalizeCloseHourForLottery(
      draw?.close_hour || "",
      lk
    );

    // filtro por horário (SLOT)
    if (filterClose) {
      if (closeSlot !== filterClose) {
        skippedCloseHour++;
        continue;
      }
    }

    totalDrawsMatchedClose++;

    // validações mínimas (slot precisa ser HH:MM)
    if (!isISODate(date) || !isHHMM(closeSlot)) {
      skippedInvalid++;
      continue;
    }

    // prizes existentes
    const prizes = extractPrizes(draw);

    // Se não tem prize nenhum, NÃO grava
    if (!prizes.length) {
      skippedEmpty++;
      continue;
    }

    totalDrawsValid++;

    if (filterClose) {
      proof.apiHasPrizes = true;
      proof.apiReturnedTargetDraws += 1;
      proof.inferredDate = proof.inferredDate || date;
    }

    const { drawId, drawRef, lotteryName, lotteryIdFromDraw } = buildDrawRef({
      draw,
      lotteryKey: lk,
    });

    if (filterClose) proof.targetDrawIds.push(drawId);

    // Em closeHour: checa “já completo” e, se configurado, pula escrita (por draw)
    if (filterClose) {
      const already = await checkAlreadyComplete(drawRef);
      if (skipIfAlreadyComplete && already) {
        skippedAlreadyComplete++;
        continue;
      }
    }

    // métrica "novo" (opcional — custa reads)
    let isNewDraw = false;
    if (CHECK_EXISTENCE) {
      try {
        const snap = await drawRef.get();
        isNewDraw = !snap.exists;
      } catch {
        isNewDraw = false;
      }
    }

    const ymd = date;

    batch.set(
      drawRef,
      {
        source: "kingapostas",

        uf: uf || null,
        lottery_key: lk,

        lottery_name: lotteryName,
        lottery_id: lotteryIdFromDraw || null,
        drawId,

        date,
        ymd,

        // ✅ campo de negócio (SLOT)
        close_hour: closeSlot,

        // ✅ compat: campos usados no front (evita undefined)
        hour: closeSlot ? String(closeSlot).slice(0, 2) : null,
        close: closeSlot || null,

        // ✅ guarda o que veio da API SOMENTE quando fizer sentido
        // (PT_RIO HH:09 vira "", então cai em null)
        close_hour_raw: closeRaw || null,

        prizesCount: prizes.length,
        importedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    ops++;
    totalDrawsUpserted++;
    if (isNewDraw) totalDrawsSaved++;

    if (filterClose) proof.targetWriteCount += 1;

    for (const p of prizes) {
      const n = normalizePrize(p.value);
      const prizeId = `p${String(p.position).padStart(2, "0")}`;
      const prizeRef = drawRef.collection("prizes").doc(prizeId);

      let isNewPrize = false;
      if (CHECK_EXISTENCE) {
        try {
          const psnap = await prizeRef.get();
          isNewPrize = !psnap.exists;
        } catch {
          isNewPrize = false;
        }
      }

      batch.set(
        prizeRef,
        {
          position: p.position,
          ...n,
        },
        { merge: true }
      );
      ops++;
      totalPrizesUpserted++;
      if (isNewPrize) totalPrizesSaved++;

      if (filterClose) proof.targetWriteCount += 1;

      if (ops >= 420) {
        await batch.commit();
        batch = db.batch();
        ops = 0;
      }
    }
  }

  if (ops > 0) await batch.commit();

  // ✅ flags finais de complete (por SLOT via query anti-índice)
  if (proof.filterClose) {
    const slotDate = proof.inferredDate; // se API trouxe o slot, teremos date
    proof.expectedTargets = Math.max(1, Number(proof.apiReturnedTargetDraws || 0));

    if (slotDate) {
      const { docs, complete } = await checkSlotCompletion({
        date: slotDate,
        closeHour: proof.filterClose,
        lotteryKey: lk,
      });

      proof.slotDocsFound = docs;
      proof.alreadyCompleteCount = complete;
      proof.alreadyCompleteAny = complete > 0;
      proof.alreadyCompleteAll = complete >= proof.expectedTargets;
    } else {
      proof.slotDocsFound = 0;
      proof.alreadyCompleteCount = 0;
      proof.alreadyCompleteAny = false;
      proof.alreadyCompleteAll = false;
    }

    // savedCount “forte” para o scheduler:
    if (!proof.apiHasPrizes) {
      proof.targetSavedCount = 0;
    } else if (skipIfAlreadyComplete && proof.alreadyCompleteAll) {
      proof.targetSavedCount = 0;
    } else {
      proof.targetSavedCount = proof.targetWriteCount;
    }
  }

  console.log(
    `[IMPORT] API draws=${totalDrawsFromApi} | match_close=${totalDrawsMatchedClose} | validos=${totalDrawsValid}` +
      ` | draws_upserted=${totalDrawsUpserted} | draws_novos=${totalDrawsSaved}` +
      ` | prizes_upserted=${totalPrizesUpserted} | prizes_novos=${totalPrizesSaved}` +
      ` | skip_vazio=${skippedEmpty} | skip_invalido=${skippedInvalid} | skip_close=${skippedCloseHour}` +
      ` | skip_complete=${skippedAlreadyComplete}` +
      ` | CHECK_EXISTENCE=${CHECK_EXISTENCE ? "ON" : "OFF"}` +
      ` | uf=${uf || "NULL"} lottery_key=${lk}` +
      (proof.filterClose
        ? ` | expected=${proof.expectedTargets} complete=${proof.alreadyCompleteCount} slotDocs=${proof.slotDocsFound} apiTargets=${proof.apiReturnedTargetDraws}`
        : "")
  );

  return {
    totalDrawsFromApi,
    totalDrawsMatchedClose,
    totalDrawsValid,

    totalDrawsSaved,
    totalDrawsUpserted,

    totalPrizesSaved,
    totalPrizesUpserted,

    skippedEmpty,
    skippedInvalid,
    skippedCloseHour,
    skippedAlreadyComplete,

    proof,
  };
}

/**
 * Função principal para uso pelo server/scheduler.
 * Retorna um objeto com métricas e flags úteis (captured, savedCount, alreadyComplete).
 *
 * ✅ NOVO:
 * - se normalizedClose NÃO existir nos close_hours do dia, retorna blocked/no_draw_for_slot
 *   (isso NÃO é furo)
 */
/**
 * ✅ Cleanup automático: remove docs legados (lottery_id null) quando existe doc UUID no mesmo date+slot.
 * - Usa query mínima por date (sem índice composto)
 * - Seguro: só apaga legado se existe UUID no slot
 */
async function cleanupLegacyDrawsForDate({ date, lotteryKey }) {
  const lk = String(lotteryKey || "").trim().toUpperCase();
  if (!date || !isISODate(date) || !lk) return { ok: false, deleted: 0, slots: 0, reason: "bad_args" };

  const snap = await db.collection("draws").where("date", "==", date).get();
  const rows = snap.docs.map((doc) => ({ ref: doc.ref, id: doc.id, ...doc.data() }));

  const mine = rows.filter((r) => String(r.lottery_key || "").trim().toUpperCase() === lk);

  const bySlot = new Map();
  for (const r of mine) {
    const slot = String(r.close_hour || "").trim();
    if (!slot) continue;
    if (!bySlot.has(slot)) bySlot.set(slot, []);
    bySlot.get(slot).push(r);
  }

  let deleted = 0;
  let slots = 0;
  let batch = db.batch();
  let ops = 0;

  for (const [slot, arr] of bySlot.entries()) {
    const hasUuid = arr.some((x) => x.lottery_id && String(x.lottery_id).includes("-"));
    if (!hasUuid) continue;

    const leg = arr.filter((x) => !x.lottery_id);
    if (!leg.length) continue;

    for (const d of leg) {
      batch.delete(d.ref);
      deleted += 1;
      ops += 1;
      if (ops >= 450) {
        await batch.commit();
        batch = db.batch();
        ops = 0;
      }
    }
    slots += 1;
  }

  if (ops > 0) await batch.commit();

  return { ok: true, deleted, slots };
}

async function runImport({ date, lotteryKey = "PT_RIO", closeHour = null } = {}) {
  if (!date || !isISODate(date)) {
    throw new Error('Parâmetro "date" inválido. Use YYYY-MM-DD.');
  }

  const lk = String(lotteryKey || "").trim().toUpperCase();
  if (!lk || !LOTTERIES_BY_KEY[lk]) {
    throw new Error(`Parâmetro "lotteryKey" inválida: ${lk}`);
  }

  // ✅ BLINDAGEM: nunca importar data futura (evita “sujar” FS por engano)
  const todayBR = todayYMDLocal();
  if (!ALLOW_FUTURE_DATE && isFutureISODate(date)) {
    return {
      ok: true,
      lotteryKey: lk,
      date,
      closeHour: closeHour ? normalizeCloseHourForLottery(closeHour, lk).slot : null,

      blocked: true,
      blockedReason: "future_date",
      todayBR,

      captured: false,
      apiHasPrizes: null,
      alreadyCompleteAny: null,
      alreadyCompleteAll: null,
      expectedTargets: null,
      alreadyCompleteCount: null,
      slotDocsFound: null,
      apiReturnedTargetDraws: null,
      savedCount: null,
      writeCount: null,
      targetDrawIds: null,
      tookMs: 0,

      totalDrawsFromApi: 0,
      totalDrawsMatchedClose: 0,
      totalDrawsValid: 0,
      totalDrawsSaved: 0,
      totalDrawsUpserted: 0,
      totalPrizesSaved: 0,
      totalPrizesUpserted: 0,
      skippedEmpty: 0,
      skippedInvalid: 0,
      skippedCloseHour: 0,
      skippedAlreadyComplete: 0,
      proof: {
        filterClose: closeHour ? normalizeCloseHourForLottery(closeHour, lk).slot : null,
        apiHasPrizes: false,
        apiReturnedTargetDraws: 0,
        targetDrawIds: [],
        inferredDate: null,
        expectedTargets: 0,
        slotDocsFound: 0,
        alreadyCompleteCount: 0,
        alreadyCompleteAny: false,
        alreadyCompleteAll: false,
        targetWriteCount: 0,
        targetSavedCount: 0,
      },
    };
  }

  // ✅ closeHour do scheduler é slot; normaliza para slot também
  const normalizedClose = closeHour ? normalizeCloseHourForLottery(closeHour, lk).slot : null;
  if (normalizedClose && !isHHMM(normalizedClose)) {
    throw new Error('Parâmetro "closeHour" inválido. Use HH:MM.');
  }

  const startedAt = Date.now();

  // ✅ SOFT OVERRIDE: PT_RIO 18:00 fora do calendário (controlado por env)
  const allowSoftOverride18 =
    lk === "PT_RIO" &&
    normalizedClose === "18:00" &&
    String(process.env.PT_RIO_SOFT_OVERRIDE_18 || "1").trim() === "1";

  // ✅ GATE POR CALENDÁRIO (PT_RIO)
  if (normalizedClose && lk === "PT_RIO") {
    const cal = getPtRioSlotsByDate(date);
    const expected = new Set((cal.core || []).concat(cal.opcional || []));

    if (!expected.has(normalizedClose)) {
      if (allowSoftOverride18) {
        try {
          console.log(
            "[CAL-OVERRIDE] PT_RIO " +
              date +
              " slot=" +
              normalizedClose +
              " fora do calendário -> tentando mesmo assim (SOFT 18h override)"
          );
        } catch {}
      } else {
        const ms0 = Date.now() - startedAt;
        return {
          ok: true,
          lotteryKey: lk,
          date,
          closeHour: normalizedClose,
          blocked: true,
          blockedReason: "no_draw_for_slot_calendar",
          todayBR,
          captured: false,
          apiHasPrizes: false,
          alreadyCompleteAny: false,
          alreadyCompleteAll: false,
          expectedTargets: 0,
          alreadyCompleteCount: 0,
          slotDocsFound: 0,
          apiReturnedTargetDraws: 0,
          savedCount: 0,
          writeCount: 0,
          targetDrawIds: [],
          tookMs: ms0,
          totalDrawsFromApi: 0,
          totalDrawsMatchedClose: 0,
          totalDrawsValid: 0,
          totalDrawsSaved: 0,
          totalDrawsUpserted: 0,
          totalPrizesSaved: 0,
          totalPrizesUpserted: 0,
          skippedEmpty: 0,
          skippedInvalid: 0,
          skippedCloseHour: 0,
          skippedAlreadyComplete: 0,
          proof: {
            filterClose: normalizedClose,
            apiHasPrizes: false,
            apiReturnedTargetDraws: 0,
            targetDrawIds: [],
            inferredDate: null,
            expectedTargets: 0,
            slotDocsFound: 0,
            alreadyCompleteCount: 0,
            alreadyCompleteAny: false,
            alreadyCompleteAll: false,
            targetWriteCount: 0,
            targetSavedCount: 0,
          },
        };
      }
    }
  }

  // ✅ Fetch API (JSON)
  let payload = await fetchKingResults({ date, lotteryKey: lk });

  // ✅ Se pediram closeHour e ele NÃO existe no dia (close_hours do FETCH), retorna blocked/api_missing_slot
  if (normalizedClose) {
    const closes = summarizeCloseHours(
      Array.isArray(payload?.data) ? payload.data : [],
      lk
    );
    const hasTarget = closes.includes(normalizedClose);

    if (!hasTarget) {
      // diagnóstico: tenta fallback HTML apenas para logar
      try {
        const fb = await tryHtmlDetailsFallback({
          date,
          lotteryKey: lk,
          closeHour: normalizedClose,
        });

        if (fb.ok) {
          console.warn(
            "[FALLBACK:DETAILS] lk=" +
              lk +
              " date=" +
              date +
              " slot=" +
              fb.slot +
              " kind=" +
              fb.kind +
              " hasSlot=" +
              fb.hasSlot +
              " hasAnyPrize=" +
              fb.hasAnyPrize +
              " url=" +
              fb.url
          );
        }
      } catch (e) {
        console.warn(
          "[FALLBACK:DETAILS] erro: " + String(e?.message || e || "unknown")
        );
      }

      const ms0 = Date.now() - startedAt;

      return {
        ok: true,
        lotteryKey: lk,
        date,
        closeHour: normalizedClose,

        blocked: true,
        blockedReason: "api_missing_slot",
        todayBR,

        captured: false,
        apiHasPrizes: false,
        alreadyCompleteAny: false,
        alreadyCompleteAll: false,

        expectedTargets: 0,
        alreadyCompleteCount: 0,
        slotDocsFound: 0,
        apiReturnedTargetDraws: 0,

        savedCount: 0,
        writeCount: 0,
        targetDrawIds: [],

        tookMs: ms0,

        totalDrawsFromApi: Array.isArray(payload?.data) ? payload.data.length : 0,
        totalDrawsMatchedClose: 0,
        totalDrawsValid: 0,
        totalDrawsSaved: 0,
        totalDrawsUpserted: 0,
        totalPrizesSaved: 0,
        totalPrizesUpserted: 0,
        skippedEmpty: 0,
        skippedInvalid: 0,
        skippedCloseHour: 0,
        skippedAlreadyComplete: 0,
        proof: {
          filterClose: normalizedClose,
          apiHasPrizes: false,
          apiReturnedTargetDraws: 0,
          targetDrawIds: [],
          inferredDate: null,
          expectedTargets: 0,
          slotDocsFound: 0,
          alreadyCompleteCount: 0,
          alreadyCompleteAny: false,
          alreadyCompleteAll: false,
          targetWriteCount: 0,
          targetSavedCount: 0,
        },
      };
    }
  }

  const result = await importFromPayload({
    payload,
    lotteryKey: lk,
    closeHour: normalizedClose,
    skipIfAlreadyComplete: Boolean(normalizedClose), // scheduler: evita regravar
  });

  const ms = Date.now() - startedAt;

  const proof = result.proof || {};
  const apiHasPrizes = Boolean(proof.apiHasPrizes);

  const alreadyCompleteAnyReal = Boolean(proof.alreadyCompleteAny);
  const alreadyCompleteAll = Boolean(proof.alreadyCompleteAll);

  const alreadyCompleteAny = normalizedClose ? alreadyCompleteAnyReal : null;

  // ✅ Captured “verdadeiro” (modo closeHour):
  // - API liberou prizes para o horário, OU
  // - slot já está completo no Firestore
  const captured = normalizedClose
    ? apiHasPrizes || alreadyCompleteAnyReal
    : (result.totalDrawsValid || 0) > 0;

  const writeCount = Number.isFinite(Number(proof.targetWriteCount))
    ? Number(proof.targetWriteCount)
    : 0;

  const savedCount = Number.isFinite(Number(proof.targetSavedCount))
    ? Number(proof.targetSavedCount)
    : 0;

  return {
    ok: true,
    lotteryKey: lk,
    date,
    closeHour: normalizedClose || null,

    blocked: false,
    blockedReason: null,
    todayBR,

    captured,
    apiHasPrizes: normalizedClose ? apiHasPrizes : null,
    alreadyCompleteAny: normalizedClose ? alreadyCompleteAny : null,
    alreadyCompleteAll: normalizedClose ? alreadyCompleteAll : null,

    expectedTargets: normalizedClose ? Number(proof.expectedTargets || 0) : null,
    alreadyCompleteCount: normalizedClose
      ? Number(proof.alreadyCompleteCount || 0)
      : null,
    slotDocsFound: normalizedClose ? Number(proof.slotDocsFound || 0) : null,
    apiReturnedTargetDraws: normalizedClose
      ? Number(proof.apiReturnedTargetDraws || 0)
      : null,

    savedCount: normalizedClose ? savedCount : null,
    writeCount: normalizedClose ? writeCount : null,
    targetDrawIds: normalizedClose ? proof.targetDrawIds || [] : null,

    tookMs: ms,
    ...result,
  };
}
/**
 * CLI wrapper (mantém compatibilidade)
 */
async function main() {
  const date = process.argv[2];
  const lotteryKey = process.argv[3] || "PT_RIO";
  const closeHour = process.argv[4] || null;

  if (!date || !isISODate(date)) {
    throw new Error(
      "Uso: node backend/scripts/importKingApostas.js YYYY-MM-DD [PT_RIO|FEDERAL] [HH:MM]"
    );
  }

  const lk = String(lotteryKey || "").trim().toUpperCase();
  if (!lk || !LOTTERIES_BY_KEY[lk]) {
    throw new Error(
      "Uso: node backend/scripts/importKingApostas.js YYYY-MM-DD [PT_RIO|FEDERAL] [HH:MM]"
    );
  }

  // ✅ no CLI também bloqueia data futura (por segurança)
  const todayBR = todayYMDLocal();
  if (!ALLOW_FUTURE_DATE && isFutureISODate(date)) {
    console.error(
      `[BLOCK] future_date: date=${date} todayBR=${todayBR} (defina ALLOW_FUTURE_DATE=1 para liberar)`
    );
    process.exit(2);
  }

  const normalizedClose = closeHour ? normalizeCloseHourForLottery(closeHour, lk).slot : null;
  if (normalizedClose && !isHHMM(normalizedClose)) {
    throw new Error(
      "Uso: node backend/scripts/importKingApostas.js YYYY-MM-DD [PT_RIO|FEDERAL] [HH:MM]"
    );
  }

  console.log(
    `STEP 1/3 Buscando API: ${lk} ${date}${normalizedClose ? ` ${normalizedClose}` : ""}`
  );
  let payload = await fetchKingResults({ date, lotteryKey: lk });

  // ✅ NOVO (CLI também): se pediram closeHour e ele não existe no dia, avisa e sai 0
  if (normalizedClose) {
    const closes = summarizeCloseHours(
      Array.isArray(payload?.data) ? payload.data : [],
      lk
    );
    const hasTarget = closes.includes(normalizedClose);

    if (!hasTarget) {
      console.warn(
        `[NO_DRAW_FOR_SLOT] ${lk} ${date} slot=${normalizedClose} close_hours=[${closes.join(
          ", "
        )}]`
      );

      // tenta fallback apenas pra logar
      try {
        const fb = await tryHtmlDetailsFallback({
          date,
          lotteryKey: lk,
          closeHour: normalizedClose,
        });
        if (fb.ok) {
          console.warn(
            `[FALLBACK:DETAILS] lk=${lk} date=${date} slot=${fb.slot} kind=${fb.kind} hasSlot=${fb.hasSlot} hasAnyPrize=${fb.hasAnyPrize} url=${fb.url}`
          );
        }
      } catch {}

      process.exit(0);
    }
  }

  console.log(
    `STEP 2/3 Processando ${
      Array.isArray(payload?.data) ? payload.data.length : 0
    } draws retornados pela API...`
  );

  await importFromPayload({
    payload,
    lotteryKey: lk,
    closeHour: normalizedClose,
    skipIfAlreadyComplete: false, // CLI regrava
  });
  console.log(`STEP 3/3 OK. Import concluído: ${lk} ${date}${normalizedClose ? ` ${normalizedClose}` : ""}`);

  // ✅ cleanup automático de legado (somente quando per-lottery está ON)
  if (FETCH_PER_LOTTERY) {
    try {
      const c = await cleanupLegacyDrawsForDate({ date, lotteryKey: lk });
      if (c && c.ok && c.deleted) {
        console.log(`[CLEANUP] ${lk} ${date} slots=${c.slots} deleted=${c.deleted}`);
      } else {
        console.log(`[CLEANUP] ${lk} ${date} slots=${c?.slots || 0} deleted=${c?.deleted || 0}`);
      }
    } catch (e) {
      console.warn(`[CLEANUP] ${lk} ${date} ERROR=${String(e?.message || e || "")}`);
    }
  }
}


if (require.main === module) {
  main().catch((e) => {
    console.error("ERRO:", e?.message || e);
    process.exit(1);
  });
}

module.exports = {
  runImport,
  fetchKingResults,
  importFromPayload,
  buildResultsUrl,
};








