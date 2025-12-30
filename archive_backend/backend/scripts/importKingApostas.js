const fs = require("fs");
const path = require("path");

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
  } catch (e) {}
})();

/**
 * Importador KingApostas (app_services.apionline.cloud) -> Firestore
 *
 * Uso:
 *   node backend/scripts/importKingApostas.js 2025-12-29
 *   node backend/scripts/importKingApostas.js 2025-12-29 PT_RIO
 *
 * Requisitos:
 * - firebase-admin configurado (GOOGLE_APPLICATION_CREDENTIALS ou credencial default)
 */

"use strict";

const axios = require("axios");
const admin = require("firebase-admin");

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

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

/**
 * Loterias (IDs) capturadas do Network.
 * IMPORTANTÍSSIMO: estes IDs parecem estáveis para o conjunto exibido no PT_RIO.
 * Se em algum momento a King trocar, a gente só atualiza aqui.
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

  // Header "Origin" ajuda a manter comportamento próximo ao browser.
  const { data } = await axios.get(url, {
    headers: {
      Accept: "application/json, text/plain, */*",
      Origin: "https://app.kingapostas.com",
      Referer: "https://app.kingapostas.com/",
    },
    timeout: 30000,
    // validação simples: só aceitar 2xx
    validateStatus: (s) => s >= 200 && s < 300,
  });

  if (!data?.success || !Array.isArray(data?.data)) {
    throw new Error("Resposta inesperada da API (success/data).");
  }

  return data;
}

async function importFromPayload({ payload, lotteryKey }) {
  let batch = db.batch();
  let ops = 0;

  for (const draw of payload.data) {
    const date = draw.date;
    const close = draw.close_hour;
    const lotteryName = draw.lottery_name || draw.name || "SEM_NOME";

    // drawId estável
    const drawId = `${lotteryKey}__${date}__${close}`;
    const drawRef = db.collection("draws").doc(drawId);

    // prizes existentes (até 15)
    const prizes = [];
    for (let i = 1; i <= 15; i++) {
      const v = draw[`prize_${i}`];
      if (v === null || v === undefined || String(v).trim() === "") continue;
      prizes.push({ position: i, value: String(v) });
    }

    // >>> PATCH: grava uf + drawId no documento
    batch.set(
      drawRef,
      {
        source: "kingapostas",
        uf: lotteryKey, // <<< ADICIONADO (resolve o problema do where('uf'...))
        lottery_key: lotteryKey,
        lottery_name: lotteryName,
        drawId, // <<< recomendado para debug/UI
        date,
        close_hour: close,
        prizesCount: prizes.length,
        importedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    ops++;

    for (const p of prizes) {
      const n = normalizePrize(p.value);
      const prizeId = `p${String(p.position).padStart(2, "0")}`;
      const prizeRef = drawRef.collection("prizes").doc(prizeId);

      batch.set(
        prizeRef,
        {
          position: p.position,
          ...n,
        },
        { merge: true }
      );
      ops++;

      // limite 500 ops por batch (vamos com folga)
      if (ops >= 450) {
        await batch.commit();
        batch = db.batch();
        ops = 0;
      }
    }
  }

  if (ops > 0) await batch.commit();
}

async function main() {
  const date = process.argv[2];
  const lotteryKey = process.argv[3] || "PT_RIO";

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("Uso: node backend/scripts/importKingApostas.js YYYY-MM-DD [PT_RIO]");
  }

  console.log(`[1/3] Buscando API: ${lotteryKey} ${date}`);
  const payload = await fetchKingResults({ date, lotteryKey });

  console.log(`[2/3] Importando ${payload.data.length} draws...`);
  await importFromPayload({ payload, lotteryKey });

  console.log(`[3/3] OK. Import concluído: ${lotteryKey} ${date}`);
}

main().catch((e) => {
  console.error("ERRO:", e?.message || e);
  process.exit(1);
});
