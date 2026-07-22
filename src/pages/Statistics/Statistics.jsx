import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getKingBoundsByUf,
  getKingResultsByRange,
} from "../../services/kingResultsService";
import {
  getAnimalLabel,
} from "../../constants/bichoMap";

const LOTTERIES = Object.freeze([
  Object.freeze({
    value: "PT_RIO",
    label: "Rio de Janeiro",
    hours: Object.freeze([
      "09:00",
      "11:00",
      "14:00",
      "16:00",
      "18:00",
      "19:20",
      "21:00",
    ]),
  }),
  Object.freeze({
    value: "FEDERAL",
    label: "Federal",
    hours: Object.freeze([
      "11:00",
      "19:00",
      "20:00",
    ]),
  }),
  Object.freeze({
    value: "LOOK",
    label: "LOOK",
    hours: Object.freeze([
      "07:00",
      "09:00",
      "11:00",
      "14:00",
      "16:00",
      "18:00",
      "21:00",
      "23:00",
    ]),
  }),
  Object.freeze({
    value: "NACIONAL",
    label: "Nacional",
    hours: Object.freeze([
      "02:00",
      "08:00",
      "10:00",
      "12:00",
      "15:00",
      "17:00",
      "21:00",
      "23:00",
    ]),
  }),
]);

const MODES = Object.freeze([
  Object.freeze({ value: "dezena", label: "Dezenas" }),
  Object.freeze({ value: "centena", label: "Centenas" }),
  Object.freeze({ value: "milhar", label: "Milhares" }),
  Object.freeze({ value: "animal", label: "Animais" }),
]);

const MONTHS = Object.freeze([
  "Todos",
  "Jan",
  "Fev",
  "Mar",
  "Abr",
  "Mai",
  "Jun",
  "Jul",
  "Ago",
  "Set",
  "Out",
  "Nov",
  "Dez",
]);

const WEEKDAYS = Object.freeze([
  "Todos",
  "Dom",
  "Seg",
  "Ter",
  "Qua",
  "Qui",
  "Sex",
  "Sáb",
]);

const SORTS = Object.freeze([
  Object.freeze({ value: "count_desc", label: "Mais frequentes" }),
  Object.freeze({ value: "count_asc", label: "Menos frequentes" }),
  Object.freeze({ value: "number_asc", label: "Número crescente" }),
  Object.freeze({ value: "number_desc", label: "Número decrescente" }),
  Object.freeze({ value: "latest_desc", label: "Última aparição" }),
]);

function safeStr(value) {
  return String(value ?? "").trim();
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function isYmd(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(safeStr(value));
}

function normalizeYmd(value) {
  const input = safeStr(value);

  if (isYmd(input)) return input;

  const iso = input.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso && isYmd(iso[1])) return iso[1];

  const br = input.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;

  return "";
}

function ymdToBr(value) {
  const ymd = normalizeYmd(value);
  if (!ymd) return "—";

  const [year, month, day] = ymd.split("-");
  return `${day}/${month}/${year}`;
}

function normalizeBoundsResponse(value) {
  const minRaw = safeStr(
    value?.minYmd ??
      value?.minDate ??
      value?.min ??
      ""
  );

  const maxRaw = safeStr(
    value?.maxYmd ??
      value?.maxDate ??
      value?.max ??
      ""
  );

  return {
    minYmd: isYmd(minRaw) ? minRaw : "",
    maxYmd: isYmd(maxRaw) ? maxRaw : "",
    source: safeStr(value?.source ?? ""),
  };
}

function clampYmd(value, minYmd, maxYmd) {
  let output = safeStr(value);

  if (!isYmd(output)) return "";

  if (isYmd(minYmd) && output < minYmd) output = minYmd;
  if (isYmd(maxYmd) && output > maxYmd) output = maxYmd;

  return output;
}

function toUtcDate(ymd) {
  if (!isYmd(ymd)) return null;

  const [year, month, day] = ymd.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return Number.isNaN(date.getTime()) ? null : date;
}

function utcDateToYmd(date) {
  return [
    date.getUTCFullYear(),
    pad2(date.getUTCMonth() + 1),
    pad2(date.getUTCDate()),
  ].join("-");
}

function addDays(ymd, days) {
  const date = toUtcDate(ymd);
  if (!date) return "";

  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return utcDateToYmd(date);
}

function splitRange(from, to, chunkDays = 60) {
  if (!isYmd(from) || !isYmd(to) || from > to) return [];

  const chunks = [];
  let cursor = from;

  while (cursor <= to) {
    const candidate = addDays(cursor, chunkDays - 1);
    const end = candidate && candidate < to ? candidate : to;

    chunks.push({ from: cursor, to: end });

    const next = addDays(end, 1);
    if (!next) break;

    cursor = next;
  }

  return chunks;
}

async function runPool(items, worker, concurrency = 3) {
  const queue = [...items];

  const runners = Array.from(
    { length: Math.max(1, concurrency) },
    async () => {
      while (queue.length) {
        const item = queue.shift();
        // eslint-disable-next-line no-await-in-loop
        await worker(item);
      }
    }
  );

  await Promise.all(runners);
}

function digitsOnly(value) {
  return safeStr(value).replace(/\D+/g, "");
}

function lastDigits(value, length) {
  const digits = digitsOnly(value);

  if (!digits) return "";

  return digits.slice(-length).padStart(length, "0");
}

function normalizeHour(value) {
  const input = safeStr(value).replace(/\s+/g, "");
  if (!input) return "";

  const hourLabel = input.match(/^(\d{1,2})(?:h|hs|hr|hrs)$/i);
  if (hourLabel) return `${pad2(hourLabel[1])}:00`;

  const clock = input.match(/^(\d{1,2}):(\d{1,2})(?::\d{1,2})?$/);
  if (clock) return `${pad2(clock[1])}:${pad2(clock[2])}`;

  const hourOnly = input.match(/^(\d{1,2})$/);
  if (hourOnly) return `${pad2(hourOnly[1])}:00`;

  return input;
}

function hourBucket(value) {
  const normalized = normalizeHour(value);
  const match = normalized.match(/^(\d{2}):/);

  return match ? `${match[1]}h` : normalized;
}

function monthLabel(ymd) {
  if (!isYmd(ymd)) return "";

  const month = Number(ymd.slice(5, 7));

  return [
    "",
    "Jan",
    "Fev",
    "Mar",
    "Abr",
    "Mai",
    "Jun",
    "Jul",
    "Ago",
    "Set",
    "Out",
    "Nov",
    "Dez",
  ][month] || "";
}

function weekdayLabel(ymd) {
  const date = toUtcDate(ymd);
  if (!date) return "";

  return [
    "Dom",
    "Seg",
    "Ter",
    "Qua",
    "Qui",
    "Sex",
    "Sáb",
  ][date.getUTCDay()] || "";
}

function normalizeDrawsResponse(response) {
  if (Array.isArray(response)) return response;

  const candidate =
    response?.draws ??
    response?.results ??
    response?.data ??
    response?.items ??
    response?.docs ??
    response?.rows ??
    [];

  return Array.isArray(candidate) ? candidate : [];
}

function pickFirst(object, keys) {
  for (const key of keys) {
    const value = object?.[key];

    if (
      value !== undefined &&
      value !== null &&
      safeStr(value) !== ""
    ) {
      return value;
    }
  }

  return null;
}

function arrayPosition(array, position) {
  if (!Array.isArray(array)) return null;

  const index = Number(position) - 1;

  if (index < 0 || index >= array.length) return null;

  return array[index];
}

function pickPrizeDigits(draw, position) {
  const pos = Number(position);
  const length = pos === 7 ? 3 : 4;

  const direct = pickFirst(draw, [
    `p${pos}`,
    `p_${pos}`,
    `premio${pos}`,
    `premio_${pos}`,
    `milhar${pos}`,
    `milhar_${pos}`,
    `numero${pos}`,
    `numero_${pos}`,
    `resultado${pos}`,
    `resultado_${pos}`,
    pos === 7 ? "centena3" : "milhar4",
  ]);

  if (direct !== null) {
    const digits = lastDigits(direct, length);
    if (digits) return digits;
  }

  for (const array of [
    draw?.p,
    draw?.ps,
    draw?.premios,
    draw?.resultados,
    draw?.numbers,
    draw?.numeros,
    draw?.milhares,
  ]) {
    const digits = lastDigits(arrayPosition(array, pos), length);
    if (digits) return digits;
  }

  for (const dictionary of [
    draw?.premios,
    draw?.resultado,
    draw?.resultados,
    draw?.p,
  ]) {
    if (
      dictionary &&
      typeof dictionary === "object" &&
      !Array.isArray(dictionary)
    ) {
      const digits = lastDigits(
        dictionary?.[String(pos)] ?? dictionary?.[pos],
        length
      );

      if (digits) return digits;
    }
  }

  return "";
}

function pickPrizeGroup(draw, position) {
  const pos = Number(position);

  const direct = pickFirst(draw, [
    `grupo${pos}`,
    `grupo_${pos}`,
    `grupo2${pos}`,
    `grupo2_${pos}`,
    `bicho${pos}`,
    `bicho_${pos}`,
    `animal_grupo${pos}`,
    `animal_grupo_${pos}`,
  ]);

  const directNumber = Number(direct);
  if (Number.isFinite(directNumber)) return directNumber;

  for (const array of [
    draw?.grupos,
    draw?.grupo,
    draw?.grupo2,
    draw?.bichos,
    draw?.animais,
  ]) {
    const value = Number(arrayPosition(array, pos));
    if (Number.isFinite(value)) return value;
  }

  for (const dictionary of [
    draw?.grupos,
    draw?.grupo,
    draw?.grupo2,
    draw?.bichos,
  ]) {
    if (
      dictionary &&
      typeof dictionary === "object" &&
      !Array.isArray(dictionary)
    ) {
      const value = Number(
        dictionary?.[String(pos)] ?? dictionary?.[pos]
      );

      if (Number.isFinite(value)) return value;
    }
  }

  return null;
}

function normalizePrize(prize, fallbackPosition) {
  const position = Number(
    prize?.position ??
      prize?.pos ??
      prize?.posicao ??
      prize?.colocacao ??
      fallbackPosition
  );

  const wantedLength = position === 7 ? 3 : 4;

  const number = lastDigits(
    prize?.centena3 ??
      prize?.milhar4 ??
      prize?.milhar ??
      prize?.numero ??
      prize?.number ??
      prize?.num ??
      prize?.valor ??
      prize?.n ??
      "",
    wantedLength
  );

  const groupValue = Number(
    prize?.grupo ??
      prize?.grupo2 ??
      prize?.group ??
      prize?.animal_grupo ??
      prize?.animalGrupo
  );

  return {
    position: Number.isFinite(position) ? position : fallbackPosition,
    number,
    group: Number.isFinite(groupValue) ? groupValue : null,
  };
}

function ensurePrizes(draw) {
  if (Array.isArray(draw?.prizes) && draw.prizes.length) {
    return draw.prizes.map((prize, index) =>
      normalizePrize(prize, index + 1)
    );
  }

  const prizes = [];

  for (let position = 1; position <= 7; position += 1) {
    const number = pickPrizeDigits(draw, position);
    const group = pickPrizeGroup(draw, position);

    if (!number && !Number.isFinite(Number(group))) continue;

    prizes.push({
      position,
      number,
      group: Number.isFinite(Number(group)) ? Number(group) : null,
    });
  }

  return prizes;
}

function formatInteger(value) {
  try {
    return new Intl.NumberFormat("pt-BR", {
      maximumFractionDigits: 0,
    }).format(Number(value || 0));
  } catch {
    return String(Number(value || 0));
  }
}

function formatPercent(value) {
  try {
    return new Intl.NumberFormat("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(value || 0));
  } catch {
    return Number(value || 0).toFixed(2);
  }
}

function buildLatestKey(ymd, hour, position) {
  return [
    safeStr(ymd),
    safeStr(hour).padStart(5, "0"),
    pad2(position || 99),
  ].join("|");
}

function itemLabel(mode, key) {
  if (mode === "animal") {
    const group = Number(key);
    const animal = getAnimalLabel(group) || `Grupo ${pad2(group)}`;

    return {
      main: animal,
      secondary: `Grupo ${pad2(group)}`,
    };
  }

  return {
    main: key,
    secondary:
      mode === "dezena"
        ? "Dezena"
        : mode === "centena"
        ? "Centena"
        : "Milhar",
  };
}

export default function Statistics() {
  const [lotteryKey, setLotteryKey] = useState("PT_RIO");
  const [mode, setMode] = useState("dezena");

  const [bounds, setBounds] = useState({
    minYmd: "",
    maxYmd: "",
    source: "",
  });

  const [range, setRange] = useState({
    from: "",
    to: "",
  });

  const [month, setMonth] = useState("Todos");
  const [monthDay, setMonthDay] = useState("Todos");
  const [weekday, setWeekday] = useState("Todos");
  const [schedule, setSchedule] = useState("Todos");
  const [animal, setAnimal] = useState("Todos");
  const [position, setPosition] = useState("Todos");

  const [sort, setSort] = useState("count_desc");
  const [limit, setLimit] = useState("25");

  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({
    done: 0,
    total: 0,
  });

  const [error, setError] = useState("");
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({
    draws: 0,
    prizes: 0,
    occurrences: 0,
  });

  const mountedRef = useRef(true);
  const runIdRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      runIdRef.current += 1;
    };
  }, []);

  const selectedLottery = useMemo(
    () =>
      LOTTERIES.find((item) => item.value === lotteryKey) ??
      LOTTERIES[0],
    [lotteryKey]
  );

  const animalOptions = useMemo(() => {
    const options = [
      {
        value: "Todos",
        label: "Todos",
      },
    ];

    for (let group = 1; group <= 25; group += 1) {
      options.push({
        value: String(group),
        label: `${pad2(group)} — ${
          getAnimalLabel(group) || `Grupo ${pad2(group)}`
        }`,
      });
    }

    return options;
  }, []);

  const safeRange = useMemo(() => {
    const from = isYmd(range.from)
      ? range.from
      : bounds.minYmd;

    const to = isYmd(range.to)
      ? range.to
      : bounds.maxYmd;

    return {
      from: from || "",
      to: to || "",
    };
  }, [range, bounds]);

  const boundsReady = Boolean(
    bounds.minYmd &&
      bounds.maxYmd
  );

  useEffect(() => {
    let alive = true;

    setError("");
    setRows([]);
    setMeta({
      draws: 0,
      prizes: 0,
      occurrences: 0,
    });

    (async () => {
      try {
        const response = await getKingBoundsByUf({
          uf: lotteryKey,
        });

        if (!alive) return;

        const normalized = normalizeBoundsResponse(response);

        if (!normalized.minYmd || !normalized.maxYmd) {
          throw new Error(
            `Período histórico não encontrado para ${lotteryKey}.`
          );
        }

        setBounds(normalized);

        setRange({
          from: normalized.minYmd,
          to: normalized.maxYmd,
        });
      } catch (caught) {
        if (!alive) return;

        setBounds({
          minYmd: "",
          maxYmd: "",
          source: "",
        });

        setRange({
          from: "",
          to: "",
        });

        setError(
          safeStr(caught?.message || caught) ||
            "Falha ao carregar o período histórico."
        );
      }
    })();

    return () => {
      alive = false;
    };
  }, [lotteryKey]);

  const handleLotteryChange = useCallback((nextLottery) => {
    if (!LOTTERIES.some((item) => item.value === nextLottery)) return;

    runIdRef.current += 1;

    setLoading(false);
    setProgress({
      done: 0,
      total: 0,
    });

    setRows([]);
    setMeta({
      draws: 0,
      prizes: 0,
      occurrences: 0,
    });

    setError("");
    setSchedule("Todos");
    setLotteryKey(nextLottery);
  }, []);

  const selectedGroup = useMemo(() => {
    if (animal === "Todos") return null;

    const group = Number(animal);

    return Number.isFinite(group) &&
      group >= 1 &&
      group <= 25
      ? group
      : null;
  }, [animal]);

  const selectedPosition = useMemo(() => {
    if (position === "Todos") return null;

    const parsed = Number(
      safeStr(position).replace(/\D+/g, "")
    );

    return Number.isFinite(parsed) &&
      parsed >= 1 &&
      parsed <= 7
      ? parsed
      : null;
  }, [position]);

  const selectedHourBucket = useMemo(() => {
    if (schedule === "Todos") return null;

    return hourBucket(schedule);
  }, [schedule]);

  const analyze = useCallback(async () => {
    const runId = runIdRef.current + 1;
    runIdRef.current = runId;

    const isCurrent = () =>
      mountedRef.current &&
      runIdRef.current === runId;

    setLoading(true);
    setError("");
    setRows([]);
    setMeta({
      draws: 0,
      prizes: 0,
      occurrences: 0,
    });

    try {
      if (!boundsReady) {
        throw new Error(
          "O período histórico ainda não foi carregado."
        );
      }

      const from = clampYmd(
        safeRange.from,
        bounds.minYmd,
        bounds.maxYmd
      );

      const to = clampYmd(
        safeRange.to,
        bounds.minYmd,
        bounds.maxYmd
      );

      if (!isYmd(from) || !isYmd(to)) {
        throw new Error("Intervalo de datas inválido.");
      }

      if (from > to) {
        throw new Error(
          "A data inicial não pode ser posterior à data final."
        );
      }

      const chunks = splitRange(from, to, 60);

      if (!chunks.length) {
        throw new Error(
          "Não foi possível dividir o período para análise."
        );
      }

      setProgress({
        done: 0,
        total: chunks.length,
      });

      const aggregate = new Map();

      let analyzedDraws = 0;
      let analyzedPrizes = 0;
      let occurrences = 0;
      let completedChunks = 0;

      const worker = async (chunk) => {
        if (!isCurrent()) return;

        const response = await getKingResultsByRange({
          uf: lotteryKey,
          dateFrom: chunk.from,
          dateTo: chunk.to,
          closeHourBucket: null,
          closeHour: selectedHourBucket
            ? `${selectedHourBucket.slice(0, 2)}:00`
            : null,
          positions: selectedPosition
            ? [selectedPosition]
            : null,
          mode: "detailed",
        });

        if (!isCurrent()) return;

        const draws = normalizeDrawsResponse(response);

        for (const draw of draws) {
          const ymd = normalizeYmd(
            draw?.ymd ??
              draw?.dateYmd ??
              draw?.date ??
              draw?.data ??
              ""
          );

          if (!ymd) continue;

          const drawHour = normalizeHour(
            draw?.close_hour ??
              draw?.closeHour ??
              draw?.hour ??
              draw?.hora ??
              draw?.close_hour_bucket ??
              ""
          );

          const drawHourBucket = hourBucket(drawHour);

          if (
            selectedHourBucket &&
            drawHourBucket !== selectedHourBucket
          ) {
            continue;
          }

          if (
            month !== "Todos" &&
            monthLabel(ymd) !== month
          ) {
            continue;
          }

          if (monthDay !== "Todos") {
            const day = Number(ymd.slice(8, 10));

            if (String(day) !== String(monthDay)) {
              continue;
            }
          }

          if (
            weekday !== "Todos" &&
            weekdayLabel(ymd) !== weekday
          ) {
            continue;
          }

          analyzedDraws += 1;

          const prizes = ensurePrizes(draw);

          for (const prize of prizes) {
            const prizePosition = Number(prize.position);
            const prizeGroup = Number(prize.group);

            if (
              selectedPosition &&
              prizePosition !== selectedPosition
            ) {
              continue;
            }

            if (
              selectedGroup &&
              prizeGroup !== selectedGroup
            ) {
              continue;
            }

            const number =
              prizePosition === 7
                ? lastDigits(prize.number, 3)
                : lastDigits(prize.number, 4);

            if (!number && mode !== "animal") continue;

            analyzedPrizes += 1;

            let key = "";

            if (mode === "dezena") {
              key = lastDigits(number, 2);
            } else if (mode === "centena") {
              key = lastDigits(number, 3);
            } else if (mode === "milhar") {
              if (prizePosition === 7) continue;
              key = lastDigits(number, 4);
            } else if (mode === "animal") {
              if (
                !Number.isFinite(prizeGroup) ||
                prizeGroup < 1 ||
                prizeGroup > 25
              ) {
                continue;
              }

              key = String(prizeGroup);
            }

            if (!key) continue;

            occurrences += 1;

            const latestKey = buildLatestKey(
              ymd,
              drawHour,
              prizePosition
            );

            const current = aggregate.get(key) ?? {
              key,
              count: 0,
              latestKey: "",
              latestYmd: "",
              latestHour: "",
              latestPosition: null,
            };

            current.count += 1;

            if (
              !current.latestKey ||
              latestKey > current.latestKey
            ) {
              current.latestKey = latestKey;
              current.latestYmd = ymd;
              current.latestHour =
                drawHourBucket ||
                drawHour ||
                "—";
              current.latestPosition =
                Number.isFinite(prizePosition)
                  ? prizePosition
                  : null;
            }

            aggregate.set(key, current);
          }
        }

        completedChunks += 1;

        if (isCurrent()) {
          setProgress({
            done: completedChunks,
            total: chunks.length,
          });
        }
      };

      await runPool(chunks, worker, 3);

      if (!isCurrent()) return;

      const output = Array.from(aggregate.values()).map(
        (item) => ({
          ...item,
          percent:
            occurrences > 0
              ? (item.count / occurrences) * 100
              : 0,
        })
      );

      setRows(output);
      setMeta({
        draws: analyzedDraws,
        prizes: analyzedPrizes,
        occurrences,
      });
    } catch (caught) {
      if (!isCurrent()) return;

      setError(
        safeStr(caught?.message || caught) ||
          "Falha ao calcular as estatísticas."
      );
    } finally {
      if (!isCurrent()) return;

      setLoading(false);
    }
  }, [
    lotteryKey,
    mode,
    boundsReady,
    safeRange,
    bounds,
    month,
    monthDay,
    weekday,
    selectedHourBucket,
    selectedGroup,
    selectedPosition,
  ]);

  const sortedRows = useMemo(() => {
    const output = [...rows];

    output.sort((a, b) => {
      if (sort === "count_asc") {
        if (a.count !== b.count) return a.count - b.count;
        return String(a.key).localeCompare(
          String(b.key),
          "pt-BR",
          { numeric: true }
        );
      }

      if (sort === "number_asc") {
        return String(a.key).localeCompare(
          String(b.key),
          "pt-BR",
          { numeric: true }
        );
      }

      if (sort === "number_desc") {
        return String(b.key).localeCompare(
          String(a.key),
          "pt-BR",
          { numeric: true }
        );
      }

      if (sort === "latest_desc") {
        return String(b.latestKey).localeCompare(
          String(a.latestKey)
        );
      }

      if (a.count !== b.count) return b.count - a.count;

      return String(a.key).localeCompare(
        String(b.key),
        "pt-BR",
        { numeric: true }
      );
    });

    const parsedLimit = Number(limit);

    if (
      Number.isFinite(parsedLimit) &&
      parsedLimit > 0
    ) {
      return output.slice(0, parsedLimit);
    }

    return output;
  }, [rows, sort, limit]);

  const mostFrequent = useMemo(() => {
    if (!rows.length) return null;

    return [...rows].sort((a, b) => {
      if (a.count !== b.count) return b.count - a.count;

      return String(a.key).localeCompare(
        String(b.key),
        "pt-BR",
        { numeric: true }
      );
    })[0];
  }, [rows]);

  const mostFrequentLabel = useMemo(() => {
    if (!mostFrequent) return "—";

    return itemLabel(mode, mostFrequent.key).main;
  }, [mode, mostFrequent]);

  return (
    <div className="ppStatistics">
      <style>{`
        .ppStatistics{
          width:100%;
          min-height:100%;
          padding:14px;
          color:#e9e9e9;
          background:
            radial-gradient(900px 500px at 15% 0%, rgba(202,166,75,0.08), transparent 58%),
            radial-gradient(850px 500px at 90% 10%, rgba(255,255,255,0.04), transparent 55%),
            #050505;
        }

        .ppStatistics *{
          box-sizing:border-box;
        }

        .ppStatsPanel{
          width:100%;
          min-height:calc(100dvh - 28px);
          border-radius:20px;
          border:1px solid rgba(202,166,75,0.18);
          background:rgba(0,0,0,0.48);
          box-shadow:0 24px 70px rgba(0,0,0,0.48);
          overflow:hidden;
        }

        .ppStatsHeader{
          padding:18px;
          border-bottom:1px solid rgba(255,255,255,0.07);
          display:flex;
          align-items:flex-start;
          justify-content:space-between;
          gap:16px;
          flex-wrap:wrap;
        }

        .ppStatsTitle{
          font-size:22px;
          line-height:1;
          font-weight:950;
          letter-spacing:0.2px;
          color:#f2f2f2;
        }

        .ppStatsSubtitle{
          margin-top:8px;
          font-size:12px;
          color:rgba(233,233,233,0.66);
          line-height:1.4;
        }

        .ppStatsTabs{
          display:flex;
          flex-wrap:wrap;
          gap:8px;
        }

        .ppStatsTab{
          min-height:40px;
          padding:9px 14px;
          border-radius:999px;
          border:1px solid rgba(202,166,75,0.24);
          background:rgba(0,0,0,0.48);
          color:rgba(233,233,233,0.84);
          font-size:11px;
          font-weight:900;
          text-transform:uppercase;
          letter-spacing:0.5px;
          cursor:pointer;
        }

        .ppStatsTab.isActive{
          border-color:rgba(202,166,75,0.72);
          background:rgba(202,166,75,0.17);
          color:#f4d77d;
          box-shadow:0 12px 34px rgba(0,0,0,0.32);
        }

        .ppStatsFilters{
          padding:14px;
          display:flex;
          flex-wrap:wrap;
          align-items:center;
          justify-content:center;
          gap:9px;
          border-bottom:1px solid rgba(255,255,255,0.07);
        }

        .ppStatsControl{
          min-height:38px;
          padding:6px 10px;
          border-radius:999px;
          border:1px solid rgba(202,166,75,0.18);
          background:rgba(0,0,0,0.58);
          display:flex;
          align-items:center;
          gap:7px;
          box-shadow:0 10px 26px rgba(0,0,0,0.26);
        }

        .ppStatsControl label{
          font-size:10px;
          color:rgba(233,233,233,0.58);
          white-space:nowrap;
        }

        .ppStatsControl select,
        .ppStatsControl input{
          min-width:0;
          border:none;
          outline:none;
          background:transparent;
          color:#e9e9e9;
          font-size:12px;
          font-weight:900;
        }

        .ppStatsControl select option{
          background:#0b0b0b;
          color:#e9e9e9;
        }

        .ppStatsAnalyze{
          min-height:40px;
          padding:9px 17px;
          border-radius:999px;
          border:1px solid rgba(202,166,75,0.68);
          background:rgba(202,166,75,0.18);
          color:#f4d77d;
          font-size:12px;
          font-weight:950;
          cursor:pointer;
          box-shadow:0 12px 30px rgba(0,0,0,0.34);
        }

        .ppStatsAnalyze:disabled{
          opacity:0.54;
          cursor:not-allowed;
        }

        .ppStatsError{
          margin:14px 14px 0;
          padding:10px 12px;
          border-radius:12px;
          border:1px solid rgba(255,90,90,0.27);
          background:rgba(255,90,90,0.08);
          color:rgba(255,224,224,0.95);
          font-size:12px;
          white-space:pre-wrap;
        }

        .ppStatsProgress{
          margin:14px 14px 0;
          padding:10px 12px;
          border-radius:12px;
          border:1px solid rgba(202,166,75,0.18);
          background:rgba(202,166,75,0.07);
          color:rgba(233,233,233,0.82);
          font-size:12px;
          font-weight:800;
        }

        .ppStatsKpis{
          padding:14px;
          display:grid;
          grid-template-columns:repeat(4, minmax(0,1fr));
          gap:10px;
        }

        .ppStatsKpi{
          min-width:0;
          padding:14px;
          border-radius:16px;
          border:1px solid rgba(202,166,75,0.15);
          background:
            linear-gradient(180deg, rgba(255,255,255,0.035), rgba(0,0,0,0.25)),
            rgba(0,0,0,0.44);
          box-shadow:0 14px 40px rgba(0,0,0,0.3);
        }

        .ppStatsKpiLabel{
          font-size:10px;
          color:rgba(233,233,233,0.58);
          text-transform:uppercase;
          letter-spacing:0.6px;
        }

        .ppStatsKpiValue{
          margin-top:6px;
          font-size:20px;
          font-weight:950;
          color:#caa64b;
          white-space:nowrap;
          overflow:hidden;
          text-overflow:ellipsis;
        }

        .ppStatsResults{
          padding:0 14px 14px;
        }

        .ppStatsToolbar{
          padding:11px 0;
          display:flex;
          justify-content:space-between;
          align-items:center;
          gap:10px;
          flex-wrap:wrap;
        }

        .ppStatsToolbarGroup{
          display:flex;
          gap:8px;
          align-items:center;
          flex-wrap:wrap;
        }

        .ppStatsToolbar label{
          font-size:10px;
          color:rgba(233,233,233,0.58);
          text-transform:uppercase;
          letter-spacing:0.5px;
        }

        .ppStatsToolbar select{
          min-height:36px;
          padding:7px 10px;
          border-radius:999px;
          border:1px solid rgba(202,166,75,0.18);
          background:#090909;
          color:#e9e9e9;
          font-size:11px;
          font-weight:900;
          outline:none;
        }

        .ppStatsTableWrap{
          width:100%;
          overflow:auto;
          border-radius:16px;
          border:1px solid rgba(255,255,255,0.07);
          background:rgba(0,0,0,0.3);
        }

        .ppStatsTable{
          width:100%;
          min-width:760px;
          border-collapse:collapse;
          table-layout:fixed;
        }

        .ppStatsTable th{
          position:sticky;
          top:0;
          z-index:2;
          padding:11px 10px;
          border-bottom:1px solid rgba(255,255,255,0.08);
          background:rgba(3,3,3,0.94);
          color:rgba(233,233,233,0.63);
          font-size:10px;
          text-transform:uppercase;
          letter-spacing:0.6px;
          text-align:center;
        }

        .ppStatsTable td{
          padding:10px;
          border-bottom:1px solid rgba(255,255,255,0.055);
          color:rgba(233,233,233,0.91);
          font-size:12px;
          text-align:center;
        }

        .ppStatsTable tbody tr:hover td{
          background:rgba(202,166,75,0.055);
        }

        .ppStatsRank{
          font-weight:950;
          color:#caa64b;
        }

        .ppStatsNumber{
          font-size:15px;
          font-weight:950;
          letter-spacing:0.7px;
          font-variant-numeric:tabular-nums;
        }

        .ppStatsSecondary{
          margin-top:3px;
          font-size:10px;
          color:rgba(233,233,233,0.52);
        }

        .ppStatsBarCell{
          display:flex;
          align-items:center;
          gap:9px;
        }

        .ppStatsBarTrack{
          flex:1 1 auto;
          min-width:80px;
          height:7px;
          border-radius:999px;
          overflow:hidden;
          background:rgba(255,255,255,0.08);
        }

        .ppStatsBar{
          height:100%;
          border-radius:999px;
          background:linear-gradient(90deg, rgba(202,166,75,0.58), rgba(244,215,125,0.95));
        }

        .ppStatsEmpty{
          padding:34px 18px;
          text-align:center;
          color:rgba(233,233,233,0.62);
          font-size:13px;
        }

        @media (max-width:980px){
          .ppStatistics{
            padding:10px;
          }

          .ppStatsPanel{
            min-height:auto;
          }

          .ppStatsHeader{
            padding:14px;
          }

          .ppStatsTabs{
            width:100%;
          }

          .ppStatsTab{
            flex:1 1 calc(50% - 8px);
          }

          .ppStatsFilters{
            align-items:stretch;
          }

          .ppStatsControl{
            width:calc(50% - 5px);
            border-radius:14px;
            justify-content:space-between;
          }

          .ppStatsControl select,
          .ppStatsControl input{
            width:100%;
          }

          .ppStatsAnalyze{
            width:100%;
          }

          .ppStatsKpis{
            grid-template-columns:repeat(2, minmax(0,1fr));
          }
        }

        @media (max-width:560px){
          .ppStatsControl{
            width:100%;
          }

          .ppStatsKpis{
            grid-template-columns:1fr 1fr;
          }

          .ppStatsKpi{
            padding:12px;
          }

          .ppStatsKpiValue{
            font-size:16px;
          }
        }
      `}</style>

      <section className="ppStatsPanel">
        <header className="ppStatsHeader">
          <div>
            <div className="ppStatsTitle">Estatísticas</div>
            <div className="ppStatsSubtitle">
              Ranking histórico conforme a loteria, período, horário,
              animal e posição selecionados.
            </div>
          </div>

          <div
            className="ppStatsTabs"
            role="tablist"
            aria-label="Tipo de ranking"
          >
            {MODES.map((item) => (
              <button
                key={item.value}
                type="button"
                className={[
                  "ppStatsTab",
                  mode === item.value ? "isActive" : "",
                ].join(" ")}
                onClick={() => {
                  runIdRef.current += 1;
                  setLoading(false);
                  setRows([]);
                  setMeta({
                    draws: 0,
                    prizes: 0,
                    occurrences: 0,
                  });
                  setMode(item.value);
                }}
                aria-selected={mode === item.value}
                role="tab"
              >
                {item.label}
              </button>
            ))}
          </div>
        </header>

        <div className="ppStatsFilters">
          <div className="ppStatsControl">
            <label>Loteria</label>
            <select
              value={lotteryKey}
              onChange={(event) =>
                handleLotteryChange(event.target.value)
              }
              disabled={loading}
            >
              {LOTTERIES.map((item) => (
                <option
                  key={item.value}
                  value={item.value}
                >
                  {item.label}
                </option>
              ))}
            </select>
          </div>

          <div className="ppStatsControl">
            <label>De</label>
            <input
              type="date"
              value={safeRange.from}
              min={bounds.minYmd || undefined}
              max={bounds.maxYmd || undefined}
              onChange={(event) =>
                setRange((current) => ({
                  ...current,
                  from: event.target.value,
                }))
              }
              disabled={!boundsReady || loading}
            />
          </div>

          <div className="ppStatsControl">
            <label>Até</label>
            <input
              type="date"
              value={safeRange.to}
              min={bounds.minYmd || undefined}
              max={bounds.maxYmd || undefined}
              onChange={(event) =>
                setRange((current) => ({
                  ...current,
                  to: event.target.value,
                }))
              }
              disabled={!boundsReady || loading}
            />
          </div>

          <div className="ppStatsControl">
            <label>Mês</label>
            <select
              value={month}
              onChange={(event) =>
                setMonth(event.target.value)
              }
              disabled={loading}
            >
              {MONTHS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>

          <div className="ppStatsControl">
            <label>Dia</label>
            <select
              value={monthDay}
              onChange={(event) =>
                setMonthDay(event.target.value)
              }
              disabled={loading}
            >
              {[
                "Todos",
                ...Array.from(
                  { length: 31 },
                  (_, index) => String(index + 1)
                ),
              ].map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>

          <div className="ppStatsControl">
            <label>Semana</label>
            <select
              value={weekday}
              onChange={(event) =>
                setWeekday(event.target.value)
              }
              disabled={loading}
            >
              {WEEKDAYS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>

          <div className="ppStatsControl">
            <label>Horário</label>
            <select
              value={schedule}
              onChange={(event) =>
                setSchedule(event.target.value)
              }
              disabled={loading}
            >
              {[
                "Todos",
                ...selectedLottery.hours,
              ].map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>

          <div className="ppStatsControl">
            <label>Animal</label>
            <select
              value={animal}
              onChange={(event) =>
                setAnimal(event.target.value)
              }
              disabled={loading}
            >
              {animalOptions.map((item) => (
                <option
                  key={item.value}
                  value={item.value}
                >
                  {item.label}
                </option>
              ))}
            </select>
          </div>

          <div className="ppStatsControl">
            <label>Posição</label>
            <select
              value={position}
              onChange={(event) =>
                setPosition(event.target.value)
              }
              disabled={loading}
            >
              {[
                "Todos",
                "1º",
                "2º",
                "3º",
                "4º",
                "5º",
                "6º",
                "7º",
              ].map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            className="ppStatsAnalyze"
            onClick={analyze}
            disabled={!boundsReady || loading}
          >
            {loading
              ? "Analisando..."
              : "Gerar ranking"}
          </button>
        </div>

        {error ? (
          <div className="ppStatsError">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="ppStatsProgress">
            Processando período:{" "}
            {formatInteger(progress.done)} de{" "}
            {formatInteger(progress.total)} blocos.
          </div>
        ) : null}

        <div className="ppStatsKpis">
          <div className="ppStatsKpi">
            <div className="ppStatsKpiLabel">
              Resultados analisados
            </div>
            <div className="ppStatsKpiValue">
              {formatInteger(meta.draws)}
            </div>
          </div>

          <div className="ppStatsKpi">
            <div className="ppStatsKpiLabel">
              Prêmios filtrados
            </div>
            <div className="ppStatsKpiValue">
              {formatInteger(meta.prizes)}
            </div>
          </div>

          <div className="ppStatsKpi">
            <div className="ppStatsKpiLabel">
              Números distintos
            </div>
            <div className="ppStatsKpiValue">
              {formatInteger(rows.length)}
            </div>
          </div>

          <div className="ppStatsKpi">
            <div className="ppStatsKpiLabel">
              Mais frequente
            </div>
            <div
              className="ppStatsKpiValue"
              title={mostFrequentLabel}
            >
              {mostFrequentLabel}
            </div>
          </div>
        </div>

        <div className="ppStatsResults">
          <div className="ppStatsToolbar">
            <div className="ppStatsToolbarGroup">
              <label>Ordenar</label>
              <select
                value={sort}
                onChange={(event) =>
                  setSort(event.target.value)
                }
              >
                {SORTS.map((item) => (
                  <option
                    key={item.value}
                    value={item.value}
                  >
                    {item.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="ppStatsToolbarGroup">
              <label>Exibir</label>
              <select
                value={limit}
                onChange={(event) =>
                  setLimit(event.target.value)
                }
              >
                <option value="10">Top 10</option>
                <option value="25">Top 25</option>
                <option value="50">Top 50</option>
                <option value="0">Todos</option>
              </select>
            </div>
          </div>

          <div className="ppStatsTableWrap">
            <table className="ppStatsTable">
              <thead>
                <tr>
                  <th style={{ width: 80 }}>
                    Ranking
                  </th>
                  <th style={{ width: 180 }}>
                    {mode === "animal"
                      ? "Animal"
                      : "Número"}
                  </th>
                  <th style={{ width: 130 }}>
                    Ocorrências
                  </th>
                  <th style={{ width: 230 }}>
                    Participação
                  </th>
                  <th style={{ width: 210 }}>
                    Última aparição
                  </th>
                </tr>
              </thead>

              <tbody>
                {sortedRows.map((row, index) => {
                  const label = itemLabel(
                    mode,
                    row.key
                  );

                  const relativeWidth =
                    mostFrequent?.count > 0
                      ? Math.max(
                          2,
                          (row.count /
                            mostFrequent.count) *
                            100
                        )
                      : 0;

                  return (
                    <tr key={row.key}>
                      <td className="ppStatsRank">
                        {index + 1}º
                      </td>

                      <td>
                        <div className="ppStatsNumber">
                          {label.main}
                        </div>
                        <div className="ppStatsSecondary">
                          {label.secondary}
                        </div>
                      </td>

                      <td>
                        <strong>
                          {formatInteger(row.count)}
                        </strong>
                      </td>

                      <td>
                        <div className="ppStatsBarCell">
                          <div className="ppStatsBarTrack">
                            <div
                              className="ppStatsBar"
                              style={{
                                width: `${relativeWidth}%`,
                              }}
                            />
                          </div>

                          <strong>
                            {formatPercent(row.percent)}%
                          </strong>
                        </div>
                      </td>

                      <td>
                        <div>
                          {ymdToBr(row.latestYmd)}
                        </div>

                        <div className="ppStatsSecondary">
                          {row.latestHour || "—"}
                          {row.latestPosition
                            ? ` · ${row.latestPosition}º prêmio`
                            : ""}
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {!sortedRows.length ? (
                  <tr>
                    <td colSpan={5}>
                      <div className="ppStatsEmpty">
                        Selecione os filtros e toque em
                        “Gerar ranking”.
                      </div>
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
