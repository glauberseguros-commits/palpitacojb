from pathlib import Path

patch = Path("tmp/frq07_ineditas.cjs")
text = patch.read_text(encoding="utf-8-sig")

old = '''                )}
              </tbody>`;'''

new = '''                )}`;'''

count = text.count(old)

if count != 1:
    raise SystemExit(
        f"Fechamento do tbody encontrado {count} vez(es). Esperado: 1."
    )

text = text.replace(old, new)

patch.write_text(
    text,
    encoding="utf-8",
    newline="\n",
)

print("OK - Fechamento duplicado de tbody removido do gerador.")
