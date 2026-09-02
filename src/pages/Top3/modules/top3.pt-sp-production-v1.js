/*
 * PT_SP_BASELINE_V3_PRODUCTION_V1
 *
 * Independent PT_SP production decision.
 *
 * Development:
 * 2824 / 8830 = 31.9819%.
 *
 * Final holdout 2026-08-01..2026-08-30:
 * baseline   78 / 231 = 33.7662%;
 * challenger 72 / 231 = 31.1688%.
 *
 * Challenger delta:
 * -6 hits / -2.5974 pp.
 *
 * Production decision:
 * BASELINE_V3 in all 56 weekday x canonical-slot contexts.
 *
 * No specialist weights are inherited.
 * No ranking mutation is performed.
 */

export const PT_SP_BASELINE_V3_PRODUCTION_VERSION =
  "PT_SP_BASELINE_V3_PRODUCTION_V1";

export const PT_SP_PRODUCTION_PRIMARY_METRIC =
  "TOP3_PRIZE_ANY_ORDER";

export const PT_SP_BASELINE56_MATRIX_CERTIFICATE_SHA256 =
  "010bcdf14450bc9d14fafa804562494dc36c8950c18d43be4f432130b07aa2e1";

export const PT_SP_CALIBRATION_FINALISTS_SHA256 =
  "f113d887e9f719ffa53c112b0721b5b8e66bfff1d12ff3d84a00589e8821dc68";

export const PT_SP_FINAL_HOLDOUT_MATRIX_SHA256 =
  "13e08adc649c84a3409bc74d037934a0e9e4f88e30762fac6a4d3c463dcabe95";

export const PT_SP_METRIC_CONTRACT_SHA256 =
  "6c20d0f0407b15647f0d6520b434d48ec211fe1940f19b9e4160ec06373e062c";

export const PT_SP_CALIBRATION_ENGINE_SOURCE_SHA256 =
  "e27ba888cdd179bacf39937cc4c5350d8756f943177c557ff024ade4054f0af9";


const DOWS =
  Object.freeze([
    0,
    1,
    2,
    3,
    4,
    5,
    6,
  ]);


const SLOTS =
  Object.freeze([
    "08:00",
    "10:00",
    "12:00",
    "13:00",
    "15:00",
    "17:00",
    "19:00",
    "20:00",
  ]);


const matrix = {};


for (const dow of DOWS) {

  for (const hour of SLOTS) {

    matrix[
      `${dow}|${hour}`
    ] =
      "BASELINE_V3";
  }
}


export const PT_SP_BASELINE56_CONTEXT_MATRIX =
  Object.freeze(
    matrix
  );


export const PT_SP_BASELINE56_CONTEXT_COUNT =
  Object.keys(
    PT_SP_BASELINE56_CONTEXT_MATRIX
  ).length;


export const PT_SP_PRODUCTION_EVIDENCE =
  Object.freeze({

    lotteryKey:
      "PT_SP",

    uf:
      "SP",

    decision:
      "BASELINE_V3_ALL_CONTEXTS",

    primaryMetric:
      PT_SP_PRODUCTION_PRIMARY_METRIC,

    development:
      Object.freeze({
        cases: 8830,
        hits: 2824,
        ratePct: 31.9819,
      }),

    finalHoldout:
      Object.freeze({
        from: "2026-08-01",
        to: "2026-08-30",

        cases: 231,

        baselineHits: 78,
        baselineRatePct: 33.7662,

        challengerHits: 72,
        challengerRatePct: 31.1688,

        challengerDeltaHits: -6,
        challengerDeltaPp: -2.5974,

        challengerConfirmation:
          "FAIL",
      }),

    contextCount:
      PT_SP_BASELINE56_CONTEXT_COUNT,

    contextMode:
      "ALL_BASELINE_V3",

    specialistWeightsInherited:
      false,

    rankingMutation:
      false,

    finalistsSha256:
      PT_SP_CALIBRATION_FINALISTS_SHA256,

    finalHoldoutMatrixSha256:
      PT_SP_FINAL_HOLDOUT_MATRIX_SHA256,

    metricContractSha256:
      PT_SP_METRIC_CONTRACT_SHA256,

    calibrationEngineSourceSha256:
      PT_SP_CALIBRATION_ENGINE_SOURCE_SHA256,

    baseline56MatrixCertificateSha256:
      PT_SP_BASELINE56_MATRIX_CERTIFICATE_SHA256,
  });


export function computePtSpProductionV1Top3({
  input = {},
  baseCompute,
} = {}) {

  if (
    typeof baseCompute !==
    "function"
  ) {
    throw new Error(
      "PT_SP_BASE_COMPUTE_REQUIRED"
    );
  }

  const computed =
    baseCompute({
      ...input,

      lotteryKey:
        "PT_SP",
    });

  if (
    !computed ||
    typeof computed !==
      "object"
  ) {
    return computed;
  }

  return {
    ...computed,

    meta: {
      ...(
        computed?.meta ||
        {}
      ),

      scenario:
        PT_SP_BASELINE_V3_PRODUCTION_VERSION,

      explain: {
        ...(
          computed
            ?.meta
            ?.explain ||
          {}
        ),

        engine:
          PT_SP_BASELINE_V3_PRODUCTION_VERSION,

        baselineEngine:
          "V3_STATISTICAL",

        ptSpProduction:
          PT_SP_PRODUCTION_EVIDENCE,
      },
    },
  };
}


export default {
  version:
    PT_SP_BASELINE_V3_PRODUCTION_VERSION,

  primaryMetric:
    PT_SP_PRODUCTION_PRIMARY_METRIC,

  matrix:
    PT_SP_BASELINE56_CONTEXT_MATRIX,

  evidence:
    PT_SP_PRODUCTION_EVIDENCE,

  computePtSpProductionV1Top3,
};
