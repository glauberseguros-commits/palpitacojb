"use strict";

/*
 * PALPITACO JB
 * External Results Importer V1
 *
 * Providers:
 * - POPULAR
 * - LBR
 *
 * Regra:
 * somente draws confirmed=true podem chegar ao Firestore.
 *
 * Por padrão:
 * DRY RUN.
 *
 * Para escrita real:
 * node backend/scripts/importExternalResults.js YYYY-MM-DD LOTTERY --write
 *
 * Este script NÃO chama runImport().
 * Logo, NÃO dispara TOP3 automaticamente.
 */

const {
  fetchExternalResults,
} =
  require(
    "../services/externalResultsProviders"
  );

const UF_BY_KEY = Object.freeze({
  POPULAR: "PE",
  LBR: "DF",
});

const LOTTERY_ID_BY_KEY =
  Object.freeze({
    POPULAR:
      "external_popular_consensus",

    LBR:
      "external_lbr_consensus",
  });

function isISODate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(
    String(value || "").trim()
  );
}

function normalizeLotteryKey(
  value
) {
  return String(value || "")
    .trim()
    .toUpperCase();
}

function buildPayloadFromDraw(
  draw
) {
  const key =
    normalizeLotteryKey(
      draw?.lotteryKey
    );

  if (
    key !== "POPULAR" &&
    key !== "LBR"
  ) {
    throw new Error(
      `LOTTERY_NOT_SUPPORTED=${key}`
    );
  }

  if (
    draw?.confirmed !== true
  ) {
    throw new Error(
      `DRAW_NOT_CONFIRMED=${key} ${draw?.date || ""} ${draw?.closeHour || ""}`
    );
  }

  /*
   * LBR_SPECIAL_PAYLOAD_CONTRACT_V2
   *
   * A LBR possui contrato próprio:
   *
   * P1-P5 -> milhares de 4 dígitos
   * P6    -> Soma de 5 dígitos
   * P7    -> Multiplicação de 3 dígitos
   */
  const sourcePrizes =
    Array.isArray(
      draw?.prizes
    )
      ? draw.prizes.map(
          value =>
            String(
              value ?? ""
            ).trim()
        )
      : [];

  if (
    key === "LBR"
  ) {
    const firstFiveOk =
      sourcePrizes.length === 7 &&
      sourcePrizes
        .slice(0, 5)
        .every(
          value =>
            /^\d{4}$/.test(
              value
            )
        );

    const somaOk =
      /^\d{5}$/.test(
        sourcePrizes[5] || ""
      );

    const multiplicacaoOk =
      /^\d{3}$/.test(
        sourcePrizes[6] || ""
      );

    if (
      !firstFiveOk ||
      !somaOk ||
      !multiplicacaoOk
    ) {
      throw new Error(
        "INVALID_LBR_PRIZE_CONTRACT=" +
        String(
          draw?.date || ""
        ) +
        " " +
        String(
          draw?.closeHour || ""
        ) +
        " " +
        sourcePrizes.join(",")
      );
    }
  }
  else if (
    sourcePrizes.length < 5
  ) {
    throw new Error(
      "INVALID_PRIZES=" +
      key +
      " " +
      String(
        draw?.date || ""
      ) +
      " " +
      String(
        draw?.closeHour || ""
      )
    );
  }

  const normalizedDraw = {
    date:
      String(draw.date || "")
        .trim(),

    close_hour:
      String(draw.closeHour || "")
        .trim(),

    lottery_name:
      String(
        draw.lotteryName ||
        key
      ).trim(),

    lottery_id:
      LOTTERY_ID_BY_KEY[key],

    source_primary:
      String(
        draw.sourcePrimary ||
        ""
      ).trim(),

    source_primary_url:
      String(
        draw.sourcePrimaryUrl ||
        ""
      ).trim(),

    source_confirmation:
      String(
        draw.sourceConfirmation ||
        ""
      ).trim(),

    source_confirmation_url:
      String(
        draw.sourceConfirmationUrl ||
        ""
      ).trim(),

    external_confirmed: true,
  };

  sourcePrizes.forEach(
    (value, index) => {
      const position =
        index + 1;

      normalizedDraw[
        `prize_${position}`
      ] =
        key === "LBR"
          ? value
          : String(value)
              .padStart(
                4,
                "0"
              )
              .slice(-4);
    }
  );

  if (
    key === "LBR"
  ) {
    normalizedDraw.prize_contract =
      "LBR_5X4_SOMA5_MULT3_V2";
  }

  return {
    success: true,
    data: [
      normalizedDraw,
    ],
  };
}

async function executeImport({
  date,
  lotteryKey,
  write = false,
}) {
  const key =
    normalizeLotteryKey(
      lotteryKey
    );

  if (!isISODate(date)) {
    throw new Error(
      'DATE_INVALID. Use YYYY-MM-DD.'
    );
  }

  if (
    key !== "POPULAR" &&
    key !== "LBR"
  ) {
    throw new Error(
      `LOTTERY_INVALID=${key}`
    );
  }

  const fetched =
    await fetchExternalResults({
      lotteryKey: key,
      date,
    });

  const confirmed =
    (
      Array.isArray(
        fetched?.draws
      )
        ? fetched.draws
        : []
    ).filter(
      (draw) =>
        draw?.confirmed === true
    );

  const rejected =
    (
      Array.isArray(
        fetched?.draws
      )
        ? fetched.draws
        : []
    ).filter(
      (draw) =>
        draw?.confirmed !== true
    );

  console.log("");
  console.log(
    "============================================================"
  );
  console.log(
    " EXTERNAL RESULTS IMPORT"
  );
  console.log(
    "============================================================"
  );
  console.log(
    `LOTTERY=${key}`
  );
  console.log(
    `DATE=${date}`
  );
  console.log(
    `MODE=${write ? "WRITE" : "DRY_RUN"}`
  );
  console.log(
    `FETCHED=${confirmed.length + rejected.length}`
  );
  console.log(
    `CONFIRMED=${confirmed.length}`
  );
  console.log(
    `REJECTED=${rejected.length}`
  );
  console.log("");

  for (
    const draw of confirmed
  ) {
    console.log(
      [
        key,
        draw.date,
        draw.closeHour,
        draw.prizes.join(","),
        "CONFIRMED=YES",
      ].join(" | ")
    );
  }

  if (!write) {
    console.log("");
    console.log(
      "DRY_RUN=PASS"
    );
    console.log(
      "FIRESTORE_WRITE=0"
    );
    console.log(
      "TOP3_TRIGGER=0"
    );

    return {
      ok: true,
      dryRun: true,
      lotteryKey: key,
      date,
      confirmed:
        confirmed.length,
      rejected:
        rejected.length,
    };
  }

  if (!confirmed.length) {
    throw new Error(
      "NO_CONFIRMED_RESULTS_TO_WRITE"
    );
  }

  /*
   * Carrega o importador King SOMENTE em modo --write.
   *
   * Reutilizamos apenas importFromPayload,
   * que contém o contrato Firestore.
   *
   * Não chamamos runImport().
   */
  const {
    importFromPayload,
  } =
    require(
      "./importKingApostas"
    );

  const writeResults = [];

  for (
    const draw of confirmed
  ) {
    const payload =
      buildPayloadFromDraw(
        draw
      );

    const result =
      await importFromPayload({
        payload,

        lotteryKey:
          key,

        /*
         * closeHour=null de propósito.
         *
         * O payload contém somente UM draw,
         * portanto não precisamos do filtro
         * de slot do importador King.
         */
        closeHour: null,

        skipIfAlreadyComplete:
          false,

        source:
          "external_consensus",

        ufOverride:
          UF_BY_KEY[key],
      });

    writeResults.push({
      closeHour:
        draw.closeHour,

      result,
    });
  }

  console.log("");
  console.log(
    "WRITE_COMPLETE=YES"
  );
  console.log(
    `DRAWS_PROCESSED=${writeResults.length}`
  );
  console.log(
    "TOP3_TRIGGER=0"
  );

  return {
    ok: true,
    dryRun: false,
    lotteryKey: key,
    date,
    confirmed:
      confirmed.length,
    rejected:
      rejected.length,
    writes:
      writeResults,
  };
}

async function main() {
  const args =
    process.argv.slice(2);

  const date =
    String(
      args[0] || ""
    ).trim();

  const lotteryKey =
    normalizeLotteryKey(
      args[1] || ""
    );

  const write =
    args.includes(
      "--write"
    );

  const result =
    await executeImport({
      date,
      lotteryKey,
      write,
    });

  console.log("");
  console.log(
    "===== RESULTADO ====="
  );

  console.log(
    JSON.stringify(
      result,
      null,
      2
    )
  );
}

if (
  require.main === module
) {
  main().catch(
    (error) => {
      console.error("");
      console.error(
        "EXTERNAL_IMPORT=FAIL"
      );

      console.error(
        error?.stack ||
        error?.message ||
        error
      );

      process.exit(1);
    }
  );
}

module.exports = {
  buildPayloadFromDraw,
  executeImport,
};