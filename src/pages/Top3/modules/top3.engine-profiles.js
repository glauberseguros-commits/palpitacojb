/**
 * TOP3 4X4 ENGINE PROFILE REGISTRY V1
 *
 * Objetivo:
 * - representar explicitamente um perfil experimental por loteria;
 * - permitir futura execução cruzada motor × loteria;
 * - não alterar o motor de produção enquanto os perfis não forem validados.
 *
 * Estado atual confirmado pela auditoria:
 * - existe um motor estatístico central compartilhado;
 * - PT_RIO, LOOK e NACIONAL não possuem pesos estatísticos próprios comprovados;
 * - FEDERAL possui ramificações específicas no motor;
 * - os perfis abaixo ainda NÃO são aplicados ao ranking de produção.
 */

export const TOP3_ENGINE_PROFILE_REGISTRY_CONTRACT =
  "TOP3_4X4_ENGINE_PROFILE_REGISTRY_V1";

export const TOP3_ENGINE_PROFILE_KEYS = Object.freeze({
  PT_RIO: "PROFILE_PT_RIO",
  FEDERAL: "PROFILE_FEDERAL",
  LOOK: "PROFILE_LOOK",
  NACIONAL: "PROFILE_NACIONAL",
});

/**
 * Regimes atualmente existentes no motor compartilhado.
 *
 * Estes valores foram extraídos de getDayDrivenWeights().
 * Não representam ainda calibrações independentes por loteria.
 */
export const TOP3_SHARED_DAY_REGIME_WEIGHTS = Object.freeze({
  REPEAT: Object.freeze({
    transition: 0.25,
    pair: 0.25,
    memory: 0.20,
    recent: 0.15,
    structural: 0.10,
    late: 0.05,
  }),

  SPREAD: Object.freeze({
    transition: 0.20,
    pair: 0.10,
    memory: 0.10,
    recent: 0.20,
    structural: 0.30,
    late: 0.10,
  }),

  NEUTRAL: Object.freeze({
    transition: 0.30,
    pair: 0.15,
    memory: 0.15,
    recent: 0.15,
    structural: 0.20,
    late: 0.05,
  }),
});

/**
 * Fórmula atualmente identificada no V3 estatístico.
 *
 * pLayer =
 *   92% probabilidade de primeiro prêmio
 *   + 8% presença no pódio.
 */
export const TOP3_SHARED_V3_FORMULA = Object.freeze({
  firstPrizeBlend: 0.92,
  podiumPresenceBlend: 0.08,

  confidenceTargets: Object.freeze({
    transition: 8,
    recent: 12,
    defaultLayer: 30,
  }),

  scene: Object.freeze({
    enabledByCurrentEngine: true,
    weightSource: "TOP3_SCENE_WEIGHT",
    sampleTargetSource: "TOP3_SCENE_SAMPLE_TARGET",
    blendSceneSource: "TOP3_SCENE_BLEND_SCENE",
    blendUniformSource: "TOP3_SCENE_BLEND_UNIFORM",
  }),

  finalSort: Object.freeze({
    primary: "score_desc",
    tieBreak: "grupo_asc",
  }),
});

const createPassiveProfile = ({
  profileKey,
  lotteryKey,
  specialization,
  notes,
}) =>
  Object.freeze({
    contract: TOP3_ENGINE_PROFILE_REGISTRY_CONTRACT,

    profileKey,
    lotteryKey,

    mode: "PASSIVE_EXPERIMENTAL",
    enabledInProduction: false,
    changesRanking: false,
    changesScore: false,
    changesWeights: false,
    changesPrediction: false,

    sourceEngine: "V3_STATISTICAL_SHARED",
    sourceWeights: "TOP3_SHARED_DAY_REGIME_WEIGHTS",
    sourceFormula: "TOP3_SHARED_V3_FORMULA",

    calibrationStatus: "NOT_CALIBRATED_INDEPENDENTLY",

    specialization: Object.freeze({
      explicitStatisticalWeights: false,
      dedicatedTransitionModel: false,
      dedicatedRecencyModel: false,
      dedicatedSceneModel: false,
      dedicatedConfidenceTargets: false,
      dedicatedRankingRule: false,
      ...specialization,
    }),

    pilotWindow: Object.freeze({
      mode: "WALK_FORWARD",
      noFutureLeakage: true,
      closedDrawsOnly: true,
      targetPeriod:
        lotteryKey === "FEDERAL"
          ? "12_MONTHS"
          : "90_DAYS",
    }),

    notes: Object.freeze([...notes]),
  });

export const TOP3_ENGINE_PROFILES = Object.freeze({
  [TOP3_ENGINE_PROFILE_KEYS.PT_RIO]: createPassiveProfile({
    profileKey: TOP3_ENGINE_PROFILE_KEYS.PT_RIO,
    lotteryKey: "PT_RIO",

    specialization: {
      dedicatedSchedule: true,
      explicitFederalBranches: false,
    },

    notes: [
      "Perfil ainda espelha o motor estatístico compartilhado.",
      "Não foram comprovados pesos estatísticos exclusivos do PT_RIO.",
      "Janela piloto definida em 90 dias.",
    ],
  }),

  [TOP3_ENGINE_PROFILE_KEYS.FEDERAL]: createPassiveProfile({
    profileKey: TOP3_ENGINE_PROFILE_KEYS.FEDERAL,
    lotteryKey: "FEDERAL",

    specialization: {
      dedicatedSchedule: true,
      explicitFederalBranches: true,
      dedicatedConditionalLayers: true,
      dedicatedConditionalWeightRule: true,
      dedicatedBaseScoreBranch: true,
    },

    notes: [
      "A Federal possui ramificações específicas já existentes no motor.",
      "Os pesos de regime permanecem compartilhados.",
      "Janela piloto definida em 12 meses devido ao menor volume de sorteios.",
    ],
  }),

  [TOP3_ENGINE_PROFILE_KEYS.LOOK]: createPassiveProfile({
    profileKey: TOP3_ENGINE_PROFILE_KEYS.LOOK,
    lotteryKey: "LOOK",

    specialization: {
      dedicatedSchedule: true,
      explicitFederalBranches: false,
    },

    notes: [
      "Perfil ainda espelha o motor estatístico compartilhado.",
      "Não foram comprovados pesos estatísticos exclusivos da LOOK.",
      "Janela piloto definida em 90 dias.",
    ],
  }),

  [TOP3_ENGINE_PROFILE_KEYS.NACIONAL]: createPassiveProfile({
    profileKey: TOP3_ENGINE_PROFILE_KEYS.NACIONAL,
    lotteryKey: "NACIONAL",

    specialization: {
      dedicatedSchedule: true,
      explicitFederalBranches: false,
    },

    notes: [
      "Perfil ainda espelha o motor estatístico compartilhado.",
      "Não foram comprovados pesos estatísticos exclusivos da NACIONAL.",
      "Janela piloto definida em 90 dias.",
    ],
  }),
});

export function getTop3EngineProfile(profileKey) {
  const key = String(profileKey || "").trim().toUpperCase();

  return TOP3_ENGINE_PROFILES[key] || null;
}

export function getTop3EngineProfileByLottery(lotteryKey) {
  const key = String(lotteryKey || "").trim().toUpperCase();

  const profileKeyByLottery = {
    PT_RIO: TOP3_ENGINE_PROFILE_KEYS.PT_RIO,
    FEDERAL: TOP3_ENGINE_PROFILE_KEYS.FEDERAL,
    LOOK: TOP3_ENGINE_PROFILE_KEYS.LOOK,
    NACIONAL: TOP3_ENGINE_PROFILE_KEYS.NACIONAL,
  };

  const profileKey = profileKeyByLottery[key];

  return profileKey
    ? TOP3_ENGINE_PROFILES[profileKey] || null
    : null;
}

export function listTop3EngineProfiles() {
  return Object.values(TOP3_ENGINE_PROFILES);
}

export function buildTop3EngineProfileFingerprint(profile) {
  const source = profile && typeof profile === "object"
    ? profile
    : {};

  return JSON.stringify({
    contract: source.contract || "",
    profileKey: source.profileKey || "",
    lotteryKey: source.lotteryKey || "",
    sourceEngine: source.sourceEngine || "",
    sourceWeights: source.sourceWeights || "",
    sourceFormula: source.sourceFormula || "",
    calibrationStatus: source.calibrationStatus || "",
    specialization: source.specialization || {},
    pilotWindow: source.pilotWindow || {},
  });
}

export const TOP3_ENGINE_PROFILE_REGISTRY_META = Object.freeze({
  contract: TOP3_ENGINE_PROFILE_REGISTRY_CONTRACT,

  passive: true,
  experimental: true,
  productionApplied: false,

  profiles: Object.freeze([
    TOP3_ENGINE_PROFILE_KEYS.PT_RIO,
    TOP3_ENGINE_PROFILE_KEYS.FEDERAL,
    TOP3_ENGINE_PROFILE_KEYS.LOOK,
    TOP3_ENGINE_PROFILE_KEYS.NACIONAL,
  ]),

  crossMatrix: Object.freeze({
    dimensions: "4x4",
    profileCount: 4,
    lotteryCount: 4,
    combinations: 16,
    executionMode: "WALK_FORWARD",
    closedDrawsOnly: true,
    noFutureLeakage: true,
  }),
});

export default TOP3_ENGINE_PROFILES;
