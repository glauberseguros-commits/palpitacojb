from pathlib import Path

p = Path("src/pages/Top3/modules/top3.analytics.js")
txt = p.read_text(encoding="utf-8")

txt = txt.replace(
'''  computeConditionalNextTop3V2,
} from "../top3.engine";''',
'''  computeConditionalNextTop3V2,
  computeStatisticalTop3V3,
} from "../top3.engine";'''
)

txt = txt.replace(
'''  const fallback = computeConditionalNextTop3V2({''',
'''  const fallback = computeStatisticalTop3V3({'''
)

txt = txt.replace(
'''  const computed = computeConditionalNextTop3V2({''',
'''  const computed = computeStatisticalTop3V3({'''
)

p.write_text(txt, encoding="utf-8")


p = Path("src/pages/Top3/top3.hooks.js")
txt = p.read_text(encoding="utf-8")

old = '''        const previousResolved = previousForFirstSlot?.draw
          ? previousForFirstSlot
          : await fallbackBaseSearch({'''

new = '''        if (typeof window !== "undefined") {
          console.info("[TOP3 FIRST SLOT DEBUG]", {
            effectiveYmd,
            firstHourToday,
            previousForFirstSlot: previousForFirstSlot
              ? {
                  ymd: previousForFirstSlot.ymd,
                  hour: previousForFirstSlot.hour,
                  source: previousForFirstSlot.source,
                  hasDraw: !!previousForFirstSlot.draw,
                }
              : null,
          });
        }

        const previousResolved = previousForFirstSlot?.draw
          ? previousForFirstSlot
          : await fallbackBaseSearch({'''

txt = txt.replace(old, new)

p.write_text(txt, encoding="utf-8")
