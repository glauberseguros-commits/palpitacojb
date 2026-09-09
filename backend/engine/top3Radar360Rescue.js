"use strict";

/**
 * TOP3_RADAR360_RESCUE_V2
 *
 * Arquitetura:
 *
 * - 6 regras V1 preservadas;
 * - 7 regras RAW certificadas no R2.1;
 * - 3 regras matematicas finalistas do R3;
 * - motor oficial permanece fallback;
 * - nenhuma regra fora do contexto exato;
 * - previousHour obrigatorio;
 *
 * Kill switch:
 *
 * TOP3_RADAR360_RESCUE=0
 *
 * IMPORTANTE:
 *
 * P7 = CENTENA DE 3 DIGITOS.
 * Nunca transformar P7 em milhar.
 *
 * Ex.:
 * 097 -> 97 -> G25
 * 058 -> 58 -> G15
 * 000 -> 00 -> G25
 */

function freezeSignals(signals) {

  return Object.freeze(
    signals.map(
      (signal) =>
        Object.freeze({
          position:
            Number(signal.position),

          transform:
            String(
              signal.transform ||
              "RAW_GROUP"
            ),
        })
    )
  );
}


function rawRule({
  id,
  previousHour,
  positions,
  observedRate,
  observedCases,
  source,
}) {

  return Object.freeze({
    id,

    mode:
      "RAW_POSITIONS",

    previousHour,

    positions:
      Object.freeze([
        ...positions,
      ]),

    observedRate,
    observedCases,
    source,
  });
}


function transformRule({
  id,
  previousHour,
  signals,
  observedRate,
  observedCases,
  source,
}) {

  return Object.freeze({
    id,

    mode:
      "TRANSFORM_SIGNALS",

    previousHour,

    signals:
      freezeSignals(
        signals
      ),

    observedRate,
    observedCases,
    source,
  });
}


const RULES =
  Object.freeze({

    /* ==========================================================
     * V1 - PRESERVADAS
     * ==========================================================
     */

    "LOOK|SAB|09:00":
      rawRule({
        id:
          "LOOK_SAB_07_09_P3_P5_P7_V1",

        previousHour:
          "07:00",

        positions:
          [3, 5, 7],

        observedRate:
          19 / 36,

        observedCases:
          36,

        source:
          "V1_R21_AUDIT",
      }),


    "PT_RIO|SEG|18:00":
      rawRule({
        id:
          "PT_RIO_SEG_16_18_P2_P3_P6_V1",

        previousHour:
          "16:00",

        positions:
          [2, 3, 6],

        observedRate:
          19 / 36,

        observedCases:
          36,

        source:
          "V1_R21_AUDIT",
      }),


    "PT_RIO|TER|16:00":
      rawRule({
        id:
          "PT_RIO_TER_14_16_P1_P4_P7_V1",

        previousHour:
          "14:00",

        positions:
          [1, 4, 7],

        observedRate:
          17 / 36,

        observedCases:
          36,

        source:
          "V1_R21_AUDIT",
      }),


    "PT_RIO|QUI|16:00":
      rawRule({
        id:
          "PT_RIO_QUI_14_16_P1_P2_P5_V1",

        previousHour:
          "14:00",

        positions:
          [1, 2, 5],

        observedRate:
          16 / 35,

        observedCases:
          35,

        source:
          "V1_R21_AUDIT",
      }),


    "PT_RIO|SAB|16:00":
      rawRule({
        id:
          "PT_RIO_SAB_14_16_P1_P5_P7_V1",

        previousHour:
          "14:00",

        positions:
          [1, 5, 7],

        observedRate:
          17 / 36,

        observedCases:
          36,

        source:
          "V1_R21_AUDIT",
      }),


    "PT_SP|SEG|20:00":
      rawRule({
        id:
          "PT_SP_SEG_19_20_P3_P4_P5_V1",

        previousHour:
          "19:00",

        positions:
          [3, 4, 5],

        observedRate:
          17 / 35,

        observedCases:
          35,

        source:
          "V1_R21_AUDIT",
      }),


    /* ==========================================================
     * V2 - 7 NOVOS CONTEXTOS R2.1
     * discovery 2022-2024
     * validation 2025
     * holdout 2026
     * ==========================================================
     */

    "LOOK|DOM|21:00":
      rawRule({
        id:
          "LOOK_DOM_18_21_P2_P3_P4_R21_V2",

        previousHour:
          "18:00",

        positions:
          [2, 3, 4],

        observedRate:
          16 / 36,

        observedCases:
          36,

        source:
          "R21_GREEN",
      }),


    "LOOK|SAB|14:00":
      rawRule({
        id:
          "LOOK_SAB_11_14_P1_P2_P7_R21_V2",

        previousHour:
          "11:00",

        positions:
          [1, 2, 7],

        observedRate:
          16 / 36,

        observedCases:
          36,

        source:
          "R21_GREEN",
      }),


    "LOOK|QUA|21:00":
      rawRule({
        id:
          "LOOK_QUA_18_21_P3_P4_P7_R21_V2",

        previousHour:
          "18:00",

        positions:
          [3, 4, 7],

        observedRate:
          15 / 35,

        observedCases:
          35,

        source:
          "R21_GREEN",
      }),


    "PT_RIO|DOM|14:00":
      rawRule({
        id:
          "PT_RIO_DOM_11_14_P1_P6_P7_R21_V2",

        previousHour:
          "11:00",

        positions:
          [1, 6, 7],

        observedRate:
          12 / 27,

        observedCases:
          27,

        source:
          "R21_GREEN",
      }),


    "PT_SP|SEX|13:00":
      rawRule({
        id:
          "PT_SP_SEX_12_13_P3_P4_P6_R21_V2",

        previousHour:
          "12:00",

        positions:
          [3, 4, 6],

        observedRate:
          16 / 36,

        observedCases:
          36,

        source:
          "R21_GREEN",
      }),


    "PT_SP|QUI|12:00":
      rawRule({
        id:
          "PT_SP_QUI_10_12_P1_P2_P7_R21_V2",

        previousHour:
          "10:00",

        positions:
          [1, 2, 7],

        observedRate:
          15 / 35,

        observedCases:
          35,

        source:
          "R21_GREEN",
      }),


    "NACIONAL|TER|10:00":
      rawRule({
        id:
          "NACIONAL_TER_08_10_P2_P3_P7_R21_V2",

        previousHour:
          "08:00",

        positions:
          [2, 3, 7],

        observedRate:
          14 / 35,

        observedCases:
          35,

        source:
          "R21_GREEN",
      }),


    /* ==========================================================
     * V2 - 3 FINALISTAS R3
     *
     * Somente PT_RIO:
     * foi a loteria em que o R3 teve dados suficientes
     * para estes contextos.
     * ==========================================================
     */

    "PT_RIO|SAB|09:00":
      transformRule({
        id:
          "PT_RIO_SAB_21_09_R3_STRONG_V2",

        previousHour:
          "21:00",

        signals: [
          {
            position: 1,
            transform:
              "COMP100_AB",
          },
          {
            position: 3,
            transform:
              "CD_MINUS_AB",
          },
          {
            position: 4,
            transform:
              "AC_PLUS_BD",
          },
        ],

        observedRate:
          19 / 36,

        observedCases:
          36,

        source:
          "R3_STRONG",
      }),


    "PT_RIO|QUI|09:00":
      transformRule({
        id:
          "PT_RIO_QUI_21_09_R3_STRONG_V2",

        previousHour:
          "21:00",

        signals: [
          {
            position: 2,
            transform:
              "CA",
          },
          {
            position: 5,
            transform:
              "CA",
          },
          {
            position: 6,
            transform:
              "AC",
          },
        ],

        observedRate:
          16 / 32,

        observedCases:
          32,

        source:
          "R3_STRONG",
      }),


    "PT_RIO|SEX|11:00":
      transformRule({
        id:
          "PT_RIO_SEX_09_11_R3_GREEN_V2",

        previousHour:
          "09:00",

        signals: [
          {
            position: 2,
            transform:
              "AB",
          },
          {
            position: 5,
            transform:
              "BA",
          },
          {
            position: 6,
            transform:
              "BC",
          },
        ],

        observedRate:
          16 / 36,

        observedCases:
          36,

        source:
          "R3_GREEN",
      }),
  });


function normalizeLotteryKey(value) {

  return String(
    value || ""
  )
    .trim()
    .toUpperCase();
}


function normalizeHour(value) {

  const raw =
    String(value || "")
      .trim();

  const match =
    raw.match(
      /^(\d{1,2})(?::?(\d{2}))?\s*h?$/i
    );

  if (!match) {
    return raw;
  }

  const hh =
    String(
      Number(match[1])
    )
      .padStart(
        2,
        "0"
      );

  const mm =
    String(
      Number(
        match[2] || 0
      )
    )
      .padStart(
        2,
        "0"
      );

  return `${hh}:${mm}`;
}


function dowCode(ymd) {

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(
      String(ymd || "")
    )
  ) {
    return "";
  }

  const date =
    new Date(
      `${ymd}T12:00:00Z`
    );

  return [
    "DOM",
    "SEG",
    "TER",
    "QUA",
    "QUI",
    "SEX",
    "SAB",
  ][
    date.getUTCDay()
  ];
}


function normalizeGroup(value) {

  const match =
    String(
      value ?? ""
    )
      .trim()
      .match(
        /^G?0*(\d{1,2})$/i
      );

  if (!match) {
    return null;
  }

  const n =
    Number(
      match[1]
    );

  return (
    Number.isInteger(n) &&
    n >= 1 &&
    n <= 25
  )
    ? n
    : null;
}


function prizePosition(
  prize,
  fallbackIndex
) {

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


function findPrize(
  draw,
  wantedPosition
) {

  const prizes =
    Array.isArray(
      draw?.prizes
    )
      ? draw.prizes
      : [];

  return (
    prizes.find(
      (item, index) =>
        prizePosition(
          item,
          index + 1
        ) ===
        wantedPosition
    ) ||
    null
  );
}


/**
 * Grupo pelos dois ultimos digitos.
 *
 * P7 continua CENTENA.
 *
 * 097 -> 97 -> G25
 * 058 -> 58 -> G15
 * 039 -> 39 -> G10
 * 000 -> 00 -> G25
 */
function groupFromEnding(value) {

  const digits =
    String(
      value ?? ""
    )
      .replace(
        /\D/g,
        ""
      );

  if (!digits) {
    return null;
  }

  const ending =
    Number(
      digits.slice(-2)
    );

  if (
    !Number.isFinite(
      ending
    )
  ) {
    return null;
  }

  if (ending === 0) {
    return 25;
  }

  const group =
    Math.ceil(
      ending / 4
    );

  return (
    group >= 1 &&
    group <= 25
  )
    ? group
    : null;
}


/**
 * Le o grupo real de uma posicao.
 *
 * P7:
 * somente dezena/centena/numero.
 * Nunca usa milhar artificial.
 */
function extractPrizeGroup(
  draw,
  wantedPosition
) {

  const prize =
    findPrize(
      draw,
      wantedPosition
    );

  if (!prize) {
    return null;
  }

  const explicit =
    normalizeGroup(
      prize?.grupo
    ) ??
    normalizeGroup(
      prize?.grupo2
    ) ??
    normalizeGroup(
      prize?.group
    ) ??
    normalizeGroup(
      prize?.animalGroup
    );

  if (explicit) {
    return explicit;
  }

  if (
    wantedPosition === 7
  ) {

    return groupFromEnding(
      prize?.dezena ??
      prize?.centena ??
      prize?.numero ??
      prize?.number ??
      prize?.resultado ??
      prize?.value
    );
  }

  return groupFromEnding(
    prize?.milhar ??
    prize?.dezena ??
    prize?.centena ??
    prize?.numero ??
    prize?.number ??
    prize?.resultado ??
    prize?.value
  );
}


/**
 * Extrai milhar real de P1..P6.
 *
 * Transformacoes R3 usam quatro digitos.
 */
function extractMilhar4(
  draw,
  wantedPosition
) {

  if (
    wantedPosition < 1 ||
    wantedPosition > 6
  ) {
    return null;
  }

  const prize =
    findPrize(
      draw,
      wantedPosition
    );

  if (!prize) {
    return null;
  }

  const raw =
    prize?.milhar ??
    prize?.numero ??
    prize?.number ??
    prize?.resultado ??
    prize?.value;

  const digits =
    String(
      raw ?? ""
    )
      .replace(
        /\D/g,
        ""
      );

  if (!digits) {
    return null;
  }

  return digits
    .slice(-4)
    .padStart(
      4,
      "0"
    );
}


function pair(a, b) {

  return (
    Number(a) * 10 +
    Number(b)
  );
}


function mod100(value) {

  const n =
    Number(value);

  if (
    !Number.isFinite(n)
  ) {
    return null;
  }

  return (
    (
      Math.trunc(n) %
      100
    ) +
    100
  ) % 100;
}


function groupFromNumber(value) {

  const number =
    mod100(
      value
    );

  if (
    number === null
  ) {
    return null;
  }

  if (number === 0) {
    return 25;
  }

  const group =
    Math.ceil(
      number / 4
    );

  return (
    group >= 1 &&
    group <= 25
  )
    ? group
    : null;
}


function transformValue(
  digits,
  transform
) {

  const [
    A,
    B,
    C,
    D,
  ] =
    digits.map(
      Number
    );

  switch (
    String(transform)
  ) {

    case "AB":
      return pair(
        A,
        B
      );

    case "BA":
      return pair(
        B,
        A
      );

    case "BC":
      return pair(
        B,
        C
      );

    case "CA":
      return pair(
        C,
        A
      );

    case "AC":
      return pair(
        A,
        C
      );

    case "COMP100_AB":
      return (
        100 -
        pair(
          A,
          B
        )
      );

    case "CD_MINUS_AB":
      return (
        pair(
          C,
          D
        ) -
        pair(
          A,
          B
        )
      );

    case "AC_PLUS_BD":
      return (
        pair(
          A,
          C
        ) +
        pair(
          B,
          D
        )
      );

    default:
      return null;
  }
}


function signalToGroup(
  draw,
  signal
) {

  const position =
    Number(
      signal?.position
    );

  const transform =
    String(
      signal?.transform ||
      "RAW_GROUP"
    );

  if (
    transform ===
    "RAW_GROUP"
  ) {

    return extractPrizeGroup(
      draw,
      position
    );
  }

  const milhar =
    extractMilhar4(
      draw,
      position
    );

  if (!milhar) {
    return null;
  }

  const digits =
    milhar
      .split("")
      .map(Number);

  const value =
    transformValue(
      digits,
      transform
    );

  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  return groupFromNumber(
    value
  );
}


function uniqueGroups(values) {

  const out = [];
  const seen =
    new Set();

  for (
    const value
    of values
  ) {

    const group =
      normalizeGroup(
        value
      );

    if (
      !group ||
      seen.has(group)
    ) {
      continue;
    }

    seen.add(group);
    out.push(group);
  }

  return out;
}


function ruleSignals(rule) {

  if (
    rule?.mode ===
    "TRANSFORM_SIGNALS"
  ) {

    return [
      ...rule.signals,
    ];
  }

  return (
    Array.isArray(
      rule?.positions
    )
      ? rule.positions
      : []
  )
    .map(
      (position) => ({
        position,
        transform:
          "RAW_GROUP",
      })
    );
}


function applyTop3Radar360Rescue({
  lotteryKey,
  date,
  closeHour,
  drawLast,
  computedTop = [],
  publicApi = null,

  enabled =
    process.env
      .TOP3_RADAR360_RESCUE !==
    "0",
} = {}) {

  const engineTop =
    Array.isArray(
      computedTop
    )
      ? computedTop
      : [];

  if (!enabled) {

    return {
      top:
        engineTop,

      applied:
        false,

      reason:
        "DISABLED",
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
      top:
        engineTop,

      applied:
        false,

      reason:
        "NO_CERTIFIED_RULE",

      key,
    };
  }

  const rawPreviousHour =
    publicApi &&
    typeof
      publicApi.pickDrawHour ===
      "function"
      ? publicApi.pickDrawHour(
          drawLast
        )
      : (
          drawLast?.hour ??
          drawLast?.closeHour ??
          drawLast?.hourBucket
        );

  const previousHour =
    normalizeHour(
      rawPreviousHour
    );

  if (
    previousHour !==
    rule.previousHour
  ) {

    return {
      top:
        engineTop,

      applied:
        false,

      reason:
        "PREVIOUS_HOUR_MISMATCH",

      key,

      expectedPreviousHour:
        rule.previousHour,

      actualPreviousHour:
        previousHour,
    };
  }

  const signals =
    ruleSignals(
      rule
    );

  const rescueEntries =
    signals.map(
      (signal) => ({

        position:
          Number(
            signal.position
          ),

        transform:
          String(
            signal.transform ||
            "RAW_GROUP"
          ),

        signal:
          `P${signal.position}:` +
          String(
            signal.transform ||
            "RAW_GROUP"
          ),

        group:
          signalToGroup(
            drawLast,
            signal
          ),
      })
    );

  const rescueGroups =
    uniqueGroups(
      rescueEntries.map(
        (entry) =>
          entry.group
      )
    );

  const engineGroups =
    uniqueGroups(
      engineTop.map(
        (item) =>
          item?.grupo
      )
    );

  /*
   * Sinal certificado entra primeiro.
   *
   * Havendo grupos repetidos entre
   * sinais, o motor completa as vagas.
   */
  const finalGroups =
    uniqueGroups([
      ...rescueGroups,
      ...engineGroups,
    ])
      .slice(
        0,
        3
      );

  if (
    rescueGroups.length === 0 ||
    finalGroups.length < 3
  ) {

    return {
      top:
        engineTop,

      applied:
        false,

      reason:
        "INSUFFICIENT_RESCUE_GROUPS",

      key,
      ruleId:
        rule.id,
      ruleMode:
        rule.mode,
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
              Number(
                item?.grupo
              ) ===
              group
          );

        const source =
          rescueEntries.find(
            (entry) =>
              entry.group ===
              group
          );

        return {
          ...(
            engineItem ||
            {}
          ),

          grupo:
            group,

          score:
            Number(
              engineItem?.score ||
              0
            ),

          scoreProb:
            Number(
              engineItem?.scoreProb ||
              0
            ),

          probability:
            Number(
              engineItem?.probability ||
              0
            ),

          confidence:
            Number(
              engineItem?.confidence ||
              0
            ),

          meta: {
            ...(
              engineItem?.meta &&
              typeof
                engineItem.meta ===
                "object"
                ? engineItem.meta
                : {}
            ),

            radar360Rescue:
              true,

            radar360Version:
              "V2",

            radar360RuleId:
              rule.id,

            radar360RuleMode:
              rule.mode,

            radar360Source:
              rule.source,

            radar360SourcePosition:
              source?.position ??
              null,

            radar360Transform:
              source?.transform ??
              null,

            radar360Signal:
              source?.signal ??
              null,

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

    applied:
      true,

    reason:
      rule.mode ===
      "TRANSFORM_SIGNALS"
        ? "CERTIFIED_TRANSFORM_RESCUE"
        : "CERTIFIED_POSITION_RESCUE",

    key,

    ruleId:
      rule.id,

    ruleMode:
      rule.mode,

    ruleSource:
      rule.source,

    previousHour,

    positions:
      rescueEntries.map(
        (entry) =>
          entry.position
      ),

    signals:
      rescueEntries.map(
        (entry) =>
          entry.signal
      ),

    rescueGroups,
    engineGroups,
    finalGroups,

    observedRate:
      rule.observedRate,

    observedCases:
      rule.observedCases,
  };
}


module.exports = {
  RULES,
  normalizeHour,
  dowCode,
  groupFromEnding,
  groupFromNumber,
  extractPrizeGroup,
  extractMilhar4,
  signalToGroup,
  applyTop3Radar360Rescue,
};
