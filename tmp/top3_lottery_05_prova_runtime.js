"use strict";

const fs = require("fs");
const crypto = require("crypto");

const {
  readFullHistory,
  readMetadata,
} = require("../backend/engine/top3HistoryRepository");

const {
  computeStatisticalTop3V3,
  loadTop3PublicApi,
} = require("../backend/engine/scoreEngineUnified");

const OUT =
  "./tmp/top3_lottery_05_prova_runtime.txt";

const TARGET_YMD = "2026-07-26";

const PT_RIO_SCHEDULE_NORMAL = [
  "09:00",
  "11:00",
  "14:00",
  "16:00",
  "18:00",
  "21:00",
];

const PT_RIO_SCHEDULE_WED_SAT = [
  "09:00",
  "11:00",
  "14:00",
  "16:00",
  "21:00",
];

const FEDERAL_SCHEDULE = [
  "20:00",
];

const api = loadTop3PublicApi();

function write(text = "") {
  fs.appendFileSync(
    OUT,
    String(text) + "\n",
    "utf8"
  );
}

function section(title) {
  write("");
  write("=".repeat(110));
  write(title);
  write("=".repeat(110));
}

function normalizeHour(value) {
  const raw = String(value || "")
    .trim()
    .replace(/[hH]/g, ":");

  const match = raw.match(
    /^(\d{1,2})(?::?(\d{2}))?$/
  );

  if (!match) return "";

  return (
    String(Number(match[1])).padStart(2, "0") +
    ":" +
    String(Number(match[2] || 0)).padStart(2, "0")
  );
}

function drawYmd(draw) {
  return String(
    api.pickDrawYMD(draw) || ""
  ).trim();
}

function drawHour(draw) {
  return normalizeHour(
    api.pickDrawHour(draw)
  );
}

function drawKey(draw) {
  return `${drawYmd(draw)}T${drawHour(draw)}`;
}

function getLotteryField(draw) {
  return String(
    draw?.lotteryKey ??
    draw?.lottery_key ??
    draw?.lottery ??
    draw?.uf ??
    ""
  )
    .trim()
    .toUpperCase();
}

function getDrawId(draw) {
  return String(
    draw?.drawId ??
    draw?.id ??
    draw?.concurso ??
    draw?.contest ??
    ""
  ).trim();
}

function canonicalSignature(draws) {
  const rows = draws.map((draw) => ({
    id: getDrawId(draw),
    ymd: drawYmd(draw),
    hour: drawHour(draw),
    lottery: getLotteryField(draw),
    prizes: Array.isArray(draw?.prizes)
      ? draw.prizes.map((prize) => ({
          position: Number(
            prize?.position ??
            prize?.posicao ??
            prize?.pos ??
            0
          ),
          grupo: Number(
            prize?.grupo ??
            prize?.grupo2 ??
            prize?.group ??
            0
          ),
          milhar: String(
            prize?.milhar ?? ""
          ),
        }))
      : [],
  }));

  return crypto
    .createHash("sha256")
    .update(JSON.stringify(rows))
    .digest("hex");
}

function countBy(values) {
  const map = new Map();

  for (const value of values) {
    const key = String(value || "(VAZIO)");

    map.set(
      key,
      Number(map.get(key) || 0) + 1
    );
  }

  return Object.fromEntries(
    [...map.entries()].sort(
      (a, b) =>
        Number(b[1]) - Number(a[1])
    )
  );
}

function summarizeLayers(computed) {
  const layers =
    computed?.meta?.explain?.layers || {};

  return Object.fromEntries(
    Object.entries(layers).map(
      ([key, value]) => [
        key,
        {
          samples: Number(
            value?.samples || 0
          ),
          weight: Number(
            value?.weight || 0
          ),
          label: String(
            value?.label || ""
          ),
        },
      ]
    )
  );
}

function summarizeTop(computed) {
  return (
    Array.isArray(computed?.top)
      ? computed.top
      : []
  )
    .slice(0, 3)
    .map((item) => ({
      rank: Number(item?.rank || 0),
      grupo: Number(item?.grupo || 0),
      percentual: Number(
        (
          Number(item?.scoreProb || 0) *
          100
        ).toFixed(6)
      ),
      score: Number(
        Number(item?.score || 0)
          .toFixed(6)
      ),
      frequenciaHorario: Number(
        item?.freqBase || item?.freq || 0
      ),
      frequenciaTransicao: Number(
        item?.freqCond || 0
      ),
      sceneSamples: Number(
        item?.meta?.explain?.scene
          ?.samples || 0
      ),
    }));
}

function printObject(value) {
  write(
    JSON.stringify(
      value,
      null,
      2
    )
  );
}

async function loadLottery(lotteryKey) {
  const history =
    await readFullHistory(lotteryKey);

  const metadataResult =
    await readMetadata(lotteryKey);

  return {
    lotteryKey,
    history: Array.isArray(history)
      ? history
      : [],
    metadata:
      metadataResult?.data || null,
    metadataExists:
      metadataResult?.exists === true,
  };
}

function computeTarget(
  lotteryKey,
  history,
  targetHour
) {
  const target =
    `${TARGET_YMD}T${normalizeHour(targetHour)}`;

  const usable = history
    .filter((draw) => {
      const key = drawKey(draw);

      return (
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/
          .test(key) &&
        key < target
      );
    })
    .sort(
      (a, b) =>
        drawKey(a).localeCompare(
          drawKey(b)
        )
    );

  const drawLast =
    usable[usable.length - 1] || null;

  if (!drawLast) {
    return {
      error:
        "Nenhum draw anterior ao alvo.",
    };
  }

  const computed =
    computeStatisticalTop3V3({
      lotteryKey,
      drawsRange: usable,
      drawLast,
      PT_RIO_SCHEDULE_NORMAL,
      PT_RIO_SCHEDULE_WED_SAT,
      FEDERAL_SCHEDULE,
      topN: 3,
      targetYmdOverride: TARGET_YMD,
      targetHourOverride:
        normalizeHour(targetHour),
      drawsAlreadySorted: true,
    });

  return {
    lotteryKey,
    targetYmd: TARGET_YMD,
    targetHour:
      normalizeHour(targetHour),
    historyUsable: usable.length,
    historyHash:
      canonicalSignature(usable),
    base: {
      id: getDrawId(drawLast),
      ymd: drawYmd(drawLast),
      hour: drawHour(drawLast),
      lotteryField:
        getLotteryField(drawLast),
      grupo:
        api.pickPrize1GrupoFromDraw(
          drawLast
        ),
    },
    engine: {
      next:
        computed?.meta?.next || null,
      totalSamples:
        Number(
          computed?.meta?.samples || 0
        ),
      layers:
        summarizeLayers(computed),
      activeWeights:
        computed?.meta?.explain
          ?.activeWeights || null,
    },
    top3: summarizeTop(computed),
  };
}

async function main() {
  fs.writeFileSync(
    OUT,
    "",
    "utf8"
  );

  write(
    "TOP3-LOTTERY-05 — PROVA RJ x LOOK EM EXECUÇÃO REAL"
  );

  write(
    `Gerado em: ${new Date().toISOString()}`
  );

  write(
    `Data alvo: ${TARGET_YMD}`
  );

  const rio =
    await loadLottery("PT_RIO");

  const look =
    await loadLottery("LOOK");

  for (const dataset of [rio, look]) {
    section(
      `HISTÓRICO: ${dataset.lotteryKey}`
    );

    const history = dataset.history;

    printObject({
      lotteryKey:
        dataset.lotteryKey,
      quantidadeCarregada:
        history.length,
      hashCompleto:
        canonicalSignature(history),
      metadataExists:
        dataset.metadataExists,
      metadata:
        dataset.metadata,
      primeiraChave:
        history.length
          ? drawKey(history[0])
          : null,
      ultimaChave:
        history.length
          ? drawKey(
              history[
                history.length - 1
              ]
            )
          : null,
      valoresDoCampoLoteria:
        countBy(
          history.map(
            getLotteryField
          )
        ),
      drawsSemCampoLoteria:
        history.filter(
          (draw) =>
            !getLotteryField(draw)
        ).length,
    });
  }

  section(
    "COMPARAÇÃO BRUTA DOS HISTÓRICOS"
  );

  printObject({
    mesmaQuantidade:
      rio.history.length ===
      look.history.length,
    mesmoHash:
      canonicalSignature(
        rio.history
      ) ===
      canonicalSignature(
        look.history
      ),
    rioQuantidade:
      rio.history.length,
    lookQuantidade:
      look.history.length,
    rioHash:
      canonicalSignature(
        rio.history
      ),
    lookHash:
      canonicalSignature(
        look.history
      ),
  });

  const scenarios = [];

  for (
    const dataset
    of [rio, look]
  ) {
    for (
      const hour
      of ["14:00", "16:00"]
    ) {
      const result =
        computeTarget(
          dataset.lotteryKey,
          dataset.history,
          hour
        );

      scenarios.push(result);

      section(
        `${dataset.lotteryKey} — ${TARGET_YMD} ${hour}`
      );

      printObject(result);
    }
  }

  section(
    "COMPARAÇÃO DOS RESULTADOS"
  );

  const byKey =
    Object.fromEntries(
      scenarios.map((item) => [
        `${item.lotteryKey}_${item.targetHour}`,
        item,
      ])
    );

  for (
    const hour
    of ["14:00", "16:00"]
  ) {
    const a =
      byKey[`PT_RIO_${hour}`];

    const b =
      byKey[`LOOK_${hour}`];

    printObject({
      hour,
      mesmoHistoricoUsavel:
        a?.historyHash ===
        b?.historyHash,
      mesmaQuantidadeUsavel:
        a?.historyUsable ===
        b?.historyUsable,
      mesmoTop3:
        JSON.stringify(
          a?.top3 || []
        ) ===
        JSON.stringify(
          b?.top3 || []
        ),
      rio: {
        historyUsable:
          a?.historyUsable,
        historyHash:
          a?.historyHash,
        base:
          a?.base,
        layers:
          a?.engine?.layers,
        top3:
          a?.top3,
      },
      look: {
        historyUsable:
          b?.historyUsable,
        historyHash:
          b?.historyHash,
        base:
          b?.base,
        layers:
          b?.engine?.layers,
        top3:
          b?.top3,
      },
    });
  }

  section("STATUS");

  write(
    "AUDITORIA CONCLUÍDA SEM ALTERAR ARQUIVOS DO PROJETO."
  );
}

main().catch((error) => {
  fs.appendFileSync(
    OUT,
    "\nERRO:\n" +
      String(
        error?.stack ||
        error?.message ||
        error
      ) +
      "\n",
    "utf8"
  );

  console.error(error);
  process.exitCode = 1;
});
