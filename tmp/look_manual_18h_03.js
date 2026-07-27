"use strict";

const {
  fetchKingResults,
  importFromPayload,
} = require("../backend/scripts/importKingApostas");

const {
  syncImportedResultToTop3History,
} = require("../backend/engine/top3HistorySync");

async function main() {
  const date = "2026-07-25";
  const lotteryKey = "LOOK";
  const targetSlot = "18:00";

  const payload = await fetchKingResults({
    date,
    lotteryKey,
  });

  const draws = Array.isArray(payload?.data) ? payload.data : [];

  const candidates = draws.filter((draw) => {
    const close = String(
      draw?.close_hour ??
      draw?.closeHour ??
      draw?.horario ??
      ""
    ).trim();

    const name = String(
      draw?.lottery_name ??
      draw?.name ??
      ""
    ).toUpperCase();

    return close.startsWith("19:") || name.includes("18HS") || name.includes("18 HS");
  });

  console.log(
    `[MANUAL] draws=${draws.length} candidates=${candidates.length}`
  );

  if (candidates.length !== 1) {
    console.log(
      JSON.stringify(
        candidates.map((draw) => ({
          close_hour: draw?.close_hour ?? null,
          lottery_name: draw?.lottery_name ?? draw?.name ?? null,
          prize_1: draw?.prize_1 ?? null,
          prize_2: draw?.prize_2 ?? null,
          prize_3: draw?.prize_3 ?? null,
        })),
        null,
        2
      )
    );

    throw new Error(
      `Esperado exatamente 1 resultado candidato; encontrados ${candidates.length}.`
    );
  }

  const sourceDraw = candidates[0];

  const expected = {
    prize_1: "1663",
    prize_2: "9537",
    prize_3: "0887",
    prize_4: "7432",
    prize_5: "2135",
    prize_6: "1654",
    prize_7: "860",
  };

  for (const [field, value] of Object.entries(expected)) {
    const actual = String(sourceDraw?.[field] ?? "").trim().padStart(
      field === "prize_7" ? 3 : 4,
      "0"
    );

    const expectedNormalized = String(value).padStart(
      field === "prize_7" ? 3 : 4,
      "0"
    );

    if (actual !== expectedNormalized) {
      throw new Error(
        `Validação falhou em ${field}: API=${actual}, esperado=${expectedNormalized}.`
      );
    }
  }

  const correctedDraw = {
    ...sourceDraw,
    close_hour: targetSlot,
    closeHour: targetSlot,
  };

  const result = await importFromPayload({
    payload: {
      success: true,
      data: [correctedDraw],
    },
    lotteryKey,
    closeHour: targetSlot,
    skipIfAlreadyComplete: false,
  });

  const response = {
    ok: true,
    lotteryKey,
    date,
    closeHour: targetSlot,
    requestedCloseHour: targetSlot,
    blocked: false,
    blockedReason: null,
    captured: result.totalDrawsValid > 0,
    apiHasPrizes: result.totalDrawsValid > 0,
    alreadyCompleteAny: Boolean(result?.proof?.alreadyCompleteAny),
    alreadyCompleteAll: Boolean(result?.proof?.alreadyCompleteAll),
    expectedTargets: Number(result?.proof?.expectedTargets || 1),
    alreadyCompleteCount: Number(
      result?.proof?.alreadyCompleteCount || 0
    ),
    slotDocsFound: Number(result?.proof?.slotDocsFound || 0),
    apiReturnedTargetDraws: Number(
      result?.proof?.apiReturnedTargetDraws || 0
    ),
    savedCount: Number(result?.proof?.targetSavedCount || 0),
    writeCount: Number(result?.proof?.targetWriteCount || 0),
    targetDrawIds: result?.proof?.targetDrawIds || [],
    ...result,
  };

  const historySync =
    await syncImportedResultToTop3History(response);

  console.log("");
  console.log("===== RESULTADO FINAL =====");
  console.log(
    JSON.stringify(
      {
        status: response.captured ? "OK" : "FALHOU",
        lotteryKey,
        date,
        sourceCloseHour: sourceDraw?.close_hour ?? null,
        savedCloseHour: targetSlot,
        prize_1: correctedDraw.prize_1,
        prize_2: correctedDraw.prize_2,
        prize_3: correctedDraw.prize_3,
        drawsUpserted: result.totalDrawsUpserted,
        prizesUpserted: result.totalPrizesUpserted,
        slotDocsFound: result?.proof?.slotDocsFound,
        completeCount: result?.proof?.alreadyCompleteCount,
        historySync,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error("");
  console.error("ERRO:", error?.stack || error?.message || error);
  process.exit(1);
});
