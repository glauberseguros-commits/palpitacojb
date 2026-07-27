from pathlib import Path

patch = Path("tmp/frq07_ineditas.cjs")

text = patch.read_text(encoding="utf-8-sig")

old = '''replaceOnce(
  `              Mais frequente`,
  `              {fourthKpiLabel}`,
  "Título do quarto KPI"
);'''

new = '''replaceOnce(
  `            <div className="ppStatsKpiLabel">
              Mais frequente
            </div>`,
  `            <div className="ppStatsKpiLabel">
              {fourthKpiLabel}
            </div>`,
  "Título do quarto KPI"
);'''

count = text.count(old)

if count != 1:
    raise SystemExit(
        f"Trecho ambíguo encontrado {count} vez(es) no script. Esperado: 1."
    )

patch.write_text(
    text.replace(old, new),
    encoding="utf-8",
    newline="\n",
)

print("OK - Substituição do quarto KPI corrigida.")
