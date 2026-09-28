import {
  buildRadarHistoryViewEntry,
  radarHistoryScheduleForView,
} from './radarHistory.firestore';

import {
  buildRadarCards,
} from './radarTop1Top7Engine';

describe(
  'Radar History View V4',
  () => {
    test(
      'Nacional 28/09/2026 possui oito horarios oficiais',
      () => {
        expect(
          radarHistoryScheduleForView({
            lotteryKey:
              'NACIONAL',

            targetYmd:
              '2026-09-28',
          })
        ).toEqual([
          '02:00',
          '08:00',
          '10:00',
          '12:00',
          '15:00',
          '17:00',
          '21:00',
          '23:00',
        ]);
      }
    );

    test(
      'TOP1 e TOP7 sao classificados independentemente',
      () => {
        const source = {
          d1:
            '6632',

          d2:
            '7827',

          d3:
            '2147',
        };

        const cardsTop7 =
          buildRadarCards({
            mode:
              'TOP7',

            ...source,
          });

        const cardTop7 =
          cardsTop7[0];

        const milhar =
          cardTop7
            .rows[0]
            .numbers[0]
            .milhar;

        const draw = {
          hour:
            '17:00',

          prizes: [
            {
              position:
                1,

              milhar,

              grupo:
                cardTop7.group,
            },
          ],
        };

        const top1 =
          buildRadarHistoryViewEntry({
            lotteryKey:
              'NACIONAL',

            targetYmd:
              '2026-09-28',

            targetHour:
              '17:00',

            mode:
              'TOP1',

            source,
            draw,
          });

        const top7 =
          buildRadarHistoryViewEntry({
            lotteryKey:
              'NACIONAL',

            targetYmd:
              '2026-09-28',

            targetHour:
              '17:00',

            mode:
              'TOP7',

            source,
            draw,
          });

        expect(
          top1.hitType
        ).toBe(
          'miss'
        );

        expect(
          top7.hitType
        ).toBe(
          'hit_exact'
        );

        expect(
          top7.resultPosition
        ).toBe(
          1
        );

        expect(
          top7.predictionPosition
        ).toBe(
          1
        );
      }
    );
  }
);