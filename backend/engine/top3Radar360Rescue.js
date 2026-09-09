"use strict";

/**
 * TOP3_RADAR360_RESCUE_V1
 *
 * Aplica somente contextos selecionados.
 * Fora deles, mantém o motor oficial.
 *
 * Kill switch:
 * TOP3_RADAR360_RESCUE=0
 */

const RULES = Object.freeze({

  "LOOK|SAB|09:00": Object.freeze({
    id: "LOOK_SAB_07_09_P3_P5_P7_V1",
    previousHour: "07:00",
    positions: Object.freeze([3, 5, 7]),
    observedRate: 0.528,
    observedCases: 36,
  }),

  "PT_RIO|SEG|18:00": Object.freeze({
    id: "PT_RIO_SEG_16_18_P2_P3_P6_V1",
    previousHour: "16:00",
    positions: Object.freeze([2, 3, 6]),
    observedRate: 0.528,
    observedCases: 36,
  }),

  "PT_RIO|TER|16:00": Object.freeze({
    id: "PT_RIO_TER_14_16_P1_P4_P7_V1",
    previousHour: "14:00",
    positions: Object.freeze([1, 4, 7]),
    observedRate: 0.472,
    observedCases: 36,
  }),

  "PT_RIO|QUI|16:00": Object.freeze({
    id: "PT_RIO_QUI_14_16_P1_P2_P5_V1",
    previousHour: "14:00",
    positions: Object.freeze([1, 2, 5]),
    observedRate: 0.457,
    observedCases: 35,
  }),

  "PT_RIO|SAB|16:00": Object.freeze({
    id: "PT_RIO_SAB_14_16_P1_P5_P7_V1",
    previousHour: "14:00",
    positions: Object.freeze([1, 5, 7]),
    observedRate: 0.472,
    observedCases: 36,
  }),

  "PT_SP|SEG|20:00": Object.freeze({
    id: "PT_SP_SEG_19_20_P3_P4_P5_V1",
    previousHour: "19:00",
    positions: Object.freeze([3, 4, 5]),
    observedRate: 0.486,
    observedCases: 35,
  }),

});

function normalizeLotteryKey(value) {
  return String(value || "")
    .trim()
    .toUpperCase();
}

function normalizeHour(value) {
  const raw = String(value || "").trim();

  const match =
    raw.match(/^(\d{1,2})(?::?(\d{2}))?\s*h?$/i);

  if (!match) {
    return raw;
  }

  const hh =
    String(Number(match[1]))
      .padStart(2, "0");

  const mm =
    String(Number(match[2] || 0))
      .padStart(2, "0");

  return `${hh}:${mm}`;
}

function dowCode(ymd) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(ymd || ""))) {
    return "";
  }

  const date =
    new Date(`${ymd}T12:00:00Z`);

  return [
    "DOM",
    "SEG",
    "TER",
    "QUA",
    "QUI",
    "SEX",
    "SAB",
  ][date.getUTCDay()];
}

function normalizeGroup(value) {
  const match =
    String(value ?? "")
      .trim()
      .match(/^G?0*(\d{1,2})$/i);

  if (!match) {
    return null;
  }

  const n = Number(match[1]);

  return (
    Number.isInteger(n) &&
    n >= 1 &&
    n <= 25
  )
    ? n
    : null;
}

function prizePosition(prize, fallbackIndex) {
  const n =
    Number(
      prize?.position ??
      prize?.posicao ??
      prize?.rank ??
      prize?.prizePosition ??
      prize?.premio ??
      fallbackIndex
    );

  return Number.isInteger(n)
    ? n
    : fallbackIndex;
}

/**
 * Usa SOMENTE os dois últimos dígitos.
 *
 * O 7º prêmio continua CENTENA.
 * Nunca é transformado artificialmente em milhar.
 *
 * 097 -> 97 -> G25
 * 058 -> 58 -> G15
 * 039 -> 39 -> G10
 * 000 -> 00 -> G25
 */
function groupFromEnding(value) {
  const digits =
    String(value ?? "")
      .replace(/\D/g, "");

  if (!digits) {
    return null;
  }

  const ending =
    Number(digits.slice(-2));

  if (!Number.isFinite(ending)) {
    return null;
  }

  if (ending === 0) {
    return 25;
  }

  const group =
    Math.ceil(ending / 4);

  return (
    group >= 1 &&
    group <= 25
  )
    ? group
    : null;
}

function extractPrizeGroup(draw, wantedPosition) {
  const prizes =
    Array.isArray(draw?.prizes)
      ? draw.prizes
      : [];

  const prize =
    prizes.find(
      (item, index) =>
        prizePosition(item, index + 1) === wantedPosition
    );

  if (!prize) {
    return null;
  }

  const explicit =
    normalizeGroup(prize?.grupo) ??
    normalizeGroup(prize?.grupo2) ??
    normalizeGroup(prize?.group) ??
    normalizeGroup(prize?.animalGroup);

  if (explicit) {
    return explicit;
  }

  return groupFromEnding(
    prize?.milhar ??
    prize?.centena ??
    prize?.numero ??
    prize?.number ??
    prize?.resultado ??
    prize?.value
  );
}

function uniqueGroups(values) {
  const out = [];
  const seen = new Set();

  for (const value of values) {
    const group =
      normalizeGroup(value);

    if (!group || seen.has(group)) {
      continue;
    }

    seen.add(group);
    out.push(group);
  }

  return out;
}

function applyTop3Radar360Rescue({
  lotteryKey,
  date,
  closeHour,
  drawLast,
  computedTop = [],
  publicApi = null,
  enabled =
    process.env.TOP3_RADAR360_RESCUE !== "0",
} = {}) {

  const engineTop =
    Array.isArray(computedTop)
      ? computedTop
      : [];

  if (!enabled) {
    return {
      top: engineTop,
      applied: false,
      reason: "DISABLED",
    };
  }

  const key =
    `${normalizeLotteryKey(lotteryKey)}|` +
    `${dowCode(date)}|` +
    `${normalizeHour(closeHour)}`;

  const rule =
    RULES[key];

  if (!rule) {
    return {
      top: engineTop,
      applied: false,
      reason: "NO_CERTIFIED_RULE",
      key,
    };
  }

  const rawPreviousHour =
    publicApi &&
    typeof publicApi.pickDrawHour === "function"
      ? publicApi.pickDrawHour(drawLast)
      : (
          drawLast?.hour ??
          drawLast?.closeHour ??
          drawLast?.hourBucket
        );

  const previousHour =
    normalizeHour(rawPreviousHour);

  if (previousHour !== rule.previousHour) {
    return {
      top: engineTop,
      applied: false,
      reason: "PREVIOUS_HOUR_MISMATCH",
      key,
      expectedPreviousHour: rule.previousHour,
      actualPreviousHour: previousHour,
    };
  }

  const rescueEntries =
    rule.positions.map(
      (position) => ({
        position,
        group:
          extractPrizeGroup(
            drawLast,
            position
          ),
      })
    );

  const rescueGroups =
    uniqueGroups(
      rescueEntries.map((x) => x.group)
    );

  const engineGroups =
    uniqueGroups(
      engineTop.map((x) => x?.grupo)
    );

  /*
   * Regra certificada entra primeiro.
   * Se houver grupo duplicado entre posições,
   * o motor completa as vagas restantes.
   */
  const finalGroups =
    uniqueGroups([
      ...rescueGroups,
      ...engineGroups,
    ])
      .slice(0, 3);

  if (
    rescueGroups.length === 0 ||
    finalGroups.length < 3
  ) {
    return {
      top: engineTop,
      applied: false,
      reason: "INSUFFICIENT_RESCUE_GROUPS",
      key,
      rescueGroups,
      engineGroups,
    };
  }

  const top =
    finalGroups.map(
      (group, index) => {

        const engineItem =
          engineTop.find(
            (item) =>
              Number(item?.grupo) === group
          );

        const source =
          rescueEntries.find(
            (entry) =>
              entry.group === group
          );

        return {
          ...(engineItem || {}),

          grupo: group,

          score:
            Number(engineItem?.score || 0),

          scoreProb:
            Number(engineItem?.scoreProb || 0),

          probability:
            Number(engineItem?.probability || 0),

          confidence:
            Number(engineItem?.confidence || 0),

          meta: {
            ...(
              engineItem?.meta &&
              typeof engineItem.meta === "object"
                ? engineItem.meta
                : {}
            ),

            radar360Rescue: true,
            radar360RuleId: rule.id,

            radar360SourcePosition:
              source?.position ?? null,

            radar360ObservedRate:
              rule.observedRate,

            radar360ObservedCases:
              rule.observedCases,

            radar360Rank:
              index + 1,
          },
        };
      }
    );

  return {
    top,
    applied: true,
    reason: "CERTIFIED_POSITION_RESCUE",
    key,
    ruleId: rule.id,
    previousHour,
    positions: [...rule.positions],
    rescueGroups,
    engineGroups,
    finalGroups,
    observedRate: rule.observedRate,
    observedCases: rule.observedCases,
  };
}

module.exports = {
  RULES,
  normalizeHour,
  dowCode,
  groupFromEnding,
  extractPrizeGroup,
  applyTop3Radar360Rescue,
};
