// src/pages/Top3/Top3.jsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  getKingResultsByDate,
  getKingResultsByRange,
  getKingBoundsByUf,
} from "../../services/kingResultsService";
import { getAnimalLabel, getImgFromGrupo } from "../../constants/bichoMap";
import { computeTop3Signals } from "../../services/statsSignals";

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

  if (input instanceof Date && !Number.isNaN(input.getTime())) {
    return `${input.getFullYear()}-${pad2(input.getMonth() + 1)}-${pad2(
      input.getDate()
    )}`;
  }

  const s = safeStr(input);
  if (!s) return null;

  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

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
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(
    dt.getDate()
  )}`;
}

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

function pickPrize1GrupoFromDraw(draw) {
  const prizes = Array.isArray(draw?.prizes) ? draw.prizes : [];
  if (prizes.length) {
    const p1 = prizes.find((p) => guessPrizePos(p) === 1) || null;
    if (p1) {
      const g = guessPrizeGrupo(p1);
      return Number.isFinite(Number(g)) ? Number(g) : null;
    }
  }

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
  return dt.getDay(); // 0 dom ... 6 sáb
}

/* =========================
   URL helper (bg robusto)
========================= */

function publicBase() {
  const b = String(process.env.PUBLIC_URL || "").trim();
  return b && b !== "/" ? b : "";
}

function normalizeImgSrc(src) {
  const s = safeStr(src);
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;

  const base = publicBase();
  if (s.startsWith("/")) return `${base}${s}`;
  if (s.startsWith("public/")) return `${base}/${s.slice("public/".length)}`;
  if (s.startsWith("img/")) return `${base}/${s}`;
  return `${base}/${s}`;
}

/**
 * ✅ tenta múltiplas variações de imagem por grupo/tamanho
 */
function makeImgVariantsFromGrupo(grupo, size) {
  const g = Number(grupo);
  if (!Number.isFinite(g) || g <= 0) return [];

  const s = Number(size) || 96;

  const primary = normalizeImgSrc(
    getImgFromGrupo?.(g, s) || getImgFromGrupo?.(g) || ""
  );

  const base = publicBase();
  const g2 = pad2(g);
  const label = safeStr(getAnimalLabel?.(g) || "");
  const slug = label
    ? label
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
    : "";
  const sizedName = slug
    ? `${base}/assets/animals/animais_${s}_png/${g2}_${slug}_${s}.png`
    : "";

  const seeds = [primary, sizedName].filter(Boolean);

  const out = [];
  for (const seed of seeds) {
    const clean = String(seed).split("?")[0];
    if (!clean) continue;

    out.push(clean);
    if (clean.match(/\.png$/)) out.push(clean.replace(/\.png$/, ".PNG"));
    if (clean.match(/\.PNG$/)) out.push(clean.replace(/\.PNG$/, ".png"));

    out.push(clean.replace(/\.(png|PNG)$/i, ".jpg"));
    out.push(clean.replace(/\.(png|PNG|jpg)$/i, ".jpeg"));
    out.push(`${clean}?v=1`);
  }

  return Array.from(new Set(out.filter(Boolean)));
}

function ImgSmart({ variants, alt, className }) {
  const [failed, setFailed] = useState(false);

  if (!variants?.length || failed) {
    return (
      <div className={`pp_imgFallback ${className || ""}`} aria-hidden="true">
        —
      </div>
    );
  }

  return (
    <img
      className={className}
      src={variants[0]}
      alt={alt}
      loading="lazy"
      data-try="0"
      onError={(e) => {
        const imgEl = e.currentTarget;
        const i = Number(imgEl.dataset.try || "0");
        const next = variants[i + 1];

        if (next) {
          imgEl.dataset.try = String(i + 1);
          imgEl.src = next;
        } else {
          setFailed(true);
        }
      }}
    />
  );
}

/* =========================
   Grades (PT_RIO / FEDERAL)
========================= */

const PT_RIO_SCHEDULE_NORMAL = [
  "09:00",
  "11:00",
  "14:00",
  "16:00",
  "18:00",
  "21:00",
];

// (mantive como você tinha)
const PT_RIO_SCHEDULE_WED_SAT = ["09:00", "11:00", "14:00", "16:00", "21:00"];

// ✅ Federal: QUARTA (3) e SÁBADO (6) às 20:00
const FEDERAL_SCHEDULE = ["20:00"];

function isFederalDrawDay(ymd) {
  const dow = getDowKey(ymd);
  return dow === 3 || dow === 6;
}

function getPtRioScheduleForYmd(ymd) {
  const dow = getDowKey(ymd);
  if (dow === 3 || dow === 6) return PT_RIO_SCHEDULE_WED_SAT;
  return PT_RIO_SCHEDULE_NORMAL;
}

function getScheduleForLottery(lotteryKey, ymd) {
  const key = safeStr(lotteryKey).toUpperCase();

  // ✅ Regra correta: Federal só existe qua/sáb
  if (key === "FEDERAL") {
    return isFederalDrawDay(ymd) ? FEDERAL_SCHEDULE : [];
  }

  return getPtRioScheduleForYmd(ymd);
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
  lotteryKey,
  ymdTarget,
  targetHourBucket,
  todayDraws,
  schedule,
  maxBackDays = 10,
}) {
  // 1) tenta no mesmo dia (se houver um draw anterior ao alvo)
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

  // 2) fallback: dias anteriores (pega o último draw do dia)
  for (let i = 1; i <= maxBackDays; i += 1) {
    const day = addDaysYMD(ymdTarget, -i);
    const daySchedule = getScheduleForLottery(lotteryKey, day);

    // ✅ Federal: pula dias que não têm concurso
    if (safeStr(lotteryKey).toUpperCase() === "FEDERAL" && !daySchedule.length)
      continue;

    const out = await getKingResultsByDate({
      uf: lotteryKey,
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

function milharCompareByCentenaAsc(a, b) {
  const ca = getCentena3(a);
  const cb = getCentena3(b);
  if (ca && cb && ca !== cb)
    return String(ca).localeCompare(String(cb), "en", { numeric: true });
  return milharCompareAsc(a, b);
}

/* =========================
   Loterias (UI)
========================= */

const LOTTERY_OPTIONS = [
  { value: "PT_RIO", label: "PT_RIO (RJ)" },
  { value: "FEDERAL", label: "FEDERAL" },
];

function lotteryLabel(lotteryKey) {
  const k = safeStr(lotteryKey).toUpperCase();
  if (k === "FEDERAL") return "FEDERAL (20h • qua/sáb)";
  if (k === "PT_RIO") return "RIO (PT_RIO)";
  return k || "—";
}

/* =========================
   Top3 Page
========================= */

export default function Top3() {
  const DEFAULT_LOTTERY = "PT_RIO";

  const [lotteryKey, setLotteryKey] = useState(DEFAULT_LOTTERY);
  const [ymd, setYmd] = useState(() => todayYMDLocal());
  const [lookback, setLookback] = useState(LOOKBACK_ALL);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [rangeDraws, setRangeDraws] = useState([]);
  const [bounds, setBounds] = useState({ minDate: "", maxDate: "" });

  const [rangeInfo, setRangeInfo] = useState({ from: "", to: "" });

  const [lastHourBucket, setLastHourBucket] = useState("");
  const [targetHourBucket, setTargetHourBucket] = useState("");

  const lotteryKeySafe = useMemo(
    () => safeStr(lotteryKey).toUpperCase() || DEFAULT_LOTTERY,
    [lotteryKey]
  );

  const ymdSafe = useMemo(() => {
    const y = normalizeToYMD(ymd);
    return y && isYMD(y) ? y : todayYMDLocal();
  }, [ymd]);

  const dateBR = useMemo(() => ymdToBR(ymdSafe), [ymdSafe]);

  const schedule = useMemo(() => {
    return getScheduleForLottery(lotteryKeySafe, ymdSafe);
  }, [lotteryKeySafe, ymdSafe]);

  const isFederalNonDrawDay = useMemo(() => {
    return lotteryKeySafe === "FEDERAL" && !schedule.length;
  }, [lotteryKeySafe, schedule.length]);

  const dayEnded = useMemo(() => {
    return !!safeStr(lastHourBucket) && !safeStr(targetHourBucket);
  }, [lastHourBucket, targetHourBucket]);

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
    const lKey = safeStr(lotteryKeySafe);
    if (!lKey || !isYMD(ymdSafe)) return;

    setLoading(true);
    setError("");

    // ✅ Regra de negócio: Federal só qua/sáb 20h
    if (lKey === "FEDERAL" && !isFederalDrawDay(ymdSafe)) {
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
      setLoading(false);
      setError(
        `Loteria Federal só tem resultado às 20h nas quartas e sábados. (${dateBR} não é dia de concurso)`
      );
      return;
    }

    try {
      let minDate = safeStr(bounds?.minDate);
      let maxDate = safeStr(bounds?.maxDate);

      // bounds (quando disponível)
      try {
        const b = await getKingBoundsByUf({ uf: lKey });

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

      // hoje
      const outToday = await getKingResultsByDate({
        uf: lKey,
        date: ymdSafe,
        closeHour: null,
        positions: null,
      });
      const today = Array.isArray(outToday) ? outToday : [];

      // último horário encontrado hoje
      const last = findLastDrawInList(today, schedule);
      const lastBucket = last ? toHourBucket(pickDrawHour(last)) : "";
      setLastHourBucket(lastBucket);

      // próximo horário na grade
      const nextFromLast = (() => {
        if (!lastBucket) return null;
        const sch = Array.isArray(schedule) ? schedule : [];
        const lh = toHourBucket(lastBucket);
        const idx = sch.findIndex((h) => toHourBucket(h) === lh);
        if (idx >= 0 && idx < sch.length - 1) return sch[idx + 1];
        return null;
      })();

      // ✅ se ainda não saiu nada no dia, alvo = primeiro slot do schedule
      const targetBucket = !lastBucket ? schedule[0] || "" : nextFromLast || "";
      const ended = !!lastBucket && !nextFromLast;
      setTargetHourBucket(ended ? "" : targetBucket);

      // range alvo
      const rangeTo = ymdSafe;
      let rangeFrom = "";

      if (lookback === LOOKBACK_ALL) {
        rangeFrom = isYMD(minDate) ? minDate : addDaysYMD(ymdSafe, -180);
      } else {
        const days = Math.max(1, Number(lookback || 30));
        rangeFrom = addDaysYMD(ymdSafe, -(days - 1));
      }

      setRangeInfo({ from: rangeFrom, to: rangeTo });

      // histórico (somente 1º prêmio)
      const outRange = await getKingResultsByRange({
        uf: lKey,
        dateFrom: rangeFrom,
        dateTo: rangeTo,
        closeHour: null,
        positions: [1],
        mode: "detailed",
      });

      const hist = Array.isArray(outRange) ? outRange : [];
      setRangeDraws(hist);

      // sorteio anterior (camada de transição)
      const hourForPrev = ended ? lastBucket || "" : targetBucket || "";

      if (hourForPrev) {
        const prev = await getPreviousDrawRobust({
          lotteryKey: lKey,
          ymdTarget: ymdSafe,
          targetHourBucket: hourForPrev,
          todayDraws: today,
          schedule,
          maxBackDays: 14,
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
  }, [
    lotteryKeySafe,
    ymdSafe,
    schedule,
    lookback,
    bounds?.minDate,
    bounds?.maxDate,
    dateBR,
  ]);

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

  const analytics = useMemo(() => {
    const list = Array.isArray(rangeDraws) ? rangeDraws : [];
    const hour = safeStr(analysisHourBucket);

    if (!list.length || !hour) {
      return { top: [], meta: null };
    }

    const out = computeTop3Signals({
      drawsRange: list,
      schedule,
      ymdTarget: ymdSafe,
      hourBucket: hour,
      prevGrupo: prevInfo?.prevGrupo ?? null,
      weights: { base: 1.0, trans: 0.65, dow: 0.35, dom: 0.25, global: 0.18 },
      mins: { trans: 6, dow: 4, dom: 3 },
    });

    return out;
  }, [rangeDraws, schedule, ymdSafe, analysisHourBucket, prevInfo?.prevGrupo]);

  const top3 = useMemo(() => {
    const arr = Array.isArray(analytics?.top) ? analytics.top : [];

    return arr.map((x) => {
      const g = Number(x.grupo);
      const animal = safeStr(getAnimalLabel?.(g) || "");
      const bg = normalizeImgSrc(
        safeStr(getImgFromGrupo?.(g, 512) || getImgFromGrupo?.(g) || "")
      );
      const iconVariants = makeImgVariantsFromGrupo(g, 96);
      const bgVariants = bg ? [bg] : makeImgVariantsFromGrupo(g, 512);

      return {
        ...x,
        animal,
        imgBg: bgVariants,
        imgIcon: iconVariants,
      };
    });
  }, [analytics]);

  const layerMetaText = useMemo(() => {
    const m = analytics?.meta;
    if (!m) return "—";

    const parts = [];
    parts.push(`Base(${m.baseTotal})`);

    if (m.prevGrupo != null) {
      parts.push(`Trans(${m.transTotal}${m.useTrans ? "" : "↓"})`);
      parts.push(`DOW(${m.transTotalDow}${m.useDow ? "" : "↓"})`);
      parts.push(`DOM(${m.transTotalDom}${m.useDom ? "" : "↓"})`);
    } else {
      parts.push("Trans(—)");
      parts.push("DOW(—)");
      parts.push("DOM(—)");
    }

    return parts.join(" • ");
  }, [analytics]);

  function buildWhyFromReasons(reasons) {
    const r = Array.isArray(reasons) ? reasons : [];
    const out = [];

    out.push(`Horário alvo: ${safeStr(analysisHourBucket)} • Base: ${lookbackLabel}`);

    if (prevInfo?.prevGrupo) out.push(`Sorteio anterior (camada): ${prevLabel}`);
    else out.push(`Sorteio anterior: sem amostra suficiente/ausente (camada reduzida)`);

    for (const line of r) out.push(line);

    out.push(`Grade da loteria respeitada (${lotteryLabel(lotteryKeySafe)}).`);

    if (dayEnded) {
      out.push(`Dia encerrado: exibindo o último Top3 do dia (${safeStr(lastHourBucket)}).`);
    }

    return out.slice(0, 8);
  }

  /**
   * ✅ 16 milhares POR BICHO
   * - 1º tenta só horário alvo
   * - fallback: completa com outros horários da grade
   * - fallback final: relaxa centena única pra fechar 16
   */
  function build16MilharesForGrupo(grupo2) {
    const list = Array.isArray(rangeDraws) ? rangeDraws : [];
    const target = toHourBucket(analysisHourBucket);
    const schSet = scheduleSet(schedule);

    if (!grupo2 || !list.length || !target) {
      return { dezenas: [], slots: [] };
    }

    const collect = (mode) => {
      const prizes = [];
      for (const d of list) {
        const h = toHourBucket(pickDrawHour(d));
        if (!h) continue;

        // sempre respeita grade da loteria
        if (!schSet.has(h)) continue;

        // modo 1: só horário alvo
        if (mode === "target_only" && h !== target) continue;

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
      return prizes;
    };

    let prizes = collect("target_only");

    if (prizes.length < 16) {
      const extra = collect("any_hour");
      const set = new Set(prizes);
      for (const m of extra) {
        if (set.has(m)) continue;
        prizes.push(m);
        set.add(m);
      }
    }

    if (!prizes.length) return { dezenas: [], slots: [] };

    const dezCounts = new Map();
    for (const m4 of prizes) {
      const dz = getDezena2(m4);
      if (!dz) continue;
      dezCounts.set(dz, (dezCounts.get(dz) || 0) + 1);
    }

    let topDezenas = Array.from(dezCounts.entries())
      .sort((a, b) => b[1] - a[1] || dezenaCompareAsc(a[0], b[0]))
      .slice(0, 4)
      .map((x) => x[0])
      .sort(dezenaCompareAsc);

    if (topDezenas.length < 4) {
      const allDz = Array.from(dezCounts.entries())
        .sort((a, b) => b[1] - a[1] || dezenaCompareAsc(a[0], b[0]))
        .map((x) => x[0]);

      for (const dz of allDz) {
        if (topDezenas.length >= 4) break;
        if (!topDezenas.includes(dz)) topDezenas.push(dz);
      }
      topDezenas = topDezenas.slice(0, 4).sort(dezenaCompareAsc);
    }

    const byDezena = new Map();
    const usedCentenas = new Set();

    const pickForDezena = (dz, allowRepeatCentena) => {
      const countsMilhar = new Map();
      for (const m4 of prizes) {
        if (getDezena2(m4) !== dz) continue;
        countsMilhar.set(m4, (countsMilhar.get(m4) || 0) + 1);
      }

      const ranked = Array.from(countsMilhar.entries())
        .sort((a, b) => b[1] - a[1] || milharCompareAsc(a[0], b[0]))
        .map((x) => x[0]);

      const picked = [];

      for (const m4 of ranked) {
        if (picked.length >= 4) break;
        const cent = getCentena3(m4);
        if (!cent) continue;

        if (!allowRepeatCentena && usedCentenas.has(cent)) continue;

        if (!allowRepeatCentena) usedCentenas.add(cent);
        picked.push(m4);
      }

      if (picked.length < 4) {
        for (const m4 of ranked) {
          if (picked.length >= 4) break;
          if (picked.includes(m4)) continue;

          const cent = getCentena3(m4);
          if (!cent) continue;

          if (!allowRepeatCentena && usedCentenas.has(cent)) continue;

          if (!allowRepeatCentena) usedCentenas.add(cent);
          picked.push(m4);
        }
      }

      picked.sort(milharCompareByCentenaAsc);
      return picked.map((m4) => ({ dezena: dz, milhar: m4 }));
    };

    for (const dz of topDezenas) {
      byDezena.set(dz, pickForDezena(dz, false));
    }

    let slots = [];
    for (const dz of topDezenas) {
      const arr = byDezena.get(dz) || [];
      for (let i = 0; i < 4; i += 1) slots.push(arr[i] || { dezena: dz, milhar: "" });
    }

    const emptyCount = slots.filter((s) => !safeStr(s.milhar)).length;
    if (emptyCount > 0) {
      const byDezena2 = new Map();
      for (const dz of topDezenas) {
        byDezena2.set(dz, pickForDezena(dz, true));
      }

      const slots2 = [];
      for (const dz of topDezenas) {
        const arr = byDezena2.get(dz) || [];
        for (let i = 0; i < 4; i += 1) slots2.push(arr[i] || { dezena: dz, milhar: "" });
      }
      slots = slots2;
    }

    while (slots.length < 16) slots.push({ dezena: "", milhar: "" });

    return { dezenas: topDezenas, slots: slots.slice(0, 16) };
  }

  const styles = useMemo(() => {
    return `
      :root{
        --pp-border: rgba(255,255,255,0.10);
        --pp-border2: rgba(255,255,255,0.14);

        --pp-gold: rgba(201,168,62,0.92);
        --pp-gold2: rgba(201,168,62,0.55);
        --pp-goldSoft: rgba(201,168,62,0.16);

        --pp-text: rgba(255,255,255,0.92);
        --pp-muted: rgba(255,255,255,0.62);

        --pp-bgA: rgba(0,0,0,0.35);
        --pp-bgB: rgba(0,0,0,0.65);

        --pp-radius: 18px;
      }

      .pp_wrap{
        height: 100dvh;
        min-height: 100vh;
        padding: 14px;
        overflow: hidden;
        min-width: 0;
        box-sizing: border-box;
      }

      .pp_shell{
        height: calc(100dvh - 28px);
        border: 1px solid var(--pp-border);
        border-radius: var(--pp-radius);
        background:
          radial-gradient(1100px 520px at 10% 0%, rgba(201,168,62,0.10), transparent 60%),
          radial-gradient(900px 500px at 90% 10%, rgba(201,168,62,0.08), transparent 62%),
          rgba(0,0,0,0.40);
        box-shadow: 0 16px 48px rgba(0,0,0,0.55);
        padding: 10px;
        display: grid;
        grid-template-rows: auto 1fr;
        gap: 10px;
        overflow: hidden;
        min-width: 0;
      }

      .pp_header{
        display:grid;
        grid-template-columns: 1fr auto 1fr;
        align-items:center;
        gap: 10px;
        min-width:0;
      }

      .pp_headerCenter{
        text-align:center;
        min-width:0;
      }

      .pp_title{
        font-size: 18px;
        font-weight: 1200;
        letter-spacing: 0.25px;
        color: var(--pp-text);
        line-height: 1.1;
      }

      .pp_sub{
        margin-top: 6px;
        color: var(--pp-muted);
        font-weight: 900;
        line-height: 1.25;
        font-size: 12px;
        max-width: 980px;
        margin-left:auto;
        margin-right:auto;
        text-align:center;
      }

      .pp_gold{ color: var(--pp-gold); }

      .pp_controls{
        display:flex;
        align-items:center;
        gap: 8px;
        flex-wrap: wrap;
        justify-content:flex-end;
      }

      .pp_input, .pp_select{
        height: 34px;
        border-radius: 12px;
        border: 1px solid var(--pp-border);
        background: rgba(0,0,0,0.55);
        color: var(--pp-text);
        padding: 0 10px;
        outline:none;
        font-weight: 950;
        letter-spacing:0.2px;
        min-width: 110px;
        font-size: 12px;
        box-sizing: border-box;
      }

      .pp_input:focus, .pp_select:focus{
        border-color: rgba(201,168,62,0.55);
        box-shadow: 0 0 0 3px rgba(201,168,62,0.12);
      }

      .pp_btn{
        height: 34px;
        border-radius: 12px;
        border: 1px solid var(--pp-border);
        background: rgba(255,255,255,0.06);
        color: var(--pp-text);
        font-weight: 1100;
        letter-spacing:0.2px;
        padding: 0 14px;
        cursor:pointer;
        white-space:nowrap;
        font-size: 12px;
      }
      .pp_btn:hover{ background: rgba(255,255,255,0.08); }
      .pp_btn:active{ transform: translateY(1px); }

      .pp_body{
        min-width:0;
        min-height:0;
        overflow: auto;
        display:flex;
        justify-content:center;
        align-items: stretch;
        padding-right: 2px;
      }

      .pp_center{
        width: 100%;
        max-width: 1180px;
        display:grid;
        grid-template-rows: auto auto;
        gap: 10px;
        padding-bottom: 14px;
        min-width:0;
      }

      .pp_kpis{
        display:flex;
        gap: 10px;
        flex-wrap: wrap;
        align-items:center;
        justify-content: space-between;
        border: 1px solid var(--pp-border);
        background: rgba(0,0,0,0.22);
        border-radius: 16px;
        padding: 10px 12px;
      }

      .pp_kpi{ display:flex; flex-direction:column; gap: 3px; min-width: 160px; }
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
      .pp_kpiValue strong{ color: var(--pp-gold); font-weight: 1200; }

      .pp_state{
        border: 1px solid var(--pp-border);
        border-radius: 16px;
        background: rgba(0,0,0,0.26);
        padding: 14px 16px;
        font-weight: 900;
        color: rgba(255,255,255,0.88);
      }

      /* =========================
         PREMIUM TOP3 LAYOUT
      ========================= */

      .pp_cards{
        display:grid;
        grid-template-columns: 1.35fr 1fr;
        gap: 12px;
        align-content:start;
        min-width:0;
      }

      .pp_card{
        position: relative;
        border-radius: 18px;
        overflow: hidden;
        border: 1px solid rgba(255,255,255,0.12);
        box-shadow: 0 14px 34px rgba(0,0,0,0.48);
        min-height: 560px;
        display:flex;
      }

      .pp_cardMain{
        grid-row: 1 / span 2;
        border-color: rgba(201,168,62,0.34);
        box-shadow: 0 18px 48px rgba(0,0,0,0.58);
      }

      .pp_card::before{
        content:"";
        position:absolute;
        inset:0;
        background-image: var(--pp-bg);
        background-size: cover;
        background-position: center;
        background-repeat: no-repeat;
        opacity: 0.86;
        transform: scale(1.03);
        filter: saturate(1.08) contrast(1.05);
        pointer-events:none;
      }

      .pp_card::after{
        content:"";
        position:absolute;
        inset:0;
        pointer-events:none;
        background:
          radial-gradient(1100px 520px at 10% 0%, rgba(201,168,62,0.18), transparent 62%),
          radial-gradient(900px 500px at 90% 10%, rgba(201,168,62,0.10), transparent 64%),
          linear-gradient(180deg, rgba(0,0,0,0.42) 0%, rgba(0,0,0,0.30) 28%, rgba(0,0,0,0.58) 72%, rgba(0,0,0,0.82) 100%);
      }

      .pp_cardInner{
        position: relative;
        z-index: 1;
        width: 100%;
        padding: 12px;
        display:flex;
        flex-direction:column;
        gap: 10px;
        min-width: 0;
      }

      .pp_cardTop{
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap: 10px;
      }

      .pp_rankPill{
        display:inline-flex;
        align-items:center;
        gap: 8px;
        padding: 7px 10px;
        border-radius: 999px;
        border: 1px solid rgba(255,255,255,0.14);
        background: rgba(0,0,0,0.32);
        backdrop-filter: blur(10px);
        color: rgba(255,255,255,0.92);
        font-weight: 1150;
        font-size: 12px;
        letter-spacing: 0.2px;
        white-space: nowrap;
      }

      .pp_rankPill.isGold{
        border-color: rgba(201,168,62,0.40);
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
        backdrop-filter: blur(10px);
        border-radius: 999px;
        padding: 7px 10px;
      }

      .pp_hero{
        display:grid;
        grid-template-columns: auto 1fr;
        gap: 12px;
        align-items:center;
        border: 1px solid rgba(255,255,255,0.12);
        background: rgba(0,0,0,0.30);
        backdrop-filter: blur(12px);
        border-radius: 16px;
        padding: 10px;
        min-width:0;
      }

      .pp_iconFrame{
        width: 64px;
        height: 64px;
        border-radius: 18px;
        border: 1px solid rgba(201,168,62,0.32);
        background: rgba(0,0,0,0.22);
        display:grid;
        place-items:center;
        overflow:hidden;
        box-shadow: inset 0 0 0 1px rgba(255,255,255,0.06);
        flex: 0 0 auto;
      }

      .pp_icon{
        width: 46px;
        height: 46px;
        object-fit: contain;
        display:block;
        filter: drop-shadow(0 10px 18px rgba(0,0,0,0.35));
      }

      .pp_imgFallback{
        font-size: 12px;
        font-weight: 1200;
        color: rgba(201,168,62,0.90);
        letter-spacing: 0.3px;
        line-height: 1;
      }

      .pp_group{
        color: rgba(255,255,255,0.70);
        font-weight: 950;
        font-size: 12px;
        letter-spacing: 0.25px;
      }

      .pp_animal{
        margin-top: 3px;
        color: rgba(255,255,255,0.96);
        font-weight: 1250;
        font-size: 18px;
        letter-spacing: 0.35px;
        text-transform: uppercase;
        white-space: nowrap;
        overflow:hidden;
        text-overflow:ellipsis;
      }

      .pp_animal.big{
        font-size: 22px;
      }

      .pp_scoreRow{
        display:flex;
        gap: 8px;
        flex-wrap: wrap;
        align-items:center;
        margin-top: 8px;
      }

      .pp_chip{
        border: 1px solid rgba(255,255,255,0.12);
        background: rgba(255,255,255,0.05);
        border-radius: 999px;
        padding: 6px 10px;
        font-weight: 1000;
        font-size: 12px;
        color: rgba(255,255,255,0.90);
        white-space: nowrap;
      }

      .pp_chip strong{ color: var(--pp-gold); font-weight: 1200; }

      .pp_bottom{
        margin-top:auto;
        display:flex;
        flex-direction:column;
        gap: 8px;
      }

      .pp_whyBox{
        border: 1px solid rgba(255,255,255,0.12);
        background: rgba(0,0,0,0.32);
        backdrop-filter: blur(12px);
        border-radius: 16px;
        padding: 10px 10px;
        min-height: 150px;
      }

      .pp_notesTitle{
        margin: 0;
        font-size: 12px;
        font-weight: 1150;
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
        line-height: 1.45;
      }

      .pp_milharGrid{
        display:grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 7px;
        border: 1px solid rgba(255,255,255,0.12);
        background: rgba(0,0,0,0.28);
        backdrop-filter: blur(12px);
        border-radius: 16px;
        padding: 10px;
        min-height: 178px;
        box-sizing: border-box;
      }

      .pp_milharPill{
        border: 1px solid rgba(255,255,255,0.12);
        background: rgba(255,255,255,0.04);
        border-radius: 12px;
        padding: 6px 8px;
        font-weight: 1200;
        letter-spacing: 0.6px;
        color: rgba(255,255,255,0.92);
        text-align:center;
        display:flex;
        align-items:center;
        justify-content:center;
        min-height: 32px;
        box-sizing: border-box;
        font-size: 12px;
      }

      .pp_milharPill strong{ color: var(--pp-gold); font-weight: 1300; }

      .pp_milharPill.isEmpty{
        opacity: 0;
        pointer-events:none;
      }

      @media (max-width: 1100px){
        .pp_cards{ grid-template-columns: 1fr; }
        .pp_cardMain{ grid-row:auto; }
        .pp_card{ min-height: 540px; }
      }

      @media (max-width: 720px){
        .pp_header{ grid-template-columns: 1fr; align-items: start; }
        .pp_controls{ justify-content:flex-start; }
        .pp_input, .pp_select, .pp_btn{ width: 100%; min-width: 0; }
        .pp_milharGrid{ grid-template-columns: repeat(2, 1fr); }
        .pp_animal.big{ font-size: 20px; }
      }
    `;
  }, [
    lotteryKeySafe,
    analysisHourBucket,
    lookbackLabel,
    prevLabel,
    dayEnded,
    lastHourBucket,
  ]);

  return (
    <div className="pp_wrap">
      <style>{styles}</style>

      <div className="pp_shell">
        <div className="pp_header">
          <div aria-hidden="true" />
          <div className="pp_headerCenter" style={{ minWidth: 0 }}>
            <div className="pp_title">Top 3</div>
            <div className="pp_sub">
              Painel de sinais • <span className="pp_gold">{layerMetaText}</span>
            </div>
          </div>

          <div>
            <div className="pp_controls">
              <select
                className="pp_select"
                value={lotteryKeySafe}
                onChange={(e) => setLotteryKey(e.target.value)}
                aria-label="Loteria"
                title="Loteria"
              >
                {LOTTERY_OPTIONS.map((opt) => (
                  <option key={`lot_${opt.value}`} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
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
                <div className="pp_kpiLabel">Loteria</div>
                <div className="pp_kpiValue">
                  <strong>{lotteryKeySafe}</strong> • {lotteryLabel(lotteryKeySafe)}
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
              <div className="pp_state">Calculando sinais…</div>
            ) : error ? (
              <div className="pp_state">
                <div style={{ fontWeight: 1100, marginBottom: 6 }}>Erro</div>
                <div style={{ opacity: 0.9, whiteSpace: "pre-wrap" }}>{error}</div>
              </div>
            ) : isFederalNonDrawDay ? (
              <div className="pp_state">
                Loteria Federal só tem resultado às{" "}
                <span className="pp_gold">20h</span> nas{" "}
                <span className="pp_gold">quartas e sábados</span>.
              </div>
            ) : top3.length === 0 ? (
              <div className="pp_state">
                Sem dados suficientes para calcular no horário{" "}
                <span className="pp_gold">{analysisHourBucket || "—"}</span>.
                <div style={{ marginTop: 6, opacity: 0.85 }}>
                  Dica: troque a data ou reduza a janela.
                </div>
              </div>
            ) : (
              <div className="pp_cards">
                {top3.map((x, idx) => {
                  const isMain = idx === 0;
                  const animal = safeStr(x.animal) || "—";

                  const bgVariants = Array.isArray(x.imgBg) ? x.imgBg : [];
                  const iconVariants = Array.isArray(x.imgIcon) ? x.imgIcon : [];

                  const why = buildWhyFromReasons(x.reasons);
                  const mil = build16MilharesForGrupo(x.grupo);
                  const slots = Array.isArray(mil?.slots) ? mil.slots : [];

                  return (
                    <div
                      key={`top3_${x.grupo}_${idx}`}
                      className={`pp_card ${isMain ? "pp_cardMain" : ""}`}
                      style={{
                        "--pp-bg": bgVariants?.length
                          ? `url("${normalizeImgSrc(bgVariants[0])}")`
                          : "none",
                      }}
                    >
                      <div className="pp_cardInner">
                        <div className="pp_cardTop">
                          <div className={`pp_rankPill ${isMain ? "isGold" : ""}`}>
                            {isMain ? "👑" : "★"} #{x.rank} • {x.title}
                          </div>

                          <div className="pp_focus">
                            {dayEnded ? "Último:" : "Alvo:"}{" "}
                            <span className="pp_gold">{analysisHourBucket}</span>
                          </div>
                        </div>

                        <div className="pp_hero">
                          <div className="pp_iconFrame" aria-hidden="true">
                            <ImgSmart
                              variants={iconVariants}
                              alt={animal ? `Bicho ${animal}` : "Bicho"}
                              className="pp_icon"
                            />
                          </div>

                          <div style={{ minWidth: 0 }}>
                            <div className="pp_group">GRUPO {pad2(x.grupo)}</div>
                            <div className={`pp_animal ${isMain ? "big" : ""}`}>
                              {animal.toUpperCase()}
                            </div>

                            <div className="pp_scoreRow">
                              <div className="pp_chip">
                                Score{" "}
                                <strong>{(Number(x.finalScore) || 0).toFixed(3)}</strong>
                              </div>
                              <div className="pp_chip">
                                Peso <strong>{x.pct}%</strong>
                              </div>
                              <div className="pp_chip">
                                Base{" "}
                                <strong>
                                  {x.baseHit}/{x.baseTotal}
                                </strong>
                              </div>
                              <div className="pp_chip">
                                Trans{" "}
                                <strong>
                                  {x.useTrans
                                    ? `${x.transHit}/${x.transTotal}`
                                    : `(${x.transTotal}↓)`}
                                </strong>
                              </div>
                              <div className="pp_chip">
                                DOW{" "}
                                <strong>
                                  {x.useDow
                                    ? `${x.dowHit}/${x.transTotalDow}`
                                    : `(${x.transTotalDow}↓)`}
                                </strong>
                              </div>
                              <div className="pp_chip">
                                DOM{" "}
                                <strong>
                                  {x.useDom
                                    ? `${x.domHit}/${x.transTotalDom}`
                                    : `(${x.transTotalDom}↓)`}
                                </strong>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="pp_bottom">
                          <div className="pp_whyBox">
                            <div className="pp_notesTitle">Leitura estatística (camadas)</div>
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
                                        ? `Dezena ${m.dezena} • Centena ${getCentena3(m.milhar)}`
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
