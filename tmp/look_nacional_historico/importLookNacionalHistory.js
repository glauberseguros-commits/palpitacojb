"use strict";

const fs = require("fs");
const path = require("path");

const {
  runImport,
} = require("../../backend/scripts/importKingApostas");

const START_DATE = "2022-06-07";
const END_DATE = "2026-07-18";

const LOTTERIES = [
  "LOOK",
  "NACIONAL",
];

const OUTPUT_DIR = path.resolve(
  __dirname
);

const JSON_OUTPUT = path.join(
  OUTPUT_DIR,
  "import_look_nacional_result.json"
);

const TXT_OUTPUT = path.join(
  OUTPUT_DIR,
  "import_look_nacional_result.txt"
);

const CHECKPOINT_OUTPUT = path.join(
  OUTPUT_DIR,
  "import_look_nacional_checkpoint.json"
);

function parseYmd(value) {
  const [year, month, day] = String(value)
    .split("-")
    .map(Number);

  return new Date(
    Date.UTC(
      year,
      month - 1,
      day
    )
  );
}

function formatYmd(date) {
  return date
    .toISOString()
    .slice(0, 10);
}

function buildDateRange(startYmd, endYmd) {
  const start = parseYmd(startYmd);
  const end = parseYmd(endYmd);

  const dates = [];

  for (
    let cursor = new Date(start);
    cursor <= end;
    cursor.setUTCDate(
      cursor.getUTCDate() + 1
    )
  ) {
    dates.push(
      formatYmd(cursor)
    );
  }

  return dates;
}

function loadCheckpoint() {
  if (
    !fs.existsSync(
      CHECKPOINT_OUTPUT
    )
  ) {
    return {
      completed: {},
    };
  }

  try {
    const parsed = JSON.parse(
      fs.readFileSync(
        CHECKPOINT_OUTPUT,
        "utf8"
      )
    );

    return {
      completed:
        parsed &&
        typeof parsed.completed === "object"
          ? parsed.completed
          : {},
    };
  }
  catch (error) {
    console.warn(
      "[CHECKPOINT] Não foi possível ler o checkpoint anterior:",
      error.message
    );

    return {
      completed: {},
    };
  }
}

function saveCheckpoint(checkpoint) {
  fs.writeFileSync(
    CHECKPOINT_OUTPUT,
    JSON.stringify(
      checkpoint,
      null,
      2
    ),
    "utf8"
  );
}

function sleep(milliseconds) {
  return new Promise(
    (resolve) =>
      setTimeout(
        resolve,
        milliseconds
      )
  );
}

function summarizeResult(result) {
  if (
    !result ||
    typeof result !== "object"
  ) {
    return {
      ok: false,
      rawType: typeof result,
    };
  }

  return {
    ok: result.ok === true,
    status:
      result.status ??
      null,
    message:
      result.message ??
      result.error ??
      null,
    drawsUpserted:
      Number(
        result.draws_upserted ??
        result.drawsUpserted ??
        result.targetWriteCount ??
        0
      ),
    prizesUpserted:
      Number(
        result.prizes_upserted ??
        result.prizesUpserted ??
        0
      ),
    presentHours:
      Array.isArray(
        result.presentHours
      )
        ? result.presentHours
        : [],
    skipped:
      result.skipped === true,
  };
}

async function main() {
  if (
    typeof runImport !== "function"
  ) {
    throw new Error(
      "backend/scripts/importKingApostas.js não exporta runImport()."
    );
  }

  const dates = buildDateRange(
    START_DATE,
    END_DATE
  );

  const checkpoint =
    loadCheckpoint();

  const report = {
    startedAt:
      new Date().toISOString(),
    startDate:
      START_DATE,
    endDate:
      END_DATE,
    lotteries:
      LOTTERIES,
    totalDates:
      dates.length,
    totalAttempts:
      dates.length *
      LOTTERIES.length,
    completedAttempts: 0,
    skippedByCheckpoint: 0,
    successful: 0,
    emptyOrSkipped: 0,
    failed: 0,
    totals: {
      drawsUpserted: 0,
      prizesUpserted: 0,
    },
    byLottery: {},
    failures: [],
    executions: [],
  };

  for (
    const lotteryKey of LOTTERIES
  ) {
    report.byLottery[lotteryKey] = {
      attempted: 0,
      successful: 0,
      emptyOrSkipped: 0,
      failed: 0,
      drawsUpserted: 0,
      prizesUpserted: 0,
      hoursFound: {},
    };

    console.log("");
    console.log(
      "============================================================"
    );
    console.log(
      `INICIANDO LOTERIA: ${lotteryKey}`
    );
    console.log(
      "============================================================"
    );

    for (
      let index = 0;
      index < dates.length;
      index += 1
    ) {
      const date = dates[index];
      const checkpointKey =
        `${lotteryKey}:${date}`;

      const progress =
        `${index + 1}/${dates.length}`;

      if (
        checkpoint.completed[
          checkpointKey
        ] === true
      ) {
        report.skippedByCheckpoint += 1;

        console.log(
          `[${lotteryKey}] ${progress} ${date} — já concluído`
        );

        continue;
      }

      report.completedAttempts += 1;
      report.byLottery[
        lotteryKey
      ].attempted += 1;

      console.log("");
      console.log(
        `[${lotteryKey}] ${progress} — importando ${date}`
      );

      const startedAt = Date.now();

      try {
        const rawResult =
          await runImport({
            date,
            lotteryKey,
          });

        const result =
          summarizeResult(
            rawResult
          );

        const execution = {
          lotteryKey,
          date,
          elapsedMs:
            Date.now() -
            startedAt,
          ...result,
        };

        report.executions.push(
          execution
        );

        report.totals.drawsUpserted +=
          result.drawsUpserted;

        report.totals.prizesUpserted +=
          result.prizesUpserted;

        report.byLottery[
          lotteryKey
        ].drawsUpserted +=
          result.drawsUpserted;

        report.byLottery[
          lotteryKey
        ].prizesUpserted +=
          result.prizesUpserted;

        for (
          const hour of result.presentHours
        ) {
          const normalizedHour =
            String(hour);

          report.byLottery[
            lotteryKey
          ].hoursFound[
            normalizedHour
          ] =
            (
              report.byLottery[
                lotteryKey
              ].hoursFound[
                normalizedHour
              ] || 0
            ) + 1;
        }

        if (
          result.ok === true
        ) {
          report.successful += 1;

          report.byLottery[
            lotteryKey
          ].successful += 1;

          checkpoint.completed[
            checkpointKey
          ] = true;

          saveCheckpoint(
            checkpoint
          );

          console.log(
            `[OK] ${lotteryKey} ${date}` +
            ` | draws=${result.drawsUpserted}` +
            ` | prizes=${result.prizesUpserted}` +
            ` | horários=${result.presentHours.join(",") || "não informado"}`
          );
        }
        else if (
          result.skipped === true ||
          (
            result.drawsUpserted === 0 &&
            result.prizesUpserted === 0
          )
        ) {
          report.emptyOrSkipped += 1;

          report.byLottery[
            lotteryKey
          ].emptyOrSkipped += 1;

          /*
           * Datas vazias também são marcadas como concluídas.
           * Isso permite retomar sem repetir milhares de chamadas.
           */
          checkpoint.completed[
            checkpointKey
          ] = true;

          saveCheckpoint(
            checkpoint
          );

          console.log(
            `[SEM RESULTADO] ${lotteryKey} ${date}` +
            ` | ${result.message || "nenhuma gravação"}`
          );
        }
        else {
          report.failed += 1;

          report.byLottery[
            lotteryKey
          ].failed += 1;

          report.failures.push({
            lotteryKey,
            date,
            result,
          });

          console.error(
            `[FALHA] ${lotteryKey} ${date}`,
            result
          );
        }
      }
      catch (error) {
        report.failed += 1;

        report.byLottery[
          lotteryKey
        ].failed += 1;

        const failure = {
          lotteryKey,
          date,
          error:
            error?.stack ||
            error?.message ||
            String(error),
        };

        report.failures.push(
          failure
        );

        report.executions.push({
          lotteryKey,
          date,
          ok: false,
          elapsedMs:
            Date.now() -
            startedAt,
          error:
            failure.error,
        });

        console.error(
          `[ERRO] ${lotteryKey} ${date}`
        );

        console.error(
          failure.error
        );
      }

      /*
       * Pequena pausa para evitar sobrecarga na fonte e na API.
       */
      await sleep(350);
    }
  }

  report.finishedAt =
    new Date().toISOString();

  report.elapsedMinutes =
    (
      (
        new Date(
          report.finishedAt
        ).getTime() -
        new Date(
          report.startedAt
        ).getTime()
      ) /
      60000
    ).toFixed(2);

  fs.writeFileSync(
    JSON_OUTPUT,
    JSON.stringify(
      report,
      null,
      2
    ),
    "utf8"
  );

  const lines = [
    "===== IMPORTAÇÃO HISTÓRICA LOOK E NACIONAL =====",
    "",
    `Início: ${report.startedAt}`,
    `Fim: ${report.finishedAt}`,
    `Período histórico: ${START_DATE} a ${END_DATE}`,
    `Loterias: ${LOTTERIES.join(", ")}`,
    `Datas por loteria: ${dates.length}`,
    `Tentativas previstas: ${report.totalAttempts}`,
    `Execuções nesta rodada: ${report.completedAttempts}`,
    `Ignoradas pelo checkpoint: ${report.skippedByCheckpoint}`,
    `Importações OK: ${report.successful}`,
    `Datas sem resultado/ignoradas: ${report.emptyOrSkipped}`,
    `Falhas: ${report.failed}`,
    `Draws gravados/atualizados: ${report.totals.drawsUpserted}`,
    `Prêmios gravados/atualizados: ${report.totals.prizesUpserted}`,
    `Tempo total: ${report.elapsedMinutes} minutos`,
    "",
  ];

  for (
    const lotteryKey of LOTTERIES
  ) {
    const item =
      report.byLottery[
        lotteryKey
      ];

    lines.push(
      `===== ${lotteryKey} =====`,
      `Tentativas: ${item.attempted}`,
      `OK: ${item.successful}`,
      `Sem resultado/ignoradas: ${item.emptyOrSkipped}`,
      `Falhas: ${item.failed}`,
      `Draws: ${item.drawsUpserted}`,
      `Prêmios: ${item.prizesUpserted}`,
      `Horários encontrados: ${
        Object.entries(
          item.hoursFound
        )
          .sort(
            ([a], [b]) =>
              a.localeCompare(b)
          )
          .map(
            ([hour, count]) =>
              `${hour} (${count} datas)`
          )
          .join(", ") ||
        "nenhum"
      }`,
      ""
    );
  }

  if (
    report.failures.length > 0
  ) {
    lines.push(
      "===== FALHAS ====="
    );

    for (
      const failure of report.failures
    ) {
      lines.push(
        `${failure.lotteryKey} ${failure.date}`,
        String(
          failure.error ||
          failure.result?.message ||
          JSON.stringify(
            failure.result
          )
        ),
        ""
      );
    }
  }

  fs.writeFileSync(
    TXT_OUTPUT,
    lines.join("\n"),
    "utf8"
  );

  console.log("");
  console.log(
    "============================================================"
  );
  console.log(
    "IMPORTAÇÃO HISTÓRICA ENCERRADA"
  );
  console.log(
    "============================================================"
  );
  console.log(
    lines.join("\n")
  );

  if (
    report.failed > 0
  ) {
    process.exitCode = 2;
  }
}

main().catch(
  (error) => {
    console.error(
      error?.stack ||
      error
    );

    process.exitCode = 1;
  }
);
