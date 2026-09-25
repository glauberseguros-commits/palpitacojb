import {
  getKingResultsByRange,
} from '../../services/kingResultsService';

/*
 * PALPITACO_RADAR_NATIVE_SOURCE_V1
 *
 * Fonte exclusiva do Radar dos Bichos.
 *
 * Regra:
 *
 * Para LOTERIA + DATA + HORARIO alvo,
 * localizar os 3 sorteios validos imediatamente
 * anteriores ao alvo.
 *
 * De cada sorteio utilizar somente a milhar
 * do 1o premio.
 *
 * Ordem:
 * D1 = resultado anterior mais recente
 * D2 = segundo resultado anterior
 * D3 = terceiro resultado anterior
 *
 * O sorteio do proprio horario-alvo nunca pode
 * participar da previsao daquele horario.
 *
 * Nao acessa Firestore diretamente.
 * Usa o servico de resultados ja existente
 * no Palpitaco JB.
 */

export const RADAR_SOURCE_REQUIRED_DRAWS = 3;

export const RADAR_SOURCE_LOOKBACK_DAYS = 45;

function safeString(
  value
) {
  return String(
    value ??
    ''
  ).trim();
}

function isYmd(
  value
) {
  return /^\d{4}-\d{2}-\d{2}$/.test(
    safeString(
      value
    )
  );
}

function normalizeYmd(
  value
) {
  const ymd =
    safeString(
      value
    );

  if (!isYmd(ymd)) {
    throw new Error(
      `RADAR_SOURCE_INVALID_DATE=${ymd || 'EMPTY'}`
    );
  }

  return ymd;
}

export function radarHourToMinutes(
  value
) {
  const raw =
    safeString(
      value
    )
      .toLowerCase()
      .replace(
        /\s+/g,
        ''
      )
      .replace(
        /hs?$/,
        ''
      );

  if (!raw) {
    return null;
  }

  let hour;
  let minute;

  if (
    /^\d{1,2}$/.test(
      raw
    )
  ) {
    hour =
      Number(raw);

    minute =
      0;
  }
  else {
    const match =
      raw.match(
        /^(\d{1,2})[:h](\d{2})$/
      );

    if (!match) {
      return null;
    }

    hour =
      Number(
        match[1]
      );

    minute =
      Number(
        match[2]
      );
  }

  if (
    !Number.isInteger(
      hour
    ) ||
    !Number.isInteger(
      minute
    ) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }

  return (
    hour *
      60 +
    minute
  );
}

export function normalizeRadarHour(
  value
) {
  const minutes =
    radarHourToMinutes(
      value
    );

  if (minutes === null) {
    throw new Error(
      `RADAR_SOURCE_INVALID_HOUR=${safeString(value) || 'EMPTY'}`
    );
  }

  const hour =
    Math.floor(
      minutes /
      60
    );

  const minute =
    minutes %
    60;

  return (
    String(hour)
      .padStart(
        2,
        '0'
      ) +
    ':' +
    String(minute)
      .padStart(
        2,
        '0'
      )
  );
}

function drawDate(
  draw
) {
  const candidates = [
    draw?.date,
    draw?.ymd,
    draw?.drawDate,
  ];

  for (
    const value
    of candidates
  ) {
    const text =
      safeString(
        value
      );

    if (isYmd(text)) {
      return text;
    }
  }

  return '';
}

function drawHour(
  draw
) {
  const candidates = [
    draw?.close_hour,
    draw?.closeHour,
    draw?.hour,
    draw?.close,
    draw?.close_hour_raw,
    draw?.closeHourBucket,
  ];

  for (
    const value
    of candidates
  ) {
    const minutes =
      radarHourToMinutes(
        value
      );

    if (
      minutes !==
      null
    ) {
      return normalizeRadarHour(
        value
      );
    }
  }

  return '';
}

function prizePosition(
  prize,
  index
) {
  const value =
    Number(
      prize?.position ??
      prize?.posicao ??
      prize?.rank ??
      prize?.ordem ??
      prize?.pos ??
      (
        index +
        1
      )
    );

  return Number.isFinite(
    value
  )
    ? value
    : index + 1;
}

export function radarPrizeMilhar(
  prize
) {
  if (
    prize === null ||
    prize === undefined
  ) {
    return '';
  }

  if (
    typeof prize ===
      'string' ||
    typeof prize ===
      'number'
  ) {
    const digits =
      safeString(
        prize
      )
        .replace(
          /\D/g,
          ''
        );

    if (
      digits.length >
      4
    ) {
      return '';
    }

    return digits
      ? digits.padStart(
          4,
          '0'
        )
      : '';
  }

  const candidates = [
    prize?.milhar,
    prize?.numero,
    prize?.number,
    prize?.value,
    prize?.raw,
    prize?.displayValue,
    prize?.resultado,
  ];

  for (
    const candidate
    of candidates
  ) {
    const digits =
      safeString(
        candidate
      )
        .replace(
          /\D/g,
          ''
        );

    if (
      digits &&
      digits.length <=
        4
    ) {
      return digits.padStart(
        4,
        '0'
      );
    }
  }

  return '';
}

export function radarFirstPrizeMilhar(
  draw
) {
  const prizes =
    Array.isArray(
      draw?.prizes
    )
      ? draw.prizes
      : [];

  if (!prizes.length) {
    return '';
  }

  const indexed =
    prizes.map(
      (
        prize,
        index
      ) => ({
        prize,
        position:
          prizePosition(
            prize,
            index
          ),
      })
    );

  const first =
    indexed.find(
      (item) =>
        item.position ===
        1
    ) ??
    indexed[0];

  return radarPrizeMilhar(
    first?.prize
  );
}

function compareDrawMoment(
  left,
  right
) {
  if (
    left.date !==
    right.date
  ) {
    return left.date.localeCompare(
      right.date
    );
  }

  return (
    left.minutes -
    right.minutes
  );
}

function targetMoment({
  date,
  hour,
}) {
  return {
    date:
      normalizeYmd(
        date
      ),

    hour:
      normalizeRadarHour(
        hour
      ),

    minutes:
      radarHourToMinutes(
        hour
      ),
  };
}

function isStrictlyBefore(
  draw,
  target
) {
  if (
    draw.date <
    target.date
  ) {
    return true;
  }

  if (
    draw.date >
    target.date
  ) {
    return false;
  }

  return (
    draw.minutes <
    target.minutes
  );
}

function normalizeHistoricalDraw(
  draw
) {
  const date =
    drawDate(
      draw
    );

  const hour =
    drawHour(
      draw
    );

  const minutes =
    radarHourToMinutes(
      hour
    );

  const milhar =
    radarFirstPrizeMilhar(
      draw
    );

  if (
    !date ||
    !hour ||
    minutes === null ||
    !/^\d{4}$/.test(
      milhar
    )
  ) {
    return null;
  }

  return {
    date,
    hour,
    minutes,
    milhar,
    draw,
  };
}

function addDaysYmd(
  ymd,
  delta
) {
  const date =
    normalizeYmd(
      ymd
    );

  const [
    year,
    month,
    day,
  ] =
    date
      .split('-')
      .map(Number);

  const utc =
    new Date(
      Date.UTC(
        year,
        month - 1,
        day
      )
    );

  utc.setUTCDate(
    utc.getUTCDate() +
    Number(delta)
  );

  return [
    utc.getUTCFullYear(),
    String(
      utc.getUTCMonth() +
      1
    ).padStart(
      2,
      '0'
    ),
    String(
      utc.getUTCDate()
    ).padStart(
      2,
      '0'
    ),
  ].join('-');
}

export function buildRadarHistorySource({
  lotteryKey,
  targetDate,
  targetHour,
  draws,
} = {}) {
  const lottery =
    safeString(
      lotteryKey
    )
      .toUpperCase();

  if (!lottery) {
    throw new Error(
      'RADAR_SOURCE_LOTTERY_REQUIRED'
    );
  }

  const target =
    targetMoment({
      date:
        targetDate,
      hour:
        targetHour,
    });

  const normalized =
    (
      Array.isArray(
        draws
      )
        ? draws
        : []
    )
      .map(
        normalizeHistoricalDraw
      )
      .filter(Boolean)
      .filter(
        (draw) =>
          isStrictlyBefore(
            draw,
            target
          )
      )
      .sort(
        (
          a,
          b
        ) =>
          compareDrawMoment(
            b,
            a
          )
      );

  /*
   * Protecao contra documentos duplicados
   * para o mesmo sorteio.
   */
  const unique = [];

  const seen =
    new Set();

  for (
    const draw
    of normalized
  ) {
    const key =
      `${draw.date}|${draw.hour}`;

    if (
      seen.has(
        key
      )
    ) {
      continue;
    }

    seen.add(
      key
    );

    unique.push(
      draw
    );
  }

  const selected =
    unique.slice(
      0,
      RADAR_SOURCE_REQUIRED_DRAWS
    );

  if (
    selected.length <
    RADAR_SOURCE_REQUIRED_DRAWS
  ) {
    const error =
      new Error(
        'RADAR_SOURCE_HISTORY_INSUFFICIENT'
      );

    error.details = {
      lotteryKey:
        lottery,

      target,

      available:
        selected.length,

      required:
        RADAR_SOURCE_REQUIRED_DRAWS,
    };

    throw error;
  }

  function dayObject(
    item
  ) {
    return {
      date:
        item.date,

      hour:
        item.hour,

      milhar:
        item.milhar,
    };
  }

  return {
    ok:
      true,

    source:
      'PALPITACO_RESULTS',

    lottery:
      lottery,

    target: {
      date:
        target.date,

      hour:
        target.hour,
    },

    days: {
      d1:
        dayObject(
          selected[0]
        ),

      d2:
        dayObject(
          selected[1]
        ),

      d3:
        dayObject(
          selected[2]
        ),
    },

    history: {
      required:
        RADAR_SOURCE_REQUIRED_DRAWS,

      available:
        unique.length,

      selected:
        selected.map(
          dayObject
        ),
    },
  };
}

export async function loadRadarHistorySource({
  lotteryKey,
  targetDate,
  targetHour,
  lookbackDays =
    RADAR_SOURCE_LOOKBACK_DAYS,
} = {}) {
  const lottery =
    safeString(
      lotteryKey
    )
      .toUpperCase();

  if (!lottery) {
    throw new Error(
      'RADAR_SOURCE_LOTTERY_REQUIRED'
    );
  }

  const date =
    normalizeYmd(
      targetDate
    );

  const hour =
    normalizeRadarHour(
      targetHour
    );

  const days =
    Number(
      lookbackDays
    );

  if (
    !Number.isInteger(
      days
    ) ||
    days <
      1 ||
    days >
      365
  ) {
    throw new Error(
      `RADAR_SOURCE_INVALID_LOOKBACK=${lookbackDays}`
    );
  }

  const dateFrom =
    addDaysYmd(
      date,
      -days
    );

  const draws =
    await getKingResultsByRange({
      uf:
        lottery,

      dateFrom,

      dateTo:
        date,

      positions: [
        1,
      ],

      mode:
        'aggregated',
    });

  return buildRadarHistorySource({
    lotteryKey:
      lottery,

    targetDate:
      date,

    targetHour:
      hour,

    draws,
  });
}

const radarSource = {
  RADAR_SOURCE_REQUIRED_DRAWS,
  RADAR_SOURCE_LOOKBACK_DAYS,
  radarHourToMinutes,
  normalizeRadarHour,
  radarPrizeMilhar,
  radarFirstPrizeMilhar,
  buildRadarHistorySource,
  loadRadarHistorySource,
};

export default radarSource;