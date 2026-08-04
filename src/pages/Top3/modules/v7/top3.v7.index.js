/*
 * TOP3_V7_18_LAYERS_FOUNDATION_V1
 *
 * API pública interna da fundação experimental do V7.
 */

export {
  TOP3_V7_ENGINE_VERSION,
  TOP3_V7_LAYER_KEYS,
  TOP3_V7_LAYER_CATALOG,
  getTop3V7LayerDefinition,
  isTop3V7LayerKey,
} from "./top3.v7.catalog.js";

export {
  TOP3_V7_UNIFORM_PROBABILITY,
  createTop3V7LayerResult,
  createDisabledTop3V7LayerResult,
  validateTop3V7LayerResult,
} from "./top3.v7.contract.js";

export {
  TOP3_V7_LOTTERY_KEYS,
  TOP3_V7_PROFILES,
  normalizeTop3V7LotteryKey,
  getTop3V7Profile,
} from "./top3.v7.profiles.js";

export {
  registerTop3V7Layer,
  getTop3V7LayerImplementation,
  hasTop3V7LayerImplementation,
  listTop3V7LayerRegistry,
  clearTop3V7LayerRegistryForTests,
} from "./top3.v7.registry.js";

export {
  normalizeTop3V7LayerResults,
  buildTop3V7CandidateTelemetry,
  summarizeTop3V7Telemetry,
} from "./top3.v7.telemetry.js";
/*
 * TOP3_V7_EXISTING_LAYERS_BRIDGE_V1
 */
export {
  bridgeCurrentCandidateToTop3V7,
  bridgeCurrentRankingToTop3V7,
  summarizeTop3V7Bridge,
} from "./top3.v7.bridge.js";

/*
 * TOP3_V7_12_ADDITIONAL_LAYERS_FOUNDATION_V1
 */
export {
  TOP3_V7_ADDITIONAL_LAYER_KEYS,
  buildTop3V7AdditionalLayers,
  getTop3V7AdditionalLayerResult,
  summarizeTop3V7AdditionalLayers,
} from "./top3.v7.additional-layers.js";

/*
 * TOP3_V7_CALIBRATOR_API_V1
 */
export {
  TOP3_V7_CALIBRATOR_VERSION,
  normalizeTop3V7ExperimentalWeights,
  summarizeTop3V7ExperimentalWeights,
  scoreTop3V7Candidate,
  calibrateTop3V7Ranking,
} from "./top3.v7.calibrator.js";

