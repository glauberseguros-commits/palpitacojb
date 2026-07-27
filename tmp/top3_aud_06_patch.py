from pathlib import Path

target = Path("src/pages/Top3/top3.engine.js")
text = target.read_text(encoding="utf-8")

if "function getPrizeGroupsByPosition(" in text:
    raise SystemExit(
        "A alteração TOP3-AUD-06 já parece estar presente. "
        "Nenhuma duplicação foi realizada."
    )

helper_marker = """function getAllPrizePresenceGroups(draw) {"""

helper_code = """function getPrizeGroupsByPosition(draw, maxPosition = 3) {
  const limit = Math.max(1, Number(maxPosition || 3));
  const prizes = Array.isArray(draw?.prizes) ? draw.prizes : [];

  return Array.from({ length: limit }, (_, index) => {
    const position = index + 1;

    const prize =
      prizes.find(
        (item) => Number(guessPrizePos(item)) === position
      ) || null;

    if (!prize) return null;

    const grupo = Number(guessPrizeGrupo(prize));

    return Number.isFinite(grupo) &&
      grupo >= 1 &&
      grupo <= TOP3_GROUPS_K
      ? grupo
      : null;
  });
}


"""

if helper_marker not in text:
    raise SystemExit(
        "Marcador getAllPrizePresenceGroups não encontrado."
    )

text = text.replace(
    helper_marker,
    helper_code + helper_marker,
    1,
)

audit_start_marker = """export function auditTop3Timeline({"""
audit_end_marker = """function buildTimelineForDate({"""

audit_start = text.find(audit_start_marker)
audit_end = text.find(audit_end_marker, audit_start)

if audit_start < 0:
    raise SystemExit("Início de auditTop3Timeline não encontrado.")

if audit_end < 0:
    raise SystemExit("Fim de auditTop3Timeline não encontrado.")

new_audit = """export function auditTop3Timeline({
  timeline,
  lotteryKey = "",
}) {
  const rows = Array.isArray(timeline) ? timeline : [];

  const validated = rows.filter((slot) => {
    const status = String(slot?.status || "").toLowerCase();

    return (
      status === "validated" &&
      Number.isFinite(Number(slot?.resultGrupo))
    );
  });

  function pct(n, d) {
    if (!d) return 0;

    return Number(
      ((Number(n || 0) / Number(d || 1)) * 100).toFixed(2)
    );
  }

  function normalizeResultTop3(slot) {
    const source = Array.isArray(slot?.resultTop3Groups)
      ? slot.resultTop3Groups
      : [];

    const normalized = source
      .slice(0, 3)
      .map((grupo) => {
        const value = Number(grupo);

        return Number.isFinite(value) &&
          value >= 1 &&
          value <= TOP3_GROUPS_K
          ? value
          : null;
      });

    while (normalized.length < 3) {
      normalized.push(null);
    }

    if (!Number.isFinite(Number(normalized[0]))) {
      const fallback = Number(slot?.resultGrupo);

      normalized[0] =
        Number.isFinite(fallback) &&
        fallback >= 1 &&
        fallback <= TOP3_GROUPS_K
          ? fallback
          : null;
    }

    return normalized;
  }

  function evaluateSlot(slot) {
    const picks = (Array.isArray(slot?.top3) ? slot.top3 : [])
      .slice(0, 3)
      .map((item) => Number(item?.grupo))
      .filter(
        (grupo) =>
          Number.isFinite(grupo) &&
          grupo >= 1 &&
          grupo <= TOP3_GROUPS_K
      );

    const resultTop3 = normalizeResultTop3(slot);
    const resultGrupo = Number(resultTop3[0]);

    const top1Hit =
      picks.length > 0 &&
      Number.isFinite(resultGrupo) &&
      Number(picks[0]) === resultGrupo;

    const top3Hit =
      Number.isFinite(resultGrupo) &&
      picks.some(
        (grupo) => Number(grupo) === resultGrupo
      );

    const prizePositionHits = resultTop3.map(
      (grupo) =>
        Number.isFinite(Number(grupo)) &&
        picks.some(
          (pick) => Number(pick) === Number(grupo)
        )
    );

    const predictionHits = picks.map((grupo) =>
      resultTop3.some(
        (result) =>
          Number.isFinite(Number(result)) &&
          Number(result) === Number(grupo)
      )
    );

    const matchedPrizePositions =
      prizePositionHits.filter(Boolean).length;

    const matchedPredictions =
      predictionHits.filter(Boolean).length;

    return {
      picks,
      resultTop3,
      resultGrupo,

      top1Hit,
      top3Hit,

      prize1Hit: Boolean(prizePositionHits[0]),
      prize2Hit: Boolean(prizePositionHits[1]),
      prize3Hit: Boolean(prizePositionHits[2]),

      top3PrizeHit: matchedPrizePositions > 0,

      matchedPrizePositions,
      matchedPredictions,

      prizePositionHits,
      predictionHits,
    };
  }

  const evaluated = validated.map((slot) => ({
    slot,
    metrics: evaluateSlot(slot),
  }));

  function summarize(items) {
    const summary = {
      total: items.length,

      top1Hits: 0,
      top3Hits: 0,

      prize1Hits: 0,
      prize2Hits: 0,
      prize3Hits: 0,

      top3PrizeHits: 0,

      matchedPrizePositions: 0,
      matchedPredictions: 0,
    };

    for (const item of items) {
      const metrics = item.metrics;

      if (metrics.top1Hit) summary.top1Hits += 1;
      if (metrics.top3Hit) summary.top3Hits += 1;

      if (metrics.prize1Hit) summary.prize1Hits += 1;
      if (metrics.prize2Hit) summary.prize2Hits += 1;
      if (metrics.prize3Hit) summary.prize3Hits += 1;

      if (metrics.top3PrizeHit) {
        summary.top3PrizeHits += 1;
      }

      summary.matchedPrizePositions +=
        Number(metrics.matchedPrizePositions || 0);

      summary.matchedPredictions +=
        Number(metrics.matchedPredictions || 0);
    }

    return {
      ...summary,

      top1Rate: pct(summary.top1Hits, summary.total),
      top3Rate: pct(summary.top3Hits, summary.total),

      prize1Rate: pct(summary.prize1Hits, summary.total),
      prize2Rate: pct(summary.prize2Hits, summary.total),
      prize3Rate: pct(summary.prize3Hits, summary.total),

      top3PrizeRate: pct(
        summary.top3PrizeHits,
        summary.total
      ),

      averageMatchedPrizePositions: summary.total
        ? Number(
            (
              summary.matchedPrizePositions /
              summary.total
            ).toFixed(4)
          )
        : 0,

      averageMatchedPredictions: summary.total
        ? Number(
            (
              summary.matchedPredictions /
              summary.total
            ).toFixed(4)
          )
        : 0,
    };
  }

  function groupBy(keyFn) {
    const map = new Map();

    for (const item of evaluated) {
      const key = keyFn(item.slot);

      if (!map.has(key)) {
        map.set(key, []);
      }

      map.get(key).push(item);
    }

    return Array.from(map.entries())
      .map(([key, items]) => ({
        key,
        ...summarize(items),
      }))
      .sort((a, b) => {
        if (b.top3PrizeRate !== a.top3PrizeRate) {
          return b.top3PrizeRate - a.top3PrizeRate;
        }

        if (b.top3Rate !== a.top3Rate) {
          return b.top3Rate - a.top3Rate;
        }

        return b.total - a.total;
      });
  }

  const summary = summarize(evaluated);

  return {
    lotteryKey,
    ...summary,

    byHour: groupBy(
      (slot) => String(slot?.targetHour || "")
    ),

    byDate: groupBy(
      (slot) => String(slot?.targetYmd || "")
    ),

    rows: evaluated.map(({ slot, metrics }) => ({
      ymd: slot.targetYmd,
      hour: slot.targetHour,

      baseYmd: slot.baseYmd,
      baseHour: slot.baseHour,

      resultGrupo: metrics.resultGrupo,
      resultTop3: metrics.resultTop3,

      top3: metrics.picks,

      top1Hit: metrics.top1Hit,
      top3Hit: metrics.top3Hit,

      prize1Hit: metrics.prize1Hit,
      prize2Hit: metrics.prize2Hit,
      prize3Hit: metrics.prize3Hit,

      top3PrizeHit: metrics.top3PrizeHit,

      matchedPrizePositions:
        metrics.matchedPrizePositions,

      matchedPredictions:
        metrics.matchedPredictions,

      prizePositionHits:
        metrics.prizePositionHits,

      predictionHits:
        metrics.predictionHits,

      historyStats: slot.historyStats || null,
    })),
  };
}


"""

text = (
    text[:audit_start]
    + new_audit
    + text[audit_end:]
)

old_result_block = """    const resultGrupo = currentDraw ? pickPrize1GrupoFromDraw(currentDraw) : null;

    const hit =
      Number.isFinite(Number(resultGrupo)) && top3.length
        ? top3.some((t) => Number(t?.grupo) === Number(resultGrupo))
        : null;

    timeline.push({
      targetYmd,
      targetHour: slotHour,
      baseYmd: pickDrawYMD(baseDraw) || "",
      baseHour: toHourBucket(pickDrawHour(baseDraw)) || "",
      top3,
      resultGrupo: Number.isFinite(Number(resultGrupo)) ? Number(resultGrupo) : null,
      hit,
      status: Number.isFinite(Number(resultGrupo)) ? "validated" : "pending",
      historyStats,
    });
"""

new_result_block = """    const resultTop3Groups = currentDraw
      ? getPrizeGroupsByPosition(currentDraw, 3)
      : [null, null, null];

    const resultGrupo = Number(resultTop3Groups[0]);

    const normalizedResultGrupo =
      Number.isFinite(resultGrupo) &&
      resultGrupo >= 1 &&
      resultGrupo <= TOP3_GROUPS_K
        ? resultGrupo
        : null;

    const hit =
      Number.isFinite(Number(normalizedResultGrupo)) &&
      top3.length
        ? top3.some(
            (item) =>
              Number(item?.grupo) ===
              Number(normalizedResultGrupo)
          )
        : null;

    timeline.push({
      targetYmd,
      targetHour: slotHour,

      baseYmd: pickDrawYMD(baseDraw) || "",
      baseHour: toHourBucket(pickDrawHour(baseDraw)) || "",

      top3,

      resultGrupo: normalizedResultGrupo,
      resultTop3Groups,

      hit,

      status: Number.isFinite(
        Number(normalizedResultGrupo)
      )
        ? "validated"
        : "pending",

      historyStats,
    });
"""

if old_result_block not in text:
    raise SystemExit(
        "Bloco original de gravação do resultado não encontrado."
    )

text = text.replace(
    old_result_block,
    new_result_block,
    1,
)

required = [
    "function getPrizeGroupsByPosition",
    "resultTop3Groups",
    "top3PrizeHits",
    "top3PrizeRate",
    "prize1Hits",
    "prize2Hits",
    "prize3Hits",
    "matchedPrizePositions",
    "matchedPredictions",
]

missing = [
    token
    for token in required
    if token not in text
]

if missing:
    raise SystemExit(
        "Validação interna falhou: "
        + ", ".join(missing)
    )

target.write_text(
    text,
    encoding="utf-8",
    newline="\n",
)

print("PATCH_OK")
print(f"Arquivo alterado: {target}")
print("Auditoria ampliada para resultados reais do 1º ao 3º prêmio.")
print("Layout não alterado.")
