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

    const raw = fs.readFileSync(envPath, "utf8");
    raw.split(/\r?\n/).forEach((line) => {
      const s = String(line || "").trim();
      if (!s || s.startsWith("#")) return;

      const i = s.indexOf("=");
      if (i <= 0) return;

      const k = s.slice(0, i).trim();
      const v = s.slice(i + 1).trim();

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
        // fallback: não quebra
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

      // mais recente
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
 * Normaliza horário para HH:MM
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
};

function buildResultsUrl({ date, lotteryKey }) {
  const base = "https://app_services.apionline.cloud/api/results";
  const lotteries = LOTTERIES_BY_KEY[lotteryKey];
  if (!lotteries?.length) throw new Error(`lotteryKey inválida: ${lotteryKey}`);

  const params = new URLSearchParams();
  params.append("dates[]", date);
  for (const id of lotteries) params.append("lotteries[]", id);

  return `${base}?${params.toString()}`;
}

async function fetchKingResults({ date, lotteryKey }) {
  const url = buildResultsUrl({ date, lotteryKey });

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
 */
function buildDrawRef({ draw, lotteryKey }) {
  const date = String(draw?.date || "").trim();
  const close = normalizeHHMM(draw?.close_hour || "");
  const lotteryName = String(draw?.lottery_name || draw?.name || "SEM_NOME").trim();

  const lotteryIdFromDraw = pickLotteryId(draw);
  const lotteryIdPart = safeIdPart(lotteryIdFromDraw || lotteryName);

  const drawId = `${safeIdPart(lotteryKey)}__${date}__${safeIdPart(close)}__${lotteryIdPart}`;
  const drawRef = db.collection("draws").doc(drawId);

  return {
    drawId,
    drawRef,
    date,
    close,
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
 * Importa payload para o Firestore.
 * closeHour (opcional): se informado, importa SOMENTE draws daquele horário.
 *
 * Opts extras:
 * - skipIfAlreadyComplete (boolean): se true, e o draw do closeHour já estiver completo no FS,
 *   então NÃO escreve nada (evita ruído e falsos positivos).
 *
 * MÉTRICAS:
 * - totalDrawsUpserted / totalPrizesUpserted => contabiliza operações de escrita realizadas
 * - totalDrawsSaved / totalPrizesSaved => só é "novo" preciso quando CHECK_EXISTENCE=1
 */
async function importFromPayload({
  payload,
  lotteryKey,
  closeHour = null,
  skipIfAlreadyComplete = false,
} = {}) {
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
  let proof = {
    filterClose: null,
    apiHasPrizes: false,
    alreadyComplete: false,
    targetDrawId: null,
    targetWriteCount: 0,
    targetSavedCount: 0,
  };

  const filterClose = closeHour ? normalizeHHMM(closeHour) : null;
  if (filterClose && !isHHMM(filterClose)) {
    throw new Error('Parâmetro "closeHour" inválido. Use HH:MM.');
  }
  proof.filterClose = filterClose;

  for (const draw of payload.data) {
    totalDrawsFromApi++;

    const date = String(draw?.date || "").trim();
    const close = normalizeHHMM(draw?.close_hour || "");

    // filtro por horário
    if (filterClose) {
      if (close !== filterClose) {
        skippedCloseHour++;
        continue;
      }
    }

    totalDrawsMatchedClose++;

    // validações mínimas
    if (!isISODate(date) || !isHHMM(close)) {
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

    // Se estamos em modo closeHour, agora sabemos: API liberou prêmios para esse horário
    if (filterClose) proof.apiHasPrizes = true;

    const { drawId, drawRef, lotteryName, lotteryIdFromDraw } = buildDrawRef({
      draw,
      lotteryKey,
    });

    // Em closeHour: checa “já completo” e, se configurado, pula escrita
    if (filterClose) {
      proof.targetDrawId = drawId;
      const already = await checkAlreadyComplete(drawRef);
      proof.alreadyComplete = already;

      if (skipIfAlreadyComplete && already) {
        skippedAlreadyComplete++;
        // Não escreve nada. Prova fica registrada e o scheduler pode marcar como concluído.
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

    // ✅ FIX REAL: sempre gravar ymd (base do projeto) a partir de date (YYYY-MM-DD)
    const ymd = date;

    batch.set(
      drawRef,
      {
        source: "kingapostas",
        uf: lotteryKey,
        lottery_key: lotteryKey,
        lottery_name: lotteryName,
        lottery_id: lotteryIdFromDraw || null,
        drawId,

        // datas
        date,
        ymd,

        close_hour: close,
        prizesCount: prizes.length,
        importedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    ops++;
    totalDrawsUpserted++;
    if (isNewDraw) totalDrawsSaved++;

    // prova: contagem de writes deste horário
    if (filterClose) proof.targetWriteCount += 1;

    for (const p of prizes) {
      const n = normalizePrize(p.value);
      const prizeId = `p${String(p.position).padStart(2, "0")}`;
      const prizeRef = drawRef.collection("prizes").doc(prizeId);

      // métrica "novo" (opcional — custa reads)
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

      // limite por batch
      if (ops >= 420) {
        await batch.commit();
        batch = db.batch();
        ops = 0;
      }
    }

    // Se closeHour foi usado, sabemos que no máximo 1 draw entra (no seu caso)
    // Então podemos sair cedo para reduzir custo.
    if (filterClose) break;
  }

  if (ops > 0) await batch.commit();

  // savedCount “forte” para o scheduler:
  // - se API não liberou prêmios => 0
  // - se já estava completo e pulamos => 0 (porque não precisou gravar)
  // - se gravou => writeCount (draw + prizes)
  if (proof.filterClose) {
    if (!proof.apiHasPrizes) {
      proof.targetSavedCount = 0;
    } else if (skipIfAlreadyComplete && proof.alreadyComplete) {
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
      ` | CHECK_EXISTENCE=${CHECK_EXISTENCE ? "ON" : "OFF"}`
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
  if (!lotteryKey || !LOTTERIES_BY_KEY[lotteryKey]) {
    throw new Error(`Parâmetro "lotteryKey" inválido: ${lotteryKey}`);
  }

  const normalizedClose = closeHour ? normalizeHHMM(closeHour) : null;
  if (normalizedClose && !isHHMM(normalizedClose)) {
    throw new Error('Parâmetro "closeHour" inválido. Use HH:MM.');
  }

  const startedAt = Date.now();

  const payload = await fetchKingResults({ date, lotteryKey });

  // Quando closeHour é informado (scheduler Opção B):
  // - queremos PROVA FORTE
  // - e queremos evitar reescrever se já está completo
  const result = await importFromPayload({
    payload,
    lotteryKey,
    closeHour: normalizedClose,
    skipIfAlreadyComplete: Boolean(normalizedClose), // liga automaticamente
  });

  const ms = Date.now() - startedAt;

  const proof = result.proof || {};
  const apiHasPrizes = Boolean(proof.apiHasPrizes);

  // ✅ Captured “verdadeiro” = API liberou prêmios para esse closeHour (ou já estava completo)
  // - se já estava completo, consideramos capturado também (porque o objetivo é não faltar no dia)
  // - se API ainda não liberou (sem prizes), captured = false
  const alreadyComplete = Boolean(proof.alreadyComplete);
  const captured = normalizedClose ? apiHasPrizes || alreadyComplete : (result.totalDrawsValid || 0) > 0;

  // ✅ savedCount / writeCount para o autoImportToday usar como prova (opcional)
  const writeCount = Number.isFinite(Number(proof.targetWriteCount)) ? Number(proof.targetWriteCount) : 0;
  const savedCount = Number.isFinite(Number(proof.targetSavedCount)) ? Number(proof.targetSavedCount) : 0;

  return {
    ok: true,
    lotteryKey,
    date,
    closeHour: normalizedClose || null,

    captured, // agora é prova real para closeHour
    apiHasPrizes: normalizedClose ? apiHasPrizes : null,
    alreadyComplete: normalizedClose ? alreadyComplete : null,
    savedCount: normalizedClose ? savedCount : null,
    writeCount: normalizedClose ? writeCount : null,
    targetDrawId: normalizedClose ? (proof.targetDrawId || null) : null,

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

  const normalizedClose = closeHour ? normalizeHHMM(closeHour) : null;
  if (normalizedClose && !isHHMM(normalizedClose)) {
    throw new Error(
      "Uso: node archive_backend/backend/scripts/importKingApostas.js YYYY-MM-DD [PT_RIO] [HH:MM]"
    );
  }

  console.log(
    `[1/3] Buscando API: ${lotteryKey} ${date}${normalizedClose ? ` ${normalizedClose}` : ""}`
  );

  const payload = await fetchKingResults({ date, lotteryKey });

  console.log(`[2/3] Processando ${payload.data.length} draws retornados pela API...`);

  await importFromPayload({
    payload,
    lotteryKey,
    closeHour: normalizedClose,
    skipIfAlreadyComplete: false, // CLI mantém comportamento tradicional (regrava)
  });

  console.log(
    `[3/3] OK. Import concluído: ${lotteryKey} ${date}${normalizedClose ? ` ${normalizedClose}` : ""}`
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
