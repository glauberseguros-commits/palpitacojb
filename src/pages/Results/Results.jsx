// src/pages/Results/Results.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  getKingBoundsByUf,
  getKingResultsByDate,
  getKingResultsByRange,
} from "../../services/kingResultsService";
import { getAnimalLabel, getImgFromGrupo, getSlugByGrupo } from "../../constants/bichoMap";

/* =========================
   Helpers (locais e robustos)
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

function nowLocal() {
  return new Date();
}

function todayYMDLocal() {
  const d = nowLocal();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function currentHourNumLocal() {
  const d = nowLocal();
  return d.getHours() * 100 + d.getMinutes();
}

function ymdToDateLocal(ymd) {
  const m = String(ymd || "")
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
}

function dateToYMDLocal(d) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}


function startOfMonthYMD(ymd) {
  const d = ymdToDateLocal(ymd);
  if (!d) return todayYMDLocal().slice(0, 8) + "01";
  d.setDate(1);
  return dateToYMDLocal(d);
}

function endOfMonthYMD(ymd) {
  const d = ymdToDateLocal(ymd);
  if (!d) return todayYMDLocal();
  d.setMonth(d.getMonth() + 1, 0);
  return dateToYMDLocal(d);
}

function shiftMonthYMD(ymd, deltaMonths) {
  const d = ymdToDateLocal(startOfMonthYMD(ymd));
  if (!d) return startOfMonthYMD(todayYMDLocal());
  d.setMonth(d.getMonth() + Number(deltaMonths || 0), 1);
  return dateToYMDLocal(d);
}

function monthTitleBR(ymd) {
  const d = ymdToDateLocal(startOfMonthYMD(ymd));
  if (!d) return "";
  const s = d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function buildCalendarCells(monthYmd) {
  const first = ymdToDateLocal(startOfMonthYMD(monthYmd));
  if (!first) return [];

  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());

  return Array.from({ length: 42 }, (_, idx) => {
    const d = new Date(start);
    d.setDate(start.getDate() + idx);
    const ymd = dateToYMDLocal(d);
    return {
      ymd,
      day: d.getDate(),
      inMonth: d.getMonth() === first.getMonth(),
    };
  });
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

function hourToNum(h) {
  const s = normalizeHourLike(h);
  const m = s.match(/^(\d{2}):(\d{2})$/);
  if (!m) return -1;
  return Number(m[1]) * 100 + Number(m[2]);
}

function unwrapDraws(maybe) {
  if (Array.isArray(maybe)) return maybe;
  if (maybe && typeof maybe === "object") {
    if (Array.isArray(maybe.drawsRaw)) return maybe.drawsRaw;
    if (Array.isArray(maybe.draws)) return maybe.draws;
    if (Array.isArray(maybe.rows)) return maybe.rows;
    if (Array.isArray(maybe.data)) return maybe.data;
    if (maybe.result && Array.isArray(maybe.result)) return maybe.result;
  }
  return [];
}

/* =========================
   Bounds
========================= */

function normalizeBoundsResponse(b) {
  const minRaw = safeStr(b?.minYmd || b?.minDate || b?.min || "");
  const maxRaw = safeStr(b?.maxYmd || b?.maxDate || b?.max || "");
  const minYmd = isYMD(minRaw) ? minRaw : null;
  const maxYmd = isYMD(maxRaw) ? maxRaw : null;
  return { minYmd, maxYmd, source: safeStr(b?.source || "") };
}

function clampYmd(ymd, minYmd, maxYmd) {
  const d = safeStr(ymd);
  if (!isYMD(d)) return null;

  let out = d;
  const min = safeStr(minYmd);
  const max = safeStr(maxYmd);

  if (isYMD(min) && out < min) out = min;
  if (isYMD(max) && out > max) out = max;

  return out;
}

function normalizeSingleDateWithBounds(dateIn, minYmd, maxYmd) {
  const d = clampYmd(dateIn, minYmd, maxYmd);
  if (d) return d;

  const fallback =
    clampYmd(todayYMDLocal(), minYmd, maxYmd) ||
    (isYMD(maxYmd) ? maxYmd : null) ||
    (isYMD(minYmd) ? minYmd : null) ||
    todayYMDLocal();

  return fallback;
}

/* =========================
   Escopos
========================= */

const SCOPE_RJ = "RJ";
const SCOPE_FEDERAL = "FEDERAL";

const FEDERAL_INPUT_ALIASES = new Set([
  "FEDERAL",
  "FED",
  "LOTERIA FEDERAL",
  "LOTERIA_FEDERAL",
  "LOT FEDERAL",
  "LT_FEDERAL",
  "FED_BR",
]);

const RJ_09H_START_YMD = "2024-01-05";
const RJ_EXPECTED_HOURS_BASE_DESC = ["21:00", "18:00", "16:00", "14:00", "11:00"];
const FEDERAL_EXPECTED_HOURS_DESC = ["20:00", "19:00"];

function isFederalInput(scope) {
  const up = safeStr(scope).toUpperCase();
  if (!up) return false;
  if (up === SCOPE_FEDERAL) return true;
  if (FEDERAL_INPUT_ALIASES.has(up)) return true;
  const compact = up.replace(/[\s_]+/g, " ").trim();
  if (FEDERAL_INPUT_ALIASES.has(compact)) return true;
  const unders = up.replace(/[\s_]+/g, "_");
  if (FEDERAL_INPUT_ALIASES.has(unders)) return true;
  return false;
}

function normalizeScopeInput(input) {
  const s = safeStr(input).toUpperCase();
  if (!s) return SCOPE_RJ;
  if (s === SCOPE_RJ) return SCOPE_RJ;
  if (isFederalInput(s)) return SCOPE_FEDERAL;
  return s;
}

function scopeDisplayName(scope) {
  const up = safeStr(scope).toUpperCase();
  if (up === SCOPE_RJ) return "RIO";
  if (isFederalInput(up)) return "FEDERAL";
  return up;
}

const FEDERAL_CLOSE_CANDIDATES = [
  { bucket: "20h", hour: "20:00" },
  { bucket: "19h", hour: "19:00" },
];

/* =========================
   prizeNumber
========================= */

function guessPrizeNumber(p) {
  if (!p) return "";

  const direct = safeStr(p?.numero);
  if (direct) return direct;

  const candidates = [
    p?.milhar,
    p?.milhares,
    p?.m,
    p?.number,
    p?.num,
    p?.n,
    p?.value,
    p?.valor,
    p?.resultado,
    p?.result,
    p?.premio,
    p?.premiation,
  ];

  for (const c of candidates) {
    const s = safeStr(c);
    if (!s) continue;
    const digits = s.replace(/\D+/g, "");
    return digits || s;
  }

  if (Array.isArray(p?.numbers) && p.numbers.length) {
    const s = safeStr(p.numbers[0]);
    const digits = s.replace(/\D+/g, "");
    return digits || s;
  }

  return "";
}

function guessPrizeAnimal(p) {
  return safeStr(p?.animal || p?.label || p?.bicho || "");
}

function guessPrizeGrupo(p) {
  const g = Number.isFinite(Number(p?.grupo))
    ? Number(p.grupo)
    : Number.isFinite(Number(p?.group))
    ? Number(p.group)
    : Number.isFinite(Number(p?.grupo2))
    ? Number(p.grupo2)
    : Number.isFinite(Number(p?.group2))
    ? Number(p.group2)
    : null;
  return g;
}

function guessPrizePos(p) {
  const pos = Number.isFinite(Number(p?.position))
    ? Number(p.position)
    : Number.isFinite(Number(p?.posicao))
    ? Number(p.posicao)
    : Number.isFinite(Number(p?.pos))
    ? Number(p.pos)
    : null;
  return pos;
}

/* =========================
   Label robusto
========================= */

function safeGetAnimalLabel(grupo, animalFallback) {
  const g = Number(grupo);
  if (!Number.isFinite(g)) return safeStr(animalFallback || "");

  try {
    const a1 = getAnimalLabel({ grupo: g, animal: safeStr(animalFallback || "") });
    const s1 = safeStr(a1);
    if (s1) return s1;
  } catch {}

  try {
    const a2 = getAnimalLabel(g);
    const s2 = safeStr(a2);
    if (s2) return s2;
  } catch {}

  return safeStr(animalFallback || "");
}

/* =========================
   Imagens
========================= */

function publicBase() {
  try {
    const viteBase = typeof import.meta !== "undefined" ? import.meta.env?.BASE_URL : "";
    const vb = String(viteBase || "").trim();
    if (vb) return vb.endsWith("/") ? vb.slice(0, -1) : vb;
  } catch {}

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

function makeImgVariantsFromGrupo(grupo, size) {
  const g = Number(grupo);
  if (!Number.isFinite(g) || g <= 0) return [];

  const s = Number(size) || 96;
  const g2 = pad2(g);
  const slug = safeStr(getSlugByGrupo(g));
  if (!slug) return [];

  const primary = normalizeImgSrc(getImgFromGrupo(g, s));

  const base = publicBase();
  const sizedName = `${base}/assets/animals/animais_${s}_png/${g2}_${slug}_${s}.png`;

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
  }

  return Array.from(new Set(out.filter(Boolean)));
}

function RowImg({ variants, alt, fallbackText }) {
  const [failed, setFailed] = useState(false);

  if (!variants.length || failed) {
    return <div className="pp_imgFallback">{fallbackText || "—"}</div>;
  }

  return (
    <img
      className="pp_img"
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

function resolveAnimalUI(prize) {
  const grupo = guessPrizeGrupo(prize);
  const animalRaw = guessPrizeAnimal(prize);

  if (grupo) {
    const label = safeGetAnimalLabel(grupo, animalRaw);
    const variants = makeImgVariantsFromGrupo(grupo, 96);
    return { grupo, label, imgVariants: variants };
  }

  const label = animalRaw ? animalRaw : "";
  return { grupo: null, label, imgVariants: [] };
}

/* =========================
   Dedup de draws
========================= */

function drawKeyForDedup(d, scopeKey, ymd) {
  const hour = normalizeHourLike(d?.close_hour || d?.closeHour || d?.hour || d?.hora || "");
  if (hour) return `HOUR:${scopeKey}|${ymd}|${hour}`;
  const id = safeStr(d?.drawId || d?.id || "");
  return `ID:${scopeKey}|${ymd}|${id || "?"}`;
}

function countPrizes(d) {
  return Array.isArray(d?.prizes) ? d.prizes.length : 0;
}

function pickBetterDraw(a, b) {
  const pa = countPrizes(a);
  const pb = countPrizes(b);
  if (pa !== pb) return pb > pa ? b : a;

  const ha = safeStr(a?.close_hour || a?.closeHour || a?.hour || a?.hora);
  const hb = safeStr(b?.close_hour || b?.closeHour || b?.hour || b?.hora);
  if (!!hb !== !!ha) return hb ? b : a;

  return a;
}

function dedupeDraws(list, scopeKey, ymd) {
  const arr = Array.isArray(list) ? list : [];
  const map = new Map();

  for (const d of arr) {
    const k = drawKeyForDedup(d, scopeKey, ymd);
    const prev = map.get(k);
    if (!prev) map.set(k, d);
    else map.set(k, pickBetterDraw(prev, d));
  }

  return Array.from(map.values());
}

/* =========================
   UI helpers
========================= */

function prizeRankClass(pos) {
  if (pos === 1) return "isP1";
  if (pos === 2) return "isP2";
  if (pos === 3) return "isP3";
  return "";
}

function formatPrizeNumberByPos(value, pos) {
  const s = safeStr(value);
  if (!s) return "";

  const digits = s.replace(/\D+/g, "");
  if (!digits) return s;

  if (pos === 7) {
    return digits.slice(-3);
  }

  return digits.slice(-4).padStart(4, "0");
}

function prizeLabelByPos(pos) {
  return pos === 7 ? "CENTENA" : "MILHAR";
}

function scopePillClass(active) {
  return active ? "pp_pill isActive" : "pp_pill";
}

function stopEvt(e) {
  e.preventDefault();
  e.stopPropagation();
}

function stopOnly(e) {
  e.stopPropagation();
}

function getExpectedRjHoursDesc(ymd) {
  const out = [...RJ_EXPECTED_HOURS_BASE_DESC];
  if (isYMD(ymd) && ymd >= RJ_09H_START_YMD) {
    out.push("09:00");
  }
  return out;
}

function shouldShowExpectedHour(ymd, hour) {
  const hNum = hourToNum(hour);
  if (hNum < 0) return true;

  if (safeStr(ymd) !== todayYMDLocal()) return true;

  return hNum <= currentHourNumLocal();
}

function buildExpectedDrawsForScope(scopeKey, orderedDraws, ymd) {
  const list = Array.isArray(orderedDraws) ? orderedDraws : [];
  const byHour = new Map();

  for (const d of list) {
    const h = normalizeHourLike(d?.close_hour || d?.closeHour || d?.hour || d?.hora || "");
    if (!h) continue;
    if (!byHour.has(h)) byHour.set(h, d);
  }

  const expectedHours =
    scopeKey === SCOPE_RJ
      ? getExpectedRjHoursDesc(ymd)
      : scopeKey === SCOPE_FEDERAL
      ? FEDERAL_EXPECTED_HOURS_DESC
      : [];

  const visibleExpectedHours = expectedHours.filter((hour) => shouldShowExpectedHour(ymd, hour));

  const result = visibleExpectedHours.map((hour) => {
    const found = byHour.get(hour);
    if (found) return found;

    return {
      __placeholder: true,
      __slotHour: hour,
      __placeholderKind: "compact",
      drawId: `placeholder_${scopeKey}_${hour}`,
      id: `placeholder_${scopeKey}_${hour}`,
      close_hour: hour,
      closeHour: hour,
      prizes: [],
    };
  });

  const extraActual = list.filter((d) => {
    const h = normalizeHourLike(d?.close_hour || d?.closeHour || d?.hour || d?.hora || "");
    return h && !visibleExpectedHours.includes(h);
  });

  return [...result, ...extraActual].sort((a, b) => {
    const ha = hourToNum(a?.__slotHour || a?.close_hour || a?.closeHour || a?.hour || a?.hora);
    const hb = hourToNum(b?.__slotHour || b?.close_hour || b?.closeHour || b?.hour || b?.hora);
    return hb - ha;
  });
}

function monthDaysWithDraws(draws) {
  const out = new Set();
  for (const d of Array.isArray(draws) ? draws : []) {
    const y = safeStr(d?.ymd || d?.date || "");
    if (isYMD(y)) out.add(y);
  }
  return out;
}

/* =========================
   Page
========================= */

export default function Results() {
  const DEFAULT_SCOPE = SCOPE_RJ;

  const [scopeUi, setScopeUi] = useState(DEFAULT_SCOPE);
  const [ymd, setYmd] = useState(() => todayYMDLocal());

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [draws, setDraws] = useState([]);
  const [reloadTick, setReloadTick] = useState(0);

  const [bounds, setBounds] = useState({ minYmd: null, maxYmd: null, source: "" });

  const [showAll, setShowAll] = useState(true);
  const [needsToggle, setNeedsToggle] = useState(false);

  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarMonthYmd, setCalendarMonthYmd] = useState(() => startOfMonthYMD(todayYMDLocal()));
  const [calendarMarkedYmds, setCalendarMarkedYmds] = useState([]);
  const [calendarLoading, setCalendarLoading] = useState(false);

  const centerRef = useRef(null);
  const calendarRef = useRef(null);
  const previousScopeRef = useRef(DEFAULT_SCOPE);

  const scopeKey = useMemo(() => normalizeScopeInput(scopeUi), [scopeUi]);
  const isFederal = useMemo(() => isFederalInput(scopeKey), [scopeKey]);
  const label = useMemo(() => scopeDisplayName(scopeKey), [scopeKey]);

  const ymdSafe = useMemo(() => {
    const s = safeStr(ymd);
    return isYMD(s) ? s : todayYMDLocal();
  }, [ymd]);

  const effectiveBounds = useMemo(() => {
    const minYmd = bounds?.minYmd || null;
    const maxYmd = bounds?.maxYmd || null;
    return { minYmd, maxYmd };
  }, [bounds?.minYmd, bounds?.maxYmd]);

  const ymdClamped = useMemo(() => {
    const minYmd = effectiveBounds?.minYmd;
    const maxYmd = effectiveBounds?.maxYmd;
    if (!isYMD(minYmd) && !isYMD(maxYmd)) return ymdSafe;
    return normalizeSingleDateWithBounds(ymdSafe, minYmd, maxYmd);
  }, [ymdSafe, effectiveBounds?.minYmd, effectiveBounds?.maxYmd]);

  const dateBR = useMemo(() => ymdToBR(ymdClamped), [ymdClamped]);

  const calendarMarkedSet = useMemo(() => new Set(calendarMarkedYmds), [calendarMarkedYmds]);
  const calendarCells = useMemo(() => buildCalendarCells(calendarMonthYmd), [calendarMonthYmd]);
  const calendarTitle = useMemo(() => monthTitleBR(calendarMonthYmd), [calendarMonthYmd]);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const b = await getKingBoundsByUf({ uf: scopeKey });
        if (!alive) return;
        const nb = normalizeBoundsResponse(b);
        setBounds(nb);
      } catch {
        if (!alive) return;
        setBounds({ minYmd: null, maxYmd: null, source: "" });
      }
    })();

    return () => {
      alive = false;
    };
  }, [scopeKey]);

  useEffect(() => {
    const previousScope = previousScopeRef.current;
    const changedScope = previousScope !== scopeKey;
    previousScopeRef.current = scopeKey;

    if (changedScope) {
      setCalendarOpen(false);
      setShowAll(true);
    }

    if (!isYMD(bounds?.minYmd) && !isYMD(bounds?.maxYmd)) return;

    if (changedScope && isFederal && isYMD(bounds?.maxYmd)) {
      if (ymd !== bounds.maxYmd) {
        setYmd(bounds.maxYmd);
      }
      return;
    }

    const normalized = normalizeSingleDateWithBounds(ymdSafe, bounds?.minYmd, bounds?.maxYmd);
    if (normalized && normalized !== ymd) {
      setYmd(normalized);
    }
  }, [scopeKey, isFederal, bounds?.minYmd, bounds?.maxYmd, ymd, ymdSafe]);

  useEffect(() => {
    setCalendarMonthYmd(startOfMonthYMD(ymdClamped));
  }, [ymdClamped]);

  useEffect(() => {
    let cancelled = false;

    async function loadCalendarMarks() {
      const from = startOfMonthYMD(calendarMonthYmd);
      const to = endOfMonthYMD(calendarMonthYmd);

      if (!isYMD(from) || !isYMD(to)) {
        if (!cancelled) setCalendarMarkedYmds([]);
        return;
      }

      setCalendarLoading(true);

      try {
        const out = await getKingResultsByRange({
          uf: scopeKey,
          dateFrom: from,
          dateTo: to,
          positions: "1-7",
          mode: "aggregated",
        });

        const marks = Array.from(monthDaysWithDraws(out)).sort();
        if (!cancelled) setCalendarMarkedYmds(marks);
      } catch {
        if (!cancelled) setCalendarMarkedYmds([]);
      } finally {
        if (!cancelled) setCalendarLoading(false);
      }
    }

    loadCalendarMarks();

    return () => {
      cancelled = true;
    };
  }, [scopeKey, calendarMonthYmd]);

  useEffect(() => {
    function onDocPointerDown(e) {
      if (!calendarOpen) return;
      if (calendarRef.current && !calendarRef.current.contains(e.target)) {
        setCalendarOpen(false);
      }
    }

    function onDocKeyDown(e) {
      if (e.key === "Escape") {
        setCalendarOpen(false);
      }
    }

    document.addEventListener("mousedown", onDocPointerDown);
    document.addEventListener("keydown", onDocKeyDown);

    return () => {
      document.removeEventListener("mousedown", onDocPointerDown);
      document.removeEventListener("keydown", onDocKeyDown);
    };
  }, [calendarOpen]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const sKey = safeStr(scopeKey);
      const d = safeStr(ymdClamped);

      if (!sKey || !isYMD(d)) {
        if (!cancelled) {
          setDraws([]);
          setLoading(false);
          setError("");
        }
        return;
      }

      setLoading(true);
      setError("");

      try {
        const tryFetch = async ({ hour, bucket }) => {
          const out = await getKingResultsByDate({
            uf: sKey,
            date: d,
            closeHour: isFederal ? hour : null,
            closeHourBucket: isFederal ? bucket : null,
            positions: "1-7",
          });
          const list = unwrapDraws(out);
          return { list };
        };

        if (!isFederal) {
          const { list } = await tryFetch({ hour: null, bucket: null });
          const deduped = dedupeDraws(list, sKey, d);
          if (!cancelled) setDraws(deduped);
        } else {
          const allFederalDraws = [];

          for (const cand of FEDERAL_CLOSE_CANDIDATES) {
            const { list } = await tryFetch({ hour: cand.hour, bucket: cand.bucket });
            if (Array.isArray(list) && list.length) {
              allFederalDraws.push(...list);
            }
          }

          const deduped = dedupeDraws(allFederalDraws, sKey, d);
          if (!cancelled) setDraws(deduped);
        }
      } catch (e) {
        if (!cancelled) {
          setDraws([]);
          setError(String(e?.message || e || "Falha ao carregar resultados."));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();

    return () => {
      cancelled = true;
    };
  }, [scopeKey, ymdClamped, isFederal, reloadTick]);

  useEffect(() => {
    setShowAll(true);
  }, [scopeKey, ymdClamped]);

  const drawsOrdered = useMemo(() => {
    const list = Array.isArray(draws) ? draws : [];
    return [...list].sort((a, b) => {
      const ha = hourToNum(a?.close_hour || a?.closeHour || a?.hour || a?.hora);
      const hb = hourToNum(b?.close_hour || b?.closeHour || b?.hour || b?.hora);
      if (ha !== hb) return hb - ha;

      const la = safeStr(a?.lottery_code || a?.lotteryCode || "");
      const lb = safeStr(b?.lottery_code || b?.lotteryCode || "");
      if (la !== lb) return lb.localeCompare(la);

      const ia = safeStr(a?.drawId || a?.id || "");
      const ib = safeStr(b?.drawId || b?.id || "");
      return ib.localeCompare(ia);
    });
  }, [draws]);

  const drawsDisplayBase = useMemo(() => {
    const base = buildExpectedDrawsForScope(scopeKey, drawsOrdered, ymdClamped);

    if (scopeKey === SCOPE_FEDERAL) {
      const actuals = base.filter((d) => !d?.__placeholder);
      if (actuals.length) return actuals;
    }

    return base;
  }, [scopeKey, drawsOrdered, ymdClamped]);

  const federalMissingHoursLabel = useMemo(() => {
    if (!isFederal) return "";
    if (!drawsOrdered.length) return "";

    const actualHours = new Set(
      drawsOrdered
        .map((d) => normalizeHourLike(d?.close_hour || d?.closeHour || d?.hour || d?.hora || ""))
        .filter(Boolean)
    );

    const missing = FEDERAL_EXPECTED_HOURS_DESC.filter((h) => {
      if (!shouldShowExpectedHour(ymdClamped, h)) return false;
      return !actualHours.has(h);
    });

    if (!missing.length) return "";
    return missing.map((h) => `${h.slice(0, 2)}HS`).join(" • ");
  }, [isFederal, drawsOrdered, ymdClamped]);

  useEffect(() => {
    setNeedsToggle(drawsDisplayBase.length > 6);
  }, [drawsDisplayBase.length]);

  const drawsForView = useMemo(() => {
    if (!drawsDisplayBase.length) return [];
    if (!needsToggle) return drawsDisplayBase;
    if (showAll) return drawsDisplayBase;
    return drawsDisplayBase.slice(0, 6);
  }, [drawsDisplayBase, needsToggle, showAll]);

  const canGoPrevMonth = useMemo(() => {
    if (!isYMD(effectiveBounds?.minYmd)) return true;
    return shiftMonthYMD(calendarMonthYmd, -1) >= startOfMonthYMD(effectiveBounds.minYmd);
  }, [calendarMonthYmd, effectiveBounds?.minYmd]);

  const canGoNextMonth = useMemo(() => {
    if (!isYMD(effectiveBounds?.maxYmd)) return true;
    return shiftMonthYMD(calendarMonthYmd, 1) <= startOfMonthYMD(effectiveBounds.maxYmd);
  }, [calendarMonthYmd, effectiveBounds?.maxYmd]);

  function handleSelectYmd(nextYmd) {
    if (!isYMD(nextYmd)) return;
    const bounded = normalizeSingleDateWithBounds(nextYmd, effectiveBounds?.minYmd, effectiveBounds?.maxYmd);
    setYmd(bounded);
    setCalendarOpen(false);
  }

  const styles = useMemo(() => {
    return `
      :root{
        --pp-border: rgba(255,255,255,0.10);
        --pp-gold: rgba(201,168,62,0.92);
        --pp-text: rgba(255,255,255,0.92);
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
        border-radius: 18px;
        background:
          radial-gradient(1000px 520px at 10% 0%, rgba(201,168,62,0.10), transparent 60%),
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
        display:flex;
        align-items:flex-start;
        justify-content:space-between;
        gap:12px;
        min-width:0;
      }

      .pp_title{
        font-size:16px;
        font-weight:1100;
        letter-spacing:0.35px;
        color: var(--pp-text);
        line-height:1.1;
      }

      .pp_gold{ color: var(--pp-gold); }

      .pp_controls{
        display:flex;
        align-items:flex-start;
        gap:8px;
        flex-wrap:wrap;
        justify-content:flex-end;
        position: relative;
      }

      .pp_btn{
        height:34px;
        border-radius: 12px;
        border: 1px solid rgba(255,255,255,0.10);
        background: rgba(255,255,255,0.06);
        color: var(--pp-text);
        font-weight: 1100;
        letter-spacing:0.2px;
        padding: 0 14px;
        cursor:pointer;
        white-space:nowrap;
        font-size: 12px;
        box-sizing: border-box;
      }
      .pp_btn:hover{ background: rgba(255,255,255,0.08); }

      .pp_pills{
        display:flex;
        gap: 6px;
        align-items:center;
        flex-wrap: wrap;
      }

      .pp_pill{
        height: 34px;
        border-radius: 999px;
        border: 1px solid rgba(255,255,255,0.10);
        background: rgba(255,255,255,0.06);
        color: rgba(255,255,255,0.90);
        padding: 0 12px;
        font-weight: 1200;
        letter-spacing: 0.35px;
        cursor: pointer;
        font-size: 12px;
        user-select: none;
      }
      .pp_pill:hover{ background: rgba(255,255,255,0.08); }

      .pp_pill.isActive{
        border-color: rgba(201,168,62,0.36);
        background: rgba(201,168,62,0.12);
        color: rgba(201,168,62,0.98);
      }

      .pp_body{
        min-width:0;
        min-height:0;
        overflow: auto;
        padding-right: 2px;
        display: flex;
        justify-content: center;
        align-items: stretch;
      }

      .pp_center{
        width: 100%;
        max-width: 980px;
        height: 100%;
        display: grid;
        grid-template-rows: auto auto 1fr;
        gap: 10px;
        min-height: 0;
        min-width: 0;
      }

      .pp_state{
        border: 1px solid rgba(255,255,255,0.10);
        border-radius: 16px;
        background: rgba(0,0,0,0.26);
        padding: 12px 14px;
        font-weight: 850;
        color: rgba(255,255,255,0.92);
      }

      .pp_topbar{
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap: 10px;
        min-width:0;
      }

      .pp_hint{
        border: 1px solid rgba(201,168,62,0.20);
        background: rgba(201,168,62,0.08);
        color: rgba(255,255,255,0.86);
        border-radius: 12px;
        padding: 8px 12px;
        font-size: 12px;
        font-weight: 900;
        letter-spacing: 0.2px;
      }

      .pp_grid2{
        display:grid;
        grid-template-columns: repeat(2, minmax(0, 460px));
        justify-content: center;
        gap: 12px;
        min-width:0;
        align-content: start;
        padding-bottom: 14px;
      }

      .pp_card{
        position: relative;
        border-radius: 18px;
        overflow: hidden;
        border: 1px solid rgba(255,255,255,0.12);
        background: rgba(10,10,10,0.34);
        box-shadow: 0 14px 34px rgba(0,0,0,0.48);
      }

      .pp_card::before{
        content:"";
        position:absolute;
        inset:0;
        pointer-events:none;
        background:
          linear-gradient(180deg, rgba(201,168,62,0.20), transparent 38%),
          radial-gradient(800px 380px at 15% 0%, rgba(201,168,62,0.16), transparent 62%),
          radial-gradient(700px 360px at 85% 10%, rgba(201,168,62,0.10), transparent 64%);
      }

      .pp_card::after{
        content:"";
        position:absolute;
        inset:0;
        pointer-events:none;
        background:
          linear-gradient(180deg, rgba(0,0,0,0.32) 0%, rgba(0,0,0,0.55) 55%, rgba(0,0,0,0.74) 100%);
      }

      .pp_cardInner{ position: relative; z-index: 1; }

      .pp_cardHead{
        padding: 10px 12px;
        border-bottom: 1px solid rgba(255,255,255,0.10);
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap: 10px;
      }

      .pp_headLeft{
        display:flex;
        flex-direction:column;
        gap: 2px;
        min-width:0;
      }

      .pp_headTitle{
        font-weight: 1100;
        letter-spacing: 0.55px;
        color: rgba(255,255,255,0.92);
        text-transform: uppercase;
        font-size: 11px;
        white-space: nowrap;
        overflow:hidden;
        text-overflow: ellipsis;
      }

      .pp_headSub{
        font-weight: 900;
        color: rgba(255,255,255,0.62);
        font-size: 11px;
      }

      .pp_headPill{
        border: 1px solid rgba(201,168,62,0.32);
        background: rgba(201,168,62,0.12);
        color: rgba(201,168,62,0.96);
        font-weight: 1100;
        letter-spacing: 0.3px;
        font-size: 12px;
        padding: 6px 10px;
        border-radius: 999px;
        white-space: nowrap;
      }

      .pp_rows{ display:grid; }

      .pp_row{
        display:grid;
        grid-template-columns: 58px 1fr 110px;
        gap: 10px;
        align-items:center;
        padding: 10px 12px;
        border-bottom: 1px solid rgba(255,255,255,0.08);
        min-width: 0;
      }
      .pp_row:last-child{ border-bottom:0; }

      .pp_posBadge{
        width: 46px;
        height: 34px;
        border-radius: 12px;
        border: 1px solid rgba(255,255,255,0.12);
        background: rgba(255,255,255,0.06);
        display:flex;
        align-items:center;
        justify-content:center;
        font-weight: 1200;
        letter-spacing: 0.4px;
        color: rgba(255,255,255,0.90);
        font-size: 12px;
        user-select: none;
      }

      .pp_posBadge.isP1,
      .pp_posBadge.isP2,
      .pp_posBadge.isP3{
        border-color: rgba(201,168,62,0.36);
        background: rgba(201,168,62,0.12);
        color: rgba(201,168,62,0.98);
      }

      .pp_mid{
        display:flex;
        align-items:center;
        gap: 10px;
        min-width: 0;
      }

      .pp_imgFrame{
        width: 42px;
        height: 42px;
        border-radius: 14px;
        border: 1px solid rgba(201,168,62,0.26);
        background: rgba(0,0,0,0.22);
        display:grid;
        place-items:center;
        overflow:hidden;
        flex: 0 0 auto;
      }

      .pp_img{
        width: 32px;
        height: 32px;
        object-fit: contain;
        display:block;
      }

      .pp_imgFallback{
        font-size: 10px;
        font-weight: 1200;
        color: rgba(201,168,62,0.88);
        letter-spacing: 0.3px;
        line-height: 1;
      }

      .pp_textBlock{
        min-width: 0;
        display:flex;
        flex-direction:column;
        gap: 2px;
      }

      .pp_group{
        color: rgba(255,255,255,0.65);
        font-weight: 950;
        text-transform: uppercase;
        white-space: nowrap;
        font-size: 11px;
        overflow:hidden;
        text-overflow:ellipsis;
      }

      .pp_animal{
        color: rgba(255,255,255,0.94);
        font-weight: 1200;
        text-transform: uppercase;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: 13px;
        letter-spacing: 0.35px;
      }

      .pp_num{
        display:flex;
        align-items:center;
        justify-content:flex-end;
        gap: 8px;
        white-space: nowrap;
        min-width: 0;
        font-variant-numeric: tabular-nums;
      }

      .pp_numValue{
        font-weight: 1300;
        font-size: 18px;
        letter-spacing: 1px;
        color: rgba(255,255,255,0.95);
      }

      .pp_numHint{
        color: rgba(201,168,62,0.92);
        font-weight: 1100;
        font-size: 11px;
        letter-spacing: 0.25px;
        border: 1px solid rgba(201,168,62,0.28);
        background: rgba(201,168,62,0.10);
        padding: 4px 8px;
        border-radius: 999px;
      }

      .pp_row:hover{ background: rgba(255,255,255,0.03); }

      .pp_dateWrap{
        position: relative;
        min-width: 170px;
      }

      .pp_dateBtn{
        min-width: 170px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
      }

      .pp_calendarPop{
        position:absolute;
        top: calc(100% + 8px);
        right: 0;
        z-index: 50;
        width: 290px;
        border-radius: 18px;
        border: 1px solid rgba(255,255,255,0.12);
        background:
          linear-gradient(180deg, rgba(201,168,62,0.12), transparent 24%),
          rgba(8,8,8,0.96);
        box-shadow: 0 18px 48px rgba(0,0,0,0.55);
        padding: 12px;
        backdrop-filter: blur(10px);
      }

      .pp_calHead{
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:8px;
        margin-bottom: 10px;
      }

      .pp_calTitle{
        color: rgba(255,255,255,0.94);
        font-weight: 1100;
        letter-spacing: 0.2px;
        text-transform: none;
        font-size: 14px;
      }

      .pp_calNav{
        width: 30px;
        height: 30px;
        border-radius: 10px;
        border: 1px solid rgba(255,255,255,0.10);
        background: rgba(255,255,255,0.05);
        color: rgba(255,255,255,0.92);
        cursor: pointer;
        font-size: 16px;
      }

      .pp_calNav:disabled{
        opacity: 0.28;
        cursor: not-allowed;
      }

      .pp_calWeek{
        display:grid;
        grid-template-columns: repeat(7, 1fr);
        gap: 6px;
        margin-bottom: 6px;
      }

      .pp_calWeekItem{
        text-align:center;
        color: rgba(255,255,255,0.55);
        font-size: 11px;
        font-weight: 1100;
        padding: 4px 0;
      }

      .pp_calGrid{
        display:grid;
        grid-template-columns: repeat(7, 1fr);
        gap: 6px;
      }

      .pp_calDay{
        height: 34px;
        border-radius: 10px;
        border: 1px solid rgba(255,255,255,0.08);
        background: rgba(255,255,255,0.03);
        color: rgba(255,255,255,0.88);
        cursor: pointer;
        font-weight: 1000;
        font-size: 12px;
        position: relative;
      }

      .pp_calDay:hover{
        background: rgba(255,255,255,0.08);
      }

      .pp_calDay.isMuted{
        color: rgba(255,255,255,0.34);
      }

      .pp_calDay.isDisabled{
        opacity: 0.24;
        cursor: not-allowed;
      }

      .pp_calDay.isMarked{
        border-color: rgba(201,168,62,0.52);
        background: linear-gradient(180deg, rgba(201,168,62,0.24), rgba(201,168,62,0.12));
        color: rgba(255,248,220,0.99);
        box-shadow: inset 0 0 0 1px rgba(201,168,62,0.12);
      }

      .pp_calDay.isSelected{
        border-color: rgba(201,168,62,0.70);
        background: rgba(201,168,62,0.24);
        box-shadow: inset 0 0 0 1px rgba(201,168,62,0.18);
      }

      .pp_calDay.isToday{
        outline: 1px solid rgba(255,255,255,0.26);
        outline-offset: -1px;
      }

      .pp_calDay.isLastDraw{
        box-shadow:
          inset 0 0 0 1px rgba(255,215,120,0.24),
          0 0 0 1px rgba(201,168,62,0.14);
      }

      .pp_calDot{
        position:absolute;
        left:50%;
        bottom:4px;
        transform:translateX(-50%);
        width: 7px;
        height: 7px;
        border-radius: 999px;
        background: rgba(201,168,62,0.98);
        box-shadow: 0 0 8px rgba(201,168,62,0.45);
      }

      .pp_calFoot{
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:10px;
        margin-top: 10px;
        padding-top: 10px;
        border-top: 1px solid rgba(255,255,255,0.08);
      }

      .pp_calLegend{
        color: rgba(255,255,255,0.64);
        font-size: 11px;
        font-weight: 900;
      }

      .pp_calLegend strong{
        color: rgba(255,244,207,0.98);
        font-weight: 1100;
      }

      .pp_calMini{
        color: rgba(255,255,255,0.52);
        font-size: 11px;
        font-weight: 900;
      }

      @media (max-width: 980px){
        .pp_grid2{ grid-template-columns: 1fr; }
      }

      @media (max-width: 620px){
        .pp_header{ flex-direction: column; align-items: stretch; }
        .pp_controls{ justify-content:flex-start; }
        .pp_btn, .pp_dateWrap{ width:100%; min-width:0; }
        .pp_dateBtn{ width: 100%; }
        .pp_calendarPop{
          width: min(100vw - 64px, 320px);
          right: auto;
          left: 0;
        }
        .pp_topbar{
          flex-direction: column;
          align-items: stretch;
        }
        .pp_row{ grid-template-columns: 56px 1fr 104px; padding: 10px 10px; }
        .pp_numValue{ font-size: 17px; }
      }
    `;
  }, []);

  return (
    <div className="pp_wrap">
      <style>{styles}</style>

      <div className="pp_shell">
        <div className="pp_header">
          <div style={{ minWidth: 0 }}>
            <div className="pp_title">Resultados</div>
          </div>

          <div className="pp_controls" onClick={stopOnly} onMouseDown={stopOnly} onTouchStart={stopOnly}>
            <div className="pp_pills" aria-label="Escopo">
              <button
                type="button"
                className={scopePillClass(scopeKey === SCOPE_RJ)}
                onClick={(e) => {
                  stopEvt(e);
                  setScopeUi(SCOPE_RJ);
                }}
                title="Resultados do Rio"
              >
                RJ
              </button>

              <button
                type="button"
                className={scopePillClass(isFederal)}
                onClick={(e) => {
                  stopEvt(e);
                  setScopeUi(SCOPE_FEDERAL);
                }}
                title="Resultados da Federal"
              >
                FEDERAL
              </button>
            </div>

            <div className="pp_dateWrap" ref={calendarRef}>
              <button
                type="button"
                className="pp_btn pp_dateBtn"
                title="Calendário"
                aria-label={`Selecionar data. Atual: ${dateBR}`}
                onClick={(e) => {
                  stopEvt(e);
                  setCalendarOpen((v) => !v);
                }}
              >
                <span aria-hidden="true">📅</span>
                <span>{dateBR}</span>
              </button>

              {calendarOpen ? (
                <div className="pp_calendarPop" onClick={stopOnly} onMouseDown={stopOnly}>
                  <div className="pp_calHead">
                    <button
                      type="button"
                      className="pp_calNav"
                      disabled={!canGoPrevMonth}
                      onClick={(e) => {
                        stopEvt(e);
                        if (canGoPrevMonth) setCalendarMonthYmd((v) => shiftMonthYMD(v, -1));
                      }}
                      aria-label="Mês anterior"
                    >
                      ‹
                    </button>

                    <div className="pp_calTitle">{calendarTitle}</div>

                    <button
                      type="button"
                      className="pp_calNav"
                      disabled={!canGoNextMonth}
                      onClick={(e) => {
                        stopEvt(e);
                        if (canGoNextMonth) setCalendarMonthYmd((v) => shiftMonthYMD(v, 1));
                      }}
                      aria-label="Próximo mês"
                    >
                      ›
                    </button>
                  </div>

                  <div className="pp_calWeek">
                    {["D", "S", "T", "Q", "Q", "S", "S"].map((w) => (
                      <div key={w} className="pp_calWeekItem">
                        {w}
                      </div>
                    ))}
                  </div>

                  <div className="pp_calGrid">
                    {calendarCells.map((cell) => {
                      const disabled =
                        (isYMD(effectiveBounds?.minYmd) && cell.ymd < effectiveBounds.minYmd) ||
                        (isYMD(effectiveBounds?.maxYmd) && cell.ymd > effectiveBounds.maxYmd);

                      const isMarked = calendarMarkedSet.has(cell.ymd);
                      const isSelected = cell.ymd === ymdClamped;
                      const isToday = cell.ymd === todayYMDLocal();
                      const isLastDraw = isFederal && cell.ymd === bounds?.maxYmd;

                      const cls = [
                        "pp_calDay",
                        !cell.inMonth ? "isMuted" : "",
                        disabled ? "isDisabled" : "",
                        isMarked ? "isMarked" : "",
                        isSelected ? "isSelected" : "",
                        isToday ? "isToday" : "",
                        isLastDraw ? "isLastDraw" : "",
                      ]
                        .filter(Boolean)
                        .join(" ");

                      return (
                        <button
                          key={cell.ymd}
                          type="button"
                          className={cls}
                          disabled={disabled}
                          onClick={(e) => {
                            stopEvt(e);
                            if (!disabled) handleSelectYmd(cell.ymd);
                          }}
                          title={ymdToBR(cell.ymd)}
                        >
                          {cell.day}
                          {isMarked ? <span className="pp_calDot" aria-hidden="true" /> : null}
                        </button>
                      );
                    })}
                  </div>

                  <div className="pp_calFoot">
                    <div className="pp_calLegend">
                      <strong>•</strong> dia com sorteio
                    </div>
                    <div className="pp_calMini">
                      {calendarLoading ? "Lendo mês…" : isFederal && isYMD(bounds?.maxYmd) ? `Último: ${ymdToBR(bounds.maxYmd)}` : ""}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            <button
              className="pp_btn"
              onClick={(e) => {
                stopEvt(e);
                setReloadTick((v) => v + 1);
              }}
              type="button"
              title="Atualizar"
            >
              Atualizar
            </button>
          </div>
        </div>

        <div className="pp_body">
          <div className="pp_center" ref={centerRef}>
            {loading ? (
              <div className="pp_state">Carregando…</div>
            ) : error ? (
              <div className="pp_state">
                <div style={{ fontWeight: 1100, marginBottom: 6 }}>Erro</div>
                <div style={{ opacity: 0.9, whiteSpace: "pre-wrap" }}>{error}</div>
              </div>
            ) : drawsDisplayBase.length === 0 ? (
              <div className="pp_state">
                Nenhum resultado para <span className="pp_gold">{label || DEFAULT_SCOPE}</span> em{" "}
                <span className="pp_gold">{dateBR}</span>
              </div>
            ) : (
              <>
                <div className="pp_topbar">
                  {federalMissingHoursLabel ? (
                    <div className="pp_hint">{`Sem sorteio neste dia: ${federalMissingHoursLabel}`}</div>
                  ) : (
                    <div />
                  )}

                  {needsToggle ? (
                    <button
                      className="pp_btn"
                      type="button"
                      onClick={(e) => {
                        stopEvt(e);
                        setShowAll((v) => !v);
                      }}
                      title={showAll ? "Ver menos" : "Ver mais"}
                    >
                      {showAll ? "Ver menos" : "Ver mais"}
                    </button>
                  ) : null}
                </div>

                <div
                  className="pp_grid2"
                  style={
                    isFederal && drawsForView.length === 1
                      ? { gridTemplateColumns: "minmax(0, 460px)", justifyContent: "center" }
                      : undefined
                  }
                >
                  {drawsForView.map((d, idx) => {
                    const hour = normalizeHourLike(
                      d?.close_hour || d?.closeHour || d?.hour || d?.hora || ""
                    );
                    const id = safeStr(d?.drawId || d?.id || `idx_${idx}`);
                    const prizesRaw = Array.isArray(d?.prizes) ? d.prizes : [];
                    const hs = hour ? `${hour.slice(0, 2)}HS` : "—";

                    const byPos = new Map();
                    for (const p of prizesRaw) {
                      const pos = guessPrizePos(p);
                      if (!pos) continue;
                      if (!byPos.has(pos)) byPos.set(pos, p);
                    }

                    const rows = Array.from({ length: 7 }, (_, i) => {
                      const posWanted = i + 1;
                      const p = byPos.get(posWanted) || null;

                      const { grupo, label: animalLabelRaw, imgVariants } = p
                        ? resolveAnimalUI(p)
                        : { grupo: null, label: "", imgVariants: [] };

                      const numero = p ? guessPrizeNumber(p) : "";

                      return {
                        pos: posWanted,
                        grupo,
                        animalLabel: safeStr(animalLabelRaw),
                        imgVariants,
                        numero,
                      };
                    });

                    return (
                      <div key={`${id}_${idx}`} className="pp_card">
                        <div className="pp_cardInner">
                          <div className="pp_cardHead">
                            <div className="pp_headLeft">
                              <div className="pp_headTitle">{`Resultado • ${label}`}</div>
                              <div className="pp_headSub">{dateBR}</div>
                            </div>

                            <div className="pp_headPill">{hs}</div>
                          </div>

                          <div className="pp_rows">
                            {rows.map((r) => {
                              const gtxt = r.grupo ? `G${pad2(r.grupo)}` : "—";
                              const numFmt = r.numero ? formatPrizeNumberByPos(r.numero, r.pos) : "";

                              return (
                                <div key={`${id}_pos_${r.pos}`} className="pp_row">
                                  <div className={`pp_posBadge ${prizeRankClass(r.pos)}`}>{`${r.pos}º`}</div>

                                  <div className="pp_mid">
                                    <div className="pp_imgFrame" aria-hidden="true">
                                      <RowImg
                                        variants={r.imgVariants || []}
                                        alt={r.animalLabel ? `Bicho ${r.animalLabel}` : "Bicho"}
                                        fallbackText={gtxt}
                                      />
                                    </div>

                                    <div className="pp_textBlock">
                                      <div className="pp_group">
                                        {r.grupo ? `GRUPO ${pad2(r.grupo)}` : "GRUPO —"}
                                      </div>
                                      <div className="pp_animal">
                                        {r.animalLabel ? r.animalLabel.toUpperCase() : "—"}
                                      </div>
                                    </div>
                                  </div>

                                  <div className="pp_num">
                                    {r.numero ? (
                                      <>
                                        <span className="pp_numHint">{prizeLabelByPos(r.pos)}</span>
                                        <span className="pp_numValue">{numFmt}</span>
                                      </>
                                    ) : (
                                      <span className="pp_numValue" style={{ opacity: 0.55 }}>
                                        —
                                      </span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}


