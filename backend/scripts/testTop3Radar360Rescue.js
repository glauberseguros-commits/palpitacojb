"use strict";

const assert =
  require("assert");

const {
  RULES,
  groupFromEnding,
  extractPrizeGroup,
  signalToGroup,
  applyTop3Radar360Rescue,
} =
  require(
    "../engine/top3Radar360Rescue"
  );


assert.strictEqual(
  Object.keys(RULES).length,
  18
);


/* ============================================================
 * CONTRATO P7 = CENTENA
 * ============================================================
 */

assert.strictEqual(
  groupFromEnding("097"),
  25
);

assert.strictEqual(
  groupFromEnding("058"),
  15
);

assert.strictEqual(
  groupFromEnding("039"),
  10
);

assert.strictEqual(
  groupFromEnding("000"),
  25
);


/* ============================================================
 * INVENTARIO DE REGRAS
 * ============================================================
 */

const requiredKeys = [
  "LOOK|SAB|09:00",
  "PT_RIO|SEG|18:00",
  "PT_RIO|TER|16:00",
  "PT_RIO|QUI|16:00",
  "PT_RIO|SAB|16:00",
  "PT_SP|SEG|20:00",

  "LOOK|DOM|21:00",
  "LOOK|SAB|14:00",
  "LOOK|QUA|21:00",
  "PT_RIO|DOM|14:00",
  "PT_SP|SEX|13:00",
  "PT_SP|QUI|12:00",
  "NACIONAL|TER|10:00",

  "PT_RIO|SAB|09:00",
  "PT_RIO|QUI|09:00",
  "PT_RIO|SEX|11:00",
];

for (
  const key
  of requiredKeys
) {

  assert.ok(
    RULES[key],
    `Regra ausente: ${key}`
  );
}


/* ============================================================
 * V1 CONTINUA FUNCIONANDO
 * ============================================================
 */

const previousV1 = {
  hour:
    "07:00",

  prizes: [
    {
      position: 1,
      milhar: "1111",
    },
    {
      position: 2,
      milhar: "2222",
    },
    {
      position: 3,
      milhar: "3333",
    },
    {
      position: 4,
      milhar: "4444",
    },
    {
      position: 5,
      milhar: "5555",
    },
    {
      position: 6,
      milhar: "6666",
    },
    {
      position: 7,
      centena: "058",
    },
  ],
};

assert.strictEqual(
  extractPrizeGroup(
    previousV1,
    7
  ),
  15
);

const v1 =
  applyTop3Radar360Rescue({
    lotteryKey:
      "LOOK",

    date:
      "2026-09-12",

    closeHour:
      "09:00",

    drawLast:
      previousV1,

    computedTop: [
      { grupo: 1 },
      { grupo: 2 },
      { grupo: 3 },
    ],

    publicApi: {
      pickDrawHour:
        (draw) =>
          draw.hour,
    },
  });

assert.strictEqual(
  v1.applied,
  true
);

assert.deepStrictEqual(
  v1.rescueGroups,
  [9, 14, 15]
);

assert.deepStrictEqual(
  v1.finalGroups,
  [9, 14, 15]
);


/* ============================================================
 * NOVA REGRA RAW R2.1
 * LOOK DOM 18 -> 21
 * ============================================================
 */

const previousRaw = {
  ...previousV1,
  hour:
    "18:00",
};

const rawV2 =
  applyTop3Radar360Rescue({
    lotteryKey:
      "LOOK",

    date:
      "2026-09-13",

    closeHour:
      "21:00",

    drawLast:
      previousRaw,

    computedTop: [
      { grupo: 1 },
      { grupo: 2 },
      { grupo: 3 },
    ],

    publicApi: {
      pickDrawHour:
        (draw) =>
          draw.hour,
    },
  });

assert.strictEqual(
  rawV2.applied,
  true
);

assert.deepStrictEqual(
  rawV2.positions,
  [2, 3, 4]
);

assert.deepStrictEqual(
  rawV2.rescueGroups,
  [6, 9, 11]
);


/* ============================================================
 * R3 STRONG
 * RJ SAB 21 -> 09
 *
 * P1 COMP100_AB
 * 1234 -> AB=12 -> 100-12=88 -> G22
 *
 * P3 CD_MINUS_AB
 * 5678 -> 78-56=22 -> G06
 *
 * P4 AC_PLUS_BD
 * 9012 -> 91+02=93 -> G24
 * ============================================================
 */

const previousR3Sab = {
  hour:
    "21:00",

  prizes: [
    {
      position: 1,
      milhar: "1234",
    },
    {
      position: 2,
      milhar: "2222",
    },
    {
      position: 3,
      milhar: "5678",
    },
    {
      position: 4,
      milhar: "9012",
    },
    {
      position: 5,
      milhar: "5555",
    },
    {
      position: 6,
      milhar: "6666",
    },
    {
      position: 7,
      centena: "058",
    },
  ],
};

assert.strictEqual(
  signalToGroup(
    previousR3Sab,
    {
      position: 1,
      transform:
        "COMP100_AB",
    }
  ),
  22
);

assert.strictEqual(
  signalToGroup(
    previousR3Sab,
    {
      position: 3,
      transform:
        "CD_MINUS_AB",
    }
  ),
  6
);

assert.strictEqual(
  signalToGroup(
    previousR3Sab,
    {
      position: 4,
      transform:
        "AC_PLUS_BD",
    }
  ),
  24
);

const r3Sab =
  applyTop3Radar360Rescue({
    lotteryKey:
      "PT_RIO",

    date:
      "2026-09-12",

    closeHour:
      "09:00",

    drawLast:
      previousR3Sab,

    computedTop: [
      { grupo: 1 },
      { grupo: 2 },
      { grupo: 3 },
    ],

    publicApi: {
      pickDrawHour:
        (draw) =>
          draw.hour,
    },
  });

assert.strictEqual(
  r3Sab.applied,
  true
);

assert.deepStrictEqual(
  r3Sab.rescueGroups,
  [22, 6, 24]
);

assert.deepStrictEqual(
  r3Sab.signals,
  [
    "P1:COMP100_AB",
    "P3:CD_MINUS_AB",
    "P4:AC_PLUS_BD",
  ]
);


/* ============================================================
 * R3 STRONG
 * RJ QUI 21 -> 09
 *
 * P2 CA: 1234 -> 31 -> G08
 * P5 CA: 5678 -> 75 -> G19
 * P6 AC: 9012 -> 91 -> G23
 * ============================================================
 */

const previousR3Qui = {
  hour:
    "21:00",

  prizes: [
    {
      position: 1,
      milhar: "1111",
    },
    {
      position: 2,
      milhar: "1234",
    },
    {
      position: 3,
      milhar: "3333",
    },
    {
      position: 4,
      milhar: "4444",
    },
    {
      position: 5,
      milhar: "5678",
    },
    {
      position: 6,
      milhar: "9012",
    },
    {
      position: 7,
      centena: "058",
    },
  ],
};

const r3Qui =
  applyTop3Radar360Rescue({
    lotteryKey:
      "PT_RIO",

    date:
      "2026-09-10",

    closeHour:
      "09:00",

    drawLast:
      previousR3Qui,

    computedTop: [
      { grupo: 1 },
      { grupo: 2 },
      { grupo: 3 },
    ],

    publicApi: {
      pickDrawHour:
        (draw) =>
          draw.hour,
    },
  });

assert.strictEqual(
  r3Qui.applied,
  true
);

assert.deepStrictEqual(
  r3Qui.rescueGroups,
  [8, 19, 23]
);


/* ============================================================
 * R3 GREEN
 * RJ SEX 09 -> 11
 *
 * P2 AB: 1234 -> 12 -> G03
 * P5 BA: 5678 -> 65 -> G17
 * P6 BC: 9012 -> 01 -> G01
 * ============================================================
 */

const previousR3Sex = {
  hour:
    "09:00",

  prizes: [
    {
      position: 1,
      milhar: "1111",
    },
    {
      position: 2,
      milhar: "1234",
    },
    {
      position: 3,
      milhar: "3333",
    },
    {
      position: 4,
      milhar: "4444",
    },
    {
      position: 5,
      milhar: "5678",
    },
    {
      position: 6,
      milhar: "9012",
    },
    {
      position: 7,
      centena: "058",
    },
  ],
};

const r3Sex =
  applyTop3Radar360Rescue({
    lotteryKey:
      "PT_RIO",

    date:
      "2026-09-11",

    closeHour:
      "11:00",

    drawLast:
      previousR3Sex,

    computedTop: [
      { grupo: 24 },
      { grupo: 25 },
      { grupo: 20 },
    ],

    publicApi: {
      pickDrawHour:
        (draw) =>
          draw.hour,
    },
  });

assert.strictEqual(
  r3Sex.applied,
  true
);

assert.deepStrictEqual(
  r3Sex.rescueGroups,
  [3, 17, 1]
);


/* ============================================================
 * CONTEXTO NAO CERTIFICADO = MOTOR INTOCADO
 * ============================================================
 */

const untouched =
  applyTop3Radar360Rescue({
    lotteryKey:
      "LOOK",

    date:
      "2026-09-09",

    closeHour:
      "16:00",

    drawLast:
      previousV1,

    computedTop: [
      { grupo: 4 },
      { grupo: 5 },
      { grupo: 6 },
    ],

    publicApi: {
      pickDrawHour:
        (draw) =>
          draw.hour,
    },
  });

assert.strictEqual(
  untouched.applied,
  false
);

assert.deepStrictEqual(
  untouched.top.map(
    (item) =>
      Number(
        item.grupo
      )
  ),
  [4, 5, 6]
);


/* ============================================================
 * KILL SWITCH = MOTOR INTOCADO
 * ============================================================
 */

const disabled =
  applyTop3Radar360Rescue({
    lotteryKey:
      "PT_RIO",

    date:
      "2026-09-12",

    closeHour:
      "09:00",

    drawLast:
      previousR3Sab,

    computedTop: [
      { grupo: 7 },
      { grupo: 8 },
      { grupo: 9 },
    ],

    enabled:
      false,

    publicApi: {
      pickDrawHour:
        (draw) =>
          draw.hour,
    },
  });

assert.strictEqual(
  disabled.applied,
  false
);

assert.deepStrictEqual(
  disabled.top.map(
    (item) =>
      Number(
        item.grupo
      )
  ),
  [7, 8, 9]
);



/*
 * ============================================================
 * RADAR360 H2H RJ V3
 * ============================================================
 */

const radarH2hV3 =
  require(
    "../engine/top3Radar360Rescue"
  );

assert.strictEqual(
  Object.keys(
    radarH2hV3.RULES
  ).length,
  18
);

assert.ok(
  radarH2hV3.RULES[
    "PT_RIO|TER|14:00"
  ]
);

assert.ok(
  radarH2hV3.RULES[
    "PT_RIO|SEX|18:00"
  ]
);

/*
 * TERCA 11 -> 14
 *
 * P1 1234 -> CA = 31 -> G08
 * P3 5678 -> AC = 57 -> G15
 * P6 9012 -> PROD_OUTER = 80 -> G20
 */
const previousH2hTer = {
  hour:
    "11:00",

  prizes: [
    {
      position: 1,
      milhar: "1234",
    },
    {
      position: 2,
      milhar: "2222",
    },
    {
      position: 3,
      milhar: "5678",
    },
    {
      position: 4,
      milhar: "4444",
    },
    {
      position: 5,
      milhar: "5555",
    },
    {
      position: 6,
      milhar: "9012",
    },
    {
      position: 7,
      centena: "058",
    },
  ],
};

const h2hTer =
  radarH2hV3
    .applyTop3Radar360Rescue({
      lotteryKey:
        "PT_RIO",

      date:
        "2026-09-15",

      closeHour:
        "14:00",

      drawLast:
        previousH2hTer,

      computedTop: [
        { grupo: 1 },
        { grupo: 2 },
        { grupo: 3 },
      ],

      publicApi: {
        pickDrawHour:
          draw =>
            draw.hour,
      },
    });

assert.strictEqual(
  h2hTer.applied,
  true
);

assert.strictEqual(
  h2hTer.ruleId,
  "PT_RIO_TER_11_14_R3_H2H_PASS_V3"
);

assert.deepStrictEqual(
  h2hTer.rescueGroups,
  [
    8,
    15,
    20,
  ]
);

assert.deepStrictEqual(
  h2hTer.finalGroups,
  [
    8,
    15,
    20,
  ]
);

/*
 * SEXTA 16 -> 18
 *
 * P5 1234 -> PROD_CROSS = 38 -> G10
 *
 * P7 = CENTENA 058
 * ABC = 0,5,8
 * COMP99_AB = 99 - 05 = 94 -> G24
 *
 * P5 1234 -> CB = 32 -> G08
 */
const previousH2hSex = {
  hour:
    "16:00",

  prizes: [
    {
      position: 1,
      milhar: "1111",
    },
    {
      position: 2,
      milhar: "2222",
    },
    {
      position: 3,
      milhar: "3333",
    },
    {
      position: 4,
      milhar: "4444",
    },
    {
      position: 5,
      milhar: "1234",
    },
    {
      position: 6,
      milhar: "6666",
    },
    {
      position: 7,

      /*
       * Mesmo que exista algum campo
       * estranho chamado milhar,
       * a transformacao deve usar
       * EXCLUSIVAMENTE a centena.
       */
      centena:
        "058",

      milhar:
        "9999",
    },
  ],
};

const h2hSex =
  radarH2hV3
    .applyTop3Radar360Rescue({
      lotteryKey:
        "PT_RIO",

      date:
        "2026-09-11",

      closeHour:
        "18:00",

      drawLast:
        previousH2hSex,

      computedTop: [
        { grupo: 1 },
        { grupo: 2 },
        { grupo: 3 },
      ],

      publicApi: {
        pickDrawHour:
          draw =>
            draw.hour,
      },
    });

assert.strictEqual(
  h2hSex.applied,
  true
);

assert.strictEqual(
  h2hSex.ruleId,
  "PT_RIO_SEX_16_18_R3_H2H_PASS_V3"
);

assert.deepStrictEqual(
  h2hSex.rescueGroups,
  [
    10,
    24,
    8,
  ]
);

assert.deepStrictEqual(
  h2hSex.finalGroups,
  [
    10,
    24,
    8,
  ]
);

/*
 * KILL SWITCH continua soberano.
 */
const h2hDisabled =
  radarH2hV3
    .applyTop3Radar360Rescue({
      lotteryKey:
        "PT_RIO",

      date:
        "2026-09-15",

      closeHour:
        "14:00",

      drawLast:
        previousH2hTer,

      computedTop: [
        { grupo: 1 },
        { grupo: 2 },
        { grupo: 3 },
      ],

      enabled:
        false,

      publicApi: {
        pickDrawHour:
          draw =>
            draw.hour,
      },
    });

assert.strictEqual(
  h2hDisabled.applied,
  false
);

assert.deepStrictEqual(
  h2hDisabled.top.map(
    item =>
      Number(
        item.grupo
      )
  ),
  [
    1,
    2,
    3,
  ]
);

/*
 * QUA 14 continua FORA.
 */
const h2hQuaNotApproved =
  radarH2hV3
    .applyTop3Radar360Rescue({
      lotteryKey:
        "PT_RIO",

      date:
        "2026-09-16",

      closeHour:
        "14:00",

      drawLast: {
        ...previousH2hTer,
        hour:
          "11:00",
      },

      computedTop: [
        { grupo: 4 },
        { grupo: 5 },
        { grupo: 6 },
      ],

      publicApi: {
        pickDrawHour:
          draw =>
            draw.hour,
      },
    });

assert.strictEqual(
  h2hQuaNotApproved.applied,
  false
);

assert.deepStrictEqual(
  h2hQuaNotApproved.top.map(
    item =>
      Number(
        item.grupo
      )
  ),
  [
    4,
    5,
    6,
  ]
);

/*
 * SEX 16 continua FORA.
 */
const h2hSex16NotApproved =
  radarH2hV3
    .applyTop3Radar360Rescue({
      lotteryKey:
        "PT_RIO",

      date:
        "2026-09-11",

      closeHour:
        "16:00",

      drawLast: {
        ...previousH2hSex,
        hour:
          "14:00",
      },

      computedTop: [
        { grupo: 4 },
        { grupo: 5 },
        { grupo: 6 },
      ],

      publicApi: {
        pickDrawHour:
          draw =>
            draw.hour,
      },
    });

assert.strictEqual(
  h2hSex16NotApproved.applied,
  false
);

/*
 * DOM 14 continua com a antiga
 * regra 11 -> 14, portanto NAO
 * fazemos a troca indevida 21 -> 14.
 */
const dom14Stale =
  radarH2hV3
    .applyTop3Radar360Rescue({
      lotteryKey:
        "PT_RIO",

      date:
        "2026-09-13",

      closeHour:
        "14:00",

      drawLast: {
        hour:
          "21:00",

        prizes:
          previousH2hTer.prizes,
      },

      computedTop: [
        { grupo: 1 },
        { grupo: 2 },
        { grupo: 3 },
      ],

      publicApi: {
        pickDrawHour:
          draw =>
            draw.hour,
      },
    });

assert.strictEqual(
  dom14Stale.applied,
  false
);

assert.strictEqual(
  dom14Stale.reason,
  "PREVIOUS_HOUR_MISMATCH"
);

console.log(
  "TOP3_RADAR360_H2H_RJ_V3_SMOKE=PASS"
);


console.log(
  "TOP3_RADAR360_RESCUE_V2_SMOKE=PASS"
);
