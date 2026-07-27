from pathlib import Path

path = Path("src/pages/Centenas/CentenasView.jsx")
text = path.read_text(encoding="utf-8-sig")

old_import = '''import {
  buildMilharRecommendation,
  diversifyMilharRecommendations,
} from "./modules/milharProbabilityEngine";'''

new_import = '''import {
  buildMilharRecommendationV3,
  diversifyMilharRecommendationsV3,
} from "./modules/milharProbabilityEngineV3";'''

if old_import not in text:
    raise SystemExit(
        "ERRO: importação antiga não encontrada exatamente."
    )

text = text.replace(old_import, new_import, 1)

old_call = '''const recommendation = buildMilharRecommendation({
              centena: c,
              prizes: groupPrizes,
              fallbackPrizes: groupHistoricalPrizes,
            });'''

new_call = '''const recommendation = buildMilharRecommendationV3({
              centena: c,
              prizes: groupPrizes,
              fallbackPrizes: groupHistoricalPrizes,
            });'''

if old_call not in text:
    raise SystemExit(
        "ERRO: chamada antiga não encontrada exatamente."
    )

text = text.replace(old_call, new_call, 1)

old_diversify = '''const list40 = diversifyMilharRecommendations(
          rawList40,
          {
            maxPerPrefix: 4,
            repeatPenalty: 12,
          }
        );'''

new_diversify = '''const list40 = diversifyMilharRecommendationsV3(
          rawList40,
          {
            maxPerPrefix: 4,
            repeatPenalty: 12,
          }
        );'''

if old_diversify not in text:
    raise SystemExit(
        "ERRO: diversificação antiga não encontrada exatamente."
    )

text = text.replace(
    old_diversify,
    new_diversify,
    1
)

path.write_text(text, encoding="utf-8")
print("CentenasView integrado ao motor V3.")
