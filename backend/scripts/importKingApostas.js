// backend/scripts/importKingApostas.js
"use strict";

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

    if (current && fs.existsSync(current) && fs.lstatSync(current).isFile()) {
      return; // ok
    }

    // Se existir mas estiver inválida, remove para permitir fallback (ADC)
    if (current) {
      try {
        delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
      } catch {
        process.env.GOOGLE_APPLICATION_CREDENTIALS = "";
      }
    }

    const tryPickFromDir = (dir) => {
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

      return hits[0];
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

function resolveUfFromLotteryKey(lotteryKey) {
  const lk = String(lotteryKey || "").trim().toUpperCase();
  if (!lk) return null;

  if (lk === RJ_LOTTERY_KEY) return RJ_STATE_CODE;

  // se for uma UF padrão de 2 letras (SP, MG, DF etc.), preserva
  if (/^[A-Z]{2}$/.test(lk)) return lk;

  // fallback: não inventa UF
  return null;
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
 * Correção crítica (seu caso):
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
 */
const LOTTERIES_BY_KEY = {
  PT_RIO: [
    "c168d9b3-97b7-42dc-a332-7815edaa51e2",
    "cbac7c11-e733-400b-ba4d-2dfe0cba4272",
    "98352455-8fd3-447d-ab3d-701dc3f7865f",
    "76c127b7-8157-46b6-a64a-ec7ed1574c9f",
    "8290329b-aac4-4a6a-9649-5feb6182cf4f",
    "d5123f7e-629d-43e9-a8fb-1385ff1cba45",
  ],
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
  if (Number.isFinite(status) && (status === 429 || (status >= 500 && status <= 599))) {
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
        pickLotteryId(d) || String(d?.lottery_name || d?.name || "").trim() || "NA";
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
  for (const lotteryId of lotteries) {
    const url = buildResultsUrl({ date, lotteryKey: lk, lotteryId });
    const data = await axiosGetJson(url);
    parts.push(data?.data || []);
  }

  const merged = mergeAndDedupDraws(parts, lk);
  const closes = summarizeCloseHours(merged, lk);

  console.log(
    `[FETCH] ${lk} ${date} per-lottery=${lotteries.length} -> merged_draws=${merged.length} close_hours=[${closes.join(
      ", "
    )}]`
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

  // ✅ ID por SLOT (evita __09-09__)
  const drawId = `${safeIdPart(lotteryKey)}__${date}__${safeIdPart(closeSlot)}__${lotteryIdPart}`;
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
 * - close_hour + lottery_key filtrados em memória
 * - Conta quantos estão completos (prizes)
 */
async function checkSlotCompletion({ date, closeHour, lotteryKey }) {
  try {
    const snap = await db
      .collection("draws")
      .where("date", "==", date)
      .limit(500)
      .get();

    if (snap.empty) {
      return { docs: 0, complete: 0 };
    }

    // filtra em memória
    const refs = [];
    snap.forEach((doc) => {
      const d = doc.data() || {};
      if (String(d.lottery_key || "").trim() !== String(lotteryKey || "").trim()) return;
      if (String(d.close_hour || "").trim() !== String(closeHour || "").trim()) return;
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
  const filterClose = closeHour ? normalizeCloseHourForLottery(closeHour, lk).slot : null;
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
 */
async function runImport({ date, lotteryKey = "PT_RIO", closeHour = null } = {}) {
  if (!date || !isISODate(date)) {
    throw new Error('Parâmetro "date" inválido. Use YYYY-MM-DD.');
  }

  const lk = String(lotteryKey || "").trim().toUpperCase();
  if (!lk || !LOTTERIES_BY_KEY[lk]) {
    throw new Error(`Parâmetro "lotteryKey" inválido: ${lk}`);
  }

  // ✅ closeHour do scheduler é slot; normaliza para slot também
  const normalizedClose = closeHour ? normalizeCloseHourForLottery(closeHour, lk).slot : null;
  if (normalizedClose && !isHHMM(normalizedClose)) {
    throw new Error('Parâmetro "closeHour" inválido. Use HH:MM.');
  }

  const startedAt = Date.now();

  const payload = await fetchKingResults({ date, lotteryKey: lk });

  const result = await importFromPayload({
    payload,
    lotteryKey: lk,
    closeHour: normalizedClose,
    skipIfAlreadyComplete: Boolean(normalizedClose), // scheduler: evita regravar
  });

  const ms = Date.now() - startedAt;

  const proof = result.proof || {};
  const apiHasPrizes = Boolean(proof.apiHasPrizes);

  const alreadyCompleteAll = Boolean(proof.alreadyCompleteAll);

  /**
   * ✅ BLINDAGEM CRÍTICA:
   * autoImportToday fecha slot com (savedCount > 0 || alreadyCompleteAny).
   * Logo, no modo scheduler, "alreadyCompleteAny" precisa significar "ALL".
   */
  const alreadyCompleteAny = normalizedClose ? alreadyCompleteAll : null;

  // ✅ Captured “verdadeiro” (modo closeHour):
  // - API liberou prizes para o horário, OU
  // - slot já está completo no Firestore
  const captured = normalizedClose
    ? apiHasPrizes || alreadyCompleteAll
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

    captured,
    apiHasPrizes: normalizedClose ? apiHasPrizes : null,
    alreadyCompleteAny: normalizedClose ? alreadyCompleteAny : null,
    alreadyCompleteAll: normalizedClose ? alreadyCompleteAll : null,

    expectedTargets: normalizedClose ? Number(proof.expectedTargets || 0) : null,
    alreadyCompleteCount: normalizedClose ? Number(proof.alreadyCompleteCount || 0) : null,
    slotDocsFound: normalizedClose ? Number(proof.slotDocsFound || 0) : null,
    apiReturnedTargetDraws: normalizedClose ? Number(proof.apiReturnedTargetDraws || 0) : null,

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
      "Uso: node archive_backend/backend/scripts/importKingApostas.js YYYY-MM-DD [PT_RIO] [HH:MM]"
    );
  }

  const lk = String(lotteryKey || "").trim().toUpperCase();
  if (!lk || !LOTTERIES_BY_KEY[lk]) {
    throw new Error(
      "Uso: node archive_backend/backend/scripts/importKingApostas.js YYYY-MM-DD [PT_RIO] [HH:MM]"
    );
  }

  const normalizedClose = closeHour ? normalizeCloseHourForLottery(closeHour, lk).slot : null;
  if (normalizedClose && !isHHMM(normalizedClose)) {
    throw new Error(
      "Uso: node archive_backend/backend/scripts/importKingApostas.js YYYY-MM-DD [PT_RIO] [HH:MM]"
    );
  }

  console.log(
    `[1/3] Buscando API: ${lk} ${date}${normalizedClose ? ` ${normalizedClose}` : ""}`
  );

  const payload = await fetchKingResults({ date, lotteryKey: lk });

  console.log(
    `[2/3] Processando ${
      Array.isArray(payload?.data) ? payload.data.length : 0
    } draws retornados pela API...`
  );

  await importFromPayload({
    payload,
    lotteryKey: lk,
    closeHour: normalizedClose,
    skipIfAlreadyComplete: false, // CLI regrava
  });

  console.log(
    `[3/3] OK. Import concluído: ${lk} ${date}${normalizedClose ? ` ${normalizedClose}` : ""}`
  );
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
