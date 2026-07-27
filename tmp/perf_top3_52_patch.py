from pathlib import Path
import sys

target = Path(r"src/pages/Top3/top3.engine.js")
text = target.read_text(encoding="utf-8")

marker = "function buildHistoricalSceneRanking"

if marker not in text:
    print("FUNÇÃO NÃO ENCONTRADA")
    sys.exit(1)

print("=" * 100)
print("PATCH NÃO APLICADO AUTOMATICAMENTE")
print("=" * 100)
print("O marcador da função foi localizado.")
print("A instrumentação deverá ser inserida exatamente na implementação atual")
print("para medir:")
print(" - buildSceneFromDraw")
print(" - ordenação")
print(" - compareScenes")
print(" - filtro")
print(" - ordenação final")
print(" - tempo total")
print("")
print("Nenhuma alteração foi gravada.")
print("=" * 100)
