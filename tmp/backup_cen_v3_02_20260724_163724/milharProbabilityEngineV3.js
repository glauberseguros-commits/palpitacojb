/*
===============================================================================
Motor Probabilístico de Milhares — V3
===============================================================================

Objetivos:

- preservar integralmente a centena solicitada;
- gerar sempre as 10 milhares candidatas;
- utilizar contexto temporal real;
- não depender de diversificação artificial;
- não depender de React;
- manter resultado determinístico;
- aceitar sorteios completos, e não apenas prêmios achatados.

Fatores padrão:

- 30% frequência exata histórica;
- 18% frequência no horário-alvo;
- 14% frequência no dia da semana-alvo;
- 12% frequência na posição-alvo;
- 12% tendência recente;
- 10% recência cronológica;
- 4% força recente do prefixo.

O prefixo é apenas sinal complementar.
*/

const DEFAULT_WEIGHTS_V3 = Object.freeze({
  exactFrequency: 0.30,
  hourFrequency: 0.18,
  weekdayFrequency: 0.14,
  positionFrequency: 0.12,
  recentTrend: 0.12,
  chronologicalRecency: 0.10,
  recentPrefixStrength: 0.04,
});

const DEFAULT_RECENT_WINDOW = 120;

function digitsOnly(value) {
  return String(value ?? "").replace(/\D+/g, "");
}

function safeNumber(value, fallback = 0) {
  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : fallback;
}

function firstValue(object, keys) {
  for (const key of keys) {
    const value = object?.[key];

    if (
      value !== undefined &&
      value !== null &&
      String(value).trim() !== ""
    ) {
      return value;
    }
  }

  return "";
}

export function normalizeCentena3V3(value) {
  const digits = digitsOnly(value);

  if (!digits) return "";

  return digits.slice(-3).padStart(3, "0");
}

export function normalizeMilhar4V3(value) {
  const digits = digitsOnly(value);

  if (!digits) return "";

  return digits.slice(-4).padStart(4, "0");
}

export function normalizeHourV3(value) {
  const raw = String(value ?? "").trim();

  if (!raw) return "";

  const match = raw.match(/(\d{1,2})[:hH-]?(\d{2})?/);

  if (!match) return "";

  const hour = String(
    Math.max(0, Math.min(23, Number(match[1])))
  ).padStart(2, "0");

  const minute = String(
    Math.max(0, Math.min(59, Number(match[2] || 0)))
  ).padStart(2, "0");

  return `${hour}:${minute}`;
}

export function normalizeYmdV3(value) {
  const raw = String(value ?? "").trim();

  if (!raw) return "";

  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);

  if (iso) {
    return `${iso[1]}-${iso[2]}-${iso[3]}`;
  }

  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})/);

  if (br) {
    return `${br[3]}-${br[2]}-${br[1]}`;
  }

  return "";
}

export function weekdayFromYmdV3(ymd) {
  const normalized = normalizeYmdV3(ymd);

  if (!normalized) return null;

  const [year, month, day] = normalized
    .split("-")
    .map(Number);

  const date = new Date(
    Date.UTC(year, month - 1, day)
  );

  const weekday = date.getUTCDay();

  return Number.isFinite(weekday)
    ? weekday
    : null;
}

function drawYmd(draw) {
  return normalizeYmdV3(
    firstValue(draw, [
      "ymd",
      "date",
      "drawDate",
      "resultDate",
      "data",
      "dataSorteio",
    ])
  );
}

function drawHour(draw) {
  return normalizeHourV3(
    firstValue(draw, [
      "closeHour",
      "close_hour",
      "hour",
      "drawHour",
      "horario",
      "time",
    ])
  );
}

function prizeMilhar(prize) {
  return normalizeMilhar4V3(
    firstValue(prize, [
      "milhar4",
      "milhar",
      "numero",
      "number",
      "value",
      "result",
      "resultado",
      "raw",
    ])
  );
}

function prizePosition(prize) {
  return safeNumber(
    firstValue(prize, [
      "position",
      "pos",
      "prizePosition",
      "colocacao",
    ]),
    0
  );
}

function timestampFromParts(ymd, hour) {
  const normalizedYmd = normalizeYmdV3(ymd);
  const normalizedHour = normalizeHourV3(hour);

  if (!normalizedYmd) {
    return Number.NaN;
  }

  const [year, month, day] = normalizedYmd
    .split("-")
    .map(Number);

  const [hours, minutes] = normalizedHour
    ? normalizedHour.split(":").map(Number)
    : [0, 0];

  return Date.UTC(
    year,
    month - 1,
    day,
    hours,
    minutes,
    0,
    0
  );
}

export function flattenDrawsForMilharV3(draws = []) {
  const rows = [];

  for (const draw of Array.isArray(draws) ? draws : []) {
    const ymd = drawYmd(draw);
    const hour = drawHour(draw);
    const weekday = weekdayFromYmdV3(ymd);
    const timestamp = timestampFromParts(ymd, hour);

    const prizes = Array.isArray(draw?.prizes)
      ? draw.prizes
      : [];

    for (const prize of prizes) {
      const milhar = prizeMilhar(prize);

      if (!milhar) continue;

      rows.push({
        milhar,
        prefix: milhar.slice(0, 1),
        centena: milhar.slice(-3),
        dezena: milhar.slice(-2),
        position: prizePosition(prize),
        ymd,
        hour,
        weekday,
        timestamp,
      });
    }
  }

  return rows
    .filter((row) => Number.isFinite(row.timestamp))
    .sort((a, b) => {
      if (a.timestamp !== b.timestamp) {
        return a.timestamp - b.timestamp;
      }

      return a.position - b.position;
    })
    .map((row, index) => ({
      ...row,
      sequence: index + 1,
    }));
}

export function buildMilharCandidatesV3(centena) {
  const centena3 = normalizeCentena3V3(centena);

  if (!centena3) return [];

  return Array.from(
    { length: 10 },
    (_, prefix) => ({
      prefix: String(prefix),
      centena: centena3,
      milhar: `${prefix}${centena3}`,
    })
  );
}

function normalizeWeightsV3(weights = {}) {
  const merged = {
    ...DEFAULT_WEIGHTS_V3,
    ...(weights || {}),
  };

  const sanitized = {};

  for (const key of Object.keys(DEFAULT_WEIGHTS_V3)) {
    sanitized[key] = Math.max(
      0,
      safeNumber(merged[key], 0)
    );
  }

  const total = Object.values(sanitized)
    .reduce((sum, value) => sum + value, 0);

  if (total <= 0) {
    return {
      ...DEFAULT_WEIGHTS_V3,
    };
  }

  return Object.fromEntries(
    Object.entries(sanitized).map(
      ([key, value]) => [key, value / total]
    )
  );
}

function maxMapValue(map) {
  return Math.max(
    0,
    ...Array.from(map.values())
  );
}

function ratio(value, maximum) {
  if (!maximum || maximum <= 0) return 0;

  return Math.max(
    0,
    Math.min(1, value / maximum)
  );
}

function increment(map, key, amount = 1) {
  map.set(
    key,
    (map.get(key) || 0) + amount
  );
}

function classifyEvidence({
  exactCount,
  hourCount,
  weekdayCount,
  positionCount,
  recentCount,
}) {
  const total =
    exactCount +
    hourCount +
    weekdayCount +
    positionCount +
    recentCount;

  if (total <= 0) return "none";
  if (total < 5) return "low";
  if (total < 15) return "medium";

  return "high";
}

export function rankMilharCandidatesV3({
  centena,
  draws = [],
  targetYmd = "",
  targetHour = "",
  targetPosition = null,
  recentWindow = DEFAULT_RECENT_WINDOW,
  weights = DEFAULT_WEIGHTS_V3,
} = {}) {
  const centena3 = normalizeCentena3V3(centena);
  const candidates = buildMilharCandidatesV3(centena3);

  if (!centena3 || !candidates.length) {
    return [];
  }

  const rows = flattenDrawsForMilharV3(draws);
  const targetHourNormalized =
    normalizeHourV3(targetHour);
  const targetWeekday =
    weekdayFromYmdV3(targetYmd);
  const targetPositionNumber =
    safeNumber(targetPosition, 0);

  const normalizedWeights =
    normalizeWeightsV3(weights);

  const exactCount = new Map();
  const hourCount = new Map();
  const weekdayCount = new Map();
  const positionCount = new Map();
  const recentCount = new Map();
  const recentPrefixCount = new Map();
  const lastSeenSequence = new Map();

  const relevantRows = rows.filter(
    (row) => row.centena === centena3
  );

  const windowSize = Math.max(
    20,
    Math.floor(
      safeNumber(
        recentWindow,
        DEFAULT_RECENT_WINDOW
      )
    )
  );

  const recentRows = rows.slice(-windowSize);
  const recentRelevantRows = recentRows.filter(
    (row) => row.centena === centena3
  );

  for (const row of relevantRows) {
    increment(exactCount, row.milhar);

    lastSeenSequence.set(
      row.milhar,
      row.sequence
    );

    if (
      targetHourNormalized &&
      row.hour === targetHourNormalized
    ) {
      increment(hourCount, row.milhar);
    }

    if (
      targetWeekday !== null &&
      row.weekday === targetWeekday
    ) {
      increment(weekdayCount, row.milhar);
    }

    if (
      targetPositionNumber > 0 &&
      row.position === targetPositionNumber
    ) {
      increment(positionCount, row.milhar);
    }
  }

  for (const row of recentRelevantRows) {
    increment(recentCount, row.milhar);
  }

  for (const row of recentRows) {
    increment(recentPrefixCount, row.prefix);
  }

  const maxExact = maxMapValue(exactCount);
  const maxHour = maxMapValue(hourCount);
  const maxWeekday = maxMapValue(weekdayCount);
  const maxPosition = maxMapValue(positionCount);
  const maxRecent = maxMapValue(recentCount);
  const maxRecentPrefix =
    maxMapValue(recentPrefixCount);

  const maxSequence = Math.max(
    0,
    ...Array.from(lastSeenSequence.values())
  );

  const ranking = candidates.map((candidate) => {
    const exactRaw =
      exactCount.get(candidate.milhar) || 0;

    const hourRaw =
      hourCount.get(candidate.milhar) || 0;

    const weekdayRaw =
      weekdayCount.get(candidate.milhar) || 0;

    const positionRaw =
      positionCount.get(candidate.milhar) || 0;

    const recentRaw =
      recentCount.get(candidate.milhar) || 0;

    const recentPrefixRaw =
      recentPrefixCount.get(candidate.prefix) || 0;

    const lastSeen =
      lastSeenSequence.get(candidate.milhar) || 0;

    const evidence = {
      exactFrequency: {
        count: exactRaw,
        normalized: ratio(exactRaw, maxExact),
      },

      hourFrequency: {
        count: hourRaw,
        normalized: ratio(hourRaw, maxHour),
      },

      weekdayFrequency: {
        count: weekdayRaw,
        normalized: ratio(
          weekdayRaw,
          maxWeekday
        ),
      },

      positionFrequency: {
        count: positionRaw,
        normalized: ratio(
          positionRaw,
          maxPosition
        ),
      },

      recentTrend: {
        count: recentRaw,
        window: windowSize,
        normalized: ratio(
          recentRaw,
          maxRecent
        ),
      },

      chronologicalRecency: {
        lastSeenSequence: lastSeen,
        maxSequence,
        normalized: ratio(
          lastSeen,
          maxSequence
        ),
      },

      recentPrefixStrength: {
        count: recentPrefixRaw,
        normalized: ratio(
          recentPrefixRaw,
          maxRecentPrefix
        ),
      },
    };

    const score =
      evidence.exactFrequency.normalized *
        normalizedWeights.exactFrequency +
      evidence.hourFrequency.normalized *
        normalizedWeights.hourFrequency +
      evidence.weekdayFrequency.normalized *
        normalizedWeights.weekdayFrequency +
      evidence.positionFrequency.normalized *
        normalizedWeights.positionFrequency +
      evidence.recentTrend.normalized *
        normalizedWeights.recentTrend +
      evidence.chronologicalRecency.normalized *
        normalizedWeights.chronologicalRecency +
      evidence.recentPrefixStrength.normalized *
        normalizedWeights.recentPrefixStrength;

    return {
      ...candidate,

      score: Number(
        (score * 100).toFixed(4)
      ),

      evidenceQuality: classifyEvidence({
        exactCount: exactRaw,
        hourCount: hourRaw,
        weekdayCount: weekdayRaw,
        positionCount: positionRaw,
        recentCount: recentRaw,
      }),

      evidence,
    };
  });

  ranking.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }

    const bContext =
      b.evidence.hourFrequency.count +
      b.evidence.weekdayFrequency.count +
      b.evidence.positionFrequency.count;

    const aContext =
      a.evidence.hourFrequency.count +
      a.evidence.weekdayFrequency.count +
      a.evidence.positionFrequency.count;

    if (bContext !== aContext) {
      return bContext - aContext;
    }

    if (
      b.evidence.recentTrend.count !==
      a.evidence.recentTrend.count
    ) {
      return (
        b.evidence.recentTrend.count -
        a.evidence.recentTrend.count
      );
    }

    if (
      b.evidence.exactFrequency.count !==
      a.evidence.exactFrequency.count
    ) {
      return (
        b.evidence.exactFrequency.count -
        a.evidence.exactFrequency.count
      );
    }

    if (
      b.evidence.chronologicalRecency
        .lastSeenSequence !==
      a.evidence.chronologicalRecency
        .lastSeenSequence
    ) {
      return (
        b.evidence.chronologicalRecency
          .lastSeenSequence -
        a.evidence.chronologicalRecency
          .lastSeenSequence
      );
    }

    return Number(a.prefix) - Number(b.prefix);
  });

  return ranking.map((item, index) => ({
    position: index + 1,
    ...item,
  }));
}

export function buildMilharRecommendationV3(
  args = {}
) {
  const ranking = rankMilharCandidatesV3(args);
  const winner = ranking[0] || null;

  if (!winner) {
    return {
      ok: false,
      status: "insufficient_evidence",
      model: "MILHAR_PROBABILITY_V3",
      centena: normalizeCentena3V3(
        args?.centena
      ),
      milhar: null,
      prefixo: null,
      score: 0,
      confidence: 0,
      evidenceQuality: "none",
      evidence: null,
      alternatives: [],
      ranking: [],
    };
  }

  return {
    ok: true,
    status: "recommended",
    model: "MILHAR_PROBABILITY_V3",

    centena: winner.centena,
    milhar: winner.milhar,
    prefixo: winner.prefix,

    score: winner.score,
    confidence: Number(
      (winner.score / 100).toFixed(6)
    ),

    evidenceQuality:
      winner.evidenceQuality,

    evidence: winner.evidence,

    alternatives: ranking
      .slice(0, 3)
      .map((item) => ({
        position: item.position,
        milhar: item.milhar,
        prefixo: item.prefix,
        score: item.score,
        evidenceQuality:
          item.evidenceQuality,
      })),

    ranking,
  };
}

export const MILHAR_V3_DEFAULT_WEIGHTS =
  DEFAULT_WEIGHTS_V3;
