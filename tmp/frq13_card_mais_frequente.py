from pathlib import Path

path = Path("src/pages/Statistics/Statistics.jsx")

text = (
    path.read_text(encoding="utf-8")
    .replace("\r\n", "\n")
)

old = '''              {isUnseenView
                ? formatInteger(fourthKpiValue)
                : mode === "milhar" &&
                  /^\\d{4}$/.test(String(fourthKpiValue)) &&
                  !String(fourthKpiValue).startsWith("0")
                ? formatInteger(fourthKpiValue)
                : fourthKpiValue}'''

new = '''              {isUnseenView
                ? formatInteger(fourthKpiValue)
                : fourthKpiValue}'''

count = text.count(old)

if count != 1:
    raise SystemExit(
        f"Bloco do quarto card encontrado {count} vez(es). Esperado: 1."
    )

text = text.replace(old, new, 1)

path.write_text(
    text,
    encoding="utf-8",
    newline="\n",
)

print("OK - Card Mais frequente restaurado para o valor original.")
