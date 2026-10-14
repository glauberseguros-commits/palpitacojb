import {
  getKingBoundsByUf,
  getKingResultsByRange,
} from "../../services/kingResultsService";

import {
  buildMilharRecommendationV3,
  diversifyMilharRecommendationsV3,
} from "../../shared/predictiveMilharEngine";

/*
 * RADAR_CENTENAS24_CONTEXTUAL_V3
 *
 * A selecao dos animais permanece no motor TOP1/TOP7.
 *
 * A cada contexto:
 * - filtra resultados anteriores ao alvo;
 * - seleciona loteria, dia da semana e horario;
 * - classifica as 40 centenas de cada animal;
 * - seleciona seis digitos iniciais distintos;
 * - forma 24 centenas;
 * - utiliza o motor V3 compartilhado para as milhares.
 *
 * Nenhum numero de palpite e fixado neste modulo.
 */

const CHUNK_DAYS = 45;
const CONCURRENCY = 3;
const CACHE = new Map();

const OFFICIAL_HOURS = {
  LOOK: [
    "07:00", "09:00", "11:00", "14:00",
    "16:00", "18:00", "21:00", "23:00",
  ],
  NACIONAL: [
    "02:00", "08:00", "10:00", "12:00",
    "15:00", "17:00", "21:00", "23:00",
  ],
};

function isYmd(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

function shiftDate(ymd, days) {
  const date = new Date(`${ymd}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function weekday(ymd) {
  return new Date(`${ymd}T12:00:00Z`).getUTCDay();
}

function hourMinutes(value) {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/(?:hrs?|hs?)$/, "");

  const match = raw.match(/^(\d{1,2})(?:[:h](\d{1,2}))?$/);

  if (!match) return null;

  const h = Number(match[1]);
  const m = Number(match[2] || 0);

  if (h > 23 || m > 59) return null;

  return h * 60 + m;
}

function hourLabel(value) {
  const m =
    Number.isInteger(value) && value >= 0 && value < 1440
      ? value
      : hourMinutes(value);
  if (m === null) return "";

  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

function normalizeOfficialHour(lottery, value) {
  const hours = OFFICIAL_HOURS[lottery];
  const raw = hourMinutes(value);

  if (raw === null) return "";

  if (!hours) {
    return `${String(Math.floor(raw / 60)).padStart(2, "0")}:00`;
  }

  let best = "";
  let bestDistance = Infinity;

  for (const candidate of hours) {
    const other = hourMinutes(candidate);
    const direct = Math.abs(other - raw);
    const distance = Math.min(direct, 1440 - direct);

    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }

  return best && bestDistance <= 90
    ? best
    : `${String(Math.floor(raw / 60)).padStart(2, "0")}:00`;
}

export function normalizeRadarHistoricalHour(lottery, value) {
  return normalizeOfficialHour(lottery, hourLabel(value));
}

function firstValid(candidates, parser) {
  for (const candidate of candidates) {
    const value = parser(candidate);
    if (value !== null && value !== "") return value;
  }
  return null;
}

function dateOf(item, fallback = null) {
  if (!item) return fallback;

  return firstValid([
    item.dateYmd, item.ymd, item.date,
    item.data, item.day, item.date_ymd,
    item.drawYmd, item.draw_ymd,
    item.drawDate,
  ], (value) => {
    const str = String(value ?? "").slice(0, 10);
    return isYmd(str) ? str : null;
  }) || fallback;
}

function hourOf(item, fallback = null) {
  if (!item) return fallback;

  const found = firstValid([
    item.closeHour, item.close_hour,
    item.hour, item.horario,
    item.close, item.close_hour_raw,
    item.drawHour, item.draw_hour,
    item.hourNorm, item.hourBucket,
    item.lotteryCloseHour,
    item.lottery?.closeHour,
    item.lottery?.hour,
    item.meta?.closeHour,
  ], hourMinutes);

  return found === null ? fallback : found;
}

function positionOf(prize, fallback = null) {
  for (const candidate of [
    prize?.position, prize?.posicao,
    prize?.pos, prize?.prizePosition,
    prize?.colocacao, prize?.place,
    prize?.rank, fallback,
  ]) {
    const match = String(candidate ?? "").match(/^\s*(\d{1,2})/);
    const n = match ? Number(match[1]) : NaN;

    if (n >= 1 && n <= 7) return n;
  }

  return null;
}

function milharOf(prize) {
  for (const value of [
    prize?.milhar4, prize?.milhar,
    prize?.numero, prize?.number,
    prize?.num, prize?.n, prize?.valor,
    prize?.value, prize?.resultado,
    prize?.result, prize?.raw,
  ]) {
    const digits = String(value ?? "").replace(/\D/g, "");
    if (digits.length >= 4) return digits.slice(-4);
  }

  return null;
}

function centenaOf(prize) {
  for (const value of [
    prize?.centena3, prize?.centena,
    prize?.centena_3, prize?.centena3dig,
    prize?.c3,
  ]) {
    const digits = String(value ?? "").replace(/\D/g, "");
    if (digits.length >= 3) return digits.slice(-3);
  }

  const milhar = milharOf(prize);
  return milhar ? milhar.slice(-3) : null;
}

function groupOf(prize) {
  const centena = centenaOf(prize);
  if (!centena) return null;

  const dezena = Number(centena.slice(-2));
  return dezena === 0 ? 25 : Math.ceil(dezena / 4);
}

function normalizeResponse(response) {
  const draws = Array.isArray(response)
    ? response
    : [
        response?.draws,
        response?.drawsRaw,
        response?.data?.draws,
        response?.data,
        response?.results,
      ].find(Array.isArray) || [];

  const flat = [
    response?.prizesAllSorted,
    response?.prizesAll,
    response?.prizes,
    response?.prizeRows,
    response?.items,
    response?.data?.prizesAllSorted,
    response?.data?.prizesAll,
    response?.data?.prizes,
  ].find(Array.isArray) || [];

  const output = [];
  const seen = new Set();

  function add(prize, draw, fallbackPosition = null) {
    if (!prize || typeof prize !== "object") return;

    const ymd = dateOf(prize, dateOf(draw));
    const hour = hourOf(prize, hourOf(draw));
    const position = positionOf(prize, fallbackPosition);
    const centena = centenaOf(prize);
    const milhar = milharOf(prize);

    if (
      !ymd ||
      hour === null ||
      !position ||
      !centena
    ) {
      return;
    }

    const key = `${ymd}|${hour}|${position}|${centena}|${milhar || ""}`;

    if (seen.has(key)) return;
    seen.add(key);

    output.push({
      ...prize,
      ymd,
      dateYmd: ymd,
      hourMinutes: hour,
      position,
      centena3: centena,
      milhar4: milhar,
    });
  }

  for (const draw of draws) {
    const prizes = [
      draw?.prizes,
      draw?.prizesAll,
      draw?.prizesAllSorted,
    ].find(Array.isArray) || [];

    prizes.forEach((prize, index) =>
      add(prize, draw, index + 1)
    );
  }

  flat.forEach((prize) => add(prize, null));

  return output;
}

function dezenasDoGrupo(group) {
  const g = Number(group);

  if (!Number.isInteger(g) || g < 1 || g > 25) {
    throw new Error(`RADAR24_INVALID_GROUP=${group}`);
  }

  return Array.from({ length: 4 }, (_, index) =>
    String(((g - 1) * 4 + index + 1) % 100).padStart(2, "0")
  );
}

/*
 * Ranking individual identico ao criterio de
 * ordenacao das 40 centenas na CENTENAS+:
 *
 * frequencia decrescente;
 * desempate por numero da centena.
 *
 * Sao escolhidos os seis primeiros digitos
 * iniciais distintos encontrados nesse ranking.
 */
export function selectRadarCentenaDigits(prizes, group) {
  const dezenas = dezenasDoGrupo(group);
  const counts = new Map();

  for (const dezena of dezenas) {
    for (let digit = 0; digit <= 9; digit++) {
      counts.set(`${digit}${dezena}`, 0);
    }
  }

  for (const prize of prizes || []) {
    const centena = centenaOf(prize);

    if (counts.has(centena)) {
      counts.set(
        centena,
        counts.get(centena) + 1
      );
    }
  }

  const ranking = [...counts.entries()]
    .map(([centena, count]) => ({
      centena,
      count,
    }))
    .sort((a, b) =>
      b.count - a.count ||
      a.centena.localeCompare(b.centena)
    );

  const selected = [];
  const used = new Set();

  for (const item of ranking) {
    const digit = item.centena[0];

    if (used.has(digit)) continue;

    used.add(digit);
    selected.push(digit);

    if (selected.length === 6) break;
  }

  return selected;
}

export function buildRadarCentenas24Rows({
  group,
  prizes,
  historicalPrizes,
}) {
  if (
    !Array.isArray(prizes) ||
    !Array.isArray(historicalPrizes)
  ) {
    throw new Error("RADAR24_INVALID_HISTORY");
  }

  const dezenas = dezenasDoGrupo(group);
  const digits = selectRadarCentenaDigits(prizes, group);

  const groupPrizes = prizes.filter(
    (prize) => groupOf(prize) === Number(group)
  );

  const groupHistoricalPrizes = historicalPrizes.filter(
    (prize) => groupOf(prize) === Number(group)
  );

  if (!groupPrizes.length && !groupHistoricalPrizes.length) {
    throw new Error(`RADAR24_NO_EVIDENCE_GROUP=${group}`);
  }

  const raw = dezenas.flatMap((dezena) =>
    digits.map((digit) => {
      const centena = `${digit}${dezena}`;

      const recommendation = buildMilharRecommendationV3({
        centena,
        prizes: groupPrizes,
        fallbackPrizes: groupHistoricalPrizes,
      });

      if (!recommendation.ok) {
        throw new Error(
          `RADAR24_NO_V3_RECOMMENDATION=${centena}`
        );
      }

      return {
        centena,
        count: 0,
        milhar: recommendation.milhar,
        recommendation,
      };
    })
  );

  const diversified = diversifyMilharRecommendationsV3(
    raw,
    {
      maxPerPrefix: 4,
      repeatPenalty: 12,
    }
  );

  const rows = dezenas.map((dezena) => ({
    dezena,
    numbers: diversified
      .filter((item) =>
        item.centena.slice(-2) === dezena
      )
      .map((item) => ({
        centena: item.centena,
        milhar: item.milhar,
        method: "CENTENAS_PLUS_V3",
        tier: 1,
      })),
  }));

  const centenas = rows.flatMap((row) =>
    row.numbers.map((item) => item.centena)
  );

  const milhares = rows.flatMap((row) =>
    row.numbers.map((item) => item.milhar)
  );

  if (
    digits.length !== 6 ||
    new Set(digits).size !== 6 ||
    rows.length !== 4 ||
    rows.some((row) => row.numbers.length !== 6) ||
    new Set(centenas).size !== 24 ||
    new Set(milhares).size !== 24 ||
    milhares.some((value) => !/^\d{4}$/.test(value))
  ) {
    throw new Error(
      `RADAR24_INTEGRITY_FAILURE_GROUP=${group}`
    );
  }

  return rows;
}

export function applyRadarCentenas24(cards, context) {
  if (!context?.valid) {
    throw new Error("RADAR24_HISTORY_NOT_READY");
  }

  return cards.map((card) => {
    const rows = buildRadarCentenas24Rows({
      group: card.group,
      prizes: context.prizes,
      historicalPrizes: context.historicalPrizes,
    });

    return {
      ...card,
      rows,
      milhares: rows.flatMap((row) =>
        row.numbers.map((item) => item.milhar)
      ),
    };
  });
}

async function withConcurrency(items, mapper) {
  const results = new Array(items.length);
  let next = 0;

  async function worker() {
    while (next < items.length) {
      const index = next++;
      results[index] = await mapper(items[index]);
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(CONCURRENCY, items.length) },
      () => worker()
    )
  );

  return results;
}

export async function loadRadarCentenas24Context({
  lotteryKey,
  targetDate,
  targetHour,
}) {
  const lottery = String(lotteryKey || "")
    .trim()
    .toUpperCase();

  const targetMinutes = hourMinutes(targetHour);

  if (
    !isYmd(targetDate) ||
    targetMinutes === null ||
    !lottery
  ) {
    throw new Error("RADAR24_INVALID_TARGET");
  }

  const cacheKey =
    `${lottery}|${targetDate}|${targetMinutes}`;

  if (CACHE.has(cacheKey)) {
    return CACHE.get(cacheKey);
  }

  const pending = (async () => {
    const bounds = await getKingBoundsByUf({
      uf: lottery,
    });

    const fromDate = bounds?.minYmd;

    if (!isYmd(fromDate)) {
      throw new Error(
        "RADAR24_HISTORY_BOUNDS_UNAVAILABLE"
      );
    }

    const chunks = [];

    for (
      let from = fromDate;
      from <= targetDate;
      from = shiftDate(from, CHUNK_DAYS)
    ) {
      const last = shiftDate(
        from,
        CHUNK_DAYS - 1
      );

      chunks.push({
        from,
        to: last < targetDate
          ? last
          : targetDate,
      });
    }

    const batches = await withConcurrency(
      chunks,
      async ({ from, to }) => {
        const response =
          await getKingResultsByRange({
            uf: lottery,
            dateFrom: from,
            dateTo: to,
            positions: [1, 2, 3, 4, 5, 6, 7],
            mode: "detailed",
          });

        return normalizeResponse(response);
      }
    );

    const historical = batches.flat();

    const cutoff = historical.filter(
      (prize) =>
        prize.ymd < targetDate ||
        (
          prize.ymd === targetDate &&
          prize.hourMinutes < targetMinutes
        )
    );

    if (!cutoff.length) {
      throw new Error("RADAR24_EMPTY_HISTORY");
    }

    const desiredWeekday = weekday(targetDate);
    const desiredHour = normalizeOfficialHour(
      lottery,
      targetHour
    );

    const prizes = cutoff.filter(
      (prize) =>
        weekday(prize.ymd) === desiredWeekday &&
        normalizeRadarHistoricalHour(
          lottery,
          prize.hourMinutes
        ) === desiredHour
    );

    if (!prizes.length) {
      throw new Error(
        "RADAR24_EMPTY_FILTERED_HISTORY"
      );
    }

    return {
      valid: true,
      prizes,
      historicalPrizes: cutoff,
    };
  })();

  CACHE.set(cacheKey, pending);

  try {
    return await pending;
  } catch (error) {
    CACHE.delete(cacheKey);
    throw error;
  }
}