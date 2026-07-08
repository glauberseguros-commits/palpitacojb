from pathlib import Path

p = Path("src/pages/Top3/modules/top3.analytics.js")
txt = p.read_text(encoding="utf-8")

txt = txt.replace("  computeConditionalNextTop3V2,\n", "")

p.write_text(txt, encoding="utf-8")
