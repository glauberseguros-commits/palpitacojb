/*
 * TOP3_HISTORICAL_TRUTH_CONTRACT_V1
 *
 * Verdade histórica:
 *
 * - ausência de probabilidade não significa 0%;
 * - milhares reconstruídas administrativamente não passam
 *   a ser milhares históricas originais;
 * - marcadores persistidos de indisponibilidade possuem
 *   precedência sobre payload reconstruído posteriormente.
 */

function getHistoricalMeta(item) {
  return item?.meta &&
    typeof item.meta === "object"
    ? item.meta
    : {};
}

export function finiteTop3NumberOrNull(value) {
  if (
    value === null ||
    value === undefined ||
    value === "" ||
    typeof value === "boolean"
  ) {
    return null;
  }

  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : null;
}

export function isTop3HistoricalMilharesUnavailable(
  item
) {
  const meta = getHistoricalMeta(item);

  return (
    item?.historicalMilharesUnavailable === true ||
    meta?.originalMilhares24Unavailable === true ||
    meta?.originalMilharesUnavailable === true ||
    meta?.historicalPayloadUnavailable === true ||
    meta?.reconstructedPayloadUnavailable === true
  );
}

export function isTop3HistoricalProbabilityUnavailable(
  item
) {
  const meta = getHistoricalMeta(item);

  return (
    item?.historicalProbabilityUnavailable === true ||
    meta?.originalProbabilityUnavailable === true ||
    meta?.probabilityUnavailable === true ||
    meta?.historicalPayloadUnavailable === true ||
    meta?.reconstructedPayloadUnavailable === true
  );
}

function clampProbabilityFraction(value) {
  const number =
    finiteTop3NumberOrNull(value);

  if (number == null) {
    return null;
  }

  const normalized =
    number > 1
      ? number / 100
      : number;

  return Math.max(
    0,
    Math.min(
      1,
      normalized
    )
  );
}

export function resolveTop3ProbabilityFractionOrNull(
  item
) {
  if (
    isTop3HistoricalProbabilityUnavailable(
      item
    )
  ) {
    return null;
  }

  const directCandidates = [
    item?.scoreProb,
    item?.prob,
    item?.probCond,
  ];

  for (const candidate of directCandidates) {
    const number =
      finiteTop3NumberOrNull(
        candidate
      );

    if (number != null) {
      return clampProbabilityFraction(
        number
      );
    }
  }

  const probabilityPct =
    finiteTop3NumberOrNull(
      item?.probPct
    );

  if (probabilityPct != null) {
    return Math.max(
      0,
      Math.min(
        1,
        probabilityPct / 100
      )
    );
  }

  return null;
}
