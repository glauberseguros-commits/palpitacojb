from pathlib import Path
import re
import sys

module_path = Path(r"src/pages/Top3/modules/top3.podium.js")
firestore_path = Path(r"src/pages/Top3/top3.firestore.js")
view_path = Path(r"src/pages/Top3/Top3View.jsx")


def read(path):
    return path.read_text(encoding="utf-8")


def write(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def replace_once(text, old, new, label):
    count = text.count(old)

    if count != 1:
        raise RuntimeError(
            f"{label}: esperado exatamente 1 bloco; encontrado {count}"
        )

    return text.replace(old, new, 1)


module_code = r'''function normalizeMilhar4(value) {
  const digits = String(value ?? "").replace(/\D/g, "");

  if (!digits) return "";

  return digits.slice(-4).padStart(4, "0");
}

function normalizePosition(value, fallback = 0) {
  const direct = Number(value);

  if (Number.isFinite(direct) && direct >= 1) {
    return Math.trunc(direct);
  }

  const match = String(value ?? "").match(/\d+/);
  const parsed = match ? Number(match[0]) : Number(fallback);

  return Number.isFinite(parsed) && parsed >= 1
    ? Math.trunc(parsed)
    : 0;
}

function grupoFromMilhar(value) {
  const milhar = normalizeMilhar4(value);

  if (!milhar) return NaN;

  const dezena = Number(milhar.slice(-2));

  if (!Number.isFinite(dezena)) return NaN;
  if (dezena === 0) return 25;

  return Math.ceil(dezena / 4);
}

function normalizeGrupo(prize) {
  const direct = Number(
    prize?.grupo ??
      prize?.group ??
      prize?.animal_grupo ??
      prize?.grupo2
  );

  if (Number.isFinite(direct) && direct >= 1 && direct <= 25) {
    return Math.trunc(direct);
  }

  return grupoFromMilhar(
    prize?.milhar ??
      prize?.numero ??
      prize?.number ??
      prize?.valor ??
      ""
  );
}

function normalizePrize(prize, fallbackPosition) {
  const position = normalizePosition(
    prize?.position ??
      prize?.posicao ??
      prize?.posição ??
      prize?.premio ??
      prize?.prize,
    fallbackPosition
  );

  const milhar = normalizeMilhar4(
    prize?.milhar ??
      prize?.numero ??
      prize?.number ??
      prize?.valor ??
      ""
  );

  const grupo = normalizeGrupo(prize);

  return {
    position,
    grupo:
      Number.isFinite(grupo) && grupo >= 1 && grupo <= 25
        ? grupo
        : null,
    milhar,
    animal: String(
      prize?.animal ??
        prize?.bicho ??
        prize?.animal_nome ??
        ""
    ).trim(),
  };
}

export function extractOfficialPodium(draw) {
  const prizes = Array.isArray(draw?.prizes)
    ? draw.prizes
    : [];

  return prizes
    .map((prize, index) =>
      normalizePrize(prize, index + 1)
    )
    .filter(
      (prize) =>
        prize.position >= 1 &&
        prize.position <= 3
    )
    .sort((a, b) => a.position - b.position)
    .filter(
      (prize, index, array) =>
        array.findIndex(
          (candidate) =>
            candidate.position === prize.position
        ) === index
    );
}

export function podiumMedalFromPosition(position) {
  const value = Number(position);

  if (value === 1) return "gold";
  if (value === 2) return "silver";
  if (value === 3) return "bronze";

  return "";
}

export function podiumMedalLabel(position) {
  const value = Number(position);

  if (value === 1) return "🥇 OURO";
  if (value === 2) return "🥈 PRATA";
  if (value === 3) return "🥉 BRONZE";

  return "";
}

function normalizePredictionItems(snapshot) {
  return (Array.isArray(snapshot) ? snapshot : [])
    .slice(0, 3)
    .map((item, index) => {
      const grupo = Number(
        typeof item === "number"
          ? item
          : item?.grupo
      );

      const milhares = (
        Array.isArray(item?.milhares20)
          ? item.milhares20
          : Array.isArray(item?.milhares)
            ? item.milhares
            : []
      )
        .map(normalizeMilhar4)
        .filter(Boolean);

      return {
        predictionPosition: index + 1,
        grupo:
          Number.isFinite(grupo) &&
          grupo >= 1 &&
          grupo <= 25
            ? Math.trunc(grupo)
            : null,
        milhares,
        centenas: milhares.map(
          (milhar) => milhar.slice(-3)
        ),
      };
    })
    .filter((item) => item.grupo !== null);
}

function technicalHit(prediction, prize) {
  const milhar = normalizeMilhar4(prize?.milhar);
  const centena = milhar ? milhar.slice(-3) : "";

  if (
    milhar &&
    prediction.milhares.includes(milhar)
  ) {
    return {
      hitType: "hit_exact",
      hitScore: 100,
      matchedValue: milhar,
    };
  }

  if (
    centena &&
    prediction.centenas.includes(centena)
  ) {
    return {
      hitType: "hit_centena",
      hitScore: 66.67,
      matchedValue: centena,
    };
  }

  return {
    hitType: "hit_grupo",
    hitScore: 33.33,
    matchedValue: milhar
      ? milhar.slice(-2)
      : "",
  };
}

export function analyzeTop3PodiumDraw(snapshot, draw) {
  const predictions =
    normalizePredictionItems(snapshot);

  const podium = extractOfficialPodium(draw);

  const base = {
    hasOfficialPodium: podium.length > 0,
    hit: false,
    hitType: podium.length
      ? "miss"
      : "none",
    hitScore: 0,
    hitPosition: -1,
    predictionPosition: -1,
    resultPosition: -1,
    podiumMedal: "",
    matchedValue: "",
    matchedGrupo: null,
    matchedMilhar: "",
    matchedAnimal: "",
    resultPodium: podium,
  };

  if (!predictions.length || !podium.length) {
    return base;
  }

  // A posição oficial tem prioridade.
  // A ordem interna dos palpites não interfere na medalha.
  for (const prize of podium) {
    const prediction = predictions.find(
      (item) => item.grupo === prize.grupo
    );

    if (!prediction) continue;

    const technical =
      technicalHit(prediction, prize);

    return {
      ...base,
      hit: true,
      hitType: technical.hitType,
      hitScore: technical.hitScore,

      // Compatibilidade: posição do palpite.
      hitPosition:
        prediction.predictionPosition,
      predictionPosition:
        prediction.predictionPosition,

      // Classificação real do pódio.
      resultPosition: prize.position,
      podiumMedal:
        podiumMedalFromPosition(
          prize.position
        ),

      matchedValue:
        technical.matchedValue,
      matchedGrupo: prize.grupo,
      matchedMilhar: prize.milhar,
      matchedAnimal: prize.animal,
    };
  }

  return base;
}
'''

write(module_path, module_code)

firestore = read(firestore_path)

firestore = replace_once(
    firestore,
'''import {
  pickDrawYMD,
  pickDrawHour,
  pickPrize1GrupoFromDraw,
} from "./top3.engine";''',
'''import {
  pickDrawYMD,
  pickDrawHour,
} from "./top3.engine";

import {
  analyzeTop3PodiumDraw,
} from "./modules/top3.podium";''',
    "import do avaliador de pódio no Firestore"
)

firestore = re.sub(
    r'''function extractPrize1\(draw\) \{.*?\n\}\n\nfunction extractPrize1Milhar\(draw\) \{.*?\n\}\n\n''',
    "",
    firestore,
    count=1,
    flags=re.S,
)

firestore = re.sub(
    r'''function analyzeSnapshotHit\(snapshot, resultGrupo, resultMilhar\) \{.*?\n\}\n\nexport async function saveTop3PredictionSnapshot''',
    '''export async function saveTop3PredictionSnapshot''',
    firestore,
    count=1,
    flags=re.S,
)

old_reconcile = '''    const resultGrupo = Number(
      pickPrize1GrupoFromDraw(realDraw)
    );

    if (
      !Number.isFinite(resultGrupo) ||
      resultGrupo < 1 ||
      resultGrupo > 25
    ) {
      continue;
    }

    const resultMilhar = extractPrize1Milhar(realDraw);
    const savedLottery = safeStr(
      entry?.resultLotteryKey
    ).toUpperCase();
    const savedGrupo = Number(entry?.resultGrupo);
    const savedMilhar = normalizeMilhar(entry?.resultMilhar);

    const analysis = analyzeSnapshotHit(
      entry?.snapshot,
      resultGrupo,
      resultMilhar
    );

    const alreadyMatchesRealResult =
      entry?.status === "validated" &&
      savedLottery === lottery &&
      savedGrupo === resultGrupo &&
      savedMilhar === resultMilhar &&
      safeStr(entry?.hitType) === analysis.hitType &&
      Number(entry?.hitScore) === analysis.hitScore &&
      Number(entry?.hitPosition) === analysis.hitPosition &&
      safeStr(entry?.matchedValue) === analysis.matchedValue;'''

new_reconcile = '''    const analysis = analyzeTop3PodiumDraw(
      entry?.snapshot,
      realDraw
    );

    if (!analysis.hasOfficialPodium) {
      continue;
    }

    const resultGrupo = Number(
      analysis.matchedGrupo
    );

    const resultMilhar = normalizeMilhar(
      analysis.matchedMilhar
    );

    const resultPosition = Number(
      analysis.resultPosition
    );

    const savedLottery = safeStr(
      entry?.resultLotteryKey
    ).toUpperCase();

    const savedGrupo = Number(
      entry?.resultGrupo
    );

    const savedMilhar = normalizeMilhar(
      entry?.resultMilhar
    );

    const savedResultPosition = Number(
      entry?.resultPosition ?? -1
    );

    const alreadyMatchesRealResult =
      entry?.status === "validated" &&
      savedLottery === lottery &&
      savedGrupo === resultGrupo &&
      savedMilhar === resultMilhar &&
      savedResultPosition === resultPosition &&
      safeStr(entry?.podiumMedal) ===
        safeStr(analysis.podiumMedal) &&
      safeStr(entry?.hitType) ===
        analysis.hitType &&
      Number(entry?.hitScore) ===
        analysis.hitScore &&
      Number(entry?.hitPosition) ===
        analysis.hitPosition &&
      safeStr(entry?.matchedValue) ===
        analysis.matchedValue;'''

firestore = replace_once(
    firestore,
    old_reconcile,
    new_reconcile,
    "validação antiga do primeiro prêmio"
)

old_payload = '''        resultGrupo,
        resultMilhar,
        resultLotteryKey: lottery,
        resultAnimal: safeStr(
          extractPrize1(realDraw)?.animal || ""
        ),
        hitType: analysis.hitType,
        hitScore: analysis.hitScore,
        hitPosition: analysis.hitPosition,
        matchedValue: analysis.matchedValue,'''

new_payload = '''        resultGrupo:
          Number.isFinite(resultGrupo)
            ? resultGrupo
            : null,
        resultMilhar,
        resultLotteryKey: lottery,
        resultAnimal: safeStr(
          analysis.matchedAnimal || ""
        ),
        resultPosition:
          Number.isFinite(resultPosition)
            ? resultPosition
            : -1,
        podiumMedal: safeStr(
          analysis.podiumMedal || ""
        ),
        resultPodium:
          analysis.resultPodium || [],
        hitType: analysis.hitType,
        hitScore: analysis.hitScore,
        hitPosition:
          analysis.hitPosition,
        predictionPosition:
          analysis.predictionPosition,
        matchedValue:
          analysis.matchedValue,'''

firestore = replace_once(
    firestore,
    old_payload,
    new_payload,
    "payload validado do Firestore"
)

write(firestore_path, firestore)

view = read(view_path)

view = replace_once(
    view,
'''import React, { useMemo, useState, useCallback, useEffect } from "react";
import { getAnimalLabel, getImgFromGrupo } from "../../constants/bichoMap";''',
'''import React, { useMemo, useState, useCallback, useEffect } from "react";
import { getAnimalLabel, getImgFromGrupo } from "../../constants/bichoMap";

import {
  analyzeTop3PodiumDraw,
  podiumMedalLabel,
} from "./modules/top3.podium";''',
    "import do avaliador de pódio na interface"
)

old_timeline_analysis = '''  const analysis = analyzeTop3Hit(
    slotTop3,
    resultGrupo,
    extractResultMilhar(slot)
  );'''

new_timeline_analysis = '''  const analysis =
    analyzeTop3PodiumDraw(
      slotTop3,
      slot
    );'''

view = replace_once(
    view,
    old_timeline_analysis,
    new_timeline_analysis,
    "análise da timeline"
)

old_status_label = '''  const statusLabel =
    !hasResult
      ? "⏳ PENDENTE"
      : analysis.type === "hit_exact"
        ? "🎯 MILHAR (100%)"
        : analysis.type === "hit_centena"
          ? "🟡 CENTENA (66,67%)"
          : analysis.type === "hit_grupo"
            ? "✅ DEZENA/GRUPO (33,33%)"
            : "❌ ERRO (0%)";'''

new_status_label = '''  const statusLabel =
    !hasResult
      ? "⏳ PENDENTE"
      : analysis.hit
        ? podiumMedalLabel(
            analysis.resultPosition
          )
        : "❌ ERRO";'''

view = replace_once(
    view,
    old_status_label,
    new_status_label,
    "rótulo da medalha"
)

old_status_detail = '''  const statusDetail =
    !hasResult
      ? "Aguardando resultado oficial."
      : analysis.type === "hit_exact"
        ? `Milhar exata acertada no palpite #${analysis.position}.`
        : analysis.type === "hit_centena"
          ? `Centena acertada no palpite #${analysis.position}.`
          : analysis.type === "hit_grupo"
            ? `Grupo acertado no palpite #${analysis.position}.`
            : "Nenhum dos 3 palpites foi sorteado.";'''

new_status_detail = '''  const statusDetail =
    !hasResult
      ? "Aguardando resultado oficial."
      : analysis.hit
        ? `Um dos três animais previstos apareceu em ${analysis.resultPosition}º prêmio.`
        : "Nenhum dos três animais previstos apareceu entre o 1º e o 3º prêmio.";'''

view = replace_once(
    view,
    old_status_detail,
    new_status_detail,
    "detalhe da medalha"
)

old_persisted_fields = '''          hit:
            Number(entry?.hitScore || 0) > 0,
          hitType: String(entry?.hitType || ""),
          hitScore: Number(entry?.hitScore || 0),
          hitPosition: Number(
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

new_persisted_fields = '''          hit:
            Number(entry?.resultPosition || 0) >= 1 &&
            Number(entry?.resultPosition || 0) <= 3,
          hitType:
            String(entry?.hitType || ""),
          hitScore:
            Number(entry?.hitScore || 0),
          hitPosition:
            Number(entry?.hitPosition ?? -1),
          resultPosition:
            Number(entry?.resultPosition ?? -1),
          podiumMedal:
            String(entry?.podiumMedal || ""),
          analysis: {
            hit:
              Number(entry?.resultPosition || 0) >= 1 &&
              Number(entry?.resultPosition || 0) <= 3,
            hitType:
              String(entry?.hitType || ""),
            hitScore:
              Number(entry?.hitScore || 0),
            predictionPosition:
              Number(entry?.hitPosition ?? -1),
            resultPosition:
              Number(entry?.resultPosition ?? -1),
            podiumMedal:
              String(entry?.podiumMedal || ""),
            matchedValue:
              String(entry?.matchedValue || ""),
          },'''

view = replace_once(
    view,
    old_persisted_fields,
    new_persisted_fields,
    "campos persistidos do histórico"
)

old_timeline_row_analysis = '''        const analysis = analyzeTop3Hit(
          slotTop3,
          resultGrupo,
          resultMilhar
        );'''

new_timeline_row_analysis = '''        const analysis =
          analyzeTop3PodiumDraw(
            slotTop3,
            slot
          );'''

view = replace_once(
    view,
    old_timeline_row_analysis,
    new_timeline_row_analysis,
    "análise das linhas da timeline"
)

old_timeline_return = '''          analysis,
          hit:
            analysis.type !== "miss" &&
            analysis.type !== "none",
          hitType: analysis.type,
          hitScore: Number(analysis.score || 0),
          hitPosition: Number(
            analysis.position ?? -1
          ),'''

new_timeline_return = '''          rawSlot: slot,
          analysis,
          hit: Boolean(analysis.hit),
          hitType:
            String(analysis.hitType || ""),
          hitScore:
            Number(analysis.hitScore || 0),
          hitPosition:
            Number(
              analysis.predictionPosition ?? -1
            ),
          resultPosition:
            Number(
              analysis.resultPosition ?? -1
            ),
          podiumMedal:
            String(
              analysis.podiumMedal || ""
            ),'''

view = replace_once(
    view,
    old_timeline_return,
    new_timeline_return,
    "retorno da linha da timeline"
)

old_merge_analysis = '''      const resultGrupo = Number(timelineRow.result);
      const resultMilhar = String(
        timelineRow?.resultMilhar || ""
      );

      const analysis = analyzeTop3Hit(
        row?.top3,
        resultGrupo,
        resultMilhar
      );'''

new_merge_analysis = '''      const resultGrupo =
        Number(timelineRow.result);

      const resultMilhar = String(
        timelineRow?.resultMilhar || ""
      );

      const analysis =
        analyzeTop3PodiumDraw(
          row?.top3,
          timelineRow?.rawSlot || {}
        );'''

view = replace_once(
    view,
    old_merge_analysis,
    new_merge_analysis,
    "revalidação do registro persistido"
)

old_merge_fields = '''        analysis,
        hit:
          analysis.type !== "miss" &&
          analysis.type !== "none",
        hitType: analysis.type,
        hitScore: Number(analysis.score || 0),
        hitPosition: Number(
          analysis.position ?? -1
        ),'''

new_merge_fields = '''        analysis,
        hit: Boolean(analysis.hit),
        hitType:
          String(analysis.hitType || ""),
        hitScore:
          Number(analysis.hitScore || 0),
        hitPosition:
          Number(
            analysis.predictionPosition ?? -1
          ),
        resultPosition:
          Number(
            analysis.resultPosition ?? -1
          ),
        podiumMedal:
          String(
            analysis.podiumMedal || ""
          ),'''

view = replace_once(
    view,
    old_merge_fields,
    new_merge_fields,
    "campos revalidados do histórico"
)

summary_pattern = re.compile(
    r'''  const historySummary = useMemo\(\(\) => \{.*?\n  \}, \[historyRows\]\);''',
    re.S
)

summary_replacement = '''  const historySummary = useMemo(() => {
    const validated = historyRows.filter(
      (item) => item?.result != null
    );

    const gold = validated.filter(
      (item) =>
        Number(item?.resultPosition) === 1
    ).length;

    const silver = validated.filter(
      (item) =>
        Number(item?.resultPosition) === 2
    ).length;

    const bronze = validated.filter(
      (item) =>
        Number(item?.resultPosition) === 3
    ).length;

    const hits = gold + silver + bronze;
    const misses = Math.max(
      0,
      validated.length - hits
    );

    const hitRate =
      validated.length > 0
        ? (hits / validated.length) * 100
        : 0;

    return {
      total: historyRows.length,
      validated: validated.length,
      pending: Math.max(
        0,
        historyRows.length - validated.length
      ),
      gold,
      silver,
      bronze,
      hits,
      misses,
      hitRate,
    };
  }, [historyRows]);'''

view, summary_count = summary_pattern.subn(
    summary_replacement,
    view,
    count=1
)

if summary_count != 1:
    raise RuntimeError(
        f"resumo do histórico: encontrado {summary_count}"
    )

view = replace_once(
    view,
'''              <div className="top3-historyMetric__label">Grupo/dezena</div>
              <div className="top3-historyMetric__value">
                {historySummary.grupo}
              </div>''',
'''              <div className="top3-historyMetric__label">Ouro</div>
              <div className="top3-historyMetric__value">
                {historySummary.gold}
              </div>''',
    "métrica Ouro"
)

view = replace_once(
    view,
'''              <div className="top3-historyMetric__label">Centena</div>
              <div className="top3-historyMetric__value">
                {historySummary.centena}
              </div>''',
'''              <div className="top3-historyMetric__label">Prata</div>
              <div className="top3-historyMetric__value">
                {historySummary.silver}
              </div>''',
    "métrica Prata"
)

view = replace_once(
    view,
'''              <div className="top3-historyMetric__label">Milhar</div>
              <div className="top3-historyMetric__value">
                {historySummary.exact}
              </div>''',
'''              <div className="top3-historyMetric__label">Bronze</div>
              <div className="top3-historyMetric__value">
                {historySummary.bronze}
              </div>''',
    "métrica Bronze"
)

view = replace_once(
    view,
'''              <div className="top3-historyMetric__label">Índice médio</div>
              <div className="top3-historyMetric__value">
                {historySummary.average.toFixed(2)}%
              </div>''',
'''              <div className="top3-historyMetric__label">Taxa de acerto</div>
              <div className="top3-historyMetric__value">
                {historySummary.hitRate.toFixed(2)}%
              </div>''',
    "taxa de acerto"
)

old_hit_mark = '''                const hitType = String(item?.hitType || item?.analysis?.type || "").trim();
                const matchedValue = String(item?.analysis?.matchedValue || "").trim();

                const hitMark = !hasResult
                  ? "⏳"
                  : hitType === "hit_exact"
                    ? `🏆 100% · Milhar ${matchedValue || "—"}`
                    : hitType === "hit_centena"
                      ? `✅✅ 66,67% · Centena ${matchedValue || "—"}`
                      : hitType === "hit_grupo"
                        ? `✅ 33,33% · Dezena ${matchedValue || "indisponível"}`
                        : "❌ 0%";'''

new_hit_mark = '''                const resultPosition =
                  Number(
                    item?.resultPosition ??
                      item?.analysis?.resultPosition ??
                      -1
                  );

                const hitMark = !hasResult
                  ? "⏳"
                  : resultPosition >= 1 &&
                      resultPosition <= 3
                    ? podiumMedalLabel(
                        resultPosition
                      )
                    : "❌ ERRO";'''

view = replace_once(
    view,
    old_hit_mark,
    new_hit_mark,
    "marca visual de Ouro/Prata/Bronze"
)

write(view_path, view)

print("PATCH_OK")
print(module_path)
print(firestore_path)
print(view_path)
