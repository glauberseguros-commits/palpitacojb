from pathlib import Path

p = Path("src/pages/Top3/Top3View.jsx")
txt = p.read_text(encoding="utf-8")

old = """                const hitMark = !hasResult
                  ? "⏳"
                  : item?.hit === true
                    ? "✅"
                    : "❌";"""

new = """                const hitType = String(item?.hitType || item?.analysis?.type || "").trim();

                const hitMark = !hasResult
                  ? "⏳"
                  : hitType === "milhar"
                    ? "🏆 100%"
                    : hitType === "centena"
                      ? "✅✅ 66,67%"
                      : hitType === "grupo"
                        ? "✅ 33,33%"
                        : "❌ 0%";"""

if old not in txt:
    raise SystemExit("Bloco hitMark não encontrado.")

txt = txt.replace(old, new, 1)
p.write_text(txt, encoding="utf-8")
print("OK - hitMark detalhado.")
