from pathlib import Path

p = Path("src/pages/Top3/top3.constants.js")
txt = p.read_text(encoding="utf-8")

if "TOP3_SCENE_WEIGHT" not in txt:
    txt += '''

/* =========================
   Calibração Estatística
========================= */

/**
 * Peso máximo da evidência de cena.
 */
export const TOP3_SCENE_WEIGHT = 0.06;

/**
 * Quantidade de amostras para confiança máxima da cena.
 */
export const TOP3_SCENE_SAMPLE_TARGET = 60;

/**
 * Mistura da probabilidade da cena.
 */
export const TOP3_SCENE_BLEND_SCENE = 0.55;

/**
 * Mistura da distribuição uniforme.
 */
export const TOP3_SCENE_BLEND_UNIFORM = 0.45;
'''

p.write_text(txt, encoding="utf-8")
print("top3.constants.js atualizado.")
