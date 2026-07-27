"use strict";

const fs = require("fs");
const path = require("path");
const axios = require("axios");
const admin = require("firebase-admin");

const ROOT = process.cwd();
const IMPORTER = path.join(
  ROOT,
  "backend",
  "scripts",
  "importKingApostas.js"
);

const OUT = path.join(
  ROOT,
  "tmp",
  "res_aud_48_cards_vazios_sabado_18h.txt"
);

const FROM = "2022-06-08";
const TO = "2026-07-11";
const LOTTERY_KEY = "PT_RIO";
const TARGET_HOUR = "18:00";

function line(text = "") {
  fs.appendFileSync(OUT, String(text) + "\n", "utf8");
}

function normalizeYmd(value) {
  const s = String(value || "").trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : "";
}

function normalizeHour(value) {
  const s = String(value || "").trim();
  const m = s.match(/(?:^|\s)(\d{1,2}):(\d{2})/);

  if (!m) return "";

  const hh = String(Number(m[1])).padStart(2, "0");
  const mm = m[2];

  return `${hh}:${mm}`;
}

function slotHourPtRio(value) {
  const h = normalizeHour(value);
  if (!h) return "";

  return `${h.slice(0, 2)}:00`;
}

function hasPrizes(draw) {
  if (!draw || typeof draw !== "object") return false;

  if (Number(draw.prizesCount) > 0) return true;
  if (Array.isArray(draw.prizes) && draw.prizes.length > 0) return true;
  if (Array.isArray(draw.results) && draw.results.length > 0) return true;
  if (Array.isArray(draw.result) && draw.result.length > 0) return true;

  return false;
}

function extractPtRioIds(source) {
  const block =
    source.match(
      /PT_RIO\s*:\s*\[([\s\S]*?)\]\s*,?\s*(?:FEDERAL|LOOK|NACIONAL)\s*:/
    ) ||
    source.match(/PT_RIO\s*:\s*\[([\s\S]*?)\]/);

  if (!block) {
    throw new Error(
      "Não foi possível localizar o array LOTTERIES_BY_KEY.PT_RIO."
    );
  }

  const ids = Array.from(
    block[1].matchAll(
      /["']([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})["']/gi
    ),
    (m) => m[1]
  );

  return [...new Set(ids)];
}

function tryLoadEnvFile(file) {
  if (!fs.existsSync(file)) return;

  const raw = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");

  for (const lineRaw of raw.split(/\r?\n/)) {
    let s = String(lineRaw || "").trim();

    if (!s || s.startsWith("#")) continue;

    if (/^export\s+/i.test(s)) {
      s = s.replace(/^export\s+/i, "").trim();
    }

    const i = s.indexOf("=");
    if (i <= 0) continue;

    const key = s.slice(0, i).trim();
    let value = s.slice(i + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function prepareEnvironment() {
  const candidates = [
    path.join(ROOT, ".env"),
    path.join(ROOT, ".env.local"),
    path.join(ROOT, "backend", ".env"),
    path.join(ROOT, "backend", ".env.local"),
  ];

  for (const file of candidates) {
    tryLoadEnvFile(file);
  }

  const current = process.env.GOOGLE_APPLICATION_CREDENTIALS;

  if (current && fs.existsSync(current)) {
    return;
  }

  const credentialCandidates = [
    path.join(ROOT, "serviceAccountKey.json"),
    path.join(ROOT, "firebase-service-account.json"),
    path.join(ROOT, "backend", "serviceAccountKey.json"),
    path.join(ROOT, "backend", "firebase-service-account.json"),
    path.join(ROOT, "backend", "service-account.json"),
  ];

  const found = credentialCandidates.find((file) => fs.existsSync(file));

  if (found) {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = found;
  }
}

function initializeFirestore() {
  prepareEnvironment();

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
    });
  }

  return admin.firestore();
}

function enumerateSaturdays(from, to) {
  const dates = [];

  const cursor = new Date(`${from}T12:00:00Z`);
  const end = new Date(`${to}T12:00:00Z`);

  while (cursor <= end) {
    if (cursor.getUTCDay() === 6) {
      dates.push(cursor.toISOString().slice(0, 10));
    }

    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return dates;
}

async function firestoreHasPrize(drawDoc) {
  const data = drawDoc.data() || {};

  if (hasPrizes(data)) {
    return true;
  }

  try {
    const prizeSnap = await drawDoc.ref
      .collection("prizes")
      .limit(1)
      .get();

    return !prizeSnap.empty;
  } catch {
    return false;
  }
}

async function readFirestoreStatus(db) {
  const snap = await db
    .collection("draws")
    .where("lottery_key", "==", LOTTERY_KEY)
    .select(
      "ymd",
      "date",
      "close_hour",
      "closeHour",
      "hour",
      "hora",
      "prizesCount",
      "prizes"
    )
    .get();

  const byDate = new Map();

  for (const doc of snap.docs) {
    const data = doc.data() || {};

    const ymd =
      normalizeYmd(data.ymd) ||
      normalizeYmd(data.date);

    if (!ymd || ymd < FROM || ymd > TO) {
      continue;
    }

    const rawHour =
      data.close_hour ??
      data.closeHour ??
      data.hour ??
      data.hora ??
      "";

    const slot = slotHourPtRio(rawHour);

    if (!byDate.has(ymd)) {
      byDate.set(ymd, []);
    }

    const complete = await firestoreHasPrize(doc);

    byDate.get(ymd).push({
      id: doc.id,
      rawHour: normalizeHour(rawHour),
      slot,
      complete,
      prizesCount: Number(data.prizesCount || 0),
    });
  }

  return {
    docsRead: snap.size,
    byDate,
  };
}

function buildApiUrl(date, ids) {
  const url = new URL(
    "https://app_services.apionline.cloud/api/results"
  );

  url.searchParams.append("dates[]", date);

  for (const id of ids) {
    url.searchParams.append("lotteries[]", id);
  }

  return url.toString();
}

async function fetchKingCombined(date, ids) {
  const url = buildApiUrl(date, ids);

  const response = await axios.get(url, {
    headers: {
      Accept: "application/json, text/plain, */*",
      Origin: "https://app.kingapostas.com",
      Referer: "https://app.kingapostas.com/",
      "User-Agent": "Mozilla/5.0",
    },
    timeout: 30000,
    validateStatus: (status) =>
      status >= 200 && status < 300,
  });

  if (!response.data || !Array.isArray(response.data.data)) {
    throw new Error("Resposta da API sem array data.");
  }

  return response.data.data;
}

async function fetchKingPerId(date, ids) {
  const all = [];
  const errors = [];

  for (const id of ids) {
    try {
      const draws = await fetchKingCombined(date, [id]);

      for (const draw of draws) {
        all.push({
          ...draw,
          __requestedLotteryId: id,
        });
      }
    } catch (error) {
      errors.push({
        id,
        error:
          error?.response?.status ||
          error?.code ||
          error?.message ||
          "erro desconhecido",
      });
    }

    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  return { draws: all, errors };
}

function inspectApiDraws(draws) {
  const found = [];

  for (const draw of Array.isArray(draws) ? draws : []) {
    const raw =
      draw?.close_hour ??
      draw?.closeHour ??
      draw?.horario ??
      draw?.close ??
      draw?.hour ??
      "";

    const rawHour = normalizeHour(raw);
    const slot = slotHourPtRio(rawHour);

    if (slot !== TARGET_HOUR) {
      continue;
    }

    found.push({
      rawHour,
      slot,
      hasPrizes: hasPrizes(draw),
      prizesCount:
        Number(draw?.prizesCount || 0) ||
        (Array.isArray(draw?.prizes)
          ? draw.prizes.length
          : 0),
      lotteryId:
        draw?.lottery_id ||
        draw?.lotteryId ||
        draw?.__requestedLotteryId ||
        "",
      drawId:
        draw?.id ||
        draw?.draw_id ||
        draw?.drawId ||
        "",
    });
  }

  return found;
}

async function auditDate(date, ids, firestoreDocs) {
  const fsTarget = firestoreDocs.filter(
    (draw) => draw.slot === TARGET_HOUR
  );

  const fsComplete = fsTarget.some(
    (draw) => draw.complete
  );

  if (fsComplete) {
    return {
      date,
      firestore: fsTarget,
      apiTarget: [],
      apiErrors: [],
      classification: "CARD_JA_PREENCHIDO",
      action: "NENHUMA",
    };
  }

  let combinedDraws = [];
  let combinedError = null;

  try {
    combinedDraws = await fetchKingCombined(date, ids);
  } catch (error) {
    combinedError =
      error?.response?.status ||
      error?.code ||
      error?.message ||
      "erro desconhecido";
  }

  let apiTarget = inspectApiDraws(combinedDraws);
  let apiErrors = [];

  /*
   * Se a consulta combinada não encontrar 18h,
   * confirma individualmente em cada UUID para evitar
   * falso negativo por consolidação/cap da API.
   */
  if (!apiTarget.length) {
    const individual = await fetchKingPerId(date, ids);

    apiTarget = inspectApiDraws(individual.draws);
    apiErrors = individual.errors;
  }

  const apiHasValidResult = apiTarget.some(
    (draw) => draw.hasPrizes
  );

  if (apiHasValidResult) {
    return {
      date,
      firestore: fsTarget,
      apiTarget,
      apiErrors,
      combinedError,
      classification: "CORRIGIR_IMPORTACAO",
      action:
        "NAO REMOVER O CARD; IMPORTAR O RESULTADO CORRETO",
    };
  }

  const allRequestsFailed =
    Boolean(combinedError) &&
    apiErrors.length >= ids.length;

  if (allRequestsFailed) {
    return {
      date,
      firestore: fsTarget,
      apiTarget,
      apiErrors,
      combinedError,
      classification: "INCONCLUSIVO",
      action:
        "NAO REMOVER; REPETIR A CONSULTA DA FONTE",
    };
  }

  return {
    date,
    firestore: fsTarget,
    apiTarget,
    apiErrors,
    combinedError,
    classification: "REMOVER_CARD_VAZIO",
    action:
      "FONTE SEM SORTEIO ÀS 18H; REMOVER O CARD VAZIO DESTA DATA",
  };
}

async function main() {
  fs.writeFileSync(OUT, "", "utf8");

  line(
    "===================================================================================================="
  );
  line(
    "RES-AUD-48 — AUDITORIA DE CARDS VAZIOS: PT_RIO, SÁBADOS, 18H"
  );
  line(
    "===================================================================================================="
  );
  line(`Executado em: ${new Date().toISOString()}`);
  line(`Período: ${FROM} até ${TO}`);
  line(`Loteria: ${LOTTERY_KEY}`);
  line(`Horário auditado: ${TARGET_HOUR}`);
  line("");
  line("Critério:");
  line(
    "- Fonte sem sorteio: REMOVER_CARD_VAZIO"
  );
  line(
    "- Fonte com sorteio e Firestore vazio: CORRIGIR_IMPORTACAO"
  );
  line(
    "- Falha de consulta: INCONCLUSIVO"
  );
  line("");

  if (!fs.existsSync(IMPORTER)) {
    throw new Error(
      `Arquivo não encontrado: ${IMPORTER}`
    );
  }

  const importerSource = fs.readFileSync(
    IMPORTER,
    "utf8"
  );

  const ptRioIds = extractPtRioIds(importerSource);

  line(
    `UUIDs PT_RIO encontrados no importador: ${ptRioIds.length}`
  );

  for (const id of ptRioIds) {
    line(`- ${id}`);
  }

  line("");

  const db = initializeFirestore();

  line("Lendo resultados existentes no Firestore...");

  const firestore = await readFirestoreStatus(db);

  line(
    `Documentos PT_RIO lidos no Firestore: ${firestore.docsRead}`
  );
  line("");

  const saturdays = enumerateSaturdays(FROM, TO);

  line(
    `Sábados incluídos na auditoria: ${saturdays.length}`
  );
  line("");

  const results = [];

  let index = 0;

  for (const date of saturdays) {
    index++;

    const docs = firestore.byDate.get(date) || [];

    process.stdout.write(
      `[${index}/${saturdays.length}] ${date} `
    );

    const result = await auditDate(
      date,
      ptRioIds,
      docs
    );

    results.push(result);

    console.log(result.classification);

    await new Promise((resolve) =>
      setTimeout(resolve, 200)
    );
  }

  const counts = results.reduce(
    (acc, item) => {
      acc[item.classification] =
        (acc[item.classification] || 0) + 1;
      return acc;
    },
    {}
  );

  line(
    "===================================================================================================="
  );
  line("RESUMO");
  line(
    "===================================================================================================="
  );

  for (const key of [
    "CARD_JA_PREENCHIDO",
    "REMOVER_CARD_VAZIO",
    "CORRIGIR_IMPORTACAO",
    "INCONCLUSIVO",
  ]) {
    line(`${key}: ${counts[key] || 0}`);
  }

  line("");

  const actionable = results.filter(
    (item) =>
      item.classification !== "CARD_JA_PREENCHIDO"
  );

  line(
    "===================================================================================================="
  );
  line("ANÁLISE DATA POR DATA");
  line(
    "===================================================================================================="
  );
  line("");

  for (const item of actionable) {
    line(`Data: ${item.date}`);
    line("Dia da semana: sábado");
    line(`Horário: ${TARGET_HOUR}`);

    if (item.firestore.length) {
      line(
        `Firestore: ${JSON.stringify(
          item.firestore,
          null,
          2
        )}`
      );
    } else {
      line("Firestore: nenhum resultado às 18h");
    }

    if (item.apiTarget.length) {
      line(
        `Fonte King: ${JSON.stringify(
          item.apiTarget,
          null,
          2
        )}`
      );
    } else {
      line("Fonte King: nenhum sorteio às 18h");
    }

    if (item.combinedError) {
      line(
        `Erro da consulta combinada: ${item.combinedError}`
      );
    }

    if (item.apiErrors.length) {
      line(
        `Erros por UUID: ${JSON.stringify(
          item.apiErrors,
          null,
          2
        )}`
      );
    }

    line(`Classificação: ${item.classification}`);
    line(`Ação recomendada: ${item.action}`);
    line(
      "----------------------------------------------------------------------------------------------------"
    );
  }

  line("");
  line(
    "===================================================================================================="
  );
  line("LISTA DIRETA — REMOVER CARDS VAZIOS");
  line(
    "===================================================================================================="
  );

  const removeDates = results.filter(
    (item) =>
      item.classification === "REMOVER_CARD_VAZIO"
  );

  if (!removeDates.length) {
    line("Nenhuma data confirmada.");
  } else {
    for (const item of removeDates) {
      line(`${item.date} | sábado | 18:00`);
    }
  }

  line("");
  line(
    "===================================================================================================="
  );
  line("LISTA DIRETA — CORRIGIR IMPORTAÇÃO");
  line(
    "===================================================================================================="
  );

  const importDates = results.filter(
    (item) =>
      item.classification === "CORRIGIR_IMPORTACAO"
  );

  if (!importDates.length) {
    line("Nenhuma data confirmada.");
  } else {
    for (const item of importDates) {
      line(`${item.date} | sábado | 18:00`);
    }
  }

  line("");
  line(
    "AUDITORIA CONCLUÍDA. NENHUMA ALTERAÇÃO FOI REALIZADA."
  );

  console.log("");
  console.log("Relatório criado:");
  console.log(OUT);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    line("");
    line(
      "===================================================================================================="
    );
    line("ERRO FATAL");
    line(
      "===================================================================================================="
    );
    line(error?.stack || error?.message || String(error));

    console.error(error);
    process.exit(1);
  });
