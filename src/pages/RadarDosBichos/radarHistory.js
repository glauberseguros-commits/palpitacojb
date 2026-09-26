const HIT_WEIGHT = Object.freeze({
  hit_exact: 5,
  hit_centena: 4,
  hit_dezena: 3,
  hit_grupo: 2,
  miss: 0,
});

function safeString(value) {
  return String(value ?? '').trim();
}

function onlyDigits(value) {
  return safeString(value).replace(/\D+/g, '');
}

function normalizeMilhar(value) {
  const digits = onlyDigits(value);

  if (!digits) {
    return '';
  }

  if (digits.length >= 4) {
    return digits
      .slice(-4)
      .padStart(4, '0');
  }

  return digits;
}

function unique(values) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .filter(Boolean)
    )
  );
}

export function normalizeRadarHistoryMode(
  value
) {
  const mode =
    safeString(value)
      .toUpperCase();

  if (
    mode !== 'TOP1' &&
    mode !== 'TOP7'
  ) {
    throw new Error(
      `RADAR_HISTORY_INVALID_MODE=${mode || 'EMPTY'}`
    );
  }

  return mode;
}

export function normalizeRadarHistoryHour(
  value
) {
  const raw =
    safeString(value)
      .toLowerCase()
      .replace('h', ':');

  const match =
    raw.match(
      /^(\d{1,2})(?::(\d{1,2}))?$/
    );

  if (!match) {
    throw new Error(
      `RADAR_HISTORY_INVALID_HOUR=${raw || 'EMPTY'}`
    );
  }

  const hour =
    Number(match[1]);

  const minute =
    Number(
      match[2] || 0
    );

  if (
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    throw new Error(
      `RADAR_HISTORY_INVALID_HOUR=${raw}`
    );
  }

  return (
    `${String(hour).padStart(2, '0')}:` +
    `${String(minute).padStart(2, '0')}`
  );
}

export function radarPredictionId({
  lotteryKey,
  targetYmd,
  targetHour,
  mode,
} = {}) {
  const lottery =
    safeString(lotteryKey)
      .toUpperCase();

  const ymd =
    safeString(targetYmd);

  const hour =
    normalizeRadarHistoryHour(
      targetHour
    );

  const normalizedMode =
    normalizeRadarHistoryMode(
      mode
    );

  if (!lottery) {
    throw new Error(
      'RADAR_HISTORY_LOTTERY_REQUIRED'
    );
  }

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(
      ymd
    )
  ) {
    throw new Error(
      'RADAR_HISTORY_DATE_REQUIRED'
    );
  }

  return [
    lottery,
    ymd,
    hour.replace(/\D/g, ''),
    normalizedMode,
  ].join('__');
}

function sourceDay(source, key) {
  const fromDays =
    source?.days?.[key];

  const raw =
    fromDays?.milhar ??
    source?.[key];

  return {
    date:
      safeString(
        fromDays?.date
      ),

    hour:
      safeString(
        fromDays?.hour
      ),

    milhar:
      normalizeMilhar(
        raw
      ),
  };
}

export function buildRadarHistorySourceSnapshot(
  source
) {
  const d1 =
    sourceDay(
      source,
      'd1'
    );

  const d2 =
    sourceDay(
      source,
      'd2'
    );

  const d3 =
    sourceDay(
      source,
      'd3'
    );

  for (
    const [key, item]
    of Object.entries({
      d1,
      d2,
      d3,
    })
  ) {
    if (
      !/^\d{4}$/.test(
        item.milhar
      )
    ) {
      throw new Error(
        `RADAR_HISTORY_INVALID_${key.toUpperCase()}`
      );
    }
  }

  return {
    d1,
    d2,
    d3,
  };
}

function normalizeRow(row) {
  const dezena =
    onlyDigits(
      row?.dezena
    )
      .padStart(2, '0')
      .slice(-2);

  const numbers =
    Array.isArray(
      row?.numbers
    )
      ? row.numbers
      : [];

  const normalizedNumbers =
    numbers
      .map(
        (item) => {
          const milhar =
            normalizeMilhar(
              item?.milhar
            );

          const centena =
            onlyDigits(
              item?.centena ||
              milhar
            )
              .padStart(3, '0')
              .slice(-3);

          return {
            centena,
            milhar,
          };
        }
      )
      .filter(
        (item) =>
          /^\d{3}$/.test(
            item.centena
          ) &&
          /^\d{4}$/.test(
            item.milhar
          )
      );

  return {
    dezena,
    numbers:
      normalizedNumbers,
  };
}

export function buildRadarPredictionSnapshot({
  mode,
  cards,
} = {}) {
  const normalizedMode =
    normalizeRadarHistoryMode(
      mode
    );

  const expectedCount =
    normalizedMode === 'TOP1'
      ? 4
      : 7;

  if (
    !Array.isArray(cards) ||
    cards.length !==
      expectedCount
  ) {
    throw new Error(
      `RADAR_HISTORY_CARD_COUNT_INVALID=${Array.isArray(cards) ? cards.length : 0}`
    );
  }

  return cards.map(
    (card, index) => {
      const group =
        Number(
          card?.group
        );

      if (
        !Number.isInteger(group) ||
        group < 1 ||
        group > 25
      ) {
        throw new Error(
          `RADAR_HISTORY_INVALID_GROUP=${group}`
        );
      }

      const rows =
        (
          Array.isArray(
            card?.rows
          )
            ? card.rows
            : []
        ).map(
          normalizeRow
        );

      if (
        rows.length !== 4
      ) {
        throw new Error(
          `RADAR_HISTORY_ROW_COUNT_INVALID=${rows.length}`
        );
      }

      const dezenas =
        unique(
          rows.map(
            (row) =>
              row.dezena
          )
        );

      const centenas =
        unique(
          rows.flatMap(
            (row) =>
              row.numbers.map(
                (item) =>
                  item.centena
              )
          )
        );

      const milhares =
        unique(
          rows.flatMap(
            (row) =>
              row.numbers.map(
                (item) =>
                  item.milhar
              )
          )
        );

      return {
        position:
          index + 1,

        rank:
          Number(
            card?.rank
          ) ||
          index + 1,

        group,

        dezenas,

        centenas,

        milhares,

        rows,
      };
    }
  );
}

export function radarGroupFromDigits(
  value
) {
  const digits =
    onlyDigits(value);

  if (!digits) {
    return null;
  }

  const dezena =
    Number(
      digits
        .padStart(2, '0')
        .slice(-2)
    );

  if (dezena === 0) {
    return 25;
  }

  if (
    dezena < 1 ||
    dezena > 99
  ) {
    return null;
  }

  return Math.ceil(
    dezena / 4
  );
}

export function normalizeRadarPrize(
  prize,
  index = 0
) {
  const position =
    Number(
      prize?.position ??
      prize?.posicao ??
      prize?.pos ??
      prize?.rank ??
      index + 1
    );

  const raw =
    prize?.milhar ??
    prize?.displayValue ??
    prize?.raw ??
    prize?.value ??
    prize?.number ??
    prize?.numero ??
    '';

  const digits =
    onlyDigits(raw);

  if (!digits) {
    return null;
  }

  const value =
    position === 7
      ? digits
          .slice(-3)
          .padStart(3, '0')
      : digits
          .slice(-4)
          .padStart(4, '0');

  const group =
    Number(
      prize?.grupo ??
      prize?.group ??
      radarGroupFromDigits(
        value
      )
    );

  return {
    position:
      Number.isInteger(
        position
      )
        ? position
        : index + 1,

    value,

    group:
      Number.isInteger(
        group
      )
        ? group
        : radarGroupFromDigits(
            value
          ),
  };
}

function hitAgainstCard(
  card,
  prize
) {
  const value =
    prize.value;

  const resultCentena =
    value
      .slice(-3)
      .padStart(3, '0');

  const resultDezena =
    value
      .slice(-2)
      .padStart(2, '0');

  const resultGroup =
    prize.group ??
    radarGroupFromDigits(
      value
    );

  if (
    value.length >= 4 &&
    card.milhares.includes(
      value.slice(-4)
    )
  ) {
    return {
      hitType:
        'hit_exact',

      matchedValue:
        value.slice(-4),

      matchedMilhar:
        value.slice(-4),

      matchedCentena:
        resultCentena,

      matchedDezena:
        resultDezena,
    };
  }

  const matchedMilharByCentena =
    card.milhares.find(
      (milhar) =>
        milhar.slice(-3) ===
        resultCentena
    ) || '';

  if (
    card.centenas.includes(
      resultCentena
    )
  ) {
    return {
      hitType:
        'hit_centena',

      matchedValue:
        resultCentena,

      matchedMilhar:
        matchedMilharByCentena,

      matchedCentena:
        resultCentena,

      matchedDezena:
        resultDezena,
    };
  }

  if (
    card.dezenas.includes(
      resultDezena
    )
  ) {
    return {
      hitType:
        'hit_dezena',

      matchedValue:
        resultDezena,

      matchedMilhar:
        '',

      matchedCentena:
        '',

      matchedDezena:
        resultDezena,
    };
  }

  if (
    Number(card.group) ===
    Number(resultGroup)
  ) {
    return {
      hitType:
        'hit_grupo',

      matchedValue:
        String(
          resultGroup
        ),

      matchedMilhar:
        '',

      matchedCentena:
        '',

      matchedDezena:
        resultDezena,
    };
  }

  return {
    hitType:
      'miss',

    matchedValue:
      '',

    matchedMilhar:
      '',

    matchedCentena:
      '',

    matchedDezena:
      '',
  };
}

export function analyzeRadarPrediction({
  snapshot,
  prizes,
} = {}) {
  const cards =
    Array.isArray(snapshot)
      ? snapshot
      : [];

  const normalizedPrizes =
    (
      Array.isArray(prizes)
        ? prizes
        : []
    )
      .map(
        normalizeRadarPrize
      )
      .filter(Boolean);

  const hits = [];

  for (
    const card
    of cards
  ) {
    for (
      const prize
      of normalizedPrizes
    ) {
      const analysis =
        hitAgainstCard(
          card,
          prize
        );

      if (
        analysis.hitType ===
        'miss'
      ) {
        continue;
      }

      hits.push({
        ...analysis,

        hitScore:
          HIT_WEIGHT[
            analysis.hitType
          ] || 0,

        predictionPosition:
          Number(
            card.position
          ),

        predictionRank:
          Number(
            card.rank
          ),

        matchedGrupo:
          Number(
            card.group
          ),

        resultPosition:
          Number(
            prize.position
          ),

        resultMilhar:
          prize.value,

        resultGrupo:
          prize.group,
      });
    }
  }

  hits.sort(
    (a, b) =>
      b.hitScore -
        a.hitScore ||
      a.resultPosition -
        b.resultPosition ||
      a.predictionPosition -
        b.predictionPosition
  );

  const primary =
    hits[0] ||
    null;

  return {
    hitType:
      primary?.hitType ||
      'miss',

    hitScore:
      primary?.hitScore ||
      0,

    hitPosition:
      primary?.predictionPosition ??
      null,

    predictionPosition:
      primary?.predictionPosition ??
      null,

    predictionRank:
      primary?.predictionRank ??
      null,

    resultPosition:
      primary?.resultPosition ??
      null,

    matchedGrupo:
      primary?.matchedGrupo ??
      null,

    matchedMilhar:
      primary?.matchedMilhar ||
      '',

    matchedCentena:
      primary?.matchedCentena ||
      '',

    matchedDezena:
      primary?.matchedDezena ||
      '',

    matchedValue:
      primary?.matchedValue ||
      '',

    hitCount:
      hits.length,

    hits,
  };
}

function saoPauloParts(
  date
) {
  const formatter =
    new Intl.DateTimeFormat(
      'en-CA',
      {
        timeZone:
          'America/Sao_Paulo',

        year:
          'numeric',

        month:
          '2-digit',

        day:
          '2-digit',

        hour:
          '2-digit',

        minute:
          '2-digit',

        hour12:
          false,
      }
    );

  const parts =
    Object.fromEntries(
      formatter
        .formatToParts(
          date
        )
        .filter(
          (part) =>
            part.type !==
            'literal'
        )
        .map(
          (part) => [
            part.type,
            part.value,
          ]
        )
    );

  return {
    ymd:
      `${parts.year}-${parts.month}-${parts.day}`,

    hour:
      `${parts.hour}:${parts.minute}`,
  };
}

export function isRadarSlotOpenForSnapshot({
  targetYmd,
  targetHour,
  now = new Date(),
} = {}) {
  const ymd =
    safeString(
      targetYmd
    );

  const hour =
    normalizeRadarHistoryHour(
      targetHour
    );

  const current =
    saoPauloParts(
      now
    );

  if (
    ymd >
    current.ymd
  ) {
    return true;
  }

  if (
    ymd <
    current.ymd
  ) {
    return false;
  }

  return (
    hour >
    current.hour
  );
}

export function radarHitLabel(
  hitType
) {
  switch (
    safeString(
      hitType
    )
  ) {
    case 'hit_exact':
      return 'MILHAR';

    case 'hit_centena':
      return 'CENTENA';

    case 'hit_dezena':
      return 'DEZENA';

    case 'hit_grupo':
      return 'GRUPO';

    default:
      return 'ERRO';
  }
}