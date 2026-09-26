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
      'D1 D2 D3 usam tres datas distintas',
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
                '9999'
              ),

              draw(
                '2026-09-24',
                '09:00',
                '4004'
              ),
              draw(
                '2026-09-24',
                '21:00',
                '5005'
              ),

              draw(
                '2026-09-23',
                '21:00',
                '6006'
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
              '2026-09-24',

            hour:
              '21:00',

            milhar:
              '5005',
          },

          d3: {
            date:
              '2026-09-23',

            hour:
              '21:00',

            milhar:
              '6006',
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
              '07:00',

            draws: [
              draw(
                '2026-09-25',
                '07:00',
                '9999'
              ),
              draw(
                '2026-09-24',
                '07:00',
                '1111'
              ),
              draw(
                '2026-09-24',
                '23:00',
                '2222'
              ),
              draw(
                '2026-09-23',
                '23:00',
                '3333'
              ),
              draw(
                '2026-09-22',
                '23:00',
                '4444'
              ),
            ],
          });

        expect(
          result.days
        ).toEqual({
          d1: {
            date:
              '2026-09-24',

            hour:
              '23:00',

            milhar:
              '2222',
          },

          d2: {
            date:
              '2026-09-23',

            hour:
              '23:00',

            milhar:
              '3333',
          },

          d3: {
            date:
              '2026-09-22',

            hour:
              '23:00',

            milhar:
              '4444',
          },
        });

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
      'reproduz a regra de referencia D1 D2 D3',
      () => {
        const result =
          buildRadarHistorySource({
            lotteryKey:
              'PT_RIO',

            targetDate:
              '2026-09-15',

            targetHour:
              '09:00',

            draws: [
              draw(
                '2026-09-15',
                '09:00',
                '9999'
              ),

              draw(
                '2026-09-14',
                '09:00',
                '1111'
              ),
              draw(
                '2026-09-14',
                '21:00',
                '4497'
              ),

              draw(
                '2026-09-13',
                '11:00',
                '2222'
              ),
              draw(
                '2026-09-13',
                '16:00',
                '8267'
              ),

              draw(
                '2026-09-12',
                '21:00',
                '5028'
              ),
            ],
          });

        expect(
          result.days
        ).toEqual({
          d1: {
            date:
              '2026-09-14',

            hour:
              '21:00',

            milhar:
              '4497',
          },

          d2: {
            date:
              '2026-09-13',

            hour:
              '16:00',

            milhar:
              '8267',
          },

          d3: {
            date:
              '2026-09-12',

            hour:
              '21:00',

            milhar:
              '5028',
          },
        });
      }
    );

    test(
      'deduplica documentos e mantem uma data por D',
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
                '15:00',
                '3333'
              ),
              draw(
                '2026-09-25',
                '15:00',
                '3333'
              ),
              draw(
                '2026-09-25',
                '12:00',
                '2222'
              ),

              draw(
                '2026-09-24',
                '20:00',
                '4444'
              ),
              draw(
                '2026-09-24',
                '20:00',
                '4444'
              ),

              draw(
                '2026-09-23',
                '20:00',
                '5555'
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
              '15:00',

            milhar:
              '3333',
          },

          d2: {
            date:
              '2026-09-24',

            hour:
              '20:00',

            milhar:
              '4444',
          },

          d3: {
            date:
              '2026-09-23',

            hour:
              '20:00',

            milhar:
              '5555',
          },
        });
      }
    );

    test(
      'bloqueia historico com menos de tres datas validas',
      () => {
        expect(
          () =>
            buildRadarHistorySource({
              lotteryKey:
                'PT_RIO',

              targetDate:
                '2026-09-25',

              targetHour:
                '17:00',

              draws: [
                draw(
                  '2026-09-25',
                  '09:00',
                  '1111'
                ),
                draw(
                  '2026-09-25',
                  '11:00',
                  '2222'
                ),
                draw(
                  '2026-09-25',
                  '14:00',
                  '3333'
                ),
                draw(
                  '2026-09-24',
                  '21:00',
                  '4444'
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