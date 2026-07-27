from pathlib import Path
import re
import sys

FIRESTORE_PATH = Path(r"src/pages/Top3/top3.firestore.js")
VIEW_PATH = Path(r"src/pages/Top3/Top3View.jsx")


def read(path):
    return path.read_text(encoding="utf-8")


def write(path, content):
    path.write_text(content, encoding="utf-8")


def replace_exactly_once(content, old, new, description):
    count = content.count(old)

    if count != 1:
        raise RuntimeError(
            f"{description}: esperado exatamente 1 bloco; encontrado {count}"
        )

    return content.replace(old, new, 1)


def replace_regex_once(content, pattern, replacement, description, flags=0):
    updated, count = re.subn(
        pattern,
        lambda match: replacement,
        content,
        count=1,
        flags=flags,
    )

    if count != 1:
        raise RuntimeError(
            f"{description}: esperado exatamente 1 bloco; encontrado {count}"
        )

    return updated


# ================================================================================================
# FIRESTORE
# ================================================================================================

firestore = read(FIRESTORE_PATH)

old_firestore_analysis = '''function analyzeSnapshotHit(snapshot, resultGrupo, resultMilhar) {
  const top3 = Array.isArray(snapshot) ? snapshot.slice(0, 3) : [];
  const grupo = Number(resultGrupo);
  const milhar = normalizeMilhar(resultMilhar);
  const centena = milhar ? milhar.slice(-3) : "";

  let best = {
    hitType: "miss",
    hitScore: 0,
    hitPosition: -1,
    matchedValue: "",
  };

  top3.forEach((item, index) => {
    const itemGrupo = Number(item?.grupo);

    const milhares = (Array.isArray(item?.milhares20)
      ? item.milhares20
      : []
    )
      .map(normalizeMilhar)
      .filter(Boolean);

    const centenas = milhares.map((value) => value.slice(-3));

    if (milhar && milhares.includes(milhar)) {
      best = {
        hitType: "hit_exact",
        hitScore: 100,
        hitPosition: index + 1,
        matchedValue: milhar,
      };
      return;
    }

    if (
      best.hitScore < 66.67 &&
      centena &&
      centenas.includes(centena)
    ) {
      best = {
        hitType: "hit_centena",
        hitScore: 66.67,
        hitPosition: index + 1,
        matchedValue: centena,
      };
      return;
    }

    if (
      best.hitScore < 33.33 &&
      Number.isFinite(grupo) &&
      itemGrupo === grupo
    ) {
      best = {
        hitType: "hit_grupo",
        hitScore: 33.33,
        hitPosition: index + 1,
        matchedValue: milhar ? milhar.slice(-2) : "",
      };
    }
  });

  return best;
}'''

new_firestore_analysis = '''function extractPrizeGrupo(prize) {
  const direct = Number(
    prize?.grupo ??
      prize?.group ??
      prize?.animal_grupo ??
      prize?.grupo2
  );

  if (
    Number.isFinite(direct) &&
    direct >= 1 &&
    direct <= 25
  ) {
    return direct;
  }

  const milhar = normalizeMilhar(
    prize?.milhar ??
      prize?.numero ??
      prize?.number ??
      prize?.valor ??
      ""
  );

  if (!milhar) return null;

  const dezena = Number(milhar.slice(-2));
  const normalizedDezena = dezena === 0 ? 100 : dezena;
  const grupo = Math.ceil(normalizedDezena / 4);

  return grupo >= 1 && grupo <= 25 ? grupo : null;
}

function extractOfficialPodium(draw) {
  const prizes = Array.isArray(draw?.prizes)
    ? draw.prizes
    : [];

  return [1, 2, 3].map((position) => {
    const prize =
      prizes.find(
        (item) => Number(item?.position) === position
      ) ||
      prizes[position - 1] ||
      null;

    if (!prize) return null;

    const grupo = extractPrizeGrupo(prize);
    const milhar = normalizeMilhar(
      prize?.milhar ??
        prize?.numero ??
        prize?.number ??
        prize?.valor ??
        ""
    );

    if (
      !Number.isFinite(Number(grupo)) ||
      Number(grupo) < 1 ||
      Number(grupo) > 25
    ) {
      return null;
    }

    return {
      position,
      grupo: Number(grupo),
      milhar,
      animal: safeStr(prize?.animal || ""),
    };
  });
}

function podiumMedalFromPosition(position) {
  if (Number(position) === 1) return "gold";
  if (Number(position) === 2) return "silver";
  if (Number(position) === 3) return "bronze";
  return "";
}

function analyzeSnapshotHit(snapshot, officialPodium) {
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
    const resultGrupo = Number(officialPrize?.grupo);
    const resultMilhar = normalizeMilhar(
      officialPrize?.milhar
    );
    const resultCentena = resultMilhar
      ? resultMilhar.slice(-3)
      : "";

    for (
      let predictionIndex = 0;
      predictionIndex < top3.length;
      predictionIndex += 1
    ) {
      const prediction = top3[predictionIndex];
      const predictionGrupo = Number(prediction?.grupo);

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
        Number.isFinite(resultGrupo) &&
        predictionGrupo === resultGrupo
      ) {
        hitType = "hit_grupo";
        hitScore = 33.33;
        matchedValue = resultMilhar
          ? resultMilhar.slice(-2)
          : String(resultGrupo).padStart(2, "0");
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

firestore = replace_exactly_once(
    firestore,
    old_firestore_analysis,
    new_firestore_analysis,
    "função analyzeSnapshotHit do Firestore",
)

old_firestore_result = '''    const resultGrupo = Number(
      pickPrize1GrupoFromDraw(realDraw)
    );

    if (
      !Number.isFinite(resultGrupo) ||
      resultGrupo < 1 ||
      resultGrupo > 25
    ) {
      reconciledHistory.push(entry);
      continue;
    }

    const resultMilhar = extractPrize1Milhar(realDraw);'''

new_firestore_result = '''    const officialPodium =
      extractOfficialPodium(realDraw);

    const firstOfficialPrize =
      officialPodium.find(
        (item) => Number(item?.position) === 1
      ) || null;

    const resultGrupo = Number(
      firstOfficialPrize?.grupo
    );

    if (
      !Number.isFinite(resultGrupo) ||
      resultGrupo < 1 ||
      resultGrupo > 25
    ) {
      reconciledHistory.push(entry);
      continue;
    }

    const resultMilhar = normalizeMilhar(
      firstOfficialPrize?.milhar
    );'''

firestore = replace_exactly_once(
    firestore,
    old_firestore_result,
    new_firestore_result,
    "extração antiga exclusiva do primeiro prêmio",
)

old_firestore_analysis_call = '''    const analysis = analyzeSnapshotHit(
      entry?.snapshot,
      resultGrupo,
      resultMilhar
    );'''

new_firestore_analysis_call = '''    const analysis = analyzeSnapshotHit(
      entry?.snapshot,
      officialPodium
    );'''

firestore = replace_exactly_once(
    firestore,
    old_firestore_analysis_call,
    new_firestore_analysis_call,
    "chamada antiga de analyzeSnapshotHit",
)

old_firestore_match = '''      Number(entry?.hitPosition) === analysis.hitPosition &&
      safeStr(entry?.matchedValue) === analysis.matchedValue;'''

new_firestore_match = '''      Number(entry?.hitPosition) === analysis.hitPosition &&
      Number(entry?.resultPosition ?? -1) ===
        Number(analysis.resultPosition ?? -1) &&
      safeStr(entry?.podiumMedal) ===
        safeStr(analysis.podiumMedal) &&
      safeStr(entry?.matchedValue) === analysis.matchedValue;'''

firestore = replace_exactly_once(
    firestore,
    old_firestore_match,
    new_firestore_match,
    "comparação de validação persistida",
)

old_firestore_payload = '''      resultGrupo,
      resultMilhar,
      resultLotteryKey: lottery,
      resultAnimal: safeStr(
        extractPrize1(realDraw)?.animal || ""
      ),
      hitType: analysis.hitType,
      hitScore: analysis.hitScore,
      hitPosition: analysis.hitPosition,
      matchedValue: analysis.matchedValue,'''

new_firestore_payload = '''      resultGrupo,
      resultMilhar,
      resultLotteryKey: lottery,
      resultAnimal: safeStr(
        firstOfficialPrize?.animal ||
          extractPrize1(realDraw)?.animal ||
          ""
      ),
      resultTop3Groups: officialPodium.map(
        (item) => Number(item?.grupo) || null
      ),
      resultTop3Milhares: officialPodium.map(
        (item) => normalizeMilhar(item?.milhar)
      ),
      hitType: analysis.hitType,
      hitScore: analysis.hitScore,
      hitPosition: analysis.hitPosition,
      predictionPosition: analysis.predictionPosition,
      resultPosition: analysis.resultPosition,
      podiumMedal: analysis.podiumMedal,
      matchedGrupo: analysis.matchedGrupo,
      matchedMilhar: analysis.matchedMilhar,
      matchedAnimal: analysis.matchedAnimal,
      matchedValue: analysis.matchedValue,'''

firestore = replace_exactly_once(
    firestore,
    old_firestore_payload,
    new_firestore_payload,
    "payload da validação do Firestore",
)

write(FIRESTORE_PATH, firestore)


# ================================================================================================
# FRONTEND
# ================================================================================================

view = read(VIEW_PATH)

old_extract_result = '''function extractResultMilhar(slot) {
  if (!slot || !Array.isArray(slot.prizes)) return "";

  const p1 = slot.prizes.find((p) => Number(p.position) === 1);
  if (!p1) return "";

  const num = String(
    p1.numero ||
      p1.milhar ||
      p1.number ||
      p1.valor ||
      ""
  ).replace(/\\D/g, "");

  return num.padStart(4, "0");
}'''

new_extract_result = '''function extractPrizeMilharByPosition(slot, position) {
  const prizes = Array.isArray(slot?.prizes)
    ? slot.prizes
    : [];

  const prize =
    prizes.find(
      (item) => Number(item?.position) === Number(position)
    ) ||
    prizes[Number(position) - 1] ||
    null;

  if (!prize) return "";

  const digits = String(
    prize?.numero ??
      prize?.milhar ??
      prize?.number ??
      prize?.valor ??
      ""
  ).replace(/\\D/g, "");

  return digits
    ? digits.slice(-4).padStart(4, "0")
    : "";
}

function extractResultMilhar(slot) {
  return extractPrizeMilharByPosition(slot, 1);
}

function getPrizeGrupoByPosition(slot, position) {
  const persisted = Array.isArray(
    slot?.resultTop3Groups
  )
    ? Number(slot.resultTop3Groups[position - 1])
    : NaN;

  if (
    Number.isFinite(persisted) &&
    persisted >= 1 &&
    persisted <= 25
  ) {
    return persisted;
  }

  const prizes = Array.isArray(slot?.prizes)
    ? slot.prizes
    : [];

  const prize =
    prizes.find(
      (item) => Number(item?.position) === Number(position)
    ) ||
    prizes[Number(position) - 1] ||
    null;

  const direct = Number(
    prize?.grupo ??
      prize?.group ??
      prize?.animal_grupo ??
      prize?.grupo2
  );

  if (
    Number.isFinite(direct) &&
    direct >= 1 &&
    direct <= 25
  ) {
    return direct;
  }

  const milhar = extractPrizeMilharByPosition(
    slot,
    position
  );

  if (!milhar) return NaN;

  const dezena = Number(milhar.slice(-2));
  const normalizedDezena = dezena === 0 ? 100 : dezena;
  const grupo = Math.ceil(normalizedDezena / 4);

  return grupo >= 1 && grupo <= 25
    ? grupo
    : NaN;
}

function getOfficialPodium(slot) {
  return [1, 2, 3]
    .map((position) => {
      const grupo = getPrizeGrupoByPosition(
        slot,
        position
      );

      if (
        !Number.isFinite(grupo) ||
        grupo < 1 ||
        grupo > 25
      ) {
        return null;
      }

      const persistedMilhares = Array.isArray(
        slot?.resultTop3Milhares
      )
        ? slot.resultTop3Milhares
        : [];

      const milhar =
        String(
          persistedMilhares[position - 1] || ""
        ).replace(/\\D/g, "") ||
        extractPrizeMilharByPosition(slot, position);

      return {
        position,
        grupo,
        milhar: milhar
          ? milhar.slice(-4).padStart(4, "0")
          : "",
      };
    })
    .filter(Boolean);
}

function podiumMedalFromPosition(position) {
  if (Number(position) === 1) return "gold";
  if (Number(position) === 2) return "silver";
  if (Number(position) === 3) return "bronze";
  return "";
}'''

view = replace_exactly_once(
    view,
    old_extract_result,
    new_extract_result,
    "extração de resultado do frontend",
)

view = replace_regex_once(
    view,
    r'''function analyzeTop3Hit\(top3, resultGrupo, resultMilhar\) \{.*?^\}''',
    '''function analyzeTop3Hit(top3, resultSource, resultMilhar) {
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
        .filter((value) => /^\\d{4}$/.test(value));

      const centenas = milhares
        .map((value) => centenaFromMilhar(value))
        .filter((value) => /^\\d{3}$/.test(value));

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
        Number.isFinite(grupoNum) &&
        grupo === grupoNum
      ) {
        type = "hit_grupo";
        score = 33.33;
        matchedValue = milhar
          ? milhar.slice(-2)
          : formatGrupo(grupoNum);
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
  };
}''',
    "função analyzeTop3Hit do frontend",
    flags=re.S | re.M,
)

view = view.replace(
    '''        const analysis = analyzeTop3Hit(
          slotTop3,
          resultGrupo,
          resultMilhar
        );''',
    '''        const officialPodium =
          getOfficialPodium(slot);

        const analysis = analyzeTop3Hit(
          slotTop3,
          officialPodium
        );''',
)

view = view.replace(
    '''      const analysis = analyzeTop3Hit(
        row?.top3,
        resultGrupo,
        resultMilhar
      );''',
    '''      const analysis = analyzeTop3Hit(
        row?.top3,
        getOfficialPodium(timelineRow)
      );''',
)

old_persisted_fields = '''          hitPosition: Number(
            entry?.hitPosition ?? -1
          ),
          analysis: {
            type: String(entry?.hitType || ""),
            score: Number(entry?.hitScore || 0),
            position: Number(
              entry?.hitPosition ?? -1
            ),
            matchedValue: String(
              entry?.matchedValue || ""
            ),
          },'''

new_persisted_fields = '''          hitPosition: Number(
            entry?.hitPosition ?? -1
          ),
          predictionPosition: Number(
            entry?.predictionPosition ??
              entry?.hitPosition ??
              -1
          ),
          resultPosition: Number(
            entry?.resultPosition ?? -1
          ),
          podiumMedal: String(
            entry?.podiumMedal || ""
          ),
          resultTop3Groups: Array.isArray(
            entry?.resultTop3Groups
          )
            ? entry.resultTop3Groups
            : [],
          resultTop3Milhares: Array.isArray(
            entry?.resultTop3Milhares
          )
            ? entry.resultTop3Milhares
            : [],
          analysis: {
            type: String(entry?.hitType || ""),
            score: Number(entry?.hitScore || 0),
            position: Number(
              entry?.hitPosition ?? -1
            ),
            predictionPosition: Number(
              entry?.predictionPosition ??
                entry?.hitPosition ??
                -1
            ),
            resultPosition: Number(
              entry?.resultPosition ?? -1
            ),
            podiumMedal: String(
              entry?.podiumMedal || ""
            ),
            matchedValue: String(
              entry?.matchedValue || ""
            ),
          },'''

view = replace_exactly_once(
    view,
    old_persisted_fields,
    new_persisted_fields,
    "campos persistidos do histórico",
)

old_hit_mark = '''                const hitMark = !hasResult
                  ? "⏳"
                  : hitType === "hit_exact"
                    ? `🏆 100% · Milhar ${matchedValue || "—"}`
                    : hitType === "hit_centena"
                      ? `✅✅ 66,67% · Centena ${matchedValue || "—"}`
                      : hitType === "hit_grupo"
                        ? `✅ 33,33% · Dezena ${matchedValue || "—"}`
                        : "❌ 0%";'''

new_hit_mark = '''                const resultPosition = Number(
                  item?.resultPosition ??
                    item?.analysis?.resultPosition ??
                    -1
                );

                const podiumMedal = String(
                  item?.podiumMedal ||
                    item?.analysis?.podiumMedal ||
                    podiumMedalFromPosition(resultPosition)
                );

                const hitMark = !hasResult
                  ? "⏳ PENDENTE"
                  : podiumMedal === "gold"
                    ? "🥇 OURO · 1º PRÊMIO"
                    : podiumMedal === "silver"
                      ? "🥈 PRATA · 2º PRÊMIO"
                      : podiumMedal === "bronze"
                        ? "🥉 BRONZE · 3º PRÊMIO"
                        : "❌ ERRO";'''

view = replace_exactly_once(
    view,
    old_hit_mark,
    new_hit_mark,
    "marcação percentual antiga do histórico",
)

write(VIEW_PATH, view)

print("STATUS=OK")
print("FIRESTORE_PATCHED=1")
print("VIEW_PATCHED=1")
