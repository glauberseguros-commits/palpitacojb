from pathlib import Path

target = Path(r"src/pages/Top3/top3.engine.js")
text = target.read_text(encoding="utf-8")

marker = "function buildSceneFromDraw"

start = text.find(marker)

if start < 0:
    raise SystemExit("FUNÇÃO NÃO ENCONTRADA")

brace = text.find("{", start)

depth = 0
end = None

for i in range(brace, len(text)):
    c = text[i]

    if c == "{":
        depth += 1
    elif c == "}":
        depth -= 1

        if depth == 0:
            end = i + 1
            break

if end is None:
    raise SystemExit("NÃO FOI POSSÍVEL DETERMINAR O FINAL DA FUNÇÃO")

print("=" * 100)
print("FUNÇÃO buildSceneFromDraw")
print("=" * 100)
print(text[start:end])
print("=" * 100)
print(f"Tamanho: {end-start} caracteres")
