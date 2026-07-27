from pathlib import Path
import sys

target = Path(r"src/pages/Top3/top3.engine.js")

text = target.read_text(encoding="utf-8")

old_block = '''  const ranked = Array.from({ length: safeInt(TOP3_GROUPS_K, 25) }, (_, idx) => {
    const grupo = idx + 1;

    let scoreProb = 0;
    const details = {};

    for (const [keyLayer, layer] of Object.entries(layers)) {
      const pFirst = Number(layerProbability(layer.first, layer.samples).get(grupo) || 0);
      const pPrizePresence = Number(layerProbability(layer.prizePresence, layer.samples).get(grupo) || 0);

      const pLayer = (pFirst * 0.92) + (pPrizePresence * 0.08);
'''

new_block = '''  const layerProbabilities = Object.fromEntries(
    Object.entries(layers).map(([keyLayer, layer]) => [
      keyLayer,
      {
        first: layerProbability(
          layer.first,
          layer.samples
        ),
        prizePresence: layerProbability(
          layer.prizePresence,
          layer.samples
        ),
      },
    ])
  );

  const ranked = Array.from({ length: safeInt(TOP3_GROUPS_K, 25) }, (_, idx) => {
    const grupo = idx + 1;

    let scoreProb = 0;
    const details = {};

    for (const [keyLayer, layer] of Object.entries(layers)) {
      const probabilities =
        layerProbabilities[keyLayer];

      const pFirst = Number(
        probabilities?.first?.get?.(grupo) || 0
      );

      const pPrizePresence = Number(
        probabilities?.prizePresence?.get?.(grupo) || 0
      );

      const pLayer = (pFirst * 0.92) + (pPrizePresence * 0.08);
'''

occurrences = text.count(old_block)

if occurrences != 1:
    print(
        "ERRO: bloco esperado encontrado "
        f"{occurrences} vez(es); esperado=1."
    )
    sys.exit(1)

patched = text.replace(
    old_block,
    new_block,
    1
)

target.write_text(
    patched,
    encoding="utf-8",
    newline=""
)

print("PATCH_OK")
