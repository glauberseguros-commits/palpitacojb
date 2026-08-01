import {
  TOP3_ENGINE_PROFILE_KEYS,
  TOP3_ENGINE_PROFILES,
  getTop3EngineProfile,
} from "./top3.engine-profiles";

/**
 * TOP3 4X4 EXPERIMENTAL PROFILE ADAPTER V1
 *
 * Este módulo não participa do fluxo público do TOP3.
 *
 * Responsabilidades:
 * - separar a loteria proprietária do perfil da loteria avaliada;
 * - preparar argumentos para uma execução walk-forward experimental;
 * - preservar a base histórica e o sorteio-alvo da loteria avaliada;
 * - permitir que regras condicionais do perfil sejam aplicadas pelo
 *   lotteryKey entregue ao motor experimental;
 * - impedir execução sem data e horário alvo explícitos.
 *
 * Importante:
 * - não importa nem chama automaticamente o motor de produção;
 * - não escreve no Firestore;
 * - não persiste previsões;
 * - não altera ranking, score ou pesos públicos;
 * - somente o runner experimental poderá usar este contrato.
 */

export const TOP3_4X4_EXPERIMENTAL_PROFILE_ADAPTER_CONTRACT =
  "TOP3_4X4_EXPERIMENTAL_PROFILE_ADAPTER_V1";

export const TOP3_4X4_SUPPORTED_LOTTERIES = Object.freeze([
  "PT_RIO",
  "FEDERAL",
  "LOOK",
  "NACIONAL",
]);

const PROFILE_KEY_BY_LOTTERY = Object.freeze({
  PT_RIO: TOP3_ENGINE_PROFILE_KEYS.PT_RIO,
  FEDERAL: TOP3_ENGINE_PROFILE_KEYS.FEDERAL,
  LOOK: TOP3_ENGINE_PROFILE_KEYS.LOOK,
  NACIONAL: TOP3_ENGINE_PROFILE_KEYS.NACIONAL,
});

function normalizeLotteryKey(value) {
  return String(value || "")
    .trim()
    .toUpperCase();
}

function normalizeProfileKey(value) {
  return String(value || "")
    .trim()
    .toUpperCase();
}

function normalizeYmd(value) {
  const text = String(value || "").trim();

  return /^\d{4}-\d{2}-\d{2}$/.test(text)
    ? text
    : "";
}

function normalizeHour(value) {
  const text = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");

  const match = text.match(/^(\d{1,2})(?::?(\d{2}))?h?$/);

  if (!match) {
    return "";
  }

  const hour = Number(match[1]);
  const minute = Number(match[2] || 0);

  if (
    !Number.isInteger(hour) ||
    hour < 0 ||
    hour > 23 ||
    !Number.isInteger(minute) ||
    minute < 0 ||
    minute > 59
  ) {
    return "";
  }

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function assertSupportedLottery(lotteryKey, fieldName) {
  if (!TOP3_4X4_SUPPORTED_LOTTERIES.includes(lotteryKey)) {
    throw new Error(
      `${fieldName} inválida: ${lotteryKey || "(vazia)"}`
    );
  }
}

function assertProfile(profile) {
  if (!profile || typeof profile !== "object") {
    throw new Error("Perfil experimental não encontrado.");
  }

  if (profile.enabledInProduction !== false) {
    throw new Error(
      "O perfil experimental não pode estar habilitado em produção."
    );
  }

  if (profile.mode !== "PASSIVE_EXPERIMENTAL") {
    throw new Error(
      `Modo de perfil inválido: ${profile.mode || "(vazio)"}`
    );
  }
}

function cloneArray(value) {
  return Array.isArray(value)
    ? [...value]
    : [];
}

/**
 * Resolve um perfil por profileKey ou pela loteria proprietária.
 */
export function resolveTop3ExperimentalProfile({
  profileKey = "",
  profileLotteryKey = "",
} = {}) {
  const normalizedProfileKey = normalizeProfileKey(profileKey);
  const normalizedProfileLotteryKey =
    normalizeLotteryKey(profileLotteryKey);

  let resolvedProfile = null;

  if (normalizedProfileKey) {
    resolvedProfile =
      getTop3EngineProfile(normalizedProfileKey);
  }

  if (
    !resolvedProfile &&
    normalizedProfileLotteryKey
  ) {
    assertSupportedLottery(
      normalizedProfileLotteryKey,
      "profileLotteryKey"
    );

    const mappedProfileKey =
      PROFILE_KEY_BY_LOTTERY[
        normalizedProfileLotteryKey
      ];

    resolvedProfile =
      TOP3_ENGINE_PROFILES[mappedProfileKey] || null;
  }

  assertProfile(resolvedProfile);

  return resolvedProfile;
}

/**
 * Produz o contexto isolado de uma célula da matriz 4×4.
 *
 * Exemplo:
 *
 * perfil Nacional × dados LOOK
 *
 * profileLotteryKey = NACIONAL
 * targetLotteryKey  = LOOK
 *
 * O motor recebe o lotteryKey do perfil para aplicar suas ramificações.
 * Os dados, o sorteio anterior e o alvo continuam pertencendo à LOOK.
 */
export function buildTop3ExperimentalProfileContext({
  profileKey = "",
  profileLotteryKey = "",
  targetLotteryKey = "",

  targetYmd = "",
  targetHour = "",

  drawsRange = [],
  drawLast = null,

  topN = 3,

  PT_RIO_SCHEDULE_NORMAL = [],
  PT_RIO_SCHEDULE_WED_SAT = [],
  FEDERAL_SCHEDULE = [],
} = {}) {
  const profile = resolveTop3ExperimentalProfile({
    profileKey,
    profileLotteryKey,
  });

  const normalizedProfileLotteryKey =
    normalizeLotteryKey(profile.lotteryKey);

  const normalizedTargetLotteryKey =
    normalizeLotteryKey(targetLotteryKey);

  const normalizedTargetYmd =
    normalizeYmd(targetYmd);

  const normalizedTargetHour =
    normalizeHour(targetHour);

  assertSupportedLottery(
    normalizedProfileLotteryKey,
    "profile.lotteryKey"
  );

  assertSupportedLottery(
    normalizedTargetLotteryKey,
    "targetLotteryKey"
  );

  if (!normalizedTargetYmd) {
    throw new Error(
      "targetYmd obrigatório no formato YYYY-MM-DD."
    );
  }

  if (!normalizedTargetHour) {
    throw new Error(
      "targetHour obrigatório no formato HH:mm."
    );
  }

  if (!Array.isArray(drawsRange)) {
    throw new Error(
      "drawsRange precisa ser um array."
    );
  }

  if (!drawLast || typeof drawLast !== "object") {
    throw new Error(
      "drawLast precisa representar o último sorteio anterior ao alvo."
    );
  }

  const normalizedTopN = Math.max(
    1,
    Math.min(25, Number(topN || 3))
  );

  const isNativeProfile =
    normalizedProfileLotteryKey ===
    normalizedTargetLotteryKey;

  const cellKey =
    `${normalizedProfileLotteryKey}__ON__${normalizedTargetLotteryKey}`;

  return Object.freeze({
    contract:
      TOP3_4X4_EXPERIMENTAL_PROFILE_ADAPTER_CONTRACT,

    mode: "EXPERIMENTAL_ONLY",
    productionApplied: false,
    writesFirestore: false,
    persistsPrediction: false,

    cellKey,

    profile: Object.freeze({
      profileKey: profile.profileKey,
      profileLotteryKey:
        normalizedProfileLotteryKey,
      sourceEngine: profile.sourceEngine,
      sourceWeights: profile.sourceWeights,
      sourceFormula: profile.sourceFormula,
      calibrationStatus:
        profile.calibrationStatus,
      specialization:
        profile.specialization,
    }),

    target: Object.freeze({
      targetLotteryKey:
        normalizedTargetLotteryKey,
      targetYmd: normalizedTargetYmd,
      targetHour: normalizedTargetHour,
      isNativeProfile,
    }),

    safeguards: Object.freeze({
      requiresClosedDraw: true,
      requiresExplicitTarget: true,
      noFutureLeakage: true,
      targetDataMustRemainIsolated: true,
      productionEngineImportAllowed: false,
      firestoreWriteAllowed: false,
      predictionPersistenceAllowed: false,
    }),

    engineArguments: Object.freeze({
      /**
       * O lotteryKey entregue ao cálculo representa o perfil aplicado.
       * A loteria avaliada permanece registrada separadamente em target.
       */
      lotteryKey:
        normalizedProfileLotteryKey,

      drawsRange:
        cloneArray(drawsRange),

      drawLast,

      targetYmdOverride:
        normalizedTargetYmd,

      targetHourOverride:
        normalizedTargetHour,

      topN: normalizedTopN,

      drawsAlreadySorted: false,

      PT_RIO_SCHEDULE_NORMAL:
        cloneArray(PT_RIO_SCHEDULE_NORMAL),

      PT_RIO_SCHEDULE_WED_SAT:
        cloneArray(PT_RIO_SCHEDULE_WED_SAT),

      FEDERAL_SCHEDULE:
        cloneArray(FEDERAL_SCHEDULE),
    }),
  });
}

/**
 * Executa uma célula experimental por callback.
 *
 * O runner deverá fornecer explicitamente a função do motor.
 * O adaptador não importa o motor para evitar conexão acidental
 * com o fluxo público.
 */
export async function executeTop3ExperimentalProfileCell({
  computePrediction,
  context,
} = {}) {
  if (typeof computePrediction !== "function") {
    throw new Error(
      "computePrediction precisa ser uma função."
    );
  }

  if (
    !context ||
    context.contract !==
      TOP3_4X4_EXPERIMENTAL_PROFILE_ADAPTER_CONTRACT
  ) {
    throw new Error(
      "Contexto experimental inválido."
    );
  }

  if (context.productionApplied !== false) {
    throw new Error(
      "Execução experimental marcada indevidamente como produção."
    );
  }

  const startedAt = Date.now();

  const prediction = await Promise.resolve(
    computePrediction({
      ...context.engineArguments,
    })
  );

  const elapsedMs = Date.now() - startedAt;

  const top = Array.isArray(prediction?.top)
    ? prediction.top
    : [];

  return Object.freeze({
    contract:
      TOP3_4X4_EXPERIMENTAL_PROFILE_ADAPTER_CONTRACT,

    mode: "EXPERIMENTAL_RESULT",

    cellKey: context.cellKey,

    profileKey:
      context.profile.profileKey,

    profileLotteryKey:
      context.profile.profileLotteryKey,

    targetLotteryKey:
      context.target.targetLotteryKey,

    targetYmd:
      context.target.targetYmd,

    targetHour:
      context.target.targetHour,

    isNativeProfile:
      context.target.isNativeProfile,

    elapsedMs,

    top,

    meta:
      prediction?.meta || null,

    rawPrediction:
      prediction || null,

    safeguards:
      context.safeguards,
  });
}

/**
 * Gera as 16 células da matriz 4×4.
 */
export function buildTop3ExperimentalMatrixDefinition() {
  const cells = [];

  for (
    const profileLotteryKey of
    TOP3_4X4_SUPPORTED_LOTTERIES
  ) {
    for (
      const targetLotteryKey of
      TOP3_4X4_SUPPORTED_LOTTERIES
    ) {
      cells.push(
        Object.freeze({
          cellKey:
            `${profileLotteryKey}__ON__${targetLotteryKey}`,

          profileKey:
            PROFILE_KEY_BY_LOTTERY[
              profileLotteryKey
            ],

          profileLotteryKey,
          targetLotteryKey,

          isNativeProfile:
            profileLotteryKey ===
            targetLotteryKey,
        })
      );
    }
  }

  return Object.freeze(cells);
}

export function validateTop3ExperimentalMatrixDefinition(
  cells = buildTop3ExperimentalMatrixDefinition()
) {
  const source = Array.isArray(cells)
    ? cells
    : [];

  const uniqueKeys = new Set(
    source.map((cell) => cell.cellKey)
  );

  const nativeCells = source.filter(
    (cell) => cell.isNativeProfile
  );

  const crossCells = source.filter(
    (cell) => !cell.isNativeProfile
  );

  return Object.freeze({
    contract:
      TOP3_4X4_EXPERIMENTAL_PROFILE_ADAPTER_CONTRACT,

    valid:
      source.length === 16 &&
      uniqueKeys.size === 16 &&
      nativeCells.length === 4 &&
      crossCells.length === 12,

    totalCells: source.length,
    uniqueCells: uniqueKeys.size,
    nativeCells: nativeCells.length,
    crossCells: crossCells.length,

    expectedTotalCells: 16,
    expectedNativeCells: 4,
    expectedCrossCells: 12,
  });
}

export const TOP3_4X4_EXPERIMENTAL_PROFILE_ADAPTER_META =
  Object.freeze({
    contract:
      TOP3_4X4_EXPERIMENTAL_PROFILE_ADAPTER_CONTRACT,

    passive: true,
    experimental: true,
    productionApplied: false,

    changesRanking: false,
    changesScore: false,
    changesWeights: false,
    changesPrediction: false,

    importsProductionEngine: false,
    writesFirestore: false,
    persistsPrediction: false,

    matrix: Object.freeze({
      profiles: 4,
      lotteries: 4,
      combinations: 16,
      nativeCells: 4,
      crossCells: 12,
    }),
  });

export default {
  contract:
    TOP3_4X4_EXPERIMENTAL_PROFILE_ADAPTER_CONTRACT,

  resolveTop3ExperimentalProfile,
  buildTop3ExperimentalProfileContext,
  executeTop3ExperimentalProfileCell,
  buildTop3ExperimentalMatrixDefinition,
  validateTop3ExperimentalMatrixDefinition,
};
