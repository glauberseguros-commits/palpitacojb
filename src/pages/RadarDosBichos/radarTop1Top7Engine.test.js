import {
  RADAR_MODE_RANKS,
  buildRadarCards,
  buildRadarSelection,
  radarGroupFromMilhar,
  radarOfficialDezenas,
} from './radarTop1Top7Engine';

describe(
  'Radar dos Bichos TOP1/TOP7',
  () => {
    const source = {
      d1: '6632',
      d2: '7827',
      d3: '2147',
    };

    test(
      'mapeia dezenas para grupos oficiais',
      () => {
        expect(
          radarGroupFromMilhar(
            '0001'
          )
        ).toBe(1);

        expect(
          radarGroupFromMilhar(
            '0004'
          )
        ).toBe(1);

        expect(
          radarGroupFromMilhar(
            '0005'
          )
        ).toBe(2);

        expect(
          radarGroupFromMilhar(
            '0097'
          )
        ).toBe(25);

        expect(
          radarGroupFromMilhar(
            '0000'
          )
        ).toBe(25);
      }
    );

    test(
      'TOP1 usa exatamente ranks 7,6,5,4',
      () => {
        const result =
          buildRadarSelection({
            mode:
              'TOP1',
            ...source,
          });

        expect(
          result.map(
            (item) =>
              item.rank
          )
        ).toEqual(
          RADAR_MODE_RANKS
            .TOP1
        );

        expect(
          result
        ).toHaveLength(
          4
        );
      }
    );

    test(
      'TOP7 usa exatamente ranks 1 a 7',
      () => {
        const result =
          buildRadarSelection({
            mode:
              'TOP7',
            ...source,
          });

        expect(
          result.map(
            (item) =>
              item.rank
          )
        ).toEqual(
          RADAR_MODE_RANKS
            .TOP7
        );

        expect(
          result
        ).toHaveLength(
          7
        );
      }
    );

    test(
      'resultado e deterministico',
      () => {
        const first =
          buildRadarSelection({
            mode:
              'TOP7',
            ...source,
          });

        const second =
          buildRadarSelection({
            mode:
              'TOP7',
            ...source,
          });

        expect(
          second
        ).toEqual(
          first
        );
      }
    );

    test(
      'cada bicho possui 4 dezenas e 16 milhares',
      () => {
        const cards =
          buildRadarCards({
            mode:
              'TOP1',
            ...source,
          });

        for (
          const card
          of cards
        ) {
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

          for (
            const row
            of card.rows
          ) {
            expect(
              row.numbers
            ).toHaveLength(
              4
            );

            expect(
              new Set(
                row.numbers.map(
                  (number) =>
                    number.centena
                )
              ).size
            ).toBe(
              4
            );
          }
        }
      }
    );

    test(
      'grupo 25 possui dezenas 97,98,99,00',
      () => {
        expect(
          radarOfficialDezenas(
            25
          )
        ).toEqual([
          '97',
          '98',
          '99',
          '00',
        ]);
      }
    );

    test(
      'rejeita modo invalido',
      () => {
        expect(
          () =>
            buildRadarSelection({
              mode:
                'TOP3',
              ...source,
            })
        ).toThrow(
          'RADAR_INVALID_MODE'
        );
      }
    );

    test(
      'rejeita fonte historica invalida',
      () => {
        expect(
          () =>
            buildRadarSelection({
              mode:
                'TOP1',
              d1:
                '1234',
              d2:
                '',
              d3:
                '5678',
            })
        ).toThrow(
          'RADAR_INVALID_MILHAR'
        );
      }
    );
  }
);