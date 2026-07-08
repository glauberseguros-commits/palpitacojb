from pathlib import Path

p = Path("src/pages/Top3/top3.engine.js")
txt = p.read_text(encoding="utf-8")

txt = txt.replace(
'''  TOP3_NEXTDRAW_SCAN_MAX_STEPS,
  TOP3_NEXTDRAW_SCAN_MAX_DAYS,
  TOP3_GROUPS_K,
  PT_RIO_SCHEDULE_SUNDAY,
} from "./top3.constants";''',
'''  TOP3_NEXTDRAW_SCAN_MAX_STEPS,
  TOP3_NEXTDRAW_SCAN_MAX_DAYS,
  TOP3_GROUPS_K,
  TOP3_SMOOTH_ALPHA,
  TOP3_SCENE_WEIGHT,
  TOP3_SCENE_SAMPLE_TARGET,
  TOP3_SCENE_BLEND_SCENE,
  TOP3_SCENE_BLEND_UNIFORM,
  PT_RIO_SCHEDULE_SUNDAY,
} from "./top3.constants";'''
)

txt = txt.replace(
'''function layerProbability(freqMap, samples) {
  const out = new Map();
  const denom = Math.max(1, Number(samples || 0));

  for (let g = 1; g <= safeInt(TOP3_GROUPS_K, 25); g += 1) {
    out.set(g, Number(freqMap.get(g) || 0) / denom);
  }

  return out;
}''',
'''function layerProbability(freqMap, samples, alpha = TOP3_SMOOTH_ALPHA) {
  const out = new Map();
  const k = safeInt(TOP3_GROUPS_K, 25);
  const a = Math.max(0, Number(alpha || 0));
  const base = Math.max(0, Number(samples || 0));
  const denom = Math.max(1, base + (a * k));

  for (let g = 1; g <= k; g += 1) {
    const count = Math.max(0, Number(freqMap?.get?.(g) || 0));
    out.set(g, (count + a) / denom);
  }

  return out;
}'''
)

txt = txt.replace(
'''  const sceneWeight = sampleConfidence(sceneHypothesis?.samples || 0, 60) * 0.06;''',
'''  const sceneWeight =
    sampleConfidence(sceneHypothesis?.samples || 0, TOP3_SCENE_SAMPLE_TARGET) *
    TOP3_SCENE_WEIGHT;'''
)

txt = txt.replace(
'''    const pScene = (pSceneRaw * 0.55) + ((1 / TOP3_GROUPS_K) * 0.45);''',
'''    const pScene =
      (pSceneRaw * TOP3_SCENE_BLEND_SCENE) +
      ((1 / TOP3_GROUPS_K) * TOP3_SCENE_BLEND_UNIFORM);'''
)

p.write_text(txt, encoding="utf-8")
