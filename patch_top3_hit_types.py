from pathlib import Path

p = Path("src/pages/Top3/Top3View.jsx")
txt = p.read_text(encoding="utf-8")

txt = txt.replace(
    'hitType === "milhar"',
    'hitType === "hit_exact"'
)

txt = txt.replace(
    'hitType === "centena"',
    'hitType === "hit_centena"'
)

txt = txt.replace(
    'hitType === "grupo"',
    'hitType === "hit_grupo"'
)

p.write_text(txt, encoding="utf-8")

print("OK - tipos do histórico corrigidos.")
