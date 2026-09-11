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


    "PT_SP|QUA|12:00":
      rawRule({
        id:
          "PT_SP_QUA_10_12_P2_P4_P5_H2H_PASS_V4",

        previousHour:
          "10:00",

        positions:
          [2, 4, 5],

        observedRate:
          13 / 36,

        observedCases:
          36,

        source:
          "R21_H2H_PASS_2026",
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



/*
 * ============================================================
 * RADAR360_H2H_APPROVED_RJ_V3
 * ============================================================
 *
 * Ativacao seletiva posterior a H2H evento-a-evento.
 *
 * PT_RIO TER 11 -> 14
 * CURRENT 12/36
 * OVERLAY 15/36
 * RESCUES 13
 * DESTROYS 10
 * NET +3
 * MISS_MAX 8 -> 5
 *
 * PT_RIO SEX 16 -> 18
 * CURRENT 13/36
 * OVERLAY 16/36
 * RESCUES 8
 * DESTROYS 5
 * NET +3
 * MISS_MAX 10 -> 5
 *
 * P7 permanece CENTENA ABC de 3 digitos.
 *
 * As 16 regras anteriores continuam delegadas integralmente
 * ao applyTop3Radar360Rescue original.
 * ============================================================
 */

const RADAR360_H2H_VERSION =
  "RADAR360_H2H_APPROVED_RJ_V3";

const H2H_APPROVED_RULES =
  Object.freeze({

    "PT_RIO|TER|14:00":
      Object.freeze({
        id:
          "PT_RIO_TER_11_14_R3_H2H_PASS_V3",

        mode:
          "TRANSFORM_SIGNALS",

        previousHour:
          "11:00",

        signals:
          Object.freeze([
            Object.freeze({
              position: 1,
              transform: "CA",
            }),

            Object.freeze({
              position: 3,
              transform: "AC",
            }),

            Object.freeze({
              position: 6,
              transform:
                "PROD_OUTER",
            }),
          ]),

        /*
         * Taxa do candidato R3 puro
         * no holdout usado no gate.
         */
        observedRate:
          15 / 36,

        observedCases:
          36,

        source:
          "R3_WATCH_H2H_PASS",

        h2h:
          Object.freeze({
            currentHits: 12,
            overlayHits: 15,
            rescues: 13,
            destroys: 10,
            net: 3,
            currentMissMax: 8,
            overlayMissMax: 5,
            n: 36,
          }),
      }),

    "PT_RIO|SEX|14:00":
      Object.freeze({
        id:
          "PT_RIO_SEX_11_14_TRANSITION_RANK3_PASS_V1",

        mode:
          "TRANSITION_RANK3_RESCUE",

        previousHour:
          "11:00",

        discoveryEnd:
          "2026-07-10",

        expectedDiscoveryPairs:
          212,

        signals:
          Object.freeze([]),

        observedRate:
          3 / 8,

        observedCases:
          8,

        source:
          "ARCHIVED_8_TRANSITION_RESCUE_PASS",

        h2h:
          Object.freeze({
            currentHits: 2,
            overlayHits: 3,
            rescues: 1,
            destroys: 0,
            net: 1,
            n: 8,
          }),
      }),
    "PT_RIO|SEX|18:00":
      Object.freeze({
        id:
          "PT_RIO_SEX_16_18_R3_H2H_PASS_V3",

        mode:
          "TRANSFORM_SIGNALS",

        previousHour:
          "16:00",

        signals:
          Object.freeze([
            Object.freeze({
              position: 5,
              transform:
                "PROD_CROSS",
            }),

            Object.freeze({
              /*
               * IMPORTANTE:
               * P7 = CENTENA ABC,
               * nunca milhar.
               */
              position: 7,
              transform:
                "COMP99_AB",
            }),

            Object.freeze({
              position: 5,
              transform:
                "CB",
            }),
          ]),

        /*
         * Taxa do trio R3 puro.
         * O overlay H2H foi 16/36.
         */
        observedRate:
          14 / 36,

        observedCases:
          36,

        source:
          "R3_WATCH_H2H_PASS",

        h2h:
          Object.freeze({
            currentHits: 13,
            overlayHits: 16,
            rescues: 8,
            destroys: 5,
            net: 3,
            currentMissMax: 10,
            overlayMissMax: 5,
            n: 36,
          }),
      }),
  });

const RADAR360_ALL_RULES_V3 =
  Object.freeze({
    ...RULES,
    ...H2H_APPROVED_RULES,
  });

function h2hSafeArray(
  value
) {
  return Array.isArray(value)
    ? value
    : [];
}

function h2hNormalizeLotteryKey(
  value
) {

  const key =
    String(value || "")
      .trim()
      .toUpperCase();

  if (
    key === "RJ" ||
    key === "RIO" ||
    key === "PT-RIO"
  ) {
    return "PT_RIO";
  }

  return key;
}

function h2hNormalizeHour(
  value
) {

  const raw =
    String(value ?? "")
      .trim()
      .toLowerCase()
      .replace("h", ":")
      .replace(".", ":");

  const match =
    raw.match(
      /^(\d{1,2})(?::(\d{1,2}))?$/
    );

  if (!match) {
    return "";
  }

  const hour =
    Number(match[1]);

  const minute =
    Number(match[2] ?? 0);

  if (
    !Number.isInteger(hour) ||
    hour < 0 ||
    hour > 23 ||
    !Number.isInteger(minute) ||
    minute < 0 ||
    minute > 59
  ) {
    return "";
  }

  return (
    String(hour)
      .padStart(2, "0") +
    ":" +
    String(minute)
      .padStart(2, "0")
  );
}

function h2hDowCode(
  ymd
) {

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(
      String(ymd || "")
    )
  ) {
    return "";
  }

  const day =
    new Date(
      String(ymd) +
      "T12:00:00Z"
    ).getUTCDay();

  return (
    [
      "DOM",
      "SEG",
      "TER",
      "QUA",
      "QUI",
      "SEX",
      "SAB",
    ][day] || ""
  );
}

function h2hDigits(
  value
) {
  return String(
    value ?? ""
  ).replace(
    /\D/g,
    ""
  );
}

function h2hPrizePosition(
  prize,
  fallback,
  publicApi
) {

  if (
    publicApi &&
    typeof publicApi.guessPrizePos ===
      "function"
  ) {
    try {

      const viaApi =
        Number(
          publicApi.guessPrizePos(
            prize
          )
        );

      if (
        Number.isInteger(viaApi) &&
        viaApi >= 1 &&
        viaApi <= 15
      ) {
        return viaApi;
      }
    }
    catch (_) {}
  }

  for (
    const candidate
    of [
      prize?.position,
      prize?.posicao,
      prize?.pos,
      prize?.colocacao,
      prize?.rank,
      fallback,
    ]
  ) {

    const number =
      Number(candidate);

    if (
      Number.isInteger(number) &&
      number >= 1 &&
      number <= 15
    ) {
      return number;
    }
  }

  return null;
}

function h2hGetPrize(
  draw,
  position,
  publicApi
) {

  const prizes =
    h2hSafeArray(
      draw?.prizes
    );

  const exact =
    prizes.find(
      (
        prize,
        index
      ) =>
        h2hPrizePosition(
          prize,
          index + 1,
          publicApi
        ) === position
    );

  return (
    exact ||
    prizes[position - 1] ||
    null
  );
}

/*
 * P1-P6 = MILHAR ABCD.
 *
 * P7 e explicitamente proibido
 * nesta funcao.
 */
function h2hMilhar4(
  draw,
  position,
  publicApi
) {

  if (position === 7) {
    return null;
  }

  const prize =
    h2hGetPrize(
      draw,
      position,
      publicApi
    );

  if (!prize) {
    return null;
  }

  const raw =
    prize?.milhar ??
    prize?.numero ??
    prize?.number ??
    prize?.valor ??
    prize?.value ??
    prize?.result ??
    "";

  let digits =
    h2hDigits(raw);

  if (!digits) {
    return null;
  }

  if (digits.length > 4) {
    digits =
      digits.slice(-4);
  }

  return digits.padStart(
    4,
    "0"
  );
}

/*
 * P7 = CENTENA ABC.
 *
 * 97  -> 097
 * 097 -> 097
 *
 * NUNCA usa campo "milhar".
 * NUNCA padStart(4).
 */
function h2hCentena3P7(
  draw,
  publicApi
) {

  const prize =
    h2hGetPrize(
      draw,
      7,
      publicApi
    );

  if (!prize) {
    return null;
  }

  const raw =
    prize?.centena ??
    prize?.numero ??
    prize?.number ??
    prize?.valor ??
    prize?.value ??
    prize?.result ??
    "";

  const digits =
    h2hDigits(raw);

  if (
    !digits ||
    digits.length > 3
  ) {
    return null;
  }

  return digits.padStart(
    3,
    "0"
  );
}

function h2hPair(
  a,
  b
) {
  return (
    Number(a) * 10 +
    Number(b)
  );
}

function h2hGroupFromEnding(
  value
) {

  if (
    !Number.isFinite(
      Number(value)
    )
  ) {
    return null;
  }

  let ending =
    Math.trunc(
      Number(value)
    );

  ending =
    (
      (ending % 100) +
      100
    ) % 100;

  const normalized =
    ending === 0
      ? 100
      : ending;

  const group =
    Math.ceil(
      normalized / 4
    );

  return (
    group >= 1 &&
    group <= 25
  )
    ? group
    : null;
}

function h2hUniqueGroups(
  values
) {

  const output = [];
  const seen =
    new Set();

  for (
    const raw
    of h2hSafeArray(values)
  ) {

    const group =
      Number(raw);

    if (
      !Number.isInteger(group) ||
      group < 1 ||
      group > 25 ||
      seen.has(group)
    ) {
      continue;
    }

    seen.add(group);
    output.push(group);
  }

  return output;
}

function h2hTransformMilhar4(
  transform,
  raw
) {

  if (
    !/^\d{4}$/.test(
      String(raw || "")
    )
  ) {
    return null;
  }

  const [
    A,
    B,
    C,
    D
  ] =
    raw
      .split("")
      .map(Number);

  switch (transform) {

    case "CA":
      return h2hPair(
        C,
        A
      );

    case "AC":
      return h2hPair(
        A,
        C
      );

    case "CB":
      return h2hPair(
        C,
        B
      );

    case "PROD_OUTER":
      return (
        ((A * D) % 10) * 10 +
        ((B * C) % 10)
      );

    case "PROD_CROSS":
      return (
        ((A * C) % 10) * 10 +
        ((B * D) % 10)
      );

    default:
      return null;
  }
}

function h2hTransformCentena3(
  transform,
  raw
) {

  if (
    !/^\d{3}$/.test(
      String(raw || "")
    )
  ) {
    return null;
  }

  const [
    A,
    B,
    C
  ] =
    raw
      .split("")
      .map(Number);

  switch (transform) {

    case "COMP99_AB":
      return (
        99 -
        h2hPair(
          A,
          B
        )
      );

    case "CA":
      return h2hPair(
        C,
        A
      );

    case "AC":
      return h2hPair(
        A,
        C
      );

    case "CB":
      return h2hPair(
        C,
        B
      );

    default:
      return null;
  }
}

function h2hSignalEntries(
  drawLast,
  rule,
  publicApi
) {

  const entries = [];

  for (
    const signal
    of h2hSafeArray(
      rule?.signals
    )
  ) {

    let sourceValue =
      null;

    let transformed =
      null;

    if (
      Number(signal.position) === 7
    ) {

      sourceValue =
        h2hCentena3P7(
          drawLast,
          publicApi
        );

      if (!sourceValue) {
        return [];
      }

      transformed =
        h2hTransformCentena3(
          signal.transform,
          sourceValue
        );
    }
    else {

      sourceValue =
        h2hMilhar4(
          drawLast,
          Number(
            signal.position
          ),
          publicApi
        );

      if (!sourceValue) {
        return [];
      }

      transformed =
        h2hTransformMilhar4(
          signal.transform,
          sourceValue
        );
    }

    const group =
      h2hGroupFromEnding(
        transformed
      );

    if (!group) {
      return [];
    }

    entries.push({
      position:
        Number(
          signal.position
        ),

      transform:
        signal.transform,

      sourceValue,

      transformed,

      group,
    });
  }

  return entries;
}

/*
 * Wrapper V3.
 *
 * Primeiro delega ao Radar V2 original.
 * Isso preserva:
 * - kill switch;
 * - as 16 regras existentes;
 * - comportamento de fallback.
 *
 * Somente quando o contexto pertence
 * aos dois H2H aprovados executa
 * a camada nova.
 */
function h2hTransitionYmd(
  draw,
  publicApi
) {

  let value = "";

  if (
    publicApi &&
    typeof publicApi.pickDrawYMD ===
      "function"
  ) {

    try {
      value =
        publicApi.pickDrawYMD(
          draw
        );
    }
    catch (_) {}
  }

  if (!value) {
    value =
      draw?.ymd ??
      draw?.date ??
      draw?.drawDate ??
      "";
  }

  return String(
    value
  ).slice(
    0,
    10
  );
}

function h2hTransitionHour(
  draw,
  publicApi
) {

  let value = "";

  if (
    publicApi &&
    typeof publicApi.pickDrawHour ===
      "function"
  ) {

    try {
      value =
        publicApi.pickDrawHour(
          draw
        );
    }
    catch (_) {}
  }

  if (!value) {
    value =
      draw?.closeHour ??
      draw?.hour ??
      draw?.hourBucket ??
      "";
  }

  return h2hNormalizeHour(
    value
  );
}

function h2hTransitionPodiumGroups(
  draw
) {

  const prizes =
    h2hSafeArray(
      draw?.prizes
    );

  const rows =
    prizes
      .map(
        (
          prize,
          index
        ) => {

          const position =
            Number(
              prize?.position ??
              prize?.pos ??
              prize?.rank ??
              (
                index + 1
              )
            );

          let group =
            Number(
              prize?.grupo ??
              prize?.group
            );

          if (
            !Number.isInteger(group) ||
            group < 1 ||
            group > 25
          ) {

            group =
              h2hGroupFromEnding(
                prize?.milhar ??
                prize?.value ??
                prize?.number ??
                prize?.numero ??
                ""
              );
          }

          return {
            position,
            group,
          };
        }
      )
      .filter(
        row =>
          row.position >= 1 &&
          row.position <= 3 &&
          Number.isInteger(
            row.group
          ) &&
          row.group >= 1 &&
          row.group <= 25
      )
      .sort(
        (a, b) =>
          a.position -
          b.position
      );

  return h2hUniqueGroups(
    rows.map(
      row =>
        row.group
    )
  ).slice(
    0,
    3
  );
}

function h2hBuildTransitionRank3Rescue({
  history = [],
  drawLast = null,
  engineGroups = [],
  rule = null,
  publicApi = null,
} = {}) {

  const byKey =
    new Map();

  const discoveryEnd =
    String(
      rule?.discoveryEnd ??
      ""
    );

  for (
    const draw
    of h2hSafeArray(history)
  ) {

    const ymd =
      h2hTransitionYmd(
        draw,
        publicApi
      );

    if (
      !ymd ||
      ymd > discoveryEnd ||
      h2hDowCode(ymd) !==
        "SEX"
    ) {
      continue;
    }

    const hour =
      h2hTransitionHour(
        draw,
        publicApi
      );

    if (
      hour !== "11:00" &&
      hour !== "14:00"
    ) {
      continue;
    }

    byKey.set(
      `${ymd}|${hour}`,
      draw
    );
  }

  const dates =
    Array.from(
      new Set(
        Array.from(
          byKey.keys()
        ).map(
          key =>
            key.slice(
              0,
              10
            )
        )
      )
    ).sort();

  const pairs = [];

  for (const ymd of dates) {

    const draw11 =
      byKey.get(
        `${ymd}|11:00`
      );

    const draw14 =
      byKey.get(
        `${ymd}|14:00`
      );

    if (!draw11 || !draw14) {
      continue;
    }

    const prev =
      h2hTransitionPodiumGroups(
        draw11
      );

    const target =
      h2hTransitionPodiumGroups(
        draw14
      );

    if (
      !prev.length ||
      !target.length
    ) {
      continue;
    }

    pairs.push({
      prev,
      target,
    });
  }

  if (
    pairs.length !==
    Number(
      rule?.expectedDiscoveryPairs
    )
  ) {
    return {
      ok: false,
      reason:
        "TRANSITION_DISCOVERY_DRIFT",
      discoveryPairs:
        pairs.length,
    };
  }

  const prevOccurrences =
    Array(26).fill(0);

  const transition =
    Array.from(
      { length: 26 },
      () =>
        Array(26).fill(0)
    );

  const globalTarget =
    Array(26).fill(0);

  for (const pair of pairs) {

    for (const g of pair.target) {
      globalTarget[g]++;
    }

    for (const p of pair.prev) {

      prevOccurrences[p]++;

      for (
        const g
        of pair.target
      ) {
        transition[p][g]++;
      }
    }
  }

  const previousGroups =
    h2hTransitionPodiumGroups(
      drawLast
    );

  if (!previousGroups.length) {
    return {
      ok: false,
      reason:
        "TRANSITION_PREVIOUS_PODIUM_MISSING",
    };
  }

  const championSet =
    new Set(
      h2hUniqueGroups(
        engineGroups
      )
    );

  const candidates = [];

  for (
    let g = 1;
    g <= 25;
    g++
  ) {

    if (championSet.has(g)) {
      continue;
    }

    let score = 0;

    for (
      const p
      of previousGroups
    ) {

      const denom =
        prevOccurrences[p];

      if (denom > 0) {
        score +=
          transition[p][g] /
          denom;
      }
    }

    candidates.push({
      group: g,
      score,
      global:
        globalTarget[g],
    });
  }

  candidates.sort(
    (a, b) =>
      b.score - a.score ||
      b.global - a.global ||
      a.group - b.group
  );

  const winner =
    candidates[0];

  if (!winner) {
    return {
      ok: false,
      reason:
        "TRANSITION_RESCUE_NOT_FOUND",
    };
  }

  return {
    ok: true,
    group:
      winner.group,
    score:
      winner.score,
    discoveryPairs:
      pairs.length,
    previousGroups,
  };
}
function applyTop3Radar360RescueH2hV3(
  input = {}
) {

  const base =
    applyTop3Radar360Rescue(
      input
    );

  /*
   * Kill switch do Radar original
   * continua soberano.
   */
  if (
    String(
      base?.reason ||
      ""
    ) === "DISABLED"
  ) {
    return base;
  }

  const lotteryKey =
    h2hNormalizeLotteryKey(
      input.lotteryKey
    );

  const date =
    String(
      input.date ??
      input.targetYmd ??
      ""
    );

  const closeHour =
    h2hNormalizeHour(
      input.closeHour ??
      input.targetHour
    );

  const key =
    lotteryKey +
    "|" +
    h2hDowCode(date) +
    "|" +
    closeHour;

  const rule =
    H2H_APPROVED_RULES[
      key
    ];

  /*
   * Todos os outros contextos:
   * exatamente o comportamento V2.
   */
  if (!rule) {
    return base;
  }

  const engineTop =
    h2hSafeArray(
      input.computedTop
    );

  const engineGroups =
    h2hUniqueGroups(
      engineTop.map(
        item =>
          item?.grupo ??
          item?.group
      )
    ).slice(
      0,
      3
    );

  /*
   * Fail closed:
   * se o motor nao forneceu trio valido,
   * nao tenta substituir nada.
   */
  if (
    engineGroups.length !== 3
  ) {
    return {
      ...base,
      top:
        engineTop,

      applied:
        false,

      reason:
        "INVALID_ENGINE_GROUPS",

      key,
    };
  }

  const publicApi =
    input.publicApi;

  let rawPreviousHour =
    "";

  if (
    publicApi &&
    typeof publicApi.pickDrawHour ===
      "function"
  ) {
    try {
      rawPreviousHour =
        publicApi.pickDrawHour(
          input.drawLast
        );
    }
    catch (_) {}
  }

  if (!rawPreviousHour) {
    rawPreviousHour =
      input.drawLast?.hour ??
      input.drawLast?.closeHour ??
      input.drawLast?.hourBucket ??
      "";
  }

  const previousHour =
    h2hNormalizeHour(
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

  let signalEntries = [];

  if (
    rule.mode ===
    "TRANSITION_RANK3_RESCUE"
  ) {

    const transition =
      h2hBuildTransitionRank3Rescue({
        history:
          input.history,
        drawLast:
          input.drawLast,
        engineGroups,
        rule,
        publicApi,
      });

    if (!transition?.ok) {
      return {
        top:
          engineTop,
        applied:
          false,
        reason:
          transition?.reason ??
          "TRANSITION_RESCUE_FAILED",
        key,
        engineGroups,
        rescueGroups:
          [],
        transition,
      };
    }

    signalEntries = [
      {
        position: 3,
        transform:
          "FRIDAY_11_TO_14_TRANSITION",
        group:
          transition.group,
        signal:
          transition,
      },
    ];
  }
  else {

    signalEntries =
      h2hSignalEntries(
        input.drawLast,
        rule,
        publicApi
      );

    if (
      signalEntries.length !==
      rule.signals.length
    ) {
      return {
        top:
          engineTop,
        applied:
          false,
        reason:
          "INSUFFICIENT_RESCUE_GROUPS",
        key,
        engineGroups,
        rescueGroups:
          [],
      };
    }
  }
  const rescueGroups =
    h2hUniqueGroups(
      signalEntries.map(
        entry =>
          entry.group
      )
    );

  /*
   * MESMA SEMANTICA DO H2H:
   *
   * regra primeiro;
   * motor completa somente
   * grupos unicos restantes.
   */
  const finalGroups =
    rule.mode ===
    "TRANSITION_RANK3_RESCUE"
      ? h2hUniqueGroups([
          engineGroups[0],
          engineGroups[1],
          ...rescueGroups,
          engineGroups[2],
        ]).slice(
          0,
          3
        )
      : h2hUniqueGroups([
          ...rescueGroups,
          ...engineGroups,
        ]).slice(
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
      rescueGroups,
      engineGroups,
    };
  }

  const top =
    finalGroups.map(
      (
        group,
        index
      ) => {

        const engineItem =
          engineTop.find(
            item =>
              Number(
                item?.grupo ??
                item?.group
              ) === group
          );

        const source =
          signalEntries.find(
            entry =>
              entry.group === group
          );

        return {
          ...(engineItem || {}),

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
              typeof engineItem.meta ===
                "object"
                ? engineItem.meta
                : {}
            ),

            radar360Rescue:
              true,

            radar360RuleId:
              rule.id,

            radar360Mode:
              rule.mode,

            radar360Source:
              rule.source,

            radar360SourcePosition:
              source?.position ??
              null,

            radar360Transform:
              source?.transform ??
              null,

            radar360ObservedRate:
              rule.observedRate,

            radar360ObservedCases:
              rule.observedCases,

            radar360Rank:
              index + 1,

            radar360H2hApproved:
              true,

            radar360H2hVersion:
              RADAR360_H2H_VERSION,
          },
        };
      }
    );

  return {
    top,

    applied:
      true,

    reason:
      "H2H_APPROVED_RULE",

    version:
      RADAR360_H2H_VERSION,

    key,

    ruleId:
      rule.id,

    mode:
      rule.mode,

    signals:
      signalEntries,

    positions:
      signalEntries
        .map(
          entry =>
            Number(
              entry.position
            )
        )
        .filter(
          Number.isFinite
        ),
    rescueGroups,
    engineGroups,
    finalGroups,

    observedRate:
      rule.observedRate,

    observedCases:
      rule.observedCases,

    source:
      rule.source,

    h2h:
      rule.h2h,
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

  /*
   * RADAR360_H2H_APPROVED_RJ_V3
   * exports soberanos.
   */
  RULES:
    RADAR360_ALL_RULES_V3,

  applyTop3Radar360Rescue:
    applyTop3Radar360RescueH2hV3,

  RADAR360_H2H_VERSION,

  H2H_APPROVED_RULES,

};

/*
 * RADAR360_H2H_EXPORT_FIX_V3
 */
module.exports.RULES =
  RADAR360_ALL_RULES_V3;

module.exports.applyTop3Radar360Rescue =
  applyTop3Radar360RescueH2hV3;

module.exports.RADAR360_H2H_VERSION =
  RADAR360_H2H_VERSION;

module.exports.H2H_APPROVED_RULES =
  H2H_APPROVED_RULES;
