import {
  buildRadarCards,
} from './radarTop1Top7Engine';

/*
 * RADAR_PARITY_REGRESSION_V1
 *
 * Casos reais confirmados visualmente em producao.
 *
 * Este arquivo e totalmente offline.
 * Nao possui dependencias externas em tempo de teste.
 */

const CASES = [
  {
    key:
      'TOP1_PT_RIO_20260926_09',

    mode:
      'TOP1',

    source: {
      d1: '6658',
      d2: '2398',
      d3: '9353',
    },

    expectedGroups: [
      8,
      16,
      17,
      20,
    ],

    expectedPrefixes: [
      '58',
      '53',
      '65',
      '39',
    ],
  },

  {
    key:
      'TOP1_LOOK_20260926_07',

    mode:
      'TOP1',

    source: {
      d1: '6776',
      d2: '9322',
      d3: '7528',
    },

    expectedGroups: [
      12,
      1,
      2,
      3,
    ],

    expectedPrefixes: [
      '76',
      '22',
      '28',
      '77',
    ],
  },

  {
    key:
      'TOP1_NACIONAL_20260926_02',

    mode:
      'TOP1',

    source: {
      d1: '1640',
      d2: '9201',
      d3: '0912',
    },

    expectedGroups: [
      16,
      22,
      24,
      21,
    ],

    expectedPrefixes: [
      '40',
      '01',
      '12',
      '64',
    ],
  },

  {
    key:
      'TOP7_PT_RIO_20260926_09',

    mode:
      'TOP7',

    source: {
      d1: '6658',
      d2: '2398',
      d3: '9353',
    },

    expectedGroups: [
      14,
      18,
      19,
      20,
      17,
      16,
      8,
    ],

    expectedPrefixes: [
      '58',
      '53',
      '65',
      '39',
    ],
  },

  {
    key:
      'TOP7_LOOK_20260926_07',

    mode:
      'TOP7',

    source: {
      d1: '6776',
      d2: '9322',
      d3: '7528',
    },

    expectedGroups: [
      7,
      5,
      4,
      3,
      2,
      1,
      12,
    ],

    expectedPrefixes: [
      '76',
      '22',
      '28',
      '77',
    ],
  },
];

describe(
  'Radar dos Bichos - paridade real',
  () => {
    for (const fixture of CASES) {
      test(
        fixture.key,
        () => {
          const cards =
            buildRadarCards({
              mode:
                fixture.mode,

              ...fixture.source,
            });

          expect(
            cards.map(
              (card) =>
                card.group
            )
          ).toEqual(
            fixture.expectedGroups
          );

          expect(
            cards
          ).toHaveLength(
            fixture.expectedGroups.length
          );

          for (const card of cards) {
            expect(
              card.rows
            ).toHaveLength(
              4
            );

            expect(
              card.milhares
            ).toHaveLength(
              16
            );

            for (const row of card.rows) {
              expect(
                row.numbers
              ).toHaveLength(
                4
              );

              const milhares =
                row.numbers.map(
                  (number) =>
                    number.milhar
                );

              const expected =
                fixture.expectedPrefixes.map(
                  (prefix) =>
                    `${prefix}${row.dezena}`
                );

              expect(
                milhares
              ).toEqual(
                expected
              );

              expect(
                new Set(
                  milhares
                ).size
              ).toBe(
                4
              );
            }
          }
        }
      );
    }

    test(
      'contrato possui os cinco casos reais',
      () => {
        expect(
          CASES
        ).toHaveLength(
          5
        );

        expect(
          CASES.filter(
            (item) =>
              item.mode ===
              'TOP1'
          )
        ).toHaveLength(
          3
        );

        expect(
          CASES.filter(
            (item) =>
              item.mode ===
              'TOP7'
          )
        ).toHaveLength(
          2
        );
      }
    );

    test(
      'fontes D1 D2 D3 permanecem milhares validas',
      () => {
        for (const fixture of CASES) {
          for (
            const value
            of Object.values(
              fixture.source
            )
          ) {
            expect(
              value
            ).toMatch(
              /^\d{4}$/
            );
          }
        }
      }
    );
  }
);