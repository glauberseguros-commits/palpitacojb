from pathlib import Path

p = Path("src/pages/Top3/top3.engine.js")
txt = p.read_text(encoding="utf-8")

txt = txt.replace(
'''export function computeConditionalNextTop3({
  lotteryKey,
  drawsRange,
  drawLast,
  PT_RIO_SCHEDULE_NORMAL,
  PT_RIO_SCHEDULE_WED_SAT,
  FEDERAL_SCHEDULE,
  topN = 3,
}) {''',
'''export function computeConditionalNextTop3({
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
'''export function computeConditionalNextTop3V2({
  lotteryKey,
  drawsRange,
  drawLast,
  drawsToday,
  PT_RIO_SCHEDULE_NORMAL,
  PT_RIO_SCHEDULE_WED_SAT,
  FEDERAL_SCHEDULE,
  topN = 3,
}) {''',
'''export function computeConditionalNextTop3V2({
  lotteryKey,
  drawsRange,
  drawLast,
  drawsToday,
  PT_RIO_SCHEDULE_NORMAL,
  PT_RIO_SCHEDULE_WED_SAT,
  FEDERAL_SCHEDULE,
  topN = 3,
  targetYmdOverride = "",
  targetHourOverride = "",
}) {'''
)

p.write_text(txt, encoding="utf-8")
