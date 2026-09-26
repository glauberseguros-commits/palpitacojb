import {
  analyzeRadarPrediction,
  buildRadarPredictionSnapshot,
  isRadarSlotOpenForSnapshot,
  radarHitLabel,
  radarPredictionId,
} from './radarHistory';

import {
  normalizeRadarOfficialDraws,
} from './radarHistory.firestore';

function card({
  group,
  rank,
  prefix = '40',
}) {
  const first =
    group === 25
      ? 97
      : (group - 1) * 4 + 1;

  const dezenas =
    group === 25
      ? ['97', '98', '99', '00']
      : [
          first,
          first + 1,
          first + 2,
          first + 3,
        ].map(
          (value) =>
            String(value)
              .padStart(2, '0')
        );

  return {
    group,
    rank,

    rows:
      dezenas.map(
        (dezena) => ({
          dezena,

          numbers: [
            {
              centena:
                `${prefix[1]}${dezena}`,

              milhar:
                `${prefix}${dezena}`,
            },
            {
              centena:
                `1${dezena}`,

              milhar:
                `01${dezena}`,
            },
            {
              centena:
                `2${dezena}`,

              milhar:
                `12${dezena}`,
            },
            {
              centena:
                `4${dezena}`,

              milhar:
                `64${dezena}`,
            },
          ],
        })
      ),
  };
}

describe(
  'Radar history',
  () => {
    test(
      'id separa TOP1 e TOP7 no mesmo slot',
      () => {
        const common = {
          lotteryKey:
            'NACIONAL',

          targetYmd:
            '2026-09-26',

          targetHour:
            '02:00',
        };

        const top1 =
          radarPredictionId({
            ...common,
            mode:
              'TOP1',
          });

        const top7 =
          radarPredictionId({
            ...common,
            mode:
              'TOP7',
          });

        expect(
          top1
        ).not.toBe(
          top7
        );

        expect(
          top1
        ).toContain(
          'TOP1'
        );

        expect(
          top7
        ).toContain(
          'TOP7'
        );
      }
    );

    test(
      'snapshot TOP1 exige quatro cards',
      () => {
        const snapshot =
          buildRadarPredictionSnapshot({
            mode:
              'TOP1',

            cards: [
              card({
                group: 16,
                rank: 7,
              }),
              card({
                group: 22,
                rank: 6,
              }),
              card({
                group: 24,
                rank: 5,
              }),
              card({
                group: 21,
                rank: 4,
              }),
            ],
          });

        expect(
          snapshot
        ).toHaveLength(
          4
        );

        expect(
          snapshot[0].milhares
        ).toHaveLength(
          16
        );
      }
    );

    test(
      'Nacional 02h reconhece centena 496 no Veado',
      () => {
        const snapshot =
          buildRadarPredictionSnapshot({
            mode:
              'TOP1',

            cards: [
              card({
                group: 16,
                rank: 7,
              }),
              card({
                group: 22,
                rank: 6,
              }),
              card({
                group: 24,
                rank: 5,
              }),
              card({
                group: 21,
                rank: 4,
              }),
            ],
          });

        const veado =
          snapshot[2];

        veado.centenas =
          Array.from(
            new Set([
              ...veado.centenas,
              '496',
            ])
          );

        veado.milhares =
          Array.from(
            new Set([
              ...veado.milhares,
              '6496',
            ])
          );

        const result =
          analyzeRadarPrediction({
            snapshot,

            prizes: [
              {
                position: 1,
                milhar: '9496',
                grupo: 24,
              },
              {
                position: 2,
                milhar: '7846',
                grupo: 12,
              },
              {
                position: 3,
                milhar: '9207',
                grupo: 2,
              },
            ],
          });

        expect(
          result.hitType
        ).toBe(
          'hit_centena'
        );

        expect(
          result.resultPosition
        ).toBe(
          1
        );

        expect(
          result.predictionPosition
        ).toBe(
          3
        );

        expect(
          result.matchedGrupo
        ).toBe(
          24
        );

        expect(
          result.matchedCentena
        ).toBe(
          '496'
        );

        expect(
          result.matchedMilhar
        ).toBe(
          '6496'
        );

        expect(
          radarHitLabel(
            result.hitType
          )
        ).toBe(
          'CENTENA'
        );
      }
    );

    test(
      'milhar tem prioridade sobre centena dezena e grupo',
      () => {
        const snapshot =
          buildRadarPredictionSnapshot({
            mode:
              'TOP1',

            cards: [
              card({
                group: 16,
                rank: 7,
              }),
              card({
                group: 22,
                rank: 6,
              }),
              card({
                group: 24,
                rank: 5,
              }),
              card({
                group: 21,
                rank: 4,
              }),
            ],
          });

        snapshot[2].milhares.push(
          '9496'
        );

        snapshot[2].centenas.push(
          '496'
        );

        const result =
          analyzeRadarPrediction({
            snapshot,

            prizes: [
              {
                position: 1,
                milhar: '9496',
                grupo: 24,
              },
            ],
          });

        expect(
          result.hitType
        ).toBe(
          'hit_exact'
        );

        expect(
          radarHitLabel(
            result.hitType
          )
        ).toBe(
          'MILHAR'
        );
      }
    );

    test(
      'nao permite congelar previsao depois do horario alvo',
      () => {
        expect(
          isRadarSlotOpenForSnapshot({
            targetYmd:
              '2026-09-26',

            targetHour:
              '02:00',

            now:
              new Date(
                '2026-09-26T05:10:00.000Z'
              ),
          })
        ).toBe(
          false
        );

        expect(
          isRadarSlotOpenForSnapshot({
            targetYmd:
              '2026-09-26',

            targetHour:
              '08:00',

            now:
              new Date(
                '2026-09-26T05:10:00.000Z'
              ),
          })
        ).toBe(
          true
        );
      }
    );

    test(
      'normaliza sorteio oficial detalhado',
      () => {
        const draws =
          normalizeRadarOfficialDraws([
            {
              ymd:
                '2026-09-26',

              close_hour:
                '02:00',

              prizes: [
                {
                  position: 1,
                  milhar: '9496',
                  grupo: 24,
                },
                {
                  position: 2,
                  milhar: '7846',
                  grupo: 12,
                },
              ],
            },
          ]);

        expect(
          draws
        ).toHaveLength(
          1
        );

        expect(
          draws[0].hour
        ).toBe(
          '02:00'
        );

        expect(
          draws[0].prizes[0]
        ).toEqual(
          expect.objectContaining({
            position: 1,
            value: '9496',
            group: 24,
          })
        );
      }
    );
  }
);