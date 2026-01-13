// src/pages/Top3/Top3.jsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  getKingResultsByDate,
  getKingResultsByRange,
  getKingBoundsByUf,
} from "../../services/kingResultsService";
import { getAnimalLabel, getImgFromGrupo } from "../../constants/bichoMap";

/* =========================
   Helpers (robustos)
========================= */

function pad2(n) {
  return String(n).padStart(2, "0");
}

function safeStr(v) {
  return String(v ?? "").trim();
}

function isYMD(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || "").trim());
}

function ymdToBR(ymd) {
  const m = String(ymd || "")
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return safeStr(ymd);
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function brToYMD(br) {
  const m = String(br || "")
    .trim()
    .match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function normalizeToYMD(input) {
  if (!input) return null;

  // Date object
  if (input instanceof Date && !Number.isNaN(input.getTime())) {
    return `${input.getFullYear()}-${pad2(input.getMonth() + 1)}-${pad2(
      input.getDate()
    )}`;
  }

  const s = safeStr(input);
  if (!s) return null;

  // YYYY-MM-DD...
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  // DD/MM/YYYY
  const y = brToYMD(s);
  if (y) return y;

  return null;
}

function todayYMDLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function addDaysYMD(ymd, deltaDays) {
  if (!isYMD(ymd)) return ymd;
  const [Y, M, D] = ymd.split("-").map((x) => Number(x));
  const dt = new Date(Y, M - 1, D);
  dt.setDate(dt.getDate() + Number(deltaDays || 0));
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
}

/**
 * ✅ Normaliza "horário" para HH:MM
 * Aceita: "09HS", "9 HS", "09HRS", "09HR", "09H", "9h", "09:00", "9", etc.
 */
function normalizeHourLike(value) {
  const s0 = safeStr(value);
  if (!s0) return "";

  const s = s0.replace(/\s+/g, "");

  const mhx = s.match(/^(\d{1,2})(?:h|hs|hr|hrs)$/i);
  if (mhx) return `${pad2(mhx[1])}:00`;

  const mISO = s.match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/);
  if (mISO) return `${pad2(mISO[1])}:${pad2(mISO[2])}`;

  const m2 = s.match(/^(\d{1,2})$/);
  if (m2) return `${pad2(m2[1])}:00`;

  return s0;
}

/** bucket por hora (zera minutos) — "09:09" -> "09:00" */
function toHourBucket(hhmm) {
  const s = normalizeHourLike(hhmm);
  const m = s.match(/^(\d{2}):(\d{2})$/);
  if (!m) return s;
  return `${m[1]}:00`;
}

function hourToInt(hhmm) {
  const s = normalizeHourLike(hhmm);
  const m = s.match(/^(\d{2}):(\d{2})$/);
  if (!m) return -1;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** Extrai posição/grupo do prize em múltiplos formatos */
function guessPrizePos(p) {
  const pos = Number.isFinite(Number(p?.position))
    ? Number(p.position)
    : Number.isFinite(Number(p?.posicao))
    ? Number(p.posicao)
    : Number.isFinite(Number(p?.pos))
    ? Number(p.pos)
    : Number.isFinite(Number(p?.colocacao))
    ? Number(p.colocacao)
    : null;
  return pos;
}

function guessPrizeGrupo(p) {
  const g = Number.isFinite(Number(p?.grupo2))
    ? Number(p.grupo2)
    : Number.isFinite(Number(p?.group2))
    ? Number(p.group2)
    : Number.isFinite(Number(p?.grupo))
    ? Number(p.grupo)
    : Number.isFinite(Number(p?.group))
    ? Number(p.group)
    : Number.isFinite(Number(p?.animal_grupo))
    ? Number(p.animal_grupo)
    : null;
  return g;
}

function pickDrawHour(draw) {
  return normalizeHourLike(
    draw?.close_hour || draw?.closeHour || draw?.hour || draw?.hora || ""
  );
}

function pickDrawYMD(draw) {
  const y =
    draw?.ymd ||
    normalizeToYMD(draw?.date) ||
    normalizeToYMD(draw?.data) ||
    normalizeToYMD(draw?.dt) ||
    null;
  return y;
}

/**
 * ✅ Extrai grupo do 1º prêmio do draw:
 * - primeiro tenta prizes (modo detailed)
 * - depois tenta campos “lean/auto/agregado” (se existirem)
 */
function pickPrize1GrupoFromDraw(draw) {
  const prizes = Array.isArray(draw?.prizes) ? draw.prizes : [];
  if (prizes.length) {
    const p1 = prizes.find((p) => guessPrizePos(p) === 1) || null;
    if (p1) {
      const g = guessPrizeGrupo(p1);
      return Number.isFinite(Number(g)) ? Number(g) : null;
    }
  }

  // fallback “lean/auto/agregado” (nomes comuns)
  const candidates = [
    draw?.grupo1,
    draw?.group1,
    draw?.primeiro_grupo,
    draw?.first_grupo,
    draw?.prize1_grupo,
    draw?.prize1Grupo,
    draw?.p1_grupo2,
    draw?.p1Grupo2,
    draw?.g1,
    draw?.grupo_1,
    draw?.grupoPrimeiro,
  ];

  for (const v of candidates) {
    if (Number.isFinite(Number(v))) return Number(v);
  }

  return null;
}

function getDowKey(ymd) {
  if (!isYMD(ymd)) return null;
  const [Y, M, D] = ymd.split("-").map((x) => Number(x));
  const dt = new Date(Y, M - 1, D);
  // 0=Dom..6=Sáb
  return dt.getDay();
}

function getDomNumber(ymd) {
  if (!isYMD(ymd)) return null;
  const m = ymd.match(/^\d{4}-\d{2}-(\d{2})$/);
  if (!m) return null;
  return Number(m[1]);
}

/**
 * Mapeamento UI (UF) -> chave real do Firestore
 */
const UF_TO_LOTTERY_KEY = {
  RJ: "PT_RIO",
};

function normalizeUfToQueryKey(input) {
  const s = safeStr(input).toUpperCase();
  if (!s) return "";
  if (s.includes("_") || s.length > 2) return s;
  return UF_TO_LOTTERY_KEY[s] || s;
}

function lotteryLabelFromKey(key) {
  const s = safeStr(key).toUpperCase();
  if (s === "PT_RIO") return "RIO";
  if (s.length === 2) return s;
  const parts = s.split("_");
  return parts[parts.length - 1] || s;
}

/* =========================
   Grade de horários (PT/RIO)
   ✅ Regra: quarta (3) e sábado (6) NÃO tem 18h (por causa Federal 20h)
========================= */

const PT_RIO_SCHEDULE_NORMAL = ["09:00", "11:00", "14:00", "16:00", "18:00", "21:00"];
const PT_RIO_SCHEDULE_WED_SAT = ["09:00", "11:00", "14:00", "16:00", "21:00"];

/** Retorna grade válida para a data consultada (evita 18h em qua/sáb) */
function getPtRioScheduleForYmd(ymd) {
  const dow = getDowKey(ymd);
  if (dow === 3 || dow === 6) return PT_RIO_SCHEDULE_WED_SAT;
  return PT_RIO_SCHEDULE_NORMAL;
}

function prevHourFromSchedule(schedule, targetHour) {
  const sch =
    Array.isArray(schedule) && schedule.length ? schedule : PT_RIO_SCHEDULE_NORMAL;
  const t = toHourBucket(targetHour);
  const idx = sch.findIndex((h) => h === t);
  if (idx < 0) return null;
  if (idx > 0) return sch[idx - 1];
  return null;
}

/**
 * ✅ Próximo horário:
 * - se existir, retorna o próximo
 * - se o alvo for o último do dia, retorna null (dia encerrado)
 */
function nextHourFromSchedule(schedule, lastHourBucket) {
  const sch =
    Array.isArray(schedule) && schedule.length ? schedule : PT_RIO_SCHEDULE_NORMAL;
  const lh = toHourBucket(lastHourBucket);
  const idx = sch.findIndex((h) => h === lh);
  if (idx >= 0 && idx < sch.length - 1) return sch[idx + 1];
  return null; // ✅ dia encerrado
}

function scheduleSet(schedule) {
  return new Set((Array.isArray(schedule) ? schedule : []).map(toHourBucket));
}

function isHourInSchedule(schedule, hhmm) {
  const s = scheduleSet(schedule);
  return s.has(toHourBucket(hhmm));
}

function findLastDrawInList(draws, schedule) {
  const list = Array.isArray(draws) ? draws : [];
  if (!list.length) return null;

  const sorted = [...list]
    .filter((d) => isHourInSchedule(schedule, pickDrawHour(d)))
    .sort((a, b) => {
      const ha = hourToInt(pickDrawHour(a));
      const hb = hourToInt(pickDrawHour(b));
      return hb - ha;
    });

  return sorted[0] || null;
}

function findPrevDrawBeforeTargetInSameDay(draws, targetHourBucket, schedule) {
  const list = Array.isArray(draws) ? draws : [];
  if (!list.length) return null;

  const t = hourToInt(targetHourBucket);
  if (t < 0) return null;

  const candidates = list
    .filter((d) => isHourInSchedule(schedule, pickDrawHour(d)))
    .map((d) => ({ d, h: hourToInt(toHourBucket(pickDrawHour(d))) }))
    .filter((x) => x.h >= 0 && x.h < t)
    .sort((a, b) => b.h - a.h);

  return candidates.length ? candidates[0].d : null;
}

async function getPreviousDrawRobust({
  ufQueryKey,
  ymdTarget,
  targetHourBucket,
  todayDraws,
  schedule,
  maxBackDays = 7,
}) {
  const prevSameDay = findPrevDrawBeforeTargetInSameDay(
    todayDraws,
    targetHourBucket,
    schedule
  );
  if (prevSameDay) {
    return {
      draw: prevSameDay,
      ymd: pickDrawYMD(prevSameDay) || ymdTarget,
      hour: toHourBucket(pickDrawHour(prevSameDay)),
      source: "same_day",
    };
  }

  // ao voltar dias, usa o schedule do próprio dia consultado
  for (let i = 1; i <= maxBackDays; i += 1) {
    const day = addDaysYMD(ymdTarget, -i);
    const daySchedule = getPtRioScheduleForYmd(day);

    const out = await getKingResultsByDate({
      uf: ufQueryKey,
      date: day,
      closeHour: null,
      positions: null,
    });

    const last = findLastDrawInList(out, daySchedule);
    if (last) {
      return {
        draw: last,
        ymd: pickDrawYMD(last) || day,
        hour: toHourBucket(pickDrawHour(last)),
        source: "prev_day",
      };
    }
  }

  return { draw: null, ymd: "", hour: "", source: "none" };
}

/* =========================
   Períodos (UX)
========================= */

const LOOKBACK_ALL = "ALL";
const LOOKBACK_OPTIONS = [
  { value: LOOKBACK_ALL, label: "Todos" },
  { value: 180, label: "180 dias" },
  { value: 150, label: "150 dias" },
  { value: 120, label: "120 dias" },
  { value: 90, label: "90 dias" },
  { value: 60, label: "60 dias" },
  { value: 30, label: "30 dias" },
  { value: 21, label: "21 dias" },
  { value: 14, label: "14 dias" },
  { value: 7, label: "7 dias" },
];

/* =========================
   Milhares helpers (TOP3)
========================= */

function pickPrizeMilhar4(p) {
  const raw =
    p?.milhar ??
    p?.milhar4 ??
    p?.numero ??
    p?.number ??
    p?.mil ??
    p?.num ??
    p?.valor ??
    "";
  const digits = safeStr(raw).replace(/\D+/g, "");
  if (!digits) return null;
  const last4 = digits.slice(-4).padStart(4, "0");
  return /^\d{4}$/.test(last4) ? last4 : null;
}

function getDezena2(milhar4) {
  const s = safeStr(milhar4);
  if (!/^\d{4}$/.test(s)) return null;
  return s.slice(2, 4);
}

function getCentena3(milhar4) {
  const s = safeStr(milhar4);
  if (!/^\d{4}$/.test(s)) return null;
  return s.slice(1, 4);
}

function milharCompareAsc(a, b) {
  return String(a).localeCompare(String(b), "en", { numeric: true });
}

function dezenaCompareAsc(a, b) {
  return String(a).localeCompare(String(b), "en", { numeric: true });
}

/**
 * ✅ Ordena milhares por:
 * 1) CENTENA (asc)
 * 2) MILHAR (asc)
 */
function milharCompareByCentenaAsc(a, b) {
  const ca = getCentena3(a);
  const cb = getCentena3(b);
  if (ca && cb && ca !== cb)
    return String(ca).localeCompare(String(cb), "en", { numeric: true });
  return milharCompareAsc(a, b);
}

/* =========================
   TOP3 Page
========================= */

export default function Top3() {
  const DEFAULT_UF_UI = "RJ";

  const [ufUi, setUfUi] = useState(DEFAULT_UF_UI);
  const [ymd, setYmd] = useState(() => todayYMDLocal());
  const [lookback, setLookback] = useState(LOOKBACK_ALL);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [rangeDraws, setRangeDraws] = useState([]);
  const [bounds, setBounds] = useState({ minDate: "", maxDate: "" });

  // ✅ usado (some no warning)
  const [rangeInfo, setRangeInfo] = useState({ from: "", to: "" });

  const [lastHourBucket, setLastHourBucket] = useState("");

  // ✅ Próximo horário (alvo). Quando o dia estiver encerrado => ""
  const [targetHourBucket, setTargetHourBucket] = useState("");

  const dayEnded = useMemo(() => {
    return !!safeStr(lastHourBucket) && !safeStr(targetHourBucket);
  }, [lastHourBucket, targetHourBucket]);

  // ✅ Hora efetiva de cálculo do TOP3:
  // - se houver alvo => alvo
  // - se dia encerrado => último horário encontrado
  const analysisHourBucket = useMemo(() => {
    return safeStr(targetHourBucket) || safeStr(lastHourBucket) || "";
  }, [targetHourBucket, lastHourBucket]);

  const [prevInfo, setPrevInfo] = useState({
    prevYmd: "",
    prevHour: "",
    prevGrupo: null,
    prevAnimal: "",
    source: "none",
  });

  const ufQueryKey = useMemo(() => normalizeUfToQueryKey(ufUi), [ufUi]);

  const label = useMemo(
    () => lotteryLabelFromKey(ufQueryKey || ufUi),
    [ufQueryKey, ufUi]
  );

  const ymdSafe = useMemo(() => {
    const y = normalizeToYMD(ymd);
    return y && isYMD(y) ? y : todayYMDLocal();
  }, [ymd]);

  const dateBR = useMemo(() => ymdToBR(ymdSafe), [ymdSafe]);

  // ✅ Schedule dinâmico por data (quarta/sábado sem 18h)
  const schedule = useMemo(() => {
    const key = safeStr(ufQueryKey).toUpperCase();
    if (key === "PT_RIO") return getPtRioScheduleForYmd(ymdSafe);
    return getPtRioScheduleForYmd(ymdSafe);
  }, [ufQueryKey, ymdSafe]);

  const lookbackLabel = useMemo(() => {
    if (lookback === LOOKBACK_ALL) return "Toda a base";
    const n = Number(lookback || 0);
    if (!Number.isFinite(n) || n <= 0) return "—";
    return `${n} dias`;
  }, [lookback]);

  const rangeLabel = useMemo(() => {
    const f = safeStr(rangeInfo?.from);
    const t = safeStr(rangeInfo?.to);
    if (isYMD(f) && isYMD(t)) return `${ymdToBR(f)} → ${ymdToBR(t)}`;
    return "—";
  }, [rangeInfo]);

  const load = useCallback(async () => {
    const uQuery = safeStr(ufQueryKey);
    if (!uQuery || !isYMD(ymdSafe)) return;

    setLoading(true);
    setError("");

    try {
      let minDate = safeStr(bounds?.minDate);
      let maxDate = safeStr(bounds?.maxDate);

      try {
        const b = await getKingBoundsByUf({ uf: uQuery });

        const bMin = safeStr(b?.minYmd || b?.minDate || b?.min || "");
        const bMax = safeStr(b?.maxYmd || b?.maxDate || b?.max || "");

        if (isYMD(bMin)) minDate = bMin;
        if (isYMD(bMax)) maxDate = bMax;

        if (isYMD(minDate) || isYMD(maxDate)) {
          setBounds({ minDate: minDate || "", maxDate: maxDate || "" });
        }
      } catch {
        // ok
      }

      const outToday = await getKingResultsByDate({
        uf: uQuery,
        date: ymdSafe,
        closeHour: null,
        positions: null,
      });
      const today = Array.isArray(outToday) ? outToday : [];

      // ✅ “last” só considera horários previstos no schedule do dia
      const last = findLastDrawInList(today, schedule);
      const lastBucket = last ? toHourBucket(pickDrawHour(last)) : "";
      setLastHourBucket(lastBucket);

      // ✅ CORREÇÃO:
      // - se não existe sorteio ainda no dia: alvo = primeiro horário da grade
      // - se existe last: alvo = próximo da grade (ou "" se dia encerrado)
      const nextFromLast = lastBucket ? nextHourFromSchedule(schedule, lastBucket) : null;
      const targetBucket = !lastBucket ? (schedule[0] || "") : (nextFromLast || "");

      // dia encerrado apenas quando existe lastBucket e nextFromLast é null
      const ended = !!lastBucket && !nextFromLast;

      setTargetHourBucket(ended ? "" : targetBucket);

      const rangeTo = ymdSafe;

      let rangeFrom = "";
      if (lookback === LOOKBACK_ALL) {
        rangeFrom = isYMD(minDate) ? minDate : addDaysYMD(ymdSafe, -180);
      } else {
        const days = Math.max(1, Number(lookback || 30));
        rangeFrom = addDaysYMD(ymdSafe, -(days - 1));
      }

      setRangeInfo({ from: rangeFrom, to: rangeTo });

      const outRange = await getKingResultsByRange({
        uf: uQuery,
        dateFrom: rangeFrom,
        dateTo: rangeTo,
        closeHour: null,
        positions: [1],
        mode: "detailed",
      });

      const hist = Array.isArray(outRange) ? outRange : [];
      setRangeDraws(hist);

      // ✅ Hora efetiva para buscar “sorteio anterior”:
      // - se dia encerrado => usa lastBucket
      // - se não encerrou => usa alvo (targetBucket)
      const hourForPrev = ended ? (lastBucket || "") : (targetBucket || "");

      if (hourForPrev) {
        const prev = await getPreviousDrawRobust({
          ufQueryKey: uQuery,
          ymdTarget: ymdSafe,
          targetHourBucket: hourForPrev,
          todayDraws: today,
          schedule,
          maxBackDays: 7,
        });

        const prevGrupo = prev?.draw ? pickPrize1GrupoFromDraw(prev.draw) : null;
        const prevAnimal = prevGrupo
          ? safeStr(getAnimalLabel?.(prevGrupo) || "")
          : "";

        setPrevInfo({
          prevYmd: safeStr(prev?.ymd || ""),
          prevHour: safeStr(prev?.hour || ""),
          prevGrupo: Number.isFinite(Number(prevGrupo)) ? Number(prevGrupo) : null,
          prevAnimal,
          source: safeStr(prev?.source || "none"),
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
    } catch (e) {
      setRangeDraws([]);
      setLastHourBucket("");
      setTargetHourBucket("");
      setPrevInfo({
        prevYmd: "",
        prevHour: "",
        prevGrupo: null,
        prevAnimal: "",
        source: "none",
      });
      setRangeInfo({ from: "", to: "" });
      setError(String(e?.message || e || "Falha ao carregar dados do TOP3."));
    } finally {
      setLoading(false);
    }
  }, [ufQueryKey, ymdSafe, schedule, lookback, bounds?.minDate, bounds?.maxDate]);

  useEffect(() => {
    load();
  }, [load]);

  const prevLabel = useMemo(() => {
    if (!prevInfo?.prevGrupo) return "—";
    const g = Number(prevInfo.prevGrupo);
    const animal = safeStr(prevInfo.prevAnimal || getAnimalLabel?.(g) || "");
    const when =
      prevInfo?.prevYmd && prevInfo?.prevHour
        ? `${ymdToBR(prevInfo.prevYmd)} ${prevInfo.prevHour}`
        : "";
    return `G${pad2(g)}${animal ? " • " + animal.toUpperCase() : ""}${
      when ? " • " + when : ""
    }`;
  }, [prevInfo]);

  const top3 = useMemo(() => {
    const list = Array.isArray(rangeDraws) ? rangeDraws : [];
    if (!list.length) return [];

    const target = toHourBucket(analysisHourBucket);
    if (!target) return [];

    const schSet = scheduleSet(schedule);

    const curYmd = ymdSafe;
    const curDow = getDowKey(curYmd);
    const curDom = getDomNumber(curYmd);

    const prevGrupo = Number.isFinite(Number(prevInfo?.prevGrupo))
      ? Number(prevInfo.prevGrupo)
      : null;

    // ✅ byKey só considera draws em horários válidos do schedule do dia analisado
    const byKey = new Map(); // `${ymd}__${hour}` -> grupo1
    for (const d of list) {
      const y = pickDrawYMD(d);
      if (!isYMD(y)) continue;

      const h = toHourBucket(pickDrawHour(d));
      if (!h) continue;

      // ignora horas fora da grade (ex: 20:00 Federal)
      if (!schSet.has(h)) continue;

      const g1 = pickPrize1GrupoFromDraw(d);
      if (!Number.isFinite(Number(g1))) continue;

      byKey.set(`${y}__${h}`, Number(g1));
    }

    const baseCounts = new Map(); // grupo -> count
    let baseTotal = 0;

    for (const [k, g] of byKey.entries()) {
      const hour = k.split("__")[1] || "";
      if (hour !== target) continue;
      baseTotal += 1;
      baseCounts.set(g, (baseCounts.get(g) || 0) + 1);
    }

    if (baseTotal <= 0) return [];

    const prevHourSameDay = prevHourFromSchedule(schedule, target);
    const lastHourInDay = schedule[schedule.length - 1] || "21:00";

    const transitions = []; // { ymd, dow, dom, prevG, nextG }
    for (const [k, nextG] of byKey.entries()) {
      const [y, hour] = k.split("__");
      if (hour !== target) continue;

      let prevG = null;

      if (prevHourSameDay) {
        prevG = byKey.get(`${y}__${prevHourSameDay}`) ?? null;
      } else {
        const yPrev = addDaysYMD(y, -1);
        prevG = byKey.get(`${yPrev}__${lastHourInDay}`) ?? null;
      }

      if (!Number.isFinite(Number(prevG))) continue;

      transitions.push({
        ymd: y,
        dow: getDowKey(y),
        dom: getDomNumber(y),
        prevG: Number(prevG),
        nextG: Number(nextG),
      });
    }

    const transCounts = new Map(); // nextG -> count
    const transCountsDow = new Map();
    const transCountsDom = new Map();

    let transTotal = 0;
    let transTotalDow = 0;
    let transTotalDom = 0;

    if (prevGrupo != null) {
      for (const t of transitions) {
        if (t.prevG !== prevGrupo) continue;

        transTotal += 1;
        transCounts.set(t.nextG, (transCounts.get(t.nextG) || 0) + 1);

        if (curDow != null && t.dow === curDow) {
          transTotalDow += 1;
          transCountsDow.set(t.nextG, (transCountsDow.get(t.nextG) || 0) + 1);
        }

        if (curDom != null && t.dom === curDom) {
          transTotalDom += 1;
          transCountsDom.set(t.nextG, (transCountsDom.get(t.nextG) || 0) + 1);
        }
      }
    }

    const MIN_TRANS_SAMPLES = 6;
    const MIN_DOW_SAMPLES = 4;
    const MIN_DOM_SAMPLES = 3;

    const W_BASE = 1.0;
    const W_TRANS = 0.65;
    const W_DOW = 0.35;
    const W_DOM = 0.25;

    function prob(count, total) {
      if (!Number.isFinite(total) || total <= 0) return 0;
      return Math.max(0, Math.min(1, Number(count || 0) / total));
    }

    function capped(x, cap) {
      return Math.max(0, Math.min(Number(cap), Number(x || 0)));
    }

    const candidates = Array.from(baseCounts.keys());

    const scored = candidates.map((g) => {
      const baseHit = baseCounts.get(g) || 0;
      const pBase = prob(baseHit, baseTotal);

      const transHit = transCounts.get(g) || 0;
      const pTrans = prob(transHit, transTotal);

      const dowHit = transCountsDow.get(g) || 0;
      const pDow = prob(dowHit, transTotalDow);

      const domHit = transCountsDom.get(g) || 0;
      const pDom = prob(domHit, transTotalDom);

      const useTrans = prevGrupo != null && transTotal >= MIN_TRANS_SAMPLES;
      const useDow = prevGrupo != null && transTotalDow >= MIN_DOW_SAMPLES;
      const useDom = prevGrupo != null && transTotalDom >= MIN_DOM_SAMPLES;

      const bonusTrans = useTrans ? capped(pTrans, 0.55) : 0;
      const bonusDow = useDow ? capped(pDow, 0.40) : 0;
      const bonusDom = useDom ? capped(pDom, 0.32) : 0;

      const finalScore =
        W_BASE * pBase +
        W_TRANS * bonusTrans +
        W_DOW * bonusDow +
        W_DOM * bonusDom;

      const animal = safeStr(getAnimalLabel?.(g) || "");
      const img =
        safeStr(getImgFromGrupo?.(g) || "") ||
        (animal ? `/img/${animal.toLowerCase()}.png` : "");

      return {
        grupo: g,
        animal,
        img,

        baseHit,
        baseTotal,

        prevGrupo,
        transHit,
        transTotal,

        dowHit,
        transTotalDow,

        domHit,
        transTotalDom,

        useTrans,
        useDow,
        useDom,

        pBase,
        pTrans,
        pDow,
        pDom,
        finalScore,
      };
    });

    scored.sort(
      (a, b) =>
        b.finalScore - a.finalScore ||
        b.baseHit - a.baseHit ||
        a.grupo - b.grupo
    );

    const best = scored.slice(0, 3);
    const sum =
      best.reduce((acc, x) => acc + (Number(x.finalScore) || 0), 0) || 1;

    return best.map((x, idx) => {
      const pct = Math.round(((Number(x.finalScore) || 0) / sum) * 100);
      return {
        ...x,
        rank: idx + 1,
        pct,
        title:
          idx === 0 ? "Principal" : idx === 1 ? "Alternativa" : "Terceira opção",
      };
    });
  }, [rangeDraws, analysisHourBucket, schedule, ymdSafe, prevInfo]);

  const styles = useMemo(() => {
    return `
      :root{
        --pp-border: rgba(255,255,255,0.10);
        --pp-gold: rgba(201,168,62,0.92);
        --pp-gold2: rgba(201,168,62,0.55);
      }

      .pp_wrap{ padding: 18px; min-width: 0; box-sizing: border-box; }

      .pp_shell{
        border: 1px solid var(--pp-border);
        border-radius: 18px;
        background: rgba(0,0,0,0.40);
        box-shadow: 0 16px 48px rgba(0,0,0,0.55);
        padding: 12px;
        display: grid;
        grid-template-rows: auto 1fr;
        gap: 10px;
        min-width: 0;
        min-height: calc(100dvh - 36px);
      }

      .pp_header{
        display:grid;
        grid-template-columns: 1fr auto 1fr;
        align-items:start;
        gap:12px;
        min-width:0;
      }
      .pp_headerLeft{ min-width:0; }
      .pp_headerCenter{ min-width:0; text-align:center; }
      .pp_headerRight{ display:flex; justify-content:flex-end; min-width:0; }

      .pp_title{
        font-size:18px;
        font-weight:1000;
        letter-spacing:0.2px;
        color: rgba(255,255,255,0.92);
        line-height:1.1;
        text-align:center;
      }

      .pp_sub{
        margin-top:6px;
        color: rgba(255,255,255,0.64);
        font-weight:850;
        line-height:1.25;
        max-width: 980px;
        font-size: 12px;
        margin-left:auto;
        margin-right:auto;
        text-align:center;
      }

      .pp_gold{ color: var(--pp-gold); }

      .pp_controls{ display:flex; align-items:center; gap:8px; flex-wrap:wrap; justify-content:flex-end; }

      .pp_input, .pp_select{
        height:34px;
        border-radius:12px;
        border: 1px solid var(--pp-border);
        background: rgba(0,0,0,0.55);
        color:#fff;
        padding: 0 10px;
        outline:none;
        font-weight:900;
        letter-spacing:0.2px;
        min-width:110px;
        font-size: 12px;
        box-sizing: border-box;
      }
      .pp_input:focus, .pp_select:focus{
        border-color: rgba(201,168,62,0.55);
        box-shadow: 0 0 0 3px rgba(201,168,62,0.12);
      }

      .pp_btn{
        height:34px;
        border-radius:12px;
        border: 1px solid var(--pp-border);
        background: rgba(255,255,255,0.06);
        color: rgba(255,255,255,0.92);
        font-weight:1000;
        letter-spacing:0.2px;
        padding: 0 14px;
        cursor:pointer;
        white-space:nowrap;
        font-size: 12px;
      }
      .pp_btn:hover{ background: rgba(255,255,255,0.08); }

      .pp_body{ min-width:0; min-height:0; overflow: auto; display:flex; align-items: stretch; justify-content: center; }

      .pp_center{
        width: 100%;
        max-width: 1100px;
        display:grid;
        grid-template-rows: auto auto;
        gap: 10px;
        padding-bottom: 10px;
      }

      .pp_kpis{
        display:flex;
        gap:10px;
        flex-wrap:wrap;
        align-items:center;
        justify-content: space-between;
        border: 1px solid var(--pp-border);
        background: rgba(0,0,0,0.20);
        border-radius: 16px;
        padding: 10px 12px;
      }

      .pp_kpi{ display:flex; flex-direction:column; gap:3px; min-width: 160px; }

      .pp_kpiLabel{
        color: rgba(255,255,255,0.60);
        font-weight: 900;
        font-size: 11px;
        letter-spacing: 0.2px;
      }

      .pp_kpiValue{
        color: rgba(255,255,255,0.92);
        font-weight: 1000;
        font-size: 14px;
        letter-spacing: 0.2px;
      }

      .pp_kpiValue strong{ color: var(--pp-gold); font-weight: 1100; }

      .pp_state{
        border: 1px solid var(--pp-border);
        border-radius: 16px;
        background: rgba(0,0,0,0.26);
        padding: 14px 16px;
        font-weight: 850;
        color: rgba(255,255,255,0.88);
      }

      .pp_cards{
        display:grid;
        grid-template-columns: 1.15fr 1fr 1fr;
        gap: 12px;
        align-content: start;
      }

      .pp_card{
        position:relative;
        border-radius: 18px;
        overflow:hidden;
        border: 1px solid rgba(255,255,255,0.12);
        box-shadow: 0 14px 34px rgba(0,0,0,0.45);
        min-height: 560px;
        display:flex;
      }

      .pp_card::before{
        content:"";
        position:absolute;
        inset:0;
        background-image: var(--pp-bg);
        background-size: cover;
        background-position: center;
        background-repeat:no-repeat;
        opacity: 0.82;
        transform: scale(1.02);
        filter: saturate(1.05) contrast(1.04);
      }

      .pp_card::after{
        content:"";
        position:absolute;
        inset:0;
        background:
          radial-gradient(1000px 420px at 10% 0%, rgba(201,168,62,0.18), transparent 62%),
          linear-gradient(180deg, rgba(0,0,0,0.40) 0%, rgba(0,0,0,0.30) 28%, rgba(0,0,0,0.55) 70%, rgba(0,0,0,0.78) 100%);
        pointer-events:none;
      }

      .pp_cardMain{ border-color: rgba(201,168,62,0.30); }

      .pp_cardInner{
        position:relative;
        z-index: 1;
        width:100%;
        padding: 12px;
        display:flex;
        flex-direction:column;
        gap: 10px;
      }

      .pp_cardTop{
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:10px;
      }

      .pp_badge{
        display:inline-flex;
        align-items:center;
        gap:8px;
        padding: 6px 10px;
        border-radius: 999px;
        border: 1px solid rgba(255,255,255,0.14);
        background: rgba(0,0,0,0.30);
        backdrop-filter: blur(8px);
        color: rgba(255,255,255,0.92);
        font-weight: 1000;
        font-size: 12px;
        letter-spacing: 0.2px;
      }

      .pp_badgeGold{
        border-color: rgba(201,168,62,0.35);
        background: rgba(201,168,62,0.14);
        color: rgba(201,168,62,0.98);
      }

      .pp_focus{
        color: rgba(255,255,255,0.88);
        font-weight: 950;
        font-size: 12px;
        white-space: nowrap;
        border: 1px solid rgba(255,255,255,0.12);
        background: rgba(0,0,0,0.26);
        backdrop-filter: blur(8px);
        border-radius: 999px;
        padding: 6px 10px;
      }

      .pp_headBox{
        border: 1px solid rgba(255,255,255,0.12);
        background: rgba(0,0,0,0.30);
        backdrop-filter: blur(10px);
        border-radius: 14px;
        padding: 10px 10px;
      }

      .pp_group{ color: rgba(255,255,255,0.75); font-weight: 950; font-size: 12px; letter-spacing: 0.2px; }

      .pp_animal{
        color: rgba(255,255,255,0.96);
        font-weight: 1100;
        font-size: 16px;
        letter-spacing: 0.3px;
        text-transform: uppercase;
        white-space: nowrap;
        overflow:hidden;
        text-overflow:ellipsis;
        margin-top: 2px;
      }

      .pp_meta{
        margin-top: 4px;
        color: rgba(255,255,255,0.82);
        font-weight: 900;
        font-size: 12px;
      }

      .pp_meta .pp_gold{ font-weight: 1100; }

      .pp_spacer{ flex: 1 1 auto; min-height: 10px; }

      .pp_bottom{
        margin-top:auto;
        display:flex;
        flex-direction:column;
        gap: 8px;
      }

      .pp_whyBox{
        border: 1px solid rgba(255,255,255,0.12);
        background: rgba(0,0,0,0.32);
        backdrop-filter: blur(10px);
        border-radius: 14px;
        padding: 10px 10px;
        min-height: 150px;
      }

      .pp_notesTitle{
        margin: 0;
        font-size: 12px;
        font-weight: 1100;
        color: rgba(255,255,255,0.92);
        letter-spacing: 0.2px;
      }

      .pp_list{
        margin: 0;
        margin-top: 6px;
        padding-left: 16px;
        color: rgba(255,255,255,0.84);
        font-weight: 500;
        font-size: 11px;
        line-height: 1.42;
      }

      .pp_milharGrid{
        display:grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 7px;
        border: 1px solid rgba(255,255,255,0.12);
        background: rgba(0,0,0,0.28);
        backdrop-filter: blur(10px);
        border-radius: 14px;
        padding: 10px;
        min-height: 178px;
        box-sizing:border-box;
      }

      .pp_milharPill{
        border: 1px solid rgba(255,255,255,0.12);
        background: rgba(255,255,255,0.04);
        border-radius: 12px;
        padding: 6px 8px;
        font-weight: 1100;
        letter-spacing: 0.4px;
        color: rgba(255,255,255,0.92);
        text-align:center;
        display:flex;
        align-items:center;
        justify-content:center;
        min-height: 30px;
        box-sizing: border-box;
        font-size: 12px;
      }

      .pp_milharPill strong{ color: var(--pp-gold); font-weight: 1200; }

      .pp_milharPill.isEmpty{
        opacity: 0;
        pointer-events: none;
      }

      @media (max-width: 1100px){
        .pp_cards{ grid-template-columns: 1fr; }
        .pp_card{ min-height: 540px; }
      }

      @media (max-width: 720px){
        .pp_header{
          grid-template-columns: 1fr;
          gap: 10px;
        }
        .pp_headerRight{ justify-content: stretch; }
        .pp_controls{ justify-content:flex-start; }
        .pp_input, .pp_select, .pp_btn{ width:100%; min-width:0; }
        .pp_milharGrid{ grid-template-columns: repeat(2, 1fr); }
      }
    `;
  }, []);

  function buildWhySimple() {
    const out = [];

    out.push(
      `Esse grupo aparece bem no horário ${safeStr(
        analysisHourBucket
      )} dentro da base escolhida (${lookbackLabel}).`
    );

    if (prevInfo?.prevGrupo) {
      out.push(
        `O sorteio anterior ajuda na leitura (continuidade do fluxo), porque o anterior foi ${prevLabel}.`
      );
    } else {
      out.push(
        `O sorteio anterior não teve amostra suficiente para influenciar com força — o peso maior ficou na base do horário.`
      );
    }

    out.push(
      `O cálculo foi feito respeitando a grade do dia (ignorando Federal/20h quando existir).`
    );

    if (dayEnded) {
      out.push(
        `Dia encerrado: exibindo o último TOP3 do dia no horário ${safeStr(lastHourBucket)}.`
      );
    }

    return out;
  }

  /**
   * ✅ 16 milhares (com ORDEM pedida)
   * - Seleção: top 4 dezenas por frequência; top 4 milhares por frequência; sem repetir centena
   * - EXIBIÇÃO:
   *   - dezenas em ordem crescente
   *   - milhares ordenados por CENTENA asc e depois MILHAR asc
   * - Retorna SEMPRE 16 slots
   */
  function build16MilharesForGrupo(grupo2) {
    const list = Array.isArray(rangeDraws) ? rangeDraws : [];
    const target = toHourBucket(analysisHourBucket);

    if (!grupo2 || !list.length || !target) {
      return { dezenas: [], milhares: [], slots: [] };
    }

    // filtra: apenas draws do horário alvo que tenham prizes detalhados
    const prizes = [];
    for (const d of list) {
      const h = toHourBucket(pickDrawHour(d));
      if (h !== target) continue;

      const ps = Array.isArray(d?.prizes) ? d.prizes : [];
      if (!ps.length) continue;

      const p1 = ps.find((p) => guessPrizePos(p) === 1) || null;
      if (!p1) continue;

      const g = guessPrizeGrupo(p1);
      if (!Number.isFinite(Number(g)) || Number(g) !== Number(grupo2)) continue;

      const m4 = pickPrizeMilhar4(p1);
      if (!m4) continue;

      prizes.push(m4);
    }

    if (!prizes.length) return { dezenas: [], milhares: [], slots: [] };

    // contagem por dezena
    const dezCounts = new Map();
    for (const m4 of prizes) {
      const dz = getDezena2(m4);
      if (!dz) continue;
      dezCounts.set(dz, (dezCounts.get(dz) || 0) + 1);
    }

    // top 4 dezenas por freq (seleção), exibidas em ordem crescente
    const selectedDezenas = Array.from(dezCounts.entries())
      .sort((a, b) => b[1] - a[1] || dezenaCompareAsc(a[0], b[0]))
      .slice(0, 4)
      .map((x) => x[0]);

    const topDezenas = [...selectedDezenas].sort(dezenaCompareAsc);

    // milhares por dezena (seleção por frequência; exibição por centena asc)
    const byDezena = new Map();
    const usedCentenas = new Set();

    for (const dz of topDezenas) {
      const countsMilhar = new Map();

      for (const m4 of prizes) {
        if (getDezena2(m4) !== dz) continue;
        countsMilhar.set(m4, (countsMilhar.get(m4) || 0) + 1);
      }

      const ranked = Array.from(countsMilhar.entries())
        .sort((a, b) => b[1] - a[1] || milharCompareAsc(a[0], b[0]))
        .map((x) => x[0]);

      const pickedThisDz = [];

      // 1ª passada: não repetir centena
      for (const m4 of ranked) {
        if (pickedThisDz.length >= 4) break;
        const cent = getCentena3(m4);
        if (!cent) continue;
        if (usedCentenas.has(cent)) continue;
        usedCentenas.add(cent);
        pickedThisDz.push(m4);
      }

      // 2ª passada: tenta completar ainda sem repetir centena
      if (pickedThisDz.length < 4) {
        for (const m4 of ranked) {
          if (pickedThisDz.length >= 4) break;
          if (pickedThisDz.includes(m4)) continue;
          const cent = getCentena3(m4);
          if (!cent) continue;
          if (usedCentenas.has(cent)) continue;
          usedCentenas.add(cent);
          pickedThisDz.push(m4);
        }
      }

      pickedThisDz.sort(milharCompareByCentenaAsc);

      byDezena.set(
        dz,
        pickedThisDz.map((m4) => ({ dezena: dz, milhar: m4 }))
      );
    }

    const slots = [];
    for (const dz of topDezenas) {
      const arr = byDezena.get(dz) || [];
      for (let i = 0; i < 4; i += 1) {
        slots.push(arr[i] || { dezena: dz, milhar: "" });
      }
    }
    while (slots.length < 16) slots.push({ dezena: "", milhar: "" });

    return { dezenas: topDezenas, slots: slots.slice(0, 16) };
  }

  return (
    <div className="pp_wrap">
      <style>{styles}</style>

      <div className="pp_shell">
        <div className="pp_header">
          <div className="pp_headerLeft" aria-hidden="true" />
          <div className="pp_headerCenter" style={{ minWidth: 0 }}>
            <div className="pp_title">Top 3</div>
            <div className="pp_sub"></div>
          </div>

          <div className="pp_headerRight">
            <div className="pp_controls">
              <select
                className="pp_select"
                value={ufUi}
                onChange={(e) => setUfUi(e.target.value)}
                aria-label="UF"
                title="UF"
              >
                <option value="RJ">RJ</option>
              </select>

              <input
                className="pp_input"
                type="date"
                value={ymdSafe}
                onChange={(e) => setYmd(e.target.value)}
                aria-label="Data"
                title="Data"
                style={{ minWidth: 150 }}
              />

              <select
                className="pp_select"
                value={String(lookback)}
                onChange={(e) => {
                  const v = safeStr(e.target.value);
                  if (v === LOOKBACK_ALL) return setLookback(LOOKBACK_ALL);
                  setLookback(Number(v) || 30);
                }}
                aria-label="Janela histórica"
                title="Janela histórica"
              >
                {LOOKBACK_OPTIONS.map((opt) => (
                  <option key={`lk_${opt.value}`} value={String(opt.value)}>
                    {opt.label}
                  </option>
                ))}
              </select>

              <button className="pp_btn" onClick={load} type="button" title="Atualizar">
                Atualizar
              </button>
            </div>
          </div>
        </div>

        <div className="pp_body">
          <div className="pp_center">
            <div className="pp_kpis">
              <div className="pp_kpi">
                <div className="pp_kpiLabel">UF</div>
                <div className="pp_kpiValue">
                  <strong>{safeStr(ufUi).toUpperCase() || "RJ"}</strong> • {label}
                </div>
              </div>

              <div className="pp_kpi">
                <div className="pp_kpiLabel">Data consultada</div>
                <div className="pp_kpiValue">
                  <strong>{dateBR}</strong>
                </div>
              </div>

              <div className="pp_kpi">
                <div className="pp_kpiLabel">Período analisado</div>
                <div className="pp_kpiValue">{rangeLabel}</div>
              </div>

              <div className="pp_kpi">
                <div className="pp_kpiLabel">Último horário encontrado</div>
                <div className="pp_kpiValue">{lastHourBucket || "—"}</div>
              </div>

              <div className="pp_kpi">
                <div className="pp_kpiLabel">Próximo horário (alvo)</div>
                <div className="pp_kpiValue">
                  <strong>{safeStr(targetHourBucket) ? targetHourBucket : "—"}</strong>
                </div>
              </div>

              <div className="pp_kpi">
                <div className="pp_kpiLabel">Sorteio anterior (camada)</div>
                <div className="pp_kpiValue">
                  {safeStr(analysisHourBucket) ? prevLabel : "—"}
                </div>
              </div>
            </div>

            {loading ? (
              <div className="pp_state">Calculando TOP 3…</div>
            ) : error ? (
              <div className="pp_state">
                <div style={{ fontWeight: 1100, marginBottom: 6 }}>Erro</div>
                <div style={{ opacity: 0.9, whiteSpace: "pre-wrap" }}>{error}</div>
              </div>
            ) : top3.length === 0 ? (
              <div className="pp_state">
                Sem dados suficientes para calcular TOP 3 no horário{" "}
                <span className="pp_gold">{analysisHourBucket || "—"}</span>.
                <div style={{ marginTop: 6, opacity: 0.85 }}>
                  Dica: troque a data ou reduza a janela.
                </div>
              </div>
            ) : (
              <div className="pp_cards">
                {top3.map((x) => {
                  const isMain = x.rank === 1;

                  const animal =
                    safeStr(x.animal || (x.grupo ? getAnimalLabel(x.grupo) : "")) ||
                    "—";

                  const imgSrc =
                    safeStr(x.img) ||
                    (x.grupo
                      ? safeStr(getImgFromGrupo?.(x.grupo)) ||
                        `/img/${animal.toLowerCase()}.png`
                      : "");

                  const why = buildWhySimple();
                  const mil = build16MilharesForGrupo(x.grupo);
                  const slots = Array.isArray(mil?.slots) ? mil.slots : [];

                  return (
                    <div
                      key={`top3_${x.grupo}_${x.rank}`}
                      className={`pp_card ${isMain ? "pp_cardMain" : ""}`}
                      style={{ "--pp-bg": imgSrc ? `url("${imgSrc}")` : "none" }}
                    >
                      <div className="pp_cardInner">
                        <div className="pp_cardTop">
                          <div className={`pp_badge ${isMain ? "pp_badgeGold" : ""}`}>
                            #{x.rank} • {x.title}
                          </div>

                          <div className="pp_focus">
                            {dayEnded ? "Último:" : "Alvo:"}{" "}
                            <span className="pp_gold">{analysisHourBucket}</span>
                          </div>
                        </div>

                        <div className="pp_headBox">
                          <div className="pp_group">GRUPO {pad2(x.grupo)}</div>
                          <div className="pp_animal">{animal}</div>
                          <div className="pp_meta">
                            Score final:{" "}
                            <span className="pp_gold">
                              {(Number(x.finalScore) || 0).toFixed(3)}
                            </span>{" "}
                            • Peso no Top3: <span className="pp_gold">{x.pct}%</span>
                          </div>
                        </div>

                        <div className="pp_spacer" />

                        <div className="pp_bottom">
                          <div className="pp_whyBox">
                            <div className="pp_notesTitle">Por que entrou no Top 3?</div>
                            <ul className="pp_list">
                              {why.map((t, i) => (
                                <li key={`why_${x.grupo}_${i}`}>{t}</li>
                              ))}
                            </ul>
                          </div>

                          {slots.length ? (
                            <div className="pp_milharGrid" role="list" aria-label="Milhares">
                              {slots.slice(0, 16).map((m, i) => {
                                const has = !!safeStr(m?.milhar);
                                return (
                                  <div
                                    key={`mil_${x.grupo}_${m?.dezena || "dz"}_${
                                      m?.milhar || "empty"
                                    }_${i}`}
                                    className={`pp_milharPill ${has ? "" : "isEmpty"}`}
                                    role="listitem"
                                    title={
                                      has
                                        ? `Dezena ${m.dezena} • Centena ${getCentena3(
                                            m.milhar
                                          )}`
                                        : ""
                                    }
                                  >
                                    <strong>{has ? m.milhar : "0000"}</strong>
                                  </div>
                                );
                              })}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {dayEnded ? (
              <div className="pp_state" style={{ marginTop: 10 }}>
                Dia encerrado: não existe próximo horário (alvo) após{" "}
                <span className="pp_gold">{lastHourBucket || "—"}</span>. Exibindo o
                último Top 3 do dia.
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
