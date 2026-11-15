import {
  buildRadarHistoryViewEntry,
} from './radarHistory.firestore';

import {
  buildRadarCards,
} from './radarTop1Top7Engine';

import {
  applyRadarCentenas24,
} from './radarCentenas24';

vi.mock('./radarCentenas24', () => ({
  applyRadarCentenas24: vi.fn((cards, context) => {
    if (!context?.valid) {
      throw new Error('CONTEXTO_INVALIDO');
    }

    return cards.map((card, index) => {
      if (index !== 0) return card;

      const rows = card.rows.map((row, rowIndex) => ({
        ...row,
        numbers: row.numbers.map((item, itemIndex) =>
          rowIndex === 0 && itemIndex === 0
            ? { ...item, milhar: '1195' }
            : item
        ),
      }));

      return {
        ...card,
        rows,
        milhares: rows.flatMap((row) =>
          row.numbers.map((item) => item.milhar)
        ),
        centenas: [],

      };
    });
  }),

  loadRadarCentenas24Context: vi.fn(),
}));

describe('RADAR LOOK - integracao centena 195', () => {
  test('motor contextual reconhece 1195 x 195 no P7', () => {
    const source = {
      d1: '6776',
      d2: '9322',
      d3: '7528',
    };

    const baseCards = buildRadarCards({
      mode: 'TOP7',
      ...source,
    });

    const firstGroup = baseCards[0].group;

    const result = buildRadarHistoryViewEntry({
      lotteryKey: 'LOOK',
      targetYmd: '2026-11-15',
      targetHour: '11:00',
      mode: 'TOP7',
      source,
      centenasContext: {
        valid: true,
        prizes: [],
        historicalPrizes: [],
      },
      draw: {
        hour: '11:00',
        prizes: [{
          position: 7,
          milhar: '195',
          grupo: firstGroup,
        }],
      },
    });

    expect(applyRadarCentenas24).toHaveBeenCalled();

    expect(result.status).toBe('validated');

    const hits = result.hits || [];

    const centena = hits.find((hit) =>
      hit.hitType === 'hit_centena' &&
      Number(hit.resultPosition) === 7 &&
      String(hit.matchedMilhar) === '1195'
    );


    expect(centena).toBeDefined();
    expect(String(centena.matchedValue)).toBe('195');

  });
  test('sem contexto nao atribui acerto retrospectivo', () => {
    const result = buildRadarHistoryViewEntry({
      lotteryKey: 'LOOK',
      targetYmd: '2026-11-15',
      targetHour: '11:00',
      mode: 'TOP7',
      source: {
        d1: '6776',
        d2: '9322',
        d3: '7528',
      },
      requireCentenasContext: true,
      draw: {
        prizes: [{
          position: 7,
          milhar: '195',
          grupo: 24,
        }],
      },
    });

    expect(result.status).toBe('source_unavailable');
    expect(result.hitType).toBeNull();
  });
});
