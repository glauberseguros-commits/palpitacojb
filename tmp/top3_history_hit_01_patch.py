from pathlib import Path

VIEW = Path("src/pages/Top3/Top3View.jsx")
FIRESTORE = Path("src/pages/Top3/top3.firestore.js")


def replace_function(text, start_marker, end_marker, replacement, label):
    start = text.find(start_marker)
    if start < 0:
        raise RuntimeError(f"{label}: início não encontrado")

    end = text.find(end_marker, start)
    if end < 0:
        raise RuntimeError(f"{label}: final não encontrado")

    if text.find(start_marker, start + len(start_marker)) >= 0:
        raise RuntimeError(f"{label}: mais de uma função encontrada")

    return text[:start] + replacement.rstrip() + "\n\n" + text[end:]


def replace_once(text, old, new, label):
    count = text.count(old)

    if count != 1:
        raise RuntimeError(
            f"{label}: esperado exatamente 1 trecho, encontrado {count}"
        )

    return text.replace(old, new, 1)


view_text = VIEW.read_text(encoding="utf-8")

new_view_analyzer = r'''function analyzeTop3Hit(top3, resultSource, resultMilhar) {
  if (!Array.isArray(top3) || !top3.length) {
    return {
      type: "none",
      score: 0,
      position: -1,
      predictionPosition: -1,
      resultPosition: -1,
      podiumMedal: "",
      matchedValue: "",
      matchedGrupo: null,
      matchedMilhar: "",
    };
  }

  const officialPodium = Array.isArray(resultSource)
    ? resultSource.filter(Boolean).slice(0, 3)
    : [
        {
          position: 1,
          grupo: Number(resultSource),
          milhar: normalizeMilharStr(resultMilhar),
        },
      ].filter(
        (item) =>
          Number.isFinite(item.grupo) &&
          item.grupo >= 1 &&
          item.grupo <= 25
      );

  if (!officialPodium.length) {
    return {
      type: "none",
      score: 0,
      position: -1,
      predictionPosition: -1,
      resultPosition: -1,
      podiumMedal: "",
      matchedValue: "",
      matchedGrupo: null,
      matchedMilhar: "",
    };
  }

  for (const officialPrize of officialPodium) {
    const grupoNum = Number(officialPrize?.grupo);
    const milhar = normalizeMilharStr(
      officialPrize?.milhar
    );

    const centena = milhar
      ? milhar.slice(-3)
      : "";

    const dezena = milhar
      ? milhar.slice(-2)
      : "";

    for (
      let predictionIndex = 0;
      predictionIndex < top3.length;
      predictionIndex += 1
    ) {
      const item = top3[predictionIndex];
      const grupo = Number(item?.grupo);

      const milhares = (
        Array.isArray(item?.milhares20)
          ? item.milhares20
          : Array.isArray(item?.milhares)
            ? item.milhares
            : []
      )
        .map(normalizeMilharStr)
        .filter((value) => /^\d{4}$/.test(value));

      const centenas = milhares
        .map((value) => value.slice(-3))
        .filter((value) => /^\d{3}$/.test(value));

      const dezenas = milhares
        .map((value) => value.slice(-2))
        .filter((value) => /^\d{2}$/.test(value));

      let type = "miss";
      let score = 0;
      let matchedValue = "";

      if (
        milhar &&
        milhares.includes(milhar)
      ) {
        type = "hit_exact";
        score = 100;
        matchedValue = milhar;
      } else if (
        centena &&
        centenas.includes(centena)
      ) {
        type = "hit_centena";
        score = 66.67;
        matchedValue = centena;
      } else if (
        dezena &&
        dezenas.includes(dezena)
      ) {
        type = "hit_dezena";
        score = 33.33;
        matchedValue = dezena;
      } else if (
        Number.isFinite(grupoNum) &&
        grupo === grupoNum
      ) {
        type = "hit_grupo";
        score = 33.33;
        matchedValue = formatGrupo(grupoNum);
      }

      if (type !== "miss") {
        const resultPosition = Number(
          officialPrize?.position
        );

        return {
          type,
          score,
          position: predictionIndex + 1,
          predictionPosition: predictionIndex + 1,
          resultPosition,
          podiumMedal:
            podiumMedalFromPosition(resultPosition),
          matchedValue,
          matchedGrupo: grupoNum,
          matchedMilhar: milhar,
        };
      }
    }
  }

  return {
    type: "miss",
    score: 0,
    position: -1,
    predictionPosition: -1,
    resultPosition: -1,
    podiumMedal: "",
    matchedValue: "",
    matchedGrupo: null,
    matchedMilhar: "",
  };
}'''

view_text = replace_function(
    view_text,
    "function analyzeTop3Hit(top3, resultSource, resultMilhar) {",
    "function ImgWithFallback(",
    new_view_analyzer,
    "Top3View.analyzeTop3Hit",
)

view_text = replace_once(
    view_text,
    '''                const hasDezenaHit =
                  hitType === "hit_grupo" ||
                  hasCentenaHit ||
                  hasExactHit;''',
    '''                const hasDezenaHit =
                  hitType === "hit_dezena" ||
                  hasCentenaHit ||
                  hasExactHit;''',
    "Top3View.hasDezenaHit",
)

view_text = replace_once(
    view_text,
    '''                              <strong>
                                {hitGrupo
                                  ? `G${hitGrupo} ✓`
                                  : "—"}
                              </strong>''',
    '''                              <strong>
                                {hitGrupo || "—"}
                              </strong>''',
    "Top3View.renderGrupo",
)

view_text = replace_once(
    view_text,
    '''                              <strong>
                                {hitDezena
                                  ? `${hitDezena} ✓`
                                  : "—"}
                              </strong>''',
    '''                              <strong>
                                {hitDezena || "—"}
                              </strong>''',
    "Top3View.renderDezena",
)

view_text = replace_once(
    view_text,
    '''                              <strong>
                                {hitCentena
                                  ? `${hitCentena} ✓`
                                  : "—"}
                              </strong>''',
    '''                              <strong>
                                {hitCentena || "—"}
                              </strong>''',
    "Top3View.renderCentena",
)

view_text = replace_once(
    view_text,
    '''                              <strong>
                                {hitMilhar
                                  ? `${hitMilhar} ✓`
                                  : "—"}
                              </strong>''',
    '''                              <strong>
                                {hitMilhar || "—"}
                              </strong>''',
    "Top3View.renderMilhar",
)

view_text = replace_once(
    view_text,
    '''    const grupo = validated.filter(
      (item) => item?.hitType === "hit_grupo"
    ).length;''',
    '''    const grupo = validated.filter(
      (item) =>
        item?.hitType === "hit_grupo" ||
        item?.hitType === "hit_dezena"
    ).length;''',
    "Top3View.historySummaryGrupoDezena",
)

VIEW.write_text(view_text, encoding="utf-8", newline="\n")


firestore_text = FIRESTORE.read_text(encoding="utf-8")

new_firestore_analyzer = r'''function analyzeSnapshotHit(snapshot, officialPodium) {
  const top3 = Array.isArray(snapshot)
    ? snapshot.slice(0, 3)
    : [];

  const podium = Array.isArray(officialPodium)
    ? officialPodium.filter(Boolean).slice(0, 3)
    : [];

  if (!top3.length || !podium.length) {
    return {
      hitType: "miss",
      hitScore: 0,
      hitPosition: -1,
      predictionPosition: -1,
      resultPosition: -1,
      podiumMedal: "",
      matchedValue: "",
      matchedGrupo: null,
      matchedMilhar: "",
      matchedAnimal: "",
    };
  }

  for (const officialPrize of podium) {
    const resultGrupo = Number(
      officialPrize?.grupo
    );

    const resultMilhar = normalizeMilhar(
      officialPrize?.milhar
    );

    const resultCentena = resultMilhar
      ? resultMilhar.slice(-3)
      : "";

    const resultDezena = resultMilhar
      ? resultMilhar.slice(-2)
      : "";

    for (
      let predictionIndex = 0;
      predictionIndex < top3.length;
      predictionIndex += 1
    ) {
      const prediction = top3[predictionIndex];
      const predictionGrupo = Number(
        prediction?.grupo
      );

      const milhares = (
        Array.isArray(prediction?.milhares20)
          ? prediction.milhares20
          : Array.isArray(prediction?.milhares)
            ? prediction.milhares
            : []
      )
        .map(normalizeMilhar)
        .filter(Boolean);

      const centenas = milhares.map(
        (value) => value.slice(-3)
      );

      const dezenas = milhares.map(
        (value) => value.slice(-2)
      );

      let hitType = "miss";
      let hitScore = 0;
      let matchedValue = "";

      if (
        resultMilhar &&
        milhares.includes(resultMilhar)
      ) {
        hitType = "hit_exact";
        hitScore = 100;
        matchedValue = resultMilhar;
      } else if (
        resultCentena &&
        centenas.includes(resultCentena)
      ) {
        hitType = "hit_centena";
        hitScore = 66.67;
        matchedValue = resultCentena;
      } else if (
        resultDezena &&
        dezenas.includes(resultDezena)
      ) {
        hitType = "hit_dezena";
        hitScore = 33.33;
        matchedValue = resultDezena;
      } else if (
        Number.isFinite(resultGrupo) &&
        predictionGrupo === resultGrupo
      ) {
        hitType = "hit_grupo";
        hitScore = 33.33;
        matchedValue = String(
          resultGrupo
        ).padStart(2, "0");
      }

      if (hitType !== "miss") {
        const resultPosition = Number(
          officialPrize?.position
        );

        return {
          hitType,
          hitScore,
          hitPosition: predictionIndex + 1,
          predictionPosition: predictionIndex + 1,
          resultPosition,
          podiumMedal:
            podiumMedalFromPosition(resultPosition),
          matchedValue,
          matchedGrupo: resultGrupo,
          matchedMilhar: resultMilhar,
          matchedAnimal: safeStr(
            officialPrize?.animal || ""
          ),
        };
      }
    }
  }

  return {
    hitType: "miss",
    hitScore: 0,
    hitPosition: -1,
    predictionPosition: -1,
    resultPosition: -1,
    podiumMedal: "",
    matchedValue: "",
    matchedGrupo: null,
    matchedMilhar: "",
    matchedAnimal: "",
  };
}'''

firestore_text = replace_function(
    firestore_text,
    "function analyzeSnapshotHit(snapshot, officialPodium) {",
    "export async function saveTop3PredictionSnapshot(",
    new_firestore_analyzer,
    "top3.firestore.analyzeSnapshotHit",
)

FIRESTORE.write_text(
    firestore_text,
    encoding="utf-8",
    newline="\n",
)

print("PATCH_OK")
print("Arquivos alterados:")
print(" - src/pages/Top3/Top3View.jsx")
print(" - src/pages/Top3/top3.firestore.js")
print("")
print("Regras aplicadas:")
print(" - hit_grupo: mostra somente Grupo")
print(" - hit_dezena: mostra Grupo e Dezena")
print(" - hit_centena: mostra Grupo, Dezena e Centena")
print(" - hit_exact: mostra Grupo, Dezena, Centena e Milhar")
print(" - removidos G e símbolos de confirmação da tabela")
print(" - SEM ACERTO continua sem tabela")
