import {
  buildRadarHistorySource,
  normalizeRadarHour,
  radarFirstPrizeMilhar,
  radarHourToMinutes,
} from './radarSource';

describe(
  'Radar dos Bichos - fonte D1/D2/D3',
  () => {
    function draw(
      date,
      hour,
      milhar
    ) {
      return {
        date,
        close_hour:
          hour,

        prizes: [
          {
            position:
              1,
            milhar,
          },
        ],
      };
    }

    test(
      'normaliza horarios do Palpitaco',
      () => {
        expect(
          normalizeRadarHour(
            '9h'
          )
        ).toBe(
          '09:00'
        );

        expect(
          normalizeRadarHour(
            '19:30'
          )
        ).toBe(
          '19:30'
        );

        expect(
          radarHourToMinutes(
            '11:40'
          )
        ).toBe(
          700
        );
      }
    );

    test(
      'extrai a milhar do primeiro premio',
      () => {
        expect(
          radarFirstPrizeMilhar({
            prizes: [
              {
                position:
                  2,
                milhar:
                  '2222',
              },
              {
                position:
                  1,
                milhar:
                  '0123',
              },
            ],
          })
        ).toBe(
          '0123'
        );
      }
    );

    test(
      'preserva milhar 0000',
      () => {
        expect(
          radarFirstPrizeMilhar({
            prizes: [
              {
                position:
                  1,
                milhar:
                  '0000',
              },
            ],
          })
        ).toBe(
          '0000'
        );
      }
    );

    test(
      'D1 D2 D3 sao os tres sorteios imediatamente anteriores',
      () => {
        const result =
          buildRadarHistorySource({
            lotteryKey:
              'PT_RIO',

            targetDate:
              '2026-09-25',

            targetHour:
              '16:00',

            draws: [
              draw(
                '2026-09-25',
                '09:00',
                '1001'
              ),
              draw(
                '2026-09-25',
                '11:00',
                '2002'
              ),
              draw(
                '2026-09-25',
                '14:00',
                '3003'
              ),
              draw(
                '2026-09-25',
                '16:00',
                '4004'
              ),
              draw(
                '2026-09-24',
                '21:00',
                '5005'
              ),
            ],
          });

        expect(
          result.days
        ).toEqual({
          d1: {
            date:
              '2026-09-25',
            hour:
              '14:00',
            milhar:
              '3003',
          },
          d2: {
            date:
              '2026-09-25',
            hour:
              '11:00',
            milhar:
              '2002',
          },
          d3: {
            date:
              '2026-09-25',
            hour:
              '09:00',
            milhar:
              '1001',
          },
        });
      }
    );

    test(
      'horario alvo nunca entra na propria previsao',
      () => {
        const result =
          buildRadarHistorySource({
            lotteryKey:
              'LOOK',

            targetDate:
              '2026-09-25',

            targetHour:
              '14:00',

            draws: [
              draw(
                '2026-09-24',
                '21:00',
                '1111'
              ),
              draw(
                '2026-09-25',
                '07:00',
                '2222'
              ),
              draw(
                '2026-09-25',
                '09:00',
                '3333'
              ),
              draw(
                '2026-09-25',
                '11:00',
                '4444'
              ),
              draw(
                '2026-09-25',
                '14:00',
                '9999'
              ),
              draw(
                '2026-09-25',
                '16:00',
                '8888'
              ),
            ],
          });

        expect(
          result.days.d1.milhar
        ).toBe(
          '4444'
        );

        expect(
          result.days.d2.milhar
        ).toBe(
          '3333'
        );

        expect(
          result.days.d3.milhar
        ).toBe(
          '2222'
        );

        expect(
          Object.values(
            result.days
          ).some(
            (item) =>
              item.milhar ===
              '9999'
          )
        ).toBe(
          false
        );
      }
    );

    test(
      'atravessa dias quando necessario',
      () => {
        const result =
          buildRadarHistorySource({
            lotteryKey:
              'FEDERAL',

            targetDate:
              '2026-09-27',

            targetHour:
              '11:30',

            draws: [
              draw(
                '2026-09-20',
                '11:30',
                '1111'
              ),
              draw(
                '2026-09-23',
                '20:00',
                '2222'
              ),
              draw(
                '2026-09-24',
                '09:00',
                '3333'
              ),
              draw(
                '2026-09-26',
                '18:00',
                '4444'
              ),
            ],
          });

        expect(
          result.history.selected.map(
            (item) =>
              item.milhar
          )
        ).toEqual([
          '4444',
          '3333',
          '2222',
        ]);
      }
    );

    test(
      'deduplica documentos do mesmo sorteio',
      () => {
        const result =
          buildRadarHistorySource({
            lotteryKey:
              'PT_SP',

            targetDate:
              '2026-09-25',

            targetHour:
              '17:00',

            draws: [
              draw(
                '2026-09-25',
                '10:00',
                '1111'
              ),
              draw(
                '2026-09-25',
                '12:00',
                '2222'
              ),
              draw(
                '2026-09-25',
                '15:00',
                '3333'
              ),
              draw(
                '2026-09-25',
                '15:00',
                '3333'
              ),
            ],
          });

        expect(
          result.history.selected
        ).toHaveLength(
          3
        );

        expect(
          result.history.selected.map(
            (item) =>
              item.hour
          )
        ).toEqual([
          '15:00',
          '12:00',
          '10:00',
        ]);
      }
    );

    test(
      'bloqueia historico com menos de tres resultados validos',
      () => {
        expect(
          () =>
            buildRadarHistorySource({
              lotteryKey:
                'PT_RIO',

              targetDate:
                '2026-09-25',

              targetHour:
                '11:00',

              draws: [
                draw(
                  '2026-09-25',
                  '09:00',
                  '1234'
                ),
              ],
            })
        ).toThrow(
          'RADAR_SOURCE_HISTORY_INSUFFICIENT'
        );
      }
    );
  }
);