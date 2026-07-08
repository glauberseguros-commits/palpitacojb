from pathlib import Path

p = Path("src/pages/Top3/top3.engine.js")
txt = p.read_text(encoding="utf-8")

txt = txt.replace(
'''export function computeStatisticalTop3V3({
  lotteryKey,
  drawsRange,
  drawLast,
  PT_RIO_SCHEDULE_NORMAL,
  PT_RIO_SCHEDULE_WED_SAT,
  FEDERAL_SCHEDULE,
  topN = 3,
}) {''',
'''export function computeStatisticalTop3V3({
  lotteryKey,
  drawsRange,
  drawLast,
  PT_RIO_SCHEDULE_NORMAL,
  PT_RIO_SCHEDULE_WED_SAT,
  FEDERAL_SCHEDULE,
  topN = 3,
  targetYmdOverride = "",
  targetHourOverride = "",
}) {'''
)

txt = txt.replace(
'''  const targetY = safeStr(nextSlot?.ymd);
  const targetH = toHourBucket(nextSlot?.hour);''',
'''  const forcedTargetY = safeStr(targetYmdOverride);
  const forcedTargetH = toHourBucket(targetHourOverride);

  const targetY = isYMD(forcedTargetY) && forcedTargetH
    ? forcedTargetY
    : safeStr(nextSlot?.ymd);

  const targetH = isYMD(forcedTargetY) && forcedTargetH
    ? forcedTargetH
    : toHourBucket(nextSlot?.hour);'''
)

txt = txt.replace(
'''  const sceneWeight = sampleConfidence(sceneHypothesis?.samples || 0, 30) * 0.18;''',
'''  const sceneWeight = sampleConfidence(sceneHypothesis?.samples || 0, 60) * 0.06;'''
)

txt = txt.replace(
'''    const pScene = Number(sceneHypothesis?.prob?.get?.(grupo) || 0);''',
'''    const pSceneRaw = Number(sceneHypothesis?.prob?.get?.(grupo) || 0);
    const pScene = (pSceneRaw * 0.55) + ((1 / TOP3_GROUPS_K) * 0.45);'''
)

txt = txt.replace(
'''      FEDERAL_SCHEDULE,
      topN: 3,
    });''',
'''      FEDERAL_SCHEDULE,
      topN: 3,
      targetYmdOverride: targetYmd,
      targetHourOverride: slotHour,
    });'''
)

p.write_text(txt, encoding="utf-8")
