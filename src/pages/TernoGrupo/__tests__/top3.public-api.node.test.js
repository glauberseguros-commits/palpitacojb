/** @jest-environment node */

import * as publicApi from "../top3.public-api";

const EXPECTED_EXPORTS = [
  "auditTop3Backtest",
  "auditTop3Timeline",
  "build16MilharesForGrupo",
  "build20MilharesForGrupo",
  "buildContextEvidence",
  "buildFrequencyEvidence",
  "buildMilharesForGrupo",
  "buildTimelineTop3",
  "calculateEvidenceStrength",
  "collectEvidence",
  "computeConditionalNextTop3",
  "computeConditionalNextTop3V2",
  "computeLastSeenByGrupo",
  "computeStatisticalTop3V3",
  "countAparicoesByGrupoInDraw",
  "getNextSlotForLottery",
  "getPtRioScheduleForYmd",
  "getScheduleForLottery",
  "guessPrizeGrupo",
  "guessPrizePos",
  "indexDrawsByYmdHour",
  "isFederalDrawDay",
  "isHourInSchedule",
  "pickDrawHour",
  "pickDrawYMD",
  "pickPrize1GrupoFromDraw",
  "scheduleSet",
  "scoreItem",
  "scoreRanking",
];

describe("TOP3 public API contract", () => {
  test("executa em ambiente Node sem APIs do navegador", () => {
    expect(typeof window).toBe("undefined");
    expect(typeof document).toBe("undefined");
    expect(typeof navigator).toBe("undefined");
  });

  test("expõe exatamente o contrato público aprovado", () => {
    expect(
      Object.keys(publicApi).sort()
    ).toEqual(
      [...EXPECTED_EXPORTS].sort()
    );
  });

  test("todas as exportações públicas são funções", () => {
    for (const name of EXPECTED_EXPORTS) {
      expect(typeof publicApi[name]).toBe("function");
    }
  });

  test("executa funções básicas através da fachada", () => {
    expect(
      publicApi.isHourInSchedule(
        ["09h", "11h", "14h"],
        "11:00"
      )
    ).toBe(true);

    const context = publicApi.buildContextEvidence(
      {},
      {
        lotteryKey: "PT_RIO",
        ymd: "2026-07-15",
        weekday: "quarta-feira",
        hour: "14h",
        previousGroup: 10,
        window: 90,
      }
    );

    expect(context.module).toBe("context");
    expect(context.evidence.window).toBe(90);

    const frequency = publicApi.buildFrequencyEvidence(
      {
        frequency: 18,
      },
      {
        totalDraws: 90,
        window: 90,
        lotteryKey: "PT_RIO",
      }
    );

    expect(frequency.module).toBe("frequency");
    expect(frequency.evidence.percent).toBe(20);
  });

  test("não expõe helpers internos do motor", () => {
    const forbiddenInternalExports = [
      "buildSceneFromDraw",
      "compareScenes",
      "buildConditionalLayerDistribution",
      "buildDayContext",
      "ymdHourToTs",
      "safeInt",
      "normalizeMetric",
    ];

    for (const name of forbiddenInternalExports) {
      expect(publicApi[name]).toBeUndefined();
    }
  });
});
