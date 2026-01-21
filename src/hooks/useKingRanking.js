// src/hooks/useKingRanking.js
import { useEffect, useMemo, useRef, useState } from "react";
import {
  getKingResultsByDate,
  getKingResultsByRange,
  getKingBoundsByUf,
  hydrateKingDrawsWithPrizes,
  AGGREGATED_AUTO_DAYS,
} from "../services/kingResultsService";
import { buildRanking } from "../utils/buildRanking";
import { buildPalpite } from "../utils/buildPalpites";

/* =========================
   Utils
========================= */

function pad2(n) {
  return String(n).padStart(2, "0");
}

function isIndexErrorMessage(err) {
  const msg = String(err?.message || err || "").toLowerCase();
  const code = String(err?.code || "").toLowerCase();

  return (
    code.includes("failed-precondition") ||
    msg.includes("failed_precondition") ||
    msg.includes("requires an index") ||
    (msg.includes("index") && msg.includes("create")) ||
    msg.includes("falta indice") ||
    msg.includes("falta índice") ||
    msg.includes("falta índice composto") ||
    msg.includes("falta indice composto") ||
    msg.includes("firestore: falta índice") ||
    msg.includes("firestore: falta indice")
  );
}

function normalizeToYMD(input) {
  if (!input) return null;

  // Firestore Timestamp com toDate()
  if (typeof input === "object" && typeof input.toDate === "function") {
    const d = input.toDate();
    if (d instanceof Date && !Number.isNaN(d.getTime())) {
      return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    }
  }

  // Timestamp-like { seconds } / { _seconds }
  if (
    typeof input === "object" &&
    (Number.isFinite(Number(input.seconds)) ||
      Number.isFinite(Number(input._seconds)))
  ) {
    const sec = Number.isFinite(Number(input.seconds))
      ? Number(input.seconds)
      : Number(input._seconds);

    const d = new Date(sec * 1000);
    if (!Number.isNaN(d.getTime())) {
      return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    }
  }

  if (input instanceof Date && !Number.isNaN(input.getTime())) {
    return `${input.getFullYear()}-${pad2(input.getMonth() + 1)}-${pad2(
      input.getDate()
    )}`;
  }

  const s = String(input).trim();
  if (!s) return null;

  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;

  return null;
}

function ymdToNumber(ymd) {
  if (!ymd) return NaN;
  const m = String(ymd).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return NaN;
  return Number(`${m[1]}${m[2]}${m[3]}`);
}

function dayDiffInclusiveUTC(ymdFrom, ymdTo) {
  const toUTC = (ymd) => {
    const m = String(ymd).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  };

  const da = toUTC(ymdFrom);
  const db = toUTC(ymdTo);
  if (!da || !db) return NaN;

  const ms = db.getTime() - da.getTime();
  if (!Number.isFinite(ms)) return NaN;

  return Math.floor(ms / 86400000) + 1;
}

function normalizePositionsFromKey(positionsInputKey) {
  const key = String(positionsInputKey || "").trim();
  if (!key) return null;

  const nums = key
    .split(",")
    .map((x) => Number(String(x).trim()))
    .filter((n) => Number.isFinite(n));

  if (!nums.length) return null;
  return Array.from(new Set(nums)).sort((a, b) => a - b);
}

/**
 * ✅ Normaliza close_hour para HH:MM (robusto)
 */
function normHHMM(value) {
  const s = String(value || "").trim();
  if (!s) return "";

  const mh = s.match(/^(\d{1,2})h$/i);
  if (mh) return `${String(mh[1]).padStart(2, "0")}:00`;

  const mISO = s.match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/);
  if (mISO) {
    const hh = String(mISO[1]).padStart(2, "0");
    const mm = String(mISO[2]).padStart(2, "0");
    return `${hh}:${mm}`;
  }

  const m2 = s.match(/^(\d{1,2})$/);
  if (m2) return `${String(m2[1]).padStart(2, "0")}:00`;

  return s;
}

function toHourBucketLabel(closeHour) {
  const hhmm = normHHMM(closeHour);
  if (!hhmm) return null;

  const hh = hhmm.slice(0, 2);
  if (!/^\d{2}$/.test(hh)) return null;
  return `${hh}h`;
}

function getDrawDateRaw(d) {
  if (!d) return null;
  return d.date ?? d.ymd ?? d.draw_date ?? d.close_date ?? d.data ?? d.dt ?? null;
}

function getDrawHourRaw(d) {
  if (!d) return "";
  return String(d.close_hour ?? d.closeHour ?? d.hour ?? d.hora ?? "").trim();
}

/**
 * ✅ Dedup “de verdade” (alinhado ao service)
 */
function dedupeDrawsLogicalPreferBest(draws) {
  const arr = Array.isArray(draws) ? draws : [];
  if (!arr.length) return arr;

  const byKey = new Map();
  const order = [];

  const score = (d) => {
    const prizesLen = Array.isArray(d?.prizes) ? d.prizes.length : 0;
    const pc = Number.isFinite(Number(d?.prizesCount))
      ? Number(d.prizesCount)
      : 0;
    const ymd = normalizeToYMD(getDrawDateRaw(d));
    const hhmm = normHHMM(getDrawHourRaw(d));
    const hasLogical = !!(ymd && hhmm);
    return prizesLen * 1_000_000 + pc * 1_000 + (hasLogical ? 10 : 0);
  };

  for (let i = 0; i < arr.length; i += 1) {
    const d = arr[i] || {};
    const ymd = normalizeToYMD(getDrawDateRaw(d)) || "";
    const hhmm = normHHMM(getDrawHourRaw(d)) || "";

    const id =
      (d?.drawId != null && String(d.drawId)) ||
      (d?.id != null && String(d.id)) ||
      "";

    const hasLogical = !!(ymd && hhmm);
    const key = hasLogical ? `${ymd}__${hhmm}` : `id__${id || `idx_${i}`}`;

    if (!byKey.has(key)) {
      byKey.set(key, d);
      order.push(key);
      continue;
    }

    const prev = byKey.get(key);
    if (score(d) > score(prev)) {
      byKey.set(key, d);
    }
  }

  return order.map((k) => byKey.get(k)).filter(Boolean);
}

/**
 * ✅ Normalização final para UI/Charts
 */
function normalizeDrawForCharts(d) {
  const ymd = d?.ymd || normalizeToYMD(getDrawDateRaw(d));
  const closeHour = normHHMM(getDrawHourRaw(d));

  const prizes = Array.isArray(d?.prizes) ? d.prizes : [];

  return {
    ...d,
    date: ymd || d?.date || null,
    ymd: ymd || null,
    close_hour: closeHour || "",
    closeHour: closeHour || "",
    prizes,
  };
}

/* =========================
   Auto-refresh (Opção B) — SEM FLICKER
========================= */

function clampMs(n, min, max) {
  const x = Number(n);
  if (!Number.isFinite(x)) return min;
  return Math.max(min, Math.min(max, x));
}

function clampYmdToBounds(ymd, minYmd, maxYmd) {
  if (!ymd) return null;

  const n = ymdToNumber(ymd);
  const a = ymdToNumber(minYmd);
  const b = ymdToNumber(maxYmd);

  if (!Number.isFinite(n)) return null;

  if (Number.isFinite(a) && n < a) return minYmd;
  if (Number.isFinite(b) && n > b) return maxYmd;
  return ymd;
}

function clampRangeToBounds(ymdFrom, ymdTo, minYmd, maxYmd) {
  let a = ymdFrom || null;
  let b = ymdTo || null;

  if (minYmd || maxYmd) {
    a = clampYmdToBounds(a, minYmd, maxYmd);
    b = clampYmdToBounds(b, minYmd, maxYmd);
  }

  const na = ymdToNumber(a);
  const nb = ymdToNumber(b);
  if (Number.isFinite(na) && Number.isFinite(nb) && na > nb) {
    return { ymdFrom: b, ymdTo: a };
  }

  return { ymdFrom: a, ymdTo: b };
}

function normalizeBucketInput(bucket) {
  const s = String(bucket || "").trim();
  if (!s) return null;
  const m = s.match(/^(\d{1,2})h$/i);
  if (m) return `${String(m[1]).padStart(2, "0")}h`;
  return s;
}

/**
 * ✅ Decide o modo do service no RANGE (performance/UX)
 */
function decideRangeServiceMode(rangeDays) {
  const THRESHOLD = Number.isFinite(Number(AGGREGATED_AUTO_DAYS))
    ? Number(AGGREGATED_AUTO_DAYS)
    : 60;

  if (!Number.isFinite(rangeDays) || rangeDays <= 0) return "detailed";
  return rangeDays >= THRESHOLD ? "aggregated" : "detailed";
}

/* =========================
   ✅ Bounds cache com TTL (CORREÇÃO DO "TRAVOU NA DATA")
========================= */

const BOUNDS_TTL_MS = 10 * 60 * 1000; // 10 min (ajuste se quiser)
function nowMs() {
  return Date.now();
}

const INITIAL_BOUNDS = {
  ok: false,
  uf: null,
  minYmd: null,
  maxYmd: null,
  source: "none",
};

const INITIAL_META = {
  top3: [],
  totalOcorrencias: 0,
  totalDraws: 0,
  mode: "none",
  date: null,
  dateFrom: null,
  dateTo: null,

  palpitesByGrupo: {},
  palpiteSampleDrawsUsed: 0,
  palpiteUsedBucket: null,

  bounds: { ...INITIAL_BOUNDS },
  suggestedRange: { from: null, to: null },

  serviceMode: "detailed",
  hydrating: false,
};

export function useKingRanking({
  uf,
  date,
  dateFrom,
  dateTo,
  closeHourBucket = null,
  positions = null,
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [data, setData] = useState([]);
  const [meta, setMeta] = useState(INITIAL_META);

  const [drawsRaw, setDrawsRaw] = useState([]);

  // ✅ cache: uf -> { ts, data }
  const boundsCacheRef = useRef(new Map());

  const [bounds, setBounds] = useState(INITIAL_BOUNDS);

  const [boundsRetryTick, setBoundsRetryTick] = useState(0);
  const boundsRetryTimerRef = useRef(null);

  // ✅ “soft tick” pra permitir refresh de bounds (sem spam)
  const [boundsSoftTick, setBoundsSoftTick] = useState(0);

  // ✅ no foco, tenta atualizar bounds (respeitando TTL)
  useEffect(() => {
    const onFocus = () => setBoundsSoftTick((t) => t + 1);
    if (typeof window !== "undefined") window.addEventListener("focus", onFocus);
    return () => {
      if (typeof window !== "undefined")
        window.removeEventListener("focus", onFocus);
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    async function loadBounds() {
      const key = String(uf || "").trim();
      if (!key) {
        if (mounted) setBounds(INITIAL_BOUNDS);
        return;
      }

      // ✅ cache com expiração
      if (boundsCacheRef.current.has(key)) {
        const cachedWrap = boundsCacheRef.current.get(key);
        const age = nowMs() - Number(cachedWrap?.ts || 0);

        if (cachedWrap?.data?.ok && Number.isFinite(age) && age < BOUNDS_TTL_MS) {
          if (mounted) setBounds(cachedWrap.data);
          return;
        }
      }

      try {
        const b = await getKingBoundsByUf({ uf: key });

        const safe = {
          ok: !!b?.ok,
          uf: key,
          minYmd: b?.minYmd || null,
          maxYmd: b?.maxYmd || null,
          source: b?.source || "none",
        };

        // ✅ salva no cache com timestamp (mesmo se ok=false, pra não martelar)
        boundsCacheRef.current.set(key, { ts: nowMs(), data: safe });

        if (mounted) setBounds(safe);

        if (mounted && !safe.ok) {
          if (boundsRetryTimerRef.current) clearTimeout(boundsRetryTimerRef.current);
          boundsRetryTimerRef.current = setTimeout(() => {
            if (mounted) setBoundsRetryTick((t) => t + 1);
          }, 10_000);
        }
      } catch {
        const safe = {
          ok: false,
          uf: key,
          minYmd: null,
          maxYmd: null,
          source: "none",
        };

        boundsCacheRef.current.set(key, { ts: nowMs(), data: safe });

        if (mounted) setBounds(safe);

        if (boundsRetryTimerRef.current) clearTimeout(boundsRetryTimerRef.current);
        boundsRetryTimerRef.current = setTimeout(() => {
          if (mounted) setBoundsRetryTick((t) => t + 1);
        }, 10_000);
      }
    }

    loadBounds();
    return () => {
      mounted = false;
      if (boundsRetryTimerRef.current) clearTimeout(boundsRetryTimerRef.current);
    };
  }, [uf, boundsRetryTick, boundsSoftTick]);

  const ymdDateRaw = useMemo(() => normalizeToYMD(date), [date]);
  const ymdFromRaw = useMemo(() => normalizeToYMD(dateFrom), [dateFrom]);
  const ymdToRaw = useMemo(() => normalizeToYMD(dateTo), [dateTo]);

  const bucketNorm = useMemo(
    () => normalizeBucketInput(closeHourBucket),
    [closeHourBucket]
  );

  const positionsEffective = useMemo(() => {
    return Array.isArray(positions) && positions.length ? positions : null;
  }, [positions]);

  const positionsInputKey = useMemo(() => {
    if (!Array.isArray(positionsEffective) || !positionsEffective.length) return "";
    return positionsEffective.map((n) => String(n)).join(",");
  }, [positionsEffective]);

  const positionsArrStable = useMemo(
    () => normalizePositionsFromKey(positionsInputKey),
    [positionsInputKey]
  );

  const positionsKey = useMemo(
    () => (positionsArrStable ? positionsArrStable.join(",") : ""),
    [positionsArrStable]
  );

  const hourBucketKey = useMemo(() => String(bucketNorm || ""), [bucketNorm]);

  const ymdDate = useMemo(() => {
    return clampYmdToBounds(ymdDateRaw, bounds.minYmd, bounds.maxYmd);
  }, [ymdDateRaw, bounds.minYmd, bounds.maxYmd]);

  const { ymdFrom, ymdTo } = useMemo(() => {
    const na = ymdToNumber(ymdFromRaw);
    const nb = ymdToNumber(ymdToRaw);

    const a0 =
      Number.isFinite(na) && Number.isFinite(nb) && na > nb ? ymdToRaw : ymdFromRaw;
    const b0 =
      Number.isFinite(na) && Number.isFinite(nb) && na > nb ? ymdFromRaw : ymdToRaw;

    return clampRangeToBounds(a0, b0, bounds.minYmd, bounds.maxYmd);
  }, [ymdFromRaw, ymdToRaw, bounds.minYmd, bounds.maxYmd]);

  const mode = useMemo(() => {
    if (uf && ymdFrom && ymdTo && ymdFrom !== ymdTo) return "range";
    if (uf && ymdDate) return "day";
    return "none";
  }, [uf, ymdDate, ymdFrom, ymdTo]);

  const rangeDays = useMemo(() => {
    if (mode !== "range") return NaN;
    return dayDiffInclusiveUTC(ymdFrom, ymdTo);
  }, [mode, ymdFrom, ymdTo]);

  const RANGE_FALLBACK_LIMIT_DAYS = 31;

  const rangeBlockedKeyRef = useRef("");
  const rangeBlockedRef = useRef(false);

  useEffect(() => {
    const k = [mode, uf || "", ymdFrom || "", ymdTo || ""].join("|");
    if (rangeBlockedKeyRef.current !== k) {
      rangeBlockedKeyRef.current = k;
      rangeBlockedRef.current = false;
    }
  }, [mode, uf, ymdFrom, ymdTo]);

  const autoRefreshEnabled = useMemo(() => {
    if (mode === "none") return false;

    if (
      mode === "range" &&
      rangeBlockedRef.current &&
      Number.isFinite(rangeDays) &&
      rangeDays > RANGE_FALLBACK_LIMIT_DAYS
    ) {
      return false;
    }

    if (mode === "day") return true;

    if (!Number.isFinite(rangeDays)) return true;

    const REFRESH_MAX_DAYS = 45;
    return rangeDays <= REFRESH_MAX_DAYS;
  }, [mode, rangeDays]);

  const AUTO_REFRESH_MS = 60_000;
  const intervalMs = useMemo(() => clampMs(AUTO_REFRESH_MS, 30_000, 300_000), []);

  const [refreshTick, setRefreshTick] = useState(0);
  const refreshSeqRef = useRef(0);

  const hydrateSeqRef = useRef(0);

  const hardKey = useMemo(() => {
    return [
      mode,
      uf || "",
      ymdDate || "",
      ymdFrom || "",
      ymdTo || "",
      hourBucketKey || "",
      positionsKey || "",
      bounds.minYmd || "",
      bounds.maxYmd || "",
    ].join("|");
  }, [
    mode,
    uf,
    ymdDate,
    ymdFrom,
    ymdTo,
    hourBucketKey,
    positionsKey,
    bounds.minYmd,
    bounds.maxYmd,
  ]);

  const lastHardKeyRef = useRef("");

  useEffect(() => {
    if (!autoRefreshEnabled) return;

    const id = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      setRefreshTick((t) => t + 1);
    }, intervalMs);

    return () => clearInterval(id);
  }, [intervalMs, autoRefreshEnabled]);

  useEffect(() => {
    const bump = () => setRefreshTick((t) => t + 1);

    const onVisibility = () => {
      if (typeof document === "undefined") return;
      if (!document.hidden) bump();
    };

    if (typeof window !== "undefined") window.addEventListener("focus", bump);
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibility);
    }

    return () => {
      if (typeof window !== "undefined") window.removeEventListener("focus", bump);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibility);
      }
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    async function load({ hard = false } = {}) {
      const mySeq = ++refreshSeqRef.current;

      hydrateSeqRef.current += 1;
      const myHydrateSeq = hydrateSeqRef.current;

      try {
        if (hard) setLoading(true);
        setError(null);

        if (
          mode === "range" &&
          rangeBlockedRef.current &&
          Number.isFinite(rangeDays) &&
          rangeDays > RANGE_FALLBACK_LIMIT_DAYS
        ) {
          throw new Error(
            `Firestore: consulta de RANGE longa está bloqueada após erro de índice.\n` +
              `Seu range atual tem ${rangeDays} dias.\n\n` +
              `Obs: fallback automático só cobre até ${RANGE_FALLBACK_LIMIT_DAYS} dias.`
          );
        }

        let draws = [];
        let serviceMode = "detailed";

        if (mode === "range") {
          serviceMode = decideRangeServiceMode(rangeDays);

          draws = await getKingResultsByRange({
            uf,
            dateFrom: ymdFrom,
            dateTo: ymdTo,
            closeHour: null,
            positions: positionsArrStable,
            mode: serviceMode,
          });
        } else if (mode === "day") {
          serviceMode = "detailed";
          draws = await getKingResultsByDate({
            uf,
            date: ymdDate,
            closeHour: null,
            positions: positionsArrStable,
          });
        } else {
          draws = [];
        }

        if (!mounted || mySeq !== refreshSeqRef.current) return;

        rangeBlockedRef.current = false;

        let unique = dedupeDrawsLogicalPreferBest(draws).map(normalizeDrawForCharts);

        if (bucketNorm) {
          unique = unique.filter((d) => toHourBucketLabel(d?.close_hour) === bucketNorm);
        }

        setDrawsRaw(unique);

        const hasAnyPrize = unique.some(
          (d) => Array.isArray(d?.prizes) && d.prizes.length
        );

        if (serviceMode === "detailed") {
          if (hasAnyPrize) {
            const built = buildRanking(unique);
            setData(built.ranking || []);

            const palpiteBuilt = buildPalpite(unique, {
              minDraws: 400,
              maxDraws: 2000,
            });

            setMeta((prev) => ({
              ...prev,
              top3: built.top3 || [],
              totalOcorrencias: Number(built.totalOcorrencias || 0),
              totalDraws: unique.length,
              mode,
              date: mode === "day" ? ymdDate : null,
              dateFrom: mode === "range" ? ymdFrom : null,
              dateTo: mode === "range" ? ymdTo : null,

              palpitesByGrupo: palpiteBuilt?.palpitesByGrupo || {},
              palpiteSampleDrawsUsed: Number(palpiteBuilt?.sampleDrawsUsed || 0),
              palpiteUsedBucket: palpiteBuilt?.usedBucket ?? null,

              bounds: {
                ok: !!bounds?.ok,
                uf: bounds?.uf || uf || null,
                minYmd: bounds?.minYmd || null,
                maxYmd: bounds?.maxYmd || null,
                source: bounds?.source || "none",
              },

              suggestedRange: {
                from: bounds?.minYmd || null,
                to: bounds?.maxYmd || null,
              },

              serviceMode,
              hydrating: false,
            }));
          } else {
            setData([]);
            setMeta((prev) => ({
              ...prev,
              top3: [],
              totalOcorrencias: 0,
              totalDraws: unique.length,
              mode,
              date: mode === "day" ? ymdDate : null,
              dateFrom: mode === "range" ? ymdFrom : null,
              dateTo: mode === "range" ? ymdTo : null,

              palpitesByGrupo: {},
              palpiteSampleDrawsUsed: 0,
              palpiteUsedBucket: null,

              bounds: {
                ok: !!bounds?.ok,
                uf: bounds?.uf || uf || null,
                minYmd: bounds?.minYmd || null,
                maxYmd: bounds?.maxYmd || null,
                source: bounds?.source || "none",
              },

              suggestedRange: {
                from: bounds?.minYmd || null,
                to: bounds?.maxYmd || null,
              },

              serviceMode,
              hydrating: false,
            }));
          }

          return;
        }

        // aggregated
        setMeta((prev) => ({
          ...prev,
          totalDraws: unique.length,
          mode,
          date: null,
          dateFrom: mode === "range" ? ymdFrom : null,
          dateTo: mode === "range" ? ymdTo : null,

          bounds: {
            ok: !!bounds?.ok,
            uf: bounds?.uf || uf || null,
            minYmd: bounds?.minYmd || null,
            maxYmd: bounds?.maxYmd || null,
            source: bounds?.source || "none",
          },

          suggestedRange: {
            from: bounds?.minYmd || null,
            to: bounds?.maxYmd || null,
          },

          serviceMode,
          hydrating: mode === "range" && serviceMode === "aggregated",
        }));

        if (mode === "range" && serviceMode === "aggregated") {
          (async () => {
            try {
              if (!mounted) return;
              if (mySeq !== refreshSeqRef.current) return;
              if (myHydrateSeq !== hydrateSeqRef.current) return;

              const hydrated = await hydrateKingDrawsWithPrizes({
                draws: unique,
                positions: positionsArrStable,
              });

              if (!mounted) return;
              if (mySeq !== refreshSeqRef.current) return;
              if (myHydrateSeq !== hydrateSeqRef.current) return;

              let hydratedFiltered = hydrated;

              if (bucketNorm) {
                hydratedFiltered = hydratedFiltered.filter(
                  (d) => toHourBucketLabel(d?.close_hour) === bucketNorm
                );
              }

              hydratedFiltered = dedupeDrawsLogicalPreferBest(hydratedFiltered).map(
                normalizeDrawForCharts
              );

              const built = buildRanking(hydratedFiltered);

              setDrawsRaw(hydratedFiltered);
              setData(built.ranking || []);

              const palpiteBuilt = buildPalpite(hydratedFiltered, {
                minDraws: 400,
                maxDraws: 2000,
              });

              setMeta((prev) => ({
                ...prev,
                top3: built.top3 || [],
                totalOcorrencias: Number(built.totalOcorrencias || 0),
                totalDraws: hydratedFiltered.length,
                mode,
                date: null,
                dateFrom: ymdFrom,
                dateTo: ymdTo,

                palpitesByGrupo: palpiteBuilt?.palpitesByGrupo || {},
                palpiteSampleDrawsUsed: Number(palpiteBuilt?.sampleDrawsUsed || 0),
                palpiteUsedBucket: palpiteBuilt?.usedBucket ?? null,

                bounds: {
                  ok: !!bounds?.ok,
                  uf: bounds?.uf || uf || null,
                  minYmd: bounds?.minYmd || null,
                  maxYmd: bounds?.maxYmd || null,
                  source: bounds?.source || "none",
                },

                suggestedRange: {
                  from: bounds?.minYmd || null,
                  to: bounds?.maxYmd || null,
                },

                serviceMode: "detailed",
                hydrating: false,
              }));
            } catch {
              if (!mounted) return;
              if (mySeq !== refreshSeqRef.current) return;
              if (myHydrateSeq !== hydrateSeqRef.current) return;

              setMeta((prev) => ({
                ...prev,
                hydrating: false,
              }));
            }
          })();
        }
      } catch (e) {
        if (!mounted) return;
        if (refreshSeqRef.current && mySeq !== refreshSeqRef.current) return;

        if (
          mode === "range" &&
          isIndexErrorMessage(e) &&
          Number.isFinite(rangeDays) &&
          rangeDays > RANGE_FALLBACK_LIMIT_DAYS
        ) {
          rangeBlockedRef.current = true;
        }

        setMeta((prev) => ({ ...prev, hydrating: false }));
        setError(e instanceof Error ? e : new Error("Erro desconhecido"));
      } finally {
        if (mounted && mySeq === refreshSeqRef.current) {
          setLoading(false);
        }
      }
    }

    if (mode === "none") {
      setError(null);
      setDrawsRaw([]);
      setData([]);
      setMeta(INITIAL_META);
      setLoading(false);
      return () => {
        mounted = false;
      };
    }

    const isHard = lastHardKeyRef.current !== hardKey;
    lastHardKeyRef.current = hardKey;

    load({ hard: isHard });

    return () => {
      mounted = false;
    };
  }, [
    mode,
    uf,
    ymdDate,
    ymdFrom,
    ymdTo,
    hourBucketKey,
    positionsKey,
    positionsArrStable,
    hardKey,
    refreshTick,
    bucketNorm,
    bounds.ok,
    bounds.uf,
    bounds.minYmd,
    bounds.maxYmd,
    bounds.source,
    rangeDays,
  ]);

  return { loading, error, data, meta, drawsRaw };
}
