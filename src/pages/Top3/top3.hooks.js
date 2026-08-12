/* eslint-disable no-unused-vars, react-hooks/exhaustive-deps */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  safeStr,
  isYMD,
  ymdToBR,
  normalizeToYMD,
  todayYMDLocal,
  addDaysYMD,
  toHourBucket,
  hourToInt,
  getCentena3,
  getDowKey,
} from "./top3.formatters";

import {
  LOOKBACK_ALL,
  LOOKBACK_OPTIONS,
  LOTTERY_OPTIONS,
  PT_RIO_SCHEDULE_NORMAL,
  PT_RIO_SCHEDULE_WED_SAT,
  FEDERAL_SCHEDULE,
} from "./top3.constants";

import {
  getScheduleForLottery,
  findLastDrawInList,
  pickDrawHour,
  pickDrawYMD,
  pickPrize1GrupoFromDraw,
  getPreviousDrawRobust,
  build16MilharesForGrupo,
  buildMilharesForGrupo,
  getNextSlotForLottery,
  isFederalDrawDay,
} from "./top3.engine";

import { lotteryLabel } from "./top3.selectors";

import {
  registerPrediction,
  reconcilePendingTop3Log,
  ensureDayTimeline,
} from "./top3.storage";

import {
  saveTop3PredictionSnapshot,
  loadTop3PredictionDay,
  reconcileTop3PredictionDay,
} from "./top3.firestore";

import {
  getKingResultsByDate,
  getKingResultsByRange,
  getKingBoundsByUf,
} from "../../services/kingResultsService";

import { getAnimalLabel } from "../../constants/bichoMap";

import {
  fallbackBaseSearch,
  loadHistoryRange,
} from "./modules/top3.loader";

import { computeTop3Analytics } from "./modules/top3.analytics";

import { buildTop3Predictions } from "./modules/top3.prediction";

import { buildTop3TimelineViewModel } from "./modules/top3.timeline";

import {
  buildTop3MilharesCols,
  resolveTop3ProbValue,
} from "./modules/top3.viewmodel";

import {
  normalizeImgSrc,
  getGrupoImgSrc,
  buildResultStyleImgVariants,
} from "./top3.images";

const top3SaveRunKeys = new Set();
const top3ReconcileRunKeys = new Set();
const top3ReconcileRetryCounts = new Map();

const TOP3_RECONCILE_MAX_RETRIES = 3;
const TOP3_RECONCILE_RETRY_DELAY_MS = 1200;

function emptyAnalytics() {
  return { top: [], meta: null };
}

function drawTs(draw) {
  const y = pickDrawYMD(draw);
  const h = toHourBucket(pickDrawHour(draw));

  if (!isYMD(y) || !h) return Number.NEGATIVE_INFINITY;

  const [Y, M, D] = String(y).split("-").map(Number);
  const mins = hourToInt(h);

  if (!Number.isFinite(mins) || mins < 0) {
    return Number.NEGATIVE_INFINITY;
  }

  return Date.UTC(Y, M - 1, D) + mins * 60 * 1000;
}

function drawKey(draw) {
  const y = pickDrawYMD(draw);
  const h = toHourBucket(pickDrawHour(draw));
  return isYMD(y) && h ? `${y}|${h}` : "";
}

function hasDrawAtHour(draws, hourBucket) {
  const target = toHourBucket(hourBucket);
  if (!target) return false;

  return (Array.isArray(draws) ? draws : []).some((d) => {
    const h = toHourBucket(pickDrawHour(d));
    return h === target;
  });
}

function mergeBaseIntoRange(rangeDraws, baseDraw) {
  const list = Array.isArray(rangeDraws) ? rangeDraws : [];
  const key = drawKey(baseDraw);

  if (!key) return list;

  const map = new Map();

  for (const d of list) {
    const k = drawKey(d);
    if (k) map.set(k, d);
  }

  if (!map.has(key)) {
    map.set(key, baseDraw);
  }

  return Array.from(map.values()).sort((a, b) => drawTs(a) - drawTs(b));
}

function isDrawValidForLotterySchedule(draw, lotteryKey) {
  const y = pickDrawYMD(draw);
  const h = toHourBucket(pickDrawHour(draw));

  if (!isYMD(y) || !h) return false;

  const schedule = getScheduleForLottery({
    lotteryKey,
    ymd: y,
    PT_RIO_SCHEDULE_NORMAL,
    PT_RIO_SCHEDULE_WED_SAT,
    FEDERAL_SCHEDULE,
  });

  const normalizedSchedule = Array.isArray(schedule)
    ? schedule.map(toHourBucket).filter(Boolean)
    : [];

  return normalizedSchedule.includes(h);
}

function findLatestHistoricalBaseDraw({
  draws,
  lotteryKey,
  targetYmd,
  targetHourBucket,
}) {
  const list = Array.isArray(draws) ? draws : [];
  const targetHour = toHourBucket(targetHourBucket);

  if (!isYMD(targetYmd) || !targetHour) {
    return { draw: null, ymd: "", hour: "", source: "none" };
  }

  const [Y, M, D] = String(targetYmd).split("-").map(Number);
  const mins = hourToInt(targetHour);
  const targetTs = Date.UTC(Y, M - 1, D) + mins * 60 * 1000;

  let best = null;
  let bestTs = Number.NEGATIVE_INFINITY;

  for (const d of list) {
    if (!isDrawValidForLotterySchedule(d, lotteryKey)) continue;

    const ts = drawTs(d);
    if (!Number.isFinite(ts)) continue;
    if (ts >= targetTs) continue;

    if (ts > bestTs) {
      best = d;
      bestTs = ts;
    }
  }

  if (!best) {
    return { draw: null, ymd: "", hour: "", source: "none" };
  }

  return {
    draw: best,
    ymd: pickDrawYMD(best) || "",
    hour: toHourBucket(pickDrawHour(best)) || "",
    source: "history_range",
  };
}

function sanitizeHistoricalDraws({ draws, lotteryKey, baseDraw }) {
  const list = Array.isArray(draws) ? draws : [];
  const baseTs = drawTs(baseDraw);

  if (!baseDraw || !Number.isFinite(baseTs)) return [];

  return list
    .filter((d) => isDrawValidForLotterySchedule(d, lotteryKey))
    .filter((d) => {
      const ts = drawTs(d);
      return Number.isFinite(ts) && ts <= baseTs;
    })
    .sort((a, b) => drawTs(a) - drawTs(b));
}

function parseTargetDate(ymd, hour) {
  if (!isYMD(ymd)) return null;

  const h = toHourBucket(hour);
  const m = String(h || "").match(/^(\d{2})h$/);

  if (!m) return null;

  const [Y, M, D] = String(ymd).split("-").map(Number);
  const hh = Number(m[1]);

  const dt = new Date(Y, M - 1, D, hh, 0, 0, 0);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function isFutureTarget(ymd, hour) {
  const target = parseTargetDate(ymd, hour);
  if (!target) return false;
  return target.getTime() > Date.now();
}

function makeTargetKey(ymd, hour) {
  const y = safeStr(ymd);
  const h = toHourBucket(hour);
  return isYMD(y) && h ? `${y}_${h}` : "";
}

/*
 * TOP3_PERSISTED_SNAPSHOT_CONTEXT_V1
 *
 * Um documento pode possuir identidade externa correta e, ainda assim,
 * carregar cards produzidos para outra loteria ou outro slot.
 *
 * Snapshots legados sem identidade interna permanecem válidos e imutáveis.
 * Apenas identidade interna explicitamente divergente invalida o documento.
 */
function isPersistedTop3EntryValid(
  entry,
  {
    lotteryKey = "",
    targetYmd = "",
    targetHour = "",
  } = {}
) {
  if (!entry || typeof entry !== "object") return false;

  const expectedLottery = safeStr(lotteryKey).toUpperCase();
  const expectedYmd = safeStr(targetYmd);
  const expectedHour = toHourBucket(targetHour);

  if (!expectedLottery || !isYMD(expectedYmd) || !expectedHour) {
    return false;
  }

  if (
    safeStr(entry?.lotteryKey).toUpperCase() !== expectedLottery ||
    safeStr(entry?.targetYmd) !== expectedYmd ||
    toHourBucket(entry?.targetHour) !== expectedHour
  ) {
    return false;
  }

  const snapshot = Array.isArray(entry?.snapshot)
    ? entry.snapshot.slice(0, 3)
    : [];

  if (snapshot.length !== 3) return false;

  return snapshot.every((item) => {
    const context = item?.meta?.persistenceContext || null;

    /*
     * TOP3_LEGACY_SNAPSHOT_FREEZE_V1
     *
     * Snapshots publicados antes da inclusão de persistenceContext
     * não podem ser recalculados nem sobrescritos retroativamente.
     *
     * A identidade externa do documento já foi validada acima por:
     * lotteryKey + targetYmd + targetHour.
     *
     * Quando o contexto interno existir, ele também precisa coincidir.
     */
    if (!context || typeof context !== "object") {
      return true;
    }

    return (
      safeStr(context?.lotteryKey).toUpperCase() === expectedLottery &&
      safeStr(context?.targetYmd) === expectedYmd &&
      toHourBucket(context?.targetHour) === expectedHour
    );
  });
}

function hydratePersistedTop3(
  entry,
  expectedContext = {}
) {
  if (!isPersistedTop3EntryValid(entry, expectedContext)) {
    return [];
  }

  const snapshot = Array.isArray(entry?.snapshot)
    ? entry.snapshot.slice(0, 3)
    : [];

  return snapshot
    .map((item, index) => {
      const grupo = Number(item?.grupo);

      if (
        !Number.isFinite(grupo) ||
        grupo < 1 ||
        grupo > 25
      ) {
        return null;
      }

      const imgBg =
        Array.isArray(item?.imgBg) && item.imgBg.length
          ? item.imgBg.filter(Boolean)
          : [getGrupoImgSrc(grupo, 512)].filter(Boolean);

      const imgIcon =
        Array.isArray(item?.imgIcon) && item.imgIcon.length
          ? item.imgIcon.filter(Boolean)
          : buildResultStyleImgVariants(grupo, 96);

      return {
        ...item,
        rank: Number(item?.rank || index + 1),
        grupo,
        animal:
          safeStr(item?.animal) ||
          safeStr(getAnimalLabel(grupo)),
        prob: Number(item?.prob || 0),
        probPct: Number(item?.probPct || 0),
        milhares24: Array.isArray(item?.milhares24)
          ? item.milhares24.slice(0, 24)
          : Array.isArray(item?.milhares20)
            ? item.milhares20.slice(0, 24)
            : [],
        milharesCols: Array.isArray(item?.milharesCols)
          ? item.milharesCols
          : [],
        imgBg,
        imgIcon,
        persistedSnapshot: true,
      };
    })
    .filter(Boolean)
    .slice(0, 3);
}

function resolveLayerMetaText(analytics) {
  const meta = analytics?.meta || null;
  const explain = meta?.explain || null;

  const candidates = [
    meta?.label,
    explain?.layerLabel,
    explain?.layerKey,
    meta?.scenario,
  ]
    .map((v) => safeStr(v))
    .filter(Boolean);

  return candidates[0] || "";
}

function debugTop3Effect(name, details = {}) {
  if (typeof window === "undefined") return;

  const enabled =
    new URLSearchParams(window.location.search).get(
      "debugTop3Effects"
    ) === "1";

  if (!enabled) return;

  const counters =
    window.__TOP3_EFFECT_COUNTS__ ||
    (window.__TOP3_EFFECT_COUNTS__ = {});

  counters[name] = Number(counters[name] || 0) + 1;

  console.info(
    "[TOP3 EFFECT]",
    name,
    `#${counters[name]}`,
    details
  );
}

export function useTop3Controller() {
  const DEFAULT_LOTTERY = "PT_RIO";

  const debugTop3 =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("debugTop3") === "1";

  const requestIdRef = useRef(0);

  /*
   * TOP3_CONTEXT_IDENTITY_GUARD_V1
   *
   * Identidade funcional do contexto atualmente ativo.
   * Nenhum cálculo ou snapshot pode atualizar os cards se tiver sido
   * produzido para outra loteria, data ou horário.
   */
  const activeTop3ContextRef = useRef("");

  const boundsCacheRef = useRef(new Map());
  const analyticsCacheRef = useRef({ key: "", value: emptyAnalytics() });

  // TOP3_REF_04_MILHARES_CACHE
  // Cache restrito à carga atual. É limpo sempre que qualquer entrada
  // funcional da geração de milhares muda.
  const milharesCacheRef = useRef(new Map());

  const [lotteryKey, setLotteryKey] = useState(DEFAULT_LOTTERY);
  const [ymd, setYmd] = useState(() => todayYMDLocal());
  const [lookback, setLookback] = useState(LOOKBACK_ALL);

  const [loading, setLoading] = useState(false);
  const [loadingStage, setLoadingStage] = useState({
    today: false,
    range: false,
  });
  const [error, setError] = useState("");

  const [rangeDraws, setRangeDraws] = useState([]);
  const [todayDraws, setTodayDraws] = useState([]);
  const [rangeInfo, setRangeInfo] = useState({ from: "", to: "" });

  const [
    availableHistoryDatesByLottery,
    setAvailableHistoryDatesByLottery,
  ] = useState({});

  /*
   * TOP3_LOADED_LOTTERY_GUARD_V1
   *
   * Identifica a loteria que realmente produziu os dados atualmente
   * carregados. A loteria selecionada sozinha não autoriza renderização.
   */
  const [loadedLotteryKey, setLoadedLotteryKey] = useState("");
  const [loadedYmd, setLoadedYmd] = useState("");
  const [lastHourBucket, setLastHourBucket] = useState("");
  const [targetHourBucket, setTargetHourBucket] = useState("");
  const [targetYmd, setTargetYmd] = useState("");
  const [skipPtRio18ByFederal, setSkipPtRio18ByFederal] = useState(false);

  const [lastInfo, setLastInfo] = useState({
    lastYmd: "",
    lastHour: "",
    lastGrupo: null,
    lastAnimal: "",
  });

  const [prevInfo, setPrevInfo] = useState({
    prevYmd: "",
    prevHour: "",
    prevGrupo: null,
    prevAnimal: "",
    source: "none",
  });

  const [baseDrawState, setBaseDrawState] = useState(null);
  const [persistedTop3History, setPersistedTop3History] = useState([]);
  const [
    persistedTop3HistoryResolved,
    setPersistedTop3HistoryResolved,
  ] = useState(false);

  const [currentPersistedPrediction, setCurrentPersistedPrediction] =
    useState(null);
  const [currentPersistedResolved, setCurrentPersistedResolved] =
    useState(false);
  const [reconcileRetryNonce, setReconcileRetryNonce] = useState(0);

  // TOP3_REF_02_DEFER_SECONDARY
  // Libera primeiro os dados e palpites essenciais.
  // Timeline e persistência são processadas depois, fora do caminho crítico.
  const [secondaryReady, setSecondaryReady] = useState(false);

  // PERF-05 — pipeline primário progressivo
  // Analytics e geração dos palpites deixam de bloquear
  // a primeira renderização após a carga do histórico.
  const [analytics, setAnalytics] = useState(() => emptyAnalytics());
  const [analyticsReady, setAnalyticsReady] = useState(false);
  const [top3, setTop3] = useState([]);
  const [top3ContextKey, setTop3ContextKey] = useState("");
  const [primaryComputing, setPrimaryComputing] = useState(true);

  const lotteryKeySafe = useMemo(
    () => safeStr(lotteryKey).toUpperCase() || DEFAULT_LOTTERY,
    [lotteryKey]
  );

  const ymdSafe = useMemo(() => {
    const y = normalizeToYMD(ymd);
    return y && isYMD(y) ? y : todayYMDLocal();
  }, [ymd]);

  const dateBR = useMemo(() => ymdToBR(ymdSafe), [ymdSafe]);

  const analysisHourBucket = useMemo(
    () => toHourBucket(targetHourBucket) || "",
    [targetHourBucket]
  );

  const analysisYmd = useMemo(
    () => (isYMD(targetYmd) ? targetYmd : ""),
    [targetYmd]
  );

  const activeTop3ContextKey = useMemo(() => {
    const lottery = safeStr(lotteryKeySafe).toUpperCase();
    const loadedLottery = safeStr(loadedLotteryKey).toUpperCase();
    const targetDate = isYMD(analysisYmd) ? analysisYmd : "";
    const targetHour = toHourBucket(analysisHourBucket) || "";

    /*
     * Durante a troca de loteria, lotteryKeySafe muda antes de rangeDraws,
     * analytics e baseDrawState. Enquanto a carga não confirmar a mesma
     * loteria, nenhum contexto de cards pode ser considerado ativo.
     */
    if (
      !lottery ||
      loadedLottery !== lottery ||
      !targetDate ||
      !targetHour
    ) {
      return "";
    }

    return [
      lottery,
      targetDate,
      targetHour,
    ].join("|");
  }, [
    lotteryKeySafe,
    loadedLotteryKey,
    analysisYmd,
    analysisHourBucket,
  ]);

  activeTop3ContextRef.current = activeTop3ContextKey;

  const timelineYmd = useMemo(() => {
    if (isYMD(loadedYmd)) return loadedYmd;
    return ymdSafe;
  }, [loadedYmd, ymdSafe]);

  const schedule = useMemo(() => {
    const y = isYMD(analysisYmd)
      ? analysisYmd
      : isYMD(loadedYmd)
        ? loadedYmd
        : ymdSafe;

    return getScheduleForLottery({
      lotteryKey: lotteryKeySafe,
      ymd: y,
      PT_RIO_SCHEDULE_NORMAL,
      PT_RIO_SCHEDULE_WED_SAT,
      FEDERAL_SCHEDULE,
    });
  }, [lotteryKeySafe, ymdSafe, loadedYmd, analysisYmd]);

  const isFederalNonDrawDay = useMemo(() => {
    return lotteryKeySafe === "FEDERAL" && !isFederalDrawDay(ymdSafe);
  }, [lotteryKeySafe, ymdSafe]);

  const scheduleKey = useMemo(() => {
    return (Array.isArray(schedule) ? schedule : [])
      .map(toHourBucket)
      .filter(Boolean)
      .join("|");
  }, [schedule]);

  const rangeLabel = useMemo(() => {
    const f = safeStr(rangeInfo?.from);
    const t = safeStr(rangeInfo?.to);

    if (isYMD(f) && isYMD(t)) return `${ymdToBR(f)} → ${ymdToBR(t)}`;
    return "—";
  }, [rangeInfo]);

  const prevLabel = useMemo(() => {
    if (!prevInfo?.prevGrupo) return "—";

    const g = Number(prevInfo.prevGrupo);
    const animal = safeStr(prevInfo.prevAnimal || getAnimalLabel?.(g) || "");

    const when =
      prevInfo?.prevYmd && prevInfo?.prevHour
        ? `${ymdToBR(prevInfo.prevYmd)} ${prevInfo.prevHour}`
        : "";

    return `G${String(g).padStart(2, "0")}${
      animal ? " • " + animal.toUpperCase() : ""
    }${when ? " • " + when : ""}`;
  }, [prevInfo]);

  const lastLabel = useMemo(() => {
    if (!lastInfo?.lastGrupo) return "—";

    const g = Number(lastInfo.lastGrupo);
    const animal = safeStr(lastInfo.lastAnimal || getAnimalLabel?.(g) || "");

    const when =
      lastInfo?.lastYmd && lastInfo?.lastHour
        ? `${ymdToBR(lastInfo.lastYmd)} ${lastInfo.lastHour}`
        : "";

    return `G${String(g).padStart(2, "0")}${
      animal ? " • " + animal.toUpperCase() : ""
    }${when ? " • " + when : ""}`;
  }, [lastInfo]);

  const resetStateForNoData = useCallback(() => {
    analyticsCacheRef.current = { key: "", value: emptyAnalytics() };

    setAnalytics(emptyAnalytics());
    setAnalyticsReady(false);
    setTop3([]);
    setTop3ContextKey("");
    setPrimaryComputing(true);

    setLoadedLotteryKey("");
    setLoadedYmd("");
    setLastHourBucket("");
    setTargetHourBucket("");
    setTargetYmd("");
    setSkipPtRio18ByFederal(false);
    setBaseDrawState(null);
    setCurrentPersistedPrediction(null);
    setCurrentPersistedResolved(false);
    setPersistedTop3History([]);
    setPersistedTop3HistoryResolved(false);

    setLastInfo({
      lastYmd: "",
      lastHour: "",
      lastGrupo: null,
      lastAnimal: "",
    });

    setPrevInfo({
      prevYmd: "",
      prevHour: "",
      prevGrupo: null,
      prevAnimal: "",
      source: "none",
    });

    setRangeInfo({ from: "", to: "" });
    setRangeDraws([]);
    setTodayDraws([]);
  }, []);

  const load = useCallback(async () => {
    const lKey = safeStr(lotteryKeySafe).toUpperCase();
    if (!lKey || !isYMD(ymdSafe)) return;

    setLoading(true);
    setLoadingStage({ today: true, range: false });
    setError("");
    setSecondaryReady(false);

    // Impede exibir resultados pertencentes à consulta anterior.
    resetStateForNoData();

    const currentRequestId = ++requestIdRef.current;

    try {
      const ufResolved = lKey;

      let minDate = "";
      let maxDate = "";

      const cached = boundsCacheRef.current.get(ufResolved);

      if (cached) {
        minDate = cached.minDate;
        maxDate = cached.maxDate;
      } else {
        const b = await getKingBoundsByUf({ uf: ufResolved });

        const bMin = safeStr(b?.minYmd || b?.minDate || "");
        const bMax = safeStr(b?.maxYmd || b?.maxDate || "");

        if (isYMD(bMin)) minDate = bMin;
        if (isYMD(bMax)) maxDate = bMax;

        boundsCacheRef.current.set(ufResolved, { minDate, maxDate });
      }

      const selectedFederalNonDrawDay =
        lKey === "FEDERAL" && !isFederalDrawDay(ymdSafe);

      const effectiveYmd =
        selectedFederalNonDrawDay && isYMD(maxDate) ? maxDate : ymdSafe;

      const today =
        (await getKingResultsByDate({
          uf: ufResolved,
          date: effectiveYmd,
        })) || [];

      if (requestIdRef.current !== currentRequestId) return;

      setLoadedYmd(effectiveYmd);
      setTodayDraws(today);

      let todaySchedule = getScheduleForLottery({
        lotteryKey: lKey,
        ymd: effectiveYmd,
        PT_RIO_SCHEDULE_NORMAL,
        PT_RIO_SCHEDULE_WED_SAT,
        FEDERAL_SCHEDULE,
      });

      const shouldSkipPtRio18 =
        (lKey === "PT_RIO" || lKey === "RJ") &&
        String(effectiveYmd || "").trim() >= "2026-07-18" &&
        Number(getDowKey(effectiveYmd)) === 6;

      if (shouldSkipPtRio18) {
        todaySchedule = Array.from(
          new Set([
            ...(Array.isArray(todaySchedule) ? todaySchedule : [])
              .map(toHourBucket)
              .filter((h) => h && h !== "18:00"),
            "19:00",
          ])
        ).sort((a, b) => {
          const [ah, am] = String(a).split(":").map(Number);
          const [bh, bm] = String(b).split(":").map(Number);

          return ah * 60 + am - (bh * 60 + bm);
        });
      }

      setSkipPtRio18ByFederal(Boolean(shouldSkipPtRio18));

      if (!Array.isArray(todaySchedule) || !todaySchedule.length) {
        resetStateForNoData();
        setError("Não há grade de sorteio válida para esta data/loteria.");
        return;
      }

      const todayLast = findLastDrawInList(today, todaySchedule);

      let baseDraw = null;
      let baseY = "";
      let baseH = "";
      let baseGrupo = null;
      let baseAnimal = "";
      let resolvedTargetY = "";
      let resolvedTargetH = "";
      let resolvedPrev = {
        draw: null,
        ymd: "",
        hour: "",
        source: "none",
      };

      if (todayLast) {
        baseDraw = todayLast;
        baseY = pickDrawYMD(todayLast) || effectiveYmd;
        baseH = toHourBucket(pickDrawHour(todayLast));

        /*
         * HOTFIX RJ NEXT SLOT
         *
         * O alvo deve ser resolvido exclusivamente pelo calendário oficial.
         *
         * Não usar a posição física de todaySchedule para decidir o próximo
         * sorteio. Essa abordagem podia produzir regressão temporal quando
         * buckets equivalentes como 19h/19:30 eram normalizados em ordem
         * diferente da cronológica.
         *
         * Exemplo obrigatório:
         * 08/08/2026 21h -> 09/08/2026 14h.
         */
        const nextSlot = getNextSlotForLottery({
          lotteryKey: lKey,
          ymd: baseY,
          hourBucket: baseH,
          PT_RIO_SCHEDULE_NORMAL,
          PT_RIO_SCHEDULE_WED_SAT,
          FEDERAL_SCHEDULE,
        });

        resolvedTargetY = safeStr(nextSlot?.ymd || "");
        resolvedTargetH = toHourBucket(nextSlot?.hour || "");
      } else {
        const firstHourToday = toHourBucket(todaySchedule?.[0]);

        if (!firstHourToday) {
          resetStateForNoData();
          setError(
            "Não foi possível determinar o primeiro horário válido para esta loteria."
          );
          return;
        }

        resolvedTargetY = effectiveYmd;
        resolvedTargetH = firstHourToday;

        const previousForFirstSlot = await getPreviousDrawRobust({
          getKingResultsByDate,
          lotteryKey: lKey,
          ymdTarget: effectiveYmd,
          targetHourBucket: firstHourToday,
          todayDraws: today,
          schedule: todaySchedule,
          PT_RIO_SCHEDULE_NORMAL,
          PT_RIO_SCHEDULE_WED_SAT,
          FEDERAL_SCHEDULE,
        });

        const previousResolved = previousForFirstSlot?.draw
          ? previousForFirstSlot
          : await fallbackBaseSearch({
              getKingResultsByRange,
              findLatestHistoricalBaseDraw,
              addDaysYMD,
              minDate,
              lotteryKey: lKey,
              targetYmd: effectiveYmd,
              targetHourBucket: firstHourToday,
              uf: ufResolved,
            });

        if (!previousResolved?.draw) {
          resetStateForNoData();
          setError(
            "Não foi possível localizar a base anterior ao primeiro sorteio do dia."
          );
          return;
        }

        baseDraw = previousResolved.draw;
        baseY = safeStr(previousResolved.ymd);
        baseH = toHourBucket(previousResolved.hour);
      }

      baseGrupo = pickPrize1GrupoFromDraw(baseDraw);
      baseAnimal = baseGrupo ? safeStr(getAnimalLabel(baseGrupo)) : "";

      if (
        !baseDraw ||
        !isYMD(baseY) ||
        !baseH ||
        !Number.isFinite(Number(baseGrupo)) ||
        Number(baseGrupo) < 1 ||
        Number(baseGrupo) > 25 ||
        !isYMD(resolvedTargetY) ||
        !resolvedTargetH
      ) {
        resetStateForNoData();
        setError("Base ou alvo inválido para cálculo do TOP3.");
        return;
      }

      const baseDayDraws =
        baseY === effectiveYmd
          ? today
          : (await getKingResultsByDate({
              uf: ufResolved,
              date: baseY,
            })) || [];

      const baseDaySchedule = getScheduleForLottery({
        lotteryKey: lKey,
        ymd: baseY,
        PT_RIO_SCHEDULE_NORMAL,
        PT_RIO_SCHEDULE_WED_SAT,
        FEDERAL_SCHEDULE,
      });

      resolvedPrev = await getPreviousDrawRobust({
        getKingResultsByDate,
        lotteryKey: lKey,
        ymdTarget: baseY,
        targetHourBucket: baseH,
        todayDraws: baseDayDraws,
        schedule: baseDaySchedule,
        PT_RIO_SCHEDULE_NORMAL,
        PT_RIO_SCHEDULE_WED_SAT,
        FEDERAL_SCHEDULE,
      });

      if (!resolvedPrev?.draw) {
        resolvedPrev = await fallbackBaseSearch({
          getKingResultsByRange,
          findLatestHistoricalBaseDraw,
          addDaysYMD,
          minDate,
          lotteryKey: lKey,
          targetYmd: baseY,
          targetHourBucket: baseH,
          uf: ufResolved,
        });
      }

      if (requestIdRef.current !== currentRequestId) return;

      setBaseDrawState(baseDraw);
      setLastHourBucket(baseH);
      setTargetYmd(resolvedTargetY);
      setTargetHourBucket(resolvedTargetH);

      if (debugTop3) console.log(
        "[TOP3 STATE]",
        JSON.stringify(
          {
            loadedYmd: effectiveYmd,

            baseYmd: baseY,
            baseHour: baseH,
            baseGrupo,

            targetYmd: resolvedTargetY,
            targetHour: resolvedTargetH,

            previousYmd: resolvedPrev?.ymd || "",
            previousHour: resolvedPrev?.hour || "",
            previousSource: resolvedPrev?.source || "",

            todayDraws: Array.isArray(today) ? today.length : 0,
          },
          null,
          2
        )
      );

      setLastInfo({
        lastYmd: baseY,
        lastHour: baseH,
        lastGrupo: Number(baseGrupo),
        lastAnimal: baseAnimal,
      });

      if (resolvedPrev?.draw) {
        const gPrev = pickPrize1GrupoFromDraw(resolvedPrev.draw);

        setPrevInfo({
          prevYmd: resolvedPrev.ymd || "",
          prevHour: toHourBucket(resolvedPrev.hour) || "",
          prevGrupo: Number.isFinite(Number(gPrev)) ? Number(gPrev) : null,
          prevAnimal: gPrev ? safeStr(getAnimalLabel(gPrev)) : "",
          source: resolvedPrev.source || "none",
        });
      } else {
        setPrevInfo({
          prevYmd: "",
          prevHour: "",
          prevGrupo: null,
          prevAnimal: "",
          source: "none",
        });
      }

      let rangeFrom = "";

      if (lookback === LOOKBACK_ALL) {
        rangeFrom = minDate || addDaysYMD(baseY, -240);
      } else {
        const days = Math.max(1, Number(lookback || 30));
        rangeFrom = addDaysYMD(baseY, -(days - 1));
      }

      const rangeTo = baseY;

      setRangeInfo({ from: rangeFrom, to: rangeTo });
      setLoadingStage({ today: false, range: true });

      const histRaw = await loadHistoryRange({
        getKingResultsByRange,
        uf: ufResolved,
        dateFrom: rangeFrom,
        dateTo: rangeTo,
        readPolicy: "cache",
      });

      if (requestIdRef.current !== currentRequestId) return;

      const hist = mergeBaseIntoRange(histRaw, baseDraw);

      if (debugTop3) console.log(
        "[TOP3 HISTORY]",
        JSON.stringify(
          {
            period: {
              from: rangeFrom,
              to: rangeTo,
            },

            firestoreDraws: Array.isArray(histRaw)
              ? histRaw.length
              : 0,

            mergedDraws: Array.isArray(hist)
              ? hist.length
              : 0,

            baseIncluded: Array.isArray(hist)
              ? hist.some(
                  (d) =>
                    drawKey(d) === drawKey(baseDraw)
                )
              : false,

            firstDraw:
              Array.isArray(hist) && hist.length
                ? {
                    ymd: pickDrawYMD(hist[0]),
                    hour: toHourBucket(pickDrawHour(hist[0])),
                  }
                : null,

            lastDraw:
              Array.isArray(hist) && hist.length
                ? {
                    ymd: pickDrawYMD(hist[hist.length - 1]),
                    hour: toHourBucket(
                      pickDrawHour(hist[hist.length - 1])
                    ),
                  }
                : null,
          },
          null,
          2
        )
      );

      setRangeDraws(hist);
      setLoadedLotteryKey(lKey);

      const loadedHistoryDates = Array.from(
        new Set(
          (Array.isArray(hist) ? hist : [])
            .map((draw) => pickDrawYMD(draw))
            .filter((date) => isYMD(date))
        )
      );

      setAvailableHistoryDatesByLottery((current) => {
        const previous = Array.isArray(current?.[lKey])
          ? current[lKey]
          : [];

        const merged = Array.from(
          new Set([
            ...previous,
            ...loadedHistoryDates,
          ])
        ).sort();

        return {
          ...current,
          [lKey]: merged,
        };
      });
    } catch (e) {
      if (requestIdRef.current === currentRequestId) {
        setError(String(e?.message || e || "Falha ao carregar dados do TOP3."));
        setBaseDrawState(null);
      }
    } finally {
      if (requestIdRef.current === currentRequestId) {
        setLoadingStage({ today: false, range: false });
        setLoading(false);
      }
    }
  }, [lotteryKeySafe, ymdSafe, lookback, resetStateForNoData]);

  useEffect(() => {
    debugTop3Effect("01_load", {
      lotteryKey: lotteryKeySafe,
      ymd: ymdSafe,
      lookback,
    });

    load();
  }, [load]);

  useEffect(() => {
    if (
      loading ||
      primaryComputing ||
      !baseDrawState ||
      !Array.isArray(rangeDraws) ||
      !rangeDraws.length
    ) {
      setSecondaryReady(false);
      return undefined;
    }

    let cancelled = false;
    let idleId = null;
    let timeoutId = null;

    const activateSecondaryPipeline = () => {
      if (!cancelled) {
        setSecondaryReady(true);
      }
    };

    if (
      typeof window !== "undefined" &&
      typeof window.requestIdleCallback === "function"
    ) {
      idleId = window.requestIdleCallback(
        activateSecondaryPipeline,
        { timeout: 300 }
      );
    } else {
      timeoutId = setTimeout(activateSecondaryPipeline, 0);
    }

    return () => {
      cancelled = true;

      if (
        idleId != null &&
        typeof window !== "undefined" &&
        typeof window.cancelIdleCallback === "function"
      ) {
        window.cancelIdleCallback(idleId);
      }

      if (timeoutId != null) {
        clearTimeout(timeoutId);
      }
    };
  }, [
    loading,
    primaryComputing,
    baseDrawState,
    rangeDraws,
  ]);

  useEffect(() => {
    debugTop3Effect("02_ensure_timeline", {
      lotteryKey: lotteryKeySafe,
      timelineYmd,
    });

    ensureDayTimeline({
      ymd: timelineYmd,
      lotteryKey: lotteryKeySafe,
    });
  }, [timelineYmd, lotteryKeySafe]);

  useEffect(() => {
    let alive = true;

    setCurrentPersistedPrediction(null);
    setCurrentPersistedResolved(false);

    async function loadCurrentPersistedPrediction() {
      if (!isYMD(analysisYmd) || !analysisHourBucket) {
        if (alive) {
          setCurrentPersistedPrediction(null);
          setCurrentPersistedResolved(true);
        }
        return;
      }

      try {
        const history = await loadTop3PredictionDay({
          lotteryKey: lotteryKeySafe,
          targetYmd: analysisYmd,
          schedule: [analysisHourBucket],
        });

        const exactEntry = (
          Array.isArray(history) ? history : []
        ).find((entry) => {
          return (
            safeStr(entry?.lotteryKey).toUpperCase() ===
              lotteryKeySafe &&
            safeStr(entry?.targetYmd) === analysisYmd &&
            toHourBucket(entry?.targetHour) ===
              analysisHourBucket
          );
        }) || null;

        if (alive) {
          setCurrentPersistedPrediction(exactEntry);
        }
      } catch (error) {
        if (debugTop3) {
          console.warn(
            "[TOP3 CURRENT SNAPSHOT LOAD]",
            error
          );
        }

        if (alive) {
          setCurrentPersistedPrediction(null);
        }
      } finally {
        if (alive) {
          setCurrentPersistedResolved(true);
        }
      }
    }

    loadCurrentPersistedPrediction();

    return () => {
      alive = false;
    };
  }, [
    lotteryKeySafe,
    analysisYmd,
    analysisHourBucket,
    debugTop3,
  ]);

  useEffect(() => {
    if (loading) return undefined;

    const loadedLotteryMatches =
      safeStr(loadedLotteryKey).toUpperCase() ===
      safeStr(lotteryKeySafe).toUpperCase();

    if (
      !loadedLotteryMatches ||
      !baseDrawState ||
      !Array.isArray(rangeDraws) ||
      !rangeDraws.length
    ) {
      setAnalytics(emptyAnalytics());
      setAnalyticsReady(false);
      setTop3([]);
      setPrimaryComputing(false);
      return undefined;
    }

    let cancelled = false;
    let timeoutId = null;

    setAnalyticsReady(false);
    setTop3([]);
    setTop3ContextKey("");
    setPrimaryComputing(true);

    const computeAnalytics = () => {
      if (cancelled) return;

      try {
        const nextAnalytics = computeTop3Analytics({
          rangeDraws,
          baseDrawState,
          analyticsCacheRef,
          lotteryKeySafe,
          lookback,
          rangeInfo,
          todayDraws,
          sanitizeHistoricalDraws,
          targetYmd: analysisYmd,
          targetHourBucket: analysisHourBucket,
        });

        if (cancelled) return;

        if (debugTop3 && typeof window !== "undefined") {
          const rankingAudit =
            nextAnalytics?.meta?.explain?.rankingAudit ||
            null;

          const rankingAuditSummary =
            nextAnalytics?.top?.[0]?.meta?.explain
              ?.rankingAuditSummary ||
            (rankingAudit
              ? {
                  changed: Boolean(rankingAudit.changed),
                  compositionChanged: Boolean(
                    rankingAudit.compositionChanged
                  ),
                  beforeTop3: rankingAudit.beforeTop3 || [],
                  afterTop3: rankingAudit.afterTop3 || [],
                  enteredTop3: rankingAudit.enteredTop3 || [],
                  exitedTop3: rankingAudit.exitedTop3 || [],
                  movedTop3: rankingAudit.movedTop3 || [],
                }
              : null);

          const diagnostic = {
            at: new Date().toISOString(),
            lotteryKey: lotteryKeySafe,
            targetYmd: analysisYmd,
            targetHour: analysisHourBucket,
            rankingAudit,
            rankingAuditSummary,
          };

          window.__TOP3_RANKING_AUDIT__ = diagnostic;

          try {
            window.localStorage.setItem(
              "top3_ranking_audit_last",
              JSON.stringify(diagnostic)
            );
          } catch {}

          console.info(
            "[TOP3 RANKING AUDIT]",
            diagnostic
          );
        }

        setAnalytics(
          nextAnalytics && typeof nextAnalytics === "object"
            ? nextAnalytics
            : emptyAnalytics()
        );
        setAnalyticsReady(true);
      } catch (error) {
        if (cancelled) return;

        setAnalytics(emptyAnalytics());
        setAnalyticsReady(false);
        setTop3([]);
        setPrimaryComputing(false);
        setError(
          String(
            error?.message ||
              error ||
              "Falha ao calcular analytics do TOP3."
          )
        );
      }
    };

    timeoutId = setTimeout(computeAnalytics, 0);

    return () => {
      cancelled = true;

      if (timeoutId != null) {
        clearTimeout(timeoutId);
      }
    };
  }, [
    loading,
    rangeDraws,
    baseDrawState,
    lotteryKeySafe,
    loadedLotteryKey,
    lookback,
    rangeInfo,
    todayDraws,
    analysisYmd,
    analysisHourBucket,
  ]);

  useEffect(() => {
    milharesCacheRef.current.clear();
  }, [
    rangeDraws,
    analysisHourBucket,
    scheduleKey,
    analysisYmd,
    lotteryKeySafe,
  ]);

  const buildMilharesCached = useCallback(
    ({ grupo2, count, targetYmd }) => {
      const grupo = Number(grupo2);
      const target = isYMD(targetYmd) ? targetYmd : analysisYmd;

      const cacheKey = [
        lotteryKeySafe,
        analysisHourBucket,
        scheduleKey,
        target,
        Number(count),
        Number.isFinite(grupo) ? grupo : "",
      ].join("|");

      const cached = milharesCacheRef.current.get(cacheKey);

      if (cached) {
        return cached;
      }

      const generated = buildMilharesForGrupo({
        rangeDraws,
        analysisHourBucket,
        schedule,
        grupo2,
        count,
        targetYmd: target,
      });

      milharesCacheRef.current.set(cacheKey, generated);

      return generated;
    },
    [
      rangeDraws,
      analysisHourBucket,
      schedule,
      scheduleKey,
      analysisYmd,
      lotteryKeySafe,
    ]
  );

  const build16 = useCallback(
    (grupo2) => {
      return buildMilharesCached({
        grupo2,
        count: 16,
        targetYmd: analysisYmd,
      });
    },
    [buildMilharesCached, analysisYmd]
  );

  const build24 = useCallback(
    (grupo2, item = null) => {
      return buildMilharesCached({
        grupo2,
        count: 24,
        targetYmd: item?.meta?.next?.ymd || analysisYmd,
      });
    },
    [buildMilharesCached, analysisYmd]
  );

  const layerMetaText = useMemo(() => {
    return resolveLayerMetaText(analytics);
  }, [analytics]);

  useEffect(() => {
    if (
      loading ||
      !analyticsReady ||
      !currentPersistedResolved ||
      !activeTop3ContextKey
    ) {
      return undefined;
    }

    let cancelled = false;
    let timeoutId = null;

    const capturedContextKey = activeTop3ContextKey;

    const isCurrentContext = () => {
      return (
        !cancelled &&
        Boolean(capturedContextKey) &&
        activeTop3ContextRef.current === capturedContextKey
      );
    };

    setTop3([]);
    setTop3ContextKey("");
    setPrimaryComputing(true);

    const computePredictions = () => {
      if (!isCurrentContext()) return;

      try {
        /*
         * TOP3_FIRST_PUBLISHED_SNAPSHOT_IMMUTABLE_V1
         *
         * A primeira previsão válida persistida para o slot é o
         * palpite oficial, independentemente de ainda estar PREDICTED
         * ou já estar VALIDATED.
         */
        const persistedTop3 = hydratePersistedTop3(
          currentPersistedPrediction,
          {
            lotteryKey: lotteryKeySafe,
            targetYmd: analysisYmd,
            targetHour: analysisHourBucket,
          }
        );

        /*
         * TOP3_CURRENT_MOTOR_AUTHORITY_V2
         *
         * Slot encerrado:
         *   snapshot persistido permanece a autoridade historica.
         *
         * Slot ainda futuro:
         *   nao interromper o pipeline; deixar o motor produzir
         *   o TOP3 correspondente ao contexto atual.
         */
        if (
          persistedTop3.length &&
          !isFutureTarget(
            analysisYmd,
            analysisHourBucket
          )
        ) {
          if (!isCurrentContext()) return;

          setTop3(persistedTop3);
          setTop3ContextKey(capturedContextKey);
          setPrimaryComputing(false);
          return;
        }

        const nextTop3 = buildTop3Predictions({
          analytics,
          build24,
          safeStr,
          getAnimalLabel,
          build4ColsFromEngineOut: buildTop3MilharesCols,
          resolveProbValue: resolveTop3ProbValue,
          getGrupoImgSrc,
          buildResultStyleImgVariants,
        });

        /*
         * TOP3_NACIONAL_RUNTIME_AUTHORITY_TRACE_V4
         * STAGE=ENGINE_TOP3
         */
        
if (
          lotteryKeySafe === "NACIONAL" &&
          typeof window !== "undefined"
        ) {
          try {
            const traceEntry = {
              at: new Date().toISOString(),
              stage: "ENGINE_TOP3",
              lotteryKey: lotteryKeySafe,
              analysisYmd,
              analysisHourBucket,
              activeTop3ContextKey,
              top3ContextKey,
            capturedContextKey,
            groups: (
              Array.isArray(nextTop3)
                ? nextTop3
                : []
            )
              .map((item) => Number(item?.grupo))
              .filter((grupo) => Number.isFinite(grupo))
              .slice(0, 3),
            };
        
            const raw =
              window.localStorage.getItem(
                "nacional_top3_runtime_authority_trace_v4"
              );
        
            let trace = [];
        
            try {
              const parsed = raw
                ? JSON.parse(raw)
                : [];
        
              trace = Array.isArray(parsed)
                ? parsed
                : [];
            } catch {
              trace = [];
            }
        
            const nextTrace = [
              ...trace,
              traceEntry,
            ].slice(-500);
        
            window.localStorage.setItem(
              "nacional_top3_runtime_authority_trace_v4",
              JSON.stringify(nextTrace)
            );
        
            window.__NACIONAL_TOP3_RUNTIME_AUTHORITY_TRACE_V4__ =
              nextTrace;
        
            console.info(
              "[NACIONAL TOP3 AUTHORITY TRACE V4]",
              traceEntry
            );
          } catch {}
        }

        if (!isCurrentContext()) return;

        setTop3(
          Array.isArray(nextTop3)
            ? nextTop3
            : []
        );

        setTop3ContextKey(capturedContextKey);
        setPrimaryComputing(false);
      } catch (error) {
        if (!isCurrentContext()) return;

        setTop3([]);
        setTop3ContextKey("");
        setPrimaryComputing(false);

        setError(
          String(
            error?.message ||
              error ||
              "Falha ao gerar os palpites do TOP3."
          )
        );
      }
    };

    timeoutId = setTimeout(computePredictions, 0);

    return () => {
      cancelled = true;

      if (timeoutId != null) {
        clearTimeout(timeoutId);
      }
    };
  }, [
    loading,
    analyticsReady,
    analytics,
    build24,
    currentPersistedResolved,
    currentPersistedPrediction,
    activeTop3ContextKey,
    lotteryKeySafe,
    analysisYmd,
    analysisHourBucket,
  ]);

  const timelineTop3 = useMemo(() => {
    if (!secondaryReady) return [];

    const built = buildTop3TimelineViewModel({
      todayDraws,
      rangeDraws,
      lotteryKeySafe,
      ymdSafe: timelineYmd,
      analysisYmd,
      publicBase: String(process.env.PUBLIC_URL || "").trim(),
    });

    if (
      (lotteryKeySafe === "PT_RIO" || lotteryKeySafe === "RJ") &&
      skipPtRio18ByFederal &&
      isYMD(timelineYmd)
    ) {
      return (Array.isArray(built) ? built : []).filter((slot) => {
        const y = String(slot?.targetYmd || "").trim();
        const h = toHourBucket(slot?.targetHour || "");
        return !(y === timelineYmd && h === "18:00");
      });
    }

    return built;
  }, [
    todayDraws,
    rangeDraws,
    lotteryKeySafe,
    timelineYmd,
    analysisYmd,
    skipPtRio18ByFederal,
    secondaryReady,
  ]);

  useEffect(() => {
    debugTop3Effect("03_save_prediction", {
      lotteryKey: lotteryKeySafe,
      analysisYmd,
      analysisHourBucket,
      top3Length: Array.isArray(top3)
        ? top3.length
        : -1,
    });

    if (!analysisYmd || !analysisHourBucket) return;
    if (!currentPersistedResolved) return;

    const currentPersistedSnapshotValid =
      isPersistedTop3EntryValid(
        currentPersistedPrediction,
        {
          lotteryKey: lotteryKeySafe,
          targetYmd: analysisYmd,
          targetHour: analysisHourBucket,
        }
      );

    /*
     * TOP3_FIRST_PUBLISHED_SNAPSHOT_IMMUTABLE_V1
     *
     * Snapshot válido já persistido = palpite oficial do slot.
     * Não permitir que execução posterior do motor o substitua.
     */
    /*
     * TOP3_CURRENT_MOTOR_AUTHORITY_V2
     *
     * Snapshot persistido bloqueia nova escrita somente
     * depois que o horario-alvo deixou de ser futuro.
     *
     * Enquanto o slot ainda esta aberto, o TOP3 calculado
     * pelo motor pode corrigir/sincronizar o proprio documento.
     */
    if (
      currentPersistedPrediction &&
      currentPersistedSnapshotValid &&
      !isFutureTarget(
        analysisYmd,
        analysisHourBucket
      )
    ) {
      return;
    }

    if (!activeTop3ContextKey) return;
    if (top3ContextKey !== activeTop3ContextKey) return;
    if (!Array.isArray(top3) || !top3.length) return;
    if (!isFutureTarget(analysisYmd, analysisHourBucket)) return;

    const targetKey = makeTargetKey(analysisYmd, analysisHourBucket);
    const picks = top3
      .map((x) => Number(x?.grupo))
      .filter((n) => Number.isFinite(n) && n >= 1 && n <= 25)
      .slice(0, 3);

    /*
     * TOP3_NACIONAL_RUNTIME_AUTHORITY_TRACE_V4
     * STAGE=SAVE_PICKS
     */
    
if (
      lotteryKeySafe === "NACIONAL" &&
      typeof window !== "undefined"
    ) {
      try {
        const traceEntry = {
          at: new Date().toISOString(),
          stage: "SAVE_PICKS",
          lotteryKey: lotteryKeySafe,
          analysisYmd,
          analysisHourBucket,
          activeTop3ContextKey,
          top3ContextKey,
        targetKey,
        groups: picks,
        stateGroups: (
          Array.isArray(top3)
            ? top3
            : []
        )
          .map((item) => Number(item?.grupo))
          .filter((grupo) => Number.isFinite(grupo))
          .slice(0, 3),
        };
    
        const raw =
          window.localStorage.getItem(
            "nacional_top3_runtime_authority_trace_v4"
          );
    
        let trace = [];
    
        try {
          const parsed = raw
            ? JSON.parse(raw)
            : [];
    
          trace = Array.isArray(parsed)
            ? parsed
            : [];
        } catch {
          trace = [];
        }
    
        const nextTrace = [
          ...trace,
          traceEntry,
        ].slice(-500);
    
        window.localStorage.setItem(
          "nacional_top3_runtime_authority_trace_v4",
          JSON.stringify(nextTrace)
        );
    
        window.__NACIONAL_TOP3_RUNTIME_AUTHORITY_TRACE_V4__ =
          nextTrace;
    
        console.info(
          "[NACIONAL TOP3 AUTHORITY TRACE V4]",
          traceEntry
        );
      } catch {}
    }

    if (!targetKey || !picks.length) return;

    const saveRunKey = [
      lotteryKeySafe,
      targetKey,
      picks.join(","),
    ].join("|");

    if (top3SaveRunKeys.has(saveRunKey)) return;

    top3SaveRunKeys.add(saveRunKey);

    const snapshot = top3.map((item, index) => ({
      rank: index + 1,
      grupo: Number(item?.grupo),
      animal: safeStr(item?.animal || ""),
      prob: Number(item?.prob || 0),
      probPct: Number(item?.probPct || 0),
      milhares24: Array.isArray(item?.milhares24)
          ? item.milhares24.slice(0, 24)
          : Array.isArray(item?.milhares20)
            ? item.milhares20.slice(0, 24)
            : [],
      milharesCols: Array.isArray(item?.milharesCols)
        ? item.milharesCols
        : [],
      meta: {
        ...(item?.meta && typeof item.meta === "object"
          ? item.meta
          : {}),
        persistenceContext: {
          lotteryKey: lotteryKeySafe,
          targetYmd: analysisYmd,
          targetHour: analysisHourBucket,
        },
      },
    }));

    const engineVersion =
      safeStr(top3?.[0]?.meta?.explain?.engine) ||
      safeStr(top3?.[0]?.meta?.scenario) ||
      "V3_STATISTICAL";

    registerPrediction({
      targetKey,
      targetYmd: analysisYmd,
      targetHour: analysisHourBucket,
      picks,
      snapshot,
      engineVersion,
    });

    /*
     * TOP3_NACIONAL_RUNTIME_AUTHORITY_TRACE_V4
     * STAGE=SAVE_PAYLOAD
     */
    
if (
      lotteryKeySafe === "NACIONAL" &&
      typeof window !== "undefined"
    ) {
      try {
        const traceEntry = {
          at: new Date().toISOString(),
          stage: "SAVE_PAYLOAD",
          lotteryKey: lotteryKeySafe,
          analysisYmd,
          analysisHourBucket,
          activeTop3ContextKey,
          top3ContextKey,
        targetKey,
        picks,
        groups: (
          Array.isArray(snapshot)
            ? snapshot
            : []
        )
          .map((item) => Number(item?.grupo))
          .filter((grupo) => Number.isFinite(grupo))
          .slice(0, 3),
        persistenceContexts: (
          Array.isArray(snapshot)
            ? snapshot
            : []
        ).map(
          (item) =>
            item?.meta?.persistenceContext ||
            null
        ),
        };
    
        const raw =
          window.localStorage.getItem(
            "nacional_top3_runtime_authority_trace_v4"
          );
    
        let trace = [];
    
        try {
          const parsed = raw
            ? JSON.parse(raw)
            : [];
    
          trace = Array.isArray(parsed)
            ? parsed
            : [];
        } catch {
          trace = [];
        }
    
        const nextTrace = [
          ...trace,
          traceEntry,
        ].slice(-500);
    
        window.localStorage.setItem(
          "nacional_top3_runtime_authority_trace_v4",
          JSON.stringify(nextTrace)
        );
    
        window.__NACIONAL_TOP3_RUNTIME_AUTHORITY_TRACE_V4__ =
          nextTrace;
    
        console.info(
          "[NACIONAL TOP3 AUTHORITY TRACE V4]",
          traceEntry
        );
      } catch {}
    }

    saveTop3PredictionSnapshot({
      lotteryKey: lotteryKeySafe,
      targetYmd: analysisYmd,
      targetHour: analysisHourBucket,
      picks,
      snapshot,
      engineVersion,

      /*
       * TOP3_CURRENT_MOTOR_AUTHORITY_V2
       *
       * Este efeito somente chega ao save para target futuro,
       * pois o guard isFutureTarget ocorre antes da montagem
       * do snapshot.
       */
      replaceCurrentFutureSnapshot: true,
    })
      .then((result) => {
        const diagnostic = {
          at: new Date().toISOString(),
          lotteryKey: lotteryKeySafe,
          targetYmd: analysisYmd,
          targetHour: analysisHourBucket,
          picks,
          result: result || null,
        };

        try {
          window.localStorage.setItem(
            "top3_firestore_last_save",
            JSON.stringify(diagnostic)
          );

          window.__TOP3_FIRESTORE_LAST_SAVE__ = diagnostic;
        } catch {}

        if (!result?.ok) {
          top3SaveRunKeys.delete(saveRunKey);

          /*
           * TOP3_OFFICIAL_PUBLICATION_CONFIRMATION_V1
           *
           * Um cálculo que não foi persistido não pode continuar sendo
           * apresentado como palpite oficial.
           *
           * Isso evita exatamente o cenário:
           * card principal = cálculo novo
           * histórico      = snapshot oficial antigo
           */
          /*
           * TOP3_PERSISTENCE_ERROR_NON_DESTRUCTIVE_V1
           *
           * Falha de persistência não invalida nem apaga um TOP3
           * já calculado/hidratado para o contexto atual.
           *
           * O erro continua registrado para diagnóstico.
           * Não altera motor, ranking, snapshot ou histórico.
           */

          console.error(
            "[TOP3 FIRESTORE SAVE FAILED]",
            diagnostic
          );
        } else {
          /*
           * TOP3_OFFICIAL_PUBLICATION_CONFIRMATION_V1
           *
           * A autoridade é o documento que venceu a transação.
           *
           * - created=true:
           *   o snapshot recém-criado passa a ser oficial.
           *
           * - preserved/existing:
           *   o snapshot antigo já era o oficial e deve substituir
           *   qualquer cálculo novo produzido localmente.
           */
          const officialEntry =
            result?.entry &&
            typeof result.entry === "object"
              ? result.entry
              : null;

          const officialTop3 =
            hydratePersistedTop3(
              officialEntry,
              {
                lotteryKey: lotteryKeySafe,
                targetYmd: analysisYmd,
                targetHour: analysisHourBucket,
              }
            );

          /*
           * TOP3_NACIONAL_RUNTIME_AUTHORITY_TRACE_V4
           * STAGE=OFFICIAL_TOP3
           */
          
if (
            lotteryKeySafe === "NACIONAL" &&
            typeof window !== "undefined"
          ) {
            try {
              const traceEntry = {
                at: new Date().toISOString(),
                stage: "OFFICIAL_TOP3",
                lotteryKey: lotteryKeySafe,
                analysisYmd,
                analysisHourBucket,
                activeTop3ContextKey,
                top3ContextKey,
              requestedGroups: picks,
              officialGroups: (
                Array.isArray(officialTop3)
                  ? officialTop3
                  : []
              )
                .map((item) => Number(item?.grupo))
                .filter((grupo) => Number.isFinite(grupo))
                .slice(0, 3),
              created: Boolean(result?.created),
              preserved: Boolean(result?.preserved),
              officialTargetYmd:
                officialEntry?.targetYmd || null,
              officialTargetHour:
                officialEntry?.targetHour || null,
              };
          
              const raw =
                window.localStorage.getItem(
                  "nacional_top3_runtime_authority_trace_v4"
                );
          
              let trace = [];
          
              try {
                const parsed = raw
                  ? JSON.parse(raw)
                  : [];
          
                trace = Array.isArray(parsed)
                  ? parsed
                  : [];
              } catch {
                trace = [];
              }
          
              const nextTrace = [
                ...trace,
                traceEntry,
              ].slice(-500);
          
              window.localStorage.setItem(
                "nacional_top3_runtime_authority_trace_v4",
                JSON.stringify(nextTrace)
              );
          
              window.__NACIONAL_TOP3_RUNTIME_AUTHORITY_TRACE_V4__ =
                nextTrace;
          
              console.info(
                "[NACIONAL TOP3 AUTHORITY TRACE V4]",
                traceEntry
              );
            } catch {}
          }

          if (
            activeTop3ContextRef.current === activeTop3ContextKey &&
            top3ContextKey === activeTop3ContextKey &&
            officialTop3.length === 3
          ) {
            setCurrentPersistedPrediction(
              officialEntry
            );

            setCurrentPersistedResolved(true);

            setTop3(officialTop3);

            setTop3ContextKey(
              activeTop3ContextKey
            );
          }

          console.info(
            "[TOP3 FIRESTORE SAVE OK]",
            {
              ...diagnostic,
              officialGroups:
                officialTop3.map(
                  (item) => Number(item?.grupo)
                ),
              preserved:
                Boolean(result?.preserved),
              created:
                Boolean(result?.created),
            }
          );
        }
      })
      .catch((error) => {
        top3SaveRunKeys.delete(saveRunKey);

        const diagnostic = {
          at: new Date().toISOString(),
          lotteryKey: lotteryKeySafe,
          targetYmd: analysisYmd,
          targetHour: analysisHourBucket,
          picks,
          error: String(error?.message || error || ""),
        };

        try {
          window.localStorage.setItem(
            "top3_firestore_last_save",
            JSON.stringify(diagnostic)
          );

          window.__TOP3_FIRESTORE_LAST_SAVE__ = diagnostic;
        } catch {}

        /*
         * TOP3_OFFICIAL_PUBLICATION_CONFIRMATION_V1
         *
         * Falha técnica de persistência:
         * não publicar cálculo local como previsão oficial.
         */
        /*
           * TOP3_PERSISTENCE_ERROR_NON_DESTRUCTIVE_V1
           *
           * Falha de persistência não invalida nem apaga um TOP3
           * já calculado/hidratado para o contexto atual.
           *
           * O erro continua registrado para diagnóstico.
           * Não altera motor, ranking, snapshot ou histórico.
           */

        console.error(
          "[TOP3 FIRESTORE SAVE EXCEPTION]",
          diagnostic
        );
      });
  }, [
    analysisYmd,
    analysisHourBucket,
    top3,
    lotteryKeySafe,
    debugTop3,
    currentPersistedResolved,
    currentPersistedPrediction,
    activeTop3ContextKey,
    top3ContextKey,
  ]);

  useEffect(() => {
    const persistedSchedule = scheduleKey
      ? scheduleKey.split("|").filter(Boolean)
      : [];

    debugTop3Effect("04_load_persisted_history", {
      lotteryKey: lotteryKeySafe,
      timelineYmd,
      scheduleLength: persistedSchedule.length,
      secondaryReady,
    });

    if (!secondaryReady) {
      setPersistedTop3History([]);
      setPersistedTop3HistoryResolved(false);
      return undefined;
    }

    let alive = true;

    setPersistedTop3History([]);
    setPersistedTop3HistoryResolved(false);

    async function loadPersistedHistory() {
      if (!isYMD(timelineYmd)) {
        if (alive) {
          setPersistedTop3History([]);
          setPersistedTop3HistoryResolved(true);
        }
        return;
      }

      try {
        const history = await loadTop3PredictionDay({
          lotteryKey: lotteryKeySafe,
          targetYmd: timelineYmd,
          schedule: persistedSchedule,
        });

        /*
         * TOP3_HISTORY_HOOK_RUNTIME_TRACE_V1
         *
         * Registra exatamente o histórico recebido do Firestore.
         * Não altera ou filtra os registros.
         */
        if (typeof window !== "undefined") {
          const normalizedHistory = Array.isArray(history)
            ? history
            : [];

          const diagnostic = {
            at: new Date().toISOString(),
            lotteryKey: lotteryKeySafe,
            timelineYmd,
            requestedSchedule: persistedSchedule,
            receivedCount: normalizedHistory.length,
            receivedEntries: normalizedHistory.map((entry) => ({
              id: safeStr(entry?.id),
              targetYmd: safeStr(entry?.targetYmd),
              targetHour: toHourBucket(entry?.targetHour),
              targetKey: safeStr(entry?.targetKey),
              status: safeStr(entry?.status),
              snapshotLength: Array.isArray(entry?.snapshot)
                ? entry.snapshot.length
                : 0,
              grupos: (Array.isArray(entry?.snapshot)
                ? entry.snapshot
                : []
              )
                .slice(0, 3)
                .map((item) => Number(item?.grupo) || null),
            })),
          };

          window.__TOP3_HISTORY_HOOK_RUNTIME_TRACE__ =
            diagnostic;

          try {
            window.localStorage.setItem(
              "top3_history_hook_runtime_trace_last",
              JSON.stringify(diagnostic)
            );
          } catch {}

          console.info(
            "[TOP3 HISTORY HOOK RUNTIME TRACE]",
            diagnostic
          );
        }

        if (alive) {
          setPersistedTop3History(
            Array.isArray(history) ? history : []
          );
        }
      } catch {
        if (alive) {
          setPersistedTop3History([]);
        }
      } finally {
        if (alive) {
          setPersistedTop3HistoryResolved(true);
        }
      }
    }

    loadPersistedHistory();

    return () => {
      alive = false;
    };
  }, [
    lotteryKeySafe,
    timelineYmd,
    scheduleKey,
    secondaryReady,
  ]);

  /*
   * TOP3_BACKEND_ONLY_RECONCILIATION_V2
   *
   * A reconciliacao oficial dos resultados pertence exclusivamente
   * ao backend.
   *
   * O antigo useEffect de reconciliacao no navegador foi removido
   * fisicamente. O frontend permanece consumidor dos snapshots
   * persistidos e nao executa reconciliacao oficial.
   *
   * Isso evita:
   * - leituras duplicadas;
   * - escritas concorrentes;
   * - retries do navegador;
   * - pressao desnecessaria sobre o Firestore;
   * - duas autoridades para os hits oficiais.
   */


  const availableHistoryDates = useMemo(() => {
    const key = safeStr(lotteryKeySafe).toUpperCase();

    return Array.isArray(
      availableHistoryDatesByLottery?.[key]
    )
      ? availableHistoryDatesByLottery[key]
      : [];
  }, [
    availableHistoryDatesByLottery,
    lotteryKeySafe,
  ]);

  return {
    LOOKBACK_ALL,
    LOOKBACK_OPTIONS,
    LOTTERY_OPTIONS,

    lotteryKeySafe,
    loadedLotteryKey,
    ymdSafe,
    loadedYmd,
    lookback,
    loading: loading || primaryComputing,
    primaryComputing,
    loadingStage,
    error,
    dateBR,
    schedule,
    isFederalNonDrawDay,
    rangeLabel,

    lastHourBucket,
    targetHourBucket,
    targetYmd,
    analysisHourBucket,
    analysisYmd,

    prevLabel,
    lastLabel,
    layerMetaText,

    top3,
    top3ContextKey,
    activeTop3ContextKey,
    timelineTop3,
    persistedTop3History,
    persistedTop3HistoryResolved,
    availableHistoryDates,

    setLotteryKey,
    setYmd,
    setLookback,
    load,

    safeStr,
    lotteryLabel,

    build16,
    build24,
    getCentena3,
    normalizeImgSrc,
  };
}
