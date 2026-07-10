// src/dev/runAuditTop3.js

import {
  getKingBoundsByUf,
  getKingResultsByRange,
} from "../services/kingResultsService";

import {
  auditTop3Backtest,
  pickDrawYMD,
} from "../pages/Top3/top3.engine";

import {
  PT_RIO_SCHEDULE_NORMAL,
  PT_RIO_SCHEDULE_WED_SAT,
  FEDERAL_SCHEDULE,
} from "../pages/Top3/top3.constants";

function safeStr(value) {
  return String(value ?? "").trim();
}

function isYmd(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(safeStr(value));
}

function addDaysUtc(ymd, amount) {
  if (!isYmd(ymd)) return "";

  const [year, month, day] = ymd.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  date.setUTCDate(date.getUTCDate() + Number(amount || 0));

  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function countUniqueDays(draws) {
  return new Set(
    (Array.isArray(draws) ? draws : [])
      .map((draw) => pickDrawYMD(draw))
      .filter(isYmd)
  ).size;
}

function printDivider() {
  console.log("============================================================");
}

async function main() {
  const uf = "RJ";
  const lotteryKey = "PT_RIO";

  printDivider();
  console.log("[BACKTEST TOP3] ALVO EXCLUSIVO: GRUPO DO 1º PRÊMIO");
  console.log("[BACKTEST TOP3] Os três itens são candidatos ao 1º prêmio.");
  printDivider();

  const bounds = await getKingBoundsByUf({ uf });

  const minDate = safeStr(bounds?.minDate || bounds?.minYmd);
  const maxDate = safeStr(bounds?.maxDate || bounds?.maxYmd);

  if (!isYmd(minDate) || !isYmd(maxDate)) {
    throw new Error(
      `Bounds inválidos: minDate=${minDate || "ausente"} maxDate=${
        maxDate || "ausente"
      }`
    );
  }

  const envFrom = safeStr(process.env.AUDIT_FROM);
  const envTo = safeStr(process.env.AUDIT_TO);
  const fullAudit =
    safeStr(process.env.AUDIT_FULL) === "1" ||
    safeStr(process.env.AUDIT_FULL).toLowerCase() === "true";

  const dateTo = isYmd(envTo) ? envTo : maxDate;

  const defaultFrom = addDaysUtc(dateTo, -29);
  const dateFrom = isYmd(envFrom)
    ? envFrom
    : fullAudit
    ? minDate
    : defaultFrom < minDate
    ? minDate
    : defaultFrom;

  console.log("[BACKTEST TOP3] Base disponível:", minDate, "até", maxDate);
  console.log("[BACKTEST TOP3] Período auditado:", dateFrom, "até", dateTo);
  console.log(
    "[BACKTEST TOP3] Leitura:",
    "Firestore server + bypass do cache de range"
  );

  const startedAt = Date.now();

  const drawsRange = await getKingResultsByRange({
    uf,
    dateFrom,
    dateTo,
    closeHour: null,
    closeHourBucket: null,
    positions: null,
    mode: "detailed",
    readPolicy: "server",
    bypassCache: true,
  });

  const draws = Array.isArray(drawsRange) ? drawsRange : [];

  console.log("[BACKTEST TOP3] Sorteios carregados:", draws.length);
  console.log("[BACKTEST TOP3] Dias com resultados:", countUniqueDays(draws));

  if (!draws.length) {
    throw new Error("Nenhum sorteio encontrado no período auditado.");
  }

  const report = auditTop3Backtest({
    drawsRange: draws,
    lotteryKey,
    PT_RIO_SCHEDULE_NORMAL,
    PT_RIO_SCHEDULE_WED_SAT,
    FEDERAL_SCHEDULE,
  });

  const debugYmd = safeStr(process.env.DEBUG_YMD);
  const debugHour = safeStr(process.env.DEBUG_HOUR);

  if (debugYmd && debugHour) {
    const row = (Array.isArray(report?.rows) ? report.rows : []).find(
      (r) =>
        String(r?.ymd || "") === debugYmd &&
        String(r?.hour || "") === debugHour
    );

    printDivider();
    console.log("[DEBUG SLOT]");
    console.log(
      JSON.stringify(
        row || {
          erro: "Slot não encontrado",
          procurado: { ymd: debugYmd, hour: debugHour },
        },
        null,
        2
      )
    );
    printDivider();
  }

  const rows = Array.isArray(report?.rows) ? report.rows : [];

  function avg(list, field) {
    if (!list.length) return 0;
    return (
      list.reduce(
        (sum, row) => sum + Number(row?.historyStats?.[field] || 0),
        0
      ) / list.length
    );
  }

  const hits = rows.filter((r) => r.top1Hit === true);
  const misses = rows.filter((r) => r.top1Hit !== true);

  const historySummary = {
    totalRows: rows.length,
    top1Hits: hits.length,
    top1Misses: misses.length,

    averageAll: {
      total: avg(rows, "total"),
      d30: avg(rows, "d30"),
      d90: avg(rows, "d90"),
      d180: avg(rows, "d180"),
      d365: avg(rows, "d365"),
    },

    averageHits: {
      total: avg(hits, "total"),
      d30: avg(hits, "d30"),
      d90: avg(hits, "d90"),
      d180: avg(hits, "d180"),
      d365: avg(hits, "d365"),
    },

    averageMisses: {
      total: avg(misses, "total"),
      d30: avg(misses, "d30"),
      d90: avg(misses, "d90"),
      d180: avg(misses, "d180"),
      d365: avg(misses, "d365"),
    },
  };

  const elapsedSeconds = Number(
    ((Date.now() - startedAt) / 1000).toFixed(2)
  );

  printDivider();
  console.log("[BACKTEST TOP3] RESULTADO");
  printDivider();
  console.log(JSON.stringify(report, null, 2));

  printDivider();
  console.log("[BACKTEST TOP3] HISTÓRICO UTILIZADO");
  printDivider();
  console.table(historySummary);
  printDivider();
  console.log("[BACKTEST TOP3] Tempo total:", elapsedSeconds, "segundos");
  printDivider();
}

main()
  .then(() => {
    console.log("[BACKTEST TOP3] Auditoria concluída.");
  })
  .catch((error) => {
    console.error("[BACKTEST TOP3] FALHA:", error);
    process.exitCode = 1;
  });
