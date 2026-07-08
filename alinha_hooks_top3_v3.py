from pathlib import Path

p = Path("src/pages/Top3/top3.hooks.js")
txt = p.read_text(encoding="utf-8")

txt = txt.replace(
'''  computeConditionalNextTop3V2,
} from "./top3.engine";''',
'''  computeStatisticalTop3V3,
} from "./top3.engine";'''
)

txt = txt.replace(
'''    const computed = computeConditionalNextTop3V2({''',
'''    const computed = computeStatisticalTop3V3({'''
)

p.write_text(txt, encoding="utf-8")
