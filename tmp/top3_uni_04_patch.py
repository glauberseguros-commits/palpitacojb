from pathlib import Path
import sys

path = Path(r"src/pages/Top3/top3.engine.js")

text = path.read_text(encoding="utf-8")

import_anchor = '''import { scoreRanking } from "./modules/scoreEngine/scoreEngineV2";
'''

shared_import = '''import { scoreRanking } from "./modules/scoreEngine/scoreEngineV2";

import { chooseBestMilhar } from "../Centenas/modules/milharProbabilityEngine";
'''

if 'from "../Centenas/modules/milharProbabilityEngine"' not in text:
    if text.count(import_anchor) != 1:
        raise RuntimeError(
            f"Âncora do import encontrada {text.count(import_anchor)} vezes; esperado: 1."
        )

    text = text.replace(
        import_anchor,
        shared_import,
        1,
    )

context_anchor = '''  const usedMilhares = new Set();
  const slots = [];

  function pickDiversifiedMilharesForDezena(dz, limit) {
'''

context_replacement = '''  /*
   * Contexto compartilhado do seletor de milhar.
   *
   * O Top3 continua escolhendo:
   * - grupo;
   * - dezenas;
   * - centenas.
   *
   * O chooseBestMilhar escolhe somente o prefixo vencedor
   * para cada centena selecionada.
   */
  const fallbackMilharPrizes = [];
  const primaryMilharPrizes = [];

  for (const draw of list) {
    const drawYmd = pickDrawYMD(draw);
    const drawHour = toHourBucket(pickDrawHour(draw));
    const drawDow =
      isYMD(drawYmd)
        ? getDowKey(drawYmd)
        : null;

    const matchesTargetHour =
      Boolean(target) &&
      drawHour === target;

    const matchesTargetDow =
      targetDow === null ||
      Number(drawDow) === Number(targetDow);

    const prizes = Array.isArray(draw?.prizes)
      ? draw.prizes
      : [];

    for (const prize of prizes) {
      const position = Number(guessPrizePos(prize));
      const prizeGroup = Number(guessPrizeGrupo(prize));

      if (
        !Number.isFinite(position) ||
        position < 1 ||
        position > 7 ||
        prizeGroup !== grupoNum
      ) {
        continue;
      }

      fallbackMilharPrizes.push(prize);

      if (matchesTargetHour && matchesTargetDow) {
        primaryMilharPrizes.push(prize);
      }
    }
  }

  const usedMilhares = new Set();
  const slots = [];

  function pickDiversifiedMilharesForDezena(dz, limit) {
'''

if "const primaryMilharPrizes = [];" not in text:
    if text.count(context_anchor) != 1:
        raise RuntimeError(
            f"Âncora do contexto encontrada {text.count(context_anchor)} vezes; esperado: 1."
        )

    text = text.replace(
        context_anchor,
        context_replacement,
        1,
    )

function_start = text.find(
    "  function pickDiversifiedMilharesForDezena(dz, limit) {"
)

if function_start < 0:
    raise RuntimeError(
        "Função pickDiversifiedMilharesForDezena não encontrada."
    )

function_end_marker = "\n  for (const dz of dezenasFixas) {"
function_end = text.find(
    function_end_marker,
    function_start,
)

if function_end < 0:
    raise RuntimeError(
        "Final da função pickDiversifiedMilharesForDezena não encontrado."
    )

new_function = '''  function pickDiversifiedMilharesForDezena(dz, limit) {
    const candidates = ranked
      .filter((item) => item.dezena === dz)
      .map((item) => {
        const centena = String(
          item?.centena || ""
        )
          .replace(/\\D+/g, "")
          .padStart(3, "0")
          .slice(-3);

        return {
          ...item,
          centena,
          centenaScore: Number(
            centenaScoreMap.get(centena) || 0
          ),
        };
      })
      .filter((item) => /^\\d{3}$/.test(item.centena));

    const byCentena = new Map();

    for (const item of candidates) {
      const current = byCentena.get(item.centena);

      if (
        !current ||
        Number(item.centenaScore || 0) >
          Number(current.centenaScore || 0) ||
        (
          Number(item.centenaScore || 0) ===
            Number(current.centenaScore || 0) &&
          Number(item.score || 0) >
            Number(current.score || 0)
        )
      ) {
        byCentena.set(item.centena, item);
      }
    }

    const strongestCentenas = Array.from(
      byCentena.values()
    ).sort((a, b) => {
      if (
        Number(b.centenaScore || 0) !==
        Number(a.centenaScore || 0)
      ) {
        return (
          Number(b.centenaScore || 0) -
          Number(a.centenaScore || 0)
        );
      }

      if (
        Number(b.score || 0) !==
        Number(a.score || 0)
      ) {
        return (
          Number(b.score || 0) -
          Number(a.score || 0)
        );
      }

      if (
        Number(b.targetHits || 0) !==
        Number(a.targetHits || 0)
      ) {
        return (
          Number(b.targetHits || 0) -
          Number(a.targetHits || 0)
        );
      }

      if (
        Number(b.freq || 0) !==
        Number(a.freq || 0)
      ) {
        return (
          Number(b.freq || 0) -
          Number(a.freq || 0)
        );
      }

      return String(a.centena).localeCompare(
        String(b.centena)
      );
    });

    const picked = [];

    for (const centenaItem of strongestCentenas) {
      if (picked.length >= limit) break;

      const sharedResult = chooseBestMilhar({
        centena: centenaItem.centena,
        prizes: primaryMilharPrizes,
        fallbackPrizes: fallbackMilharPrizes,
      });

      const sharedWinner =
        sharedResult?.winner || null;

      const selectedMilhar = String(
        sharedWinner?.milhar || ""
      )
        .replace(/\\D+/g, "")
        .padStart(4, "0")
        .slice(-4);

      if (!/^\\d{4}$/.test(selectedMilhar)) {
        continue;
      }

      if (
        selectedMilhar.slice(-3) !==
        centenaItem.centena
      ) {
        continue;
      }

      if (
        getDezena2(selectedMilhar) !== dz ||
        usedMilhares.has(selectedMilhar) ||
        picked.some(
          (item) =>
            item.milhar === selectedMilhar
        )
      ) {
        continue;
      }

      picked.push({
        ...centenaItem,
        milhar: selectedMilhar,
        prefix:
          sharedWinner?.prefix ??
          selectedMilhar.slice(0, 1),
        adjustedScore: Number(
          sharedWinner?.score ||
          centenaItem.score ||
          0
        ),
        sharedMilharModel:
          sharedResult?.model ||
          "MILHAR_PROBABILITY_V2",
        sharedMilharSampleSize: Number(
          sharedResult?.sampleSize || 0
        ),
      });
    }

    return picked.slice(0, limit);
  }
'''

text = (
    text[:function_start] +
    new_function +
    text[function_end:]
)

required_checks = [
    'import { chooseBestMilhar } from "../Centenas/modules/milharProbabilityEngine";',
    "const primaryMilharPrizes = [];",
    "const fallbackMilharPrizes = [];",
    "const sharedResult = chooseBestMilhar({",
    "sharedMilharModel:",
]

for check in required_checks:
    if check not in text:
        raise RuntimeError(
            f"Validação interna falhou: trecho ausente: {check}"
        )

if text.count(
    'import { chooseBestMilhar } from "../Centenas/modules/milharProbabilityEngine";'
) != 1:
    raise RuntimeError(
        "O import do motor compartilhado não ficou único."
    )

path.write_text(text, encoding="utf-8", newline="\n")

print("PATCH_OK")
