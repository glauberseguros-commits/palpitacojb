// src/pages/Dashboard/Dashboard.jsx
/**
 * ============================================================
 * DASHBOARD — BASELINE CONGELADA (freeze)
 * ============================================================
 * ✅ Ajuste de produto (Guest / Vitrine):
 * - "Entrar sem login" = modo DEMO (guest):
 *   - entra no Dashboard
 *   - mostra dados gerais (Todos + período completo desde 2022)
 *   - NÃO permite mexer em filtros/período/seleções
 * ============================================================
 */

import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import "./dashboard.css";

import LeftRankingTable from "./components/LeftRankingTable";
import FiltersBar from "./components/FiltersBar";
import KpiCards from "./components/KpiCards";
import ChartsGrid from "./components/ChartsGrid";
import DateRangeControl from "./components/DateRangeControl";

import { useKingRanking } from "../../hooks/useKingRanking";
import {
  BICHO_MAP,
  getAnimalLabel as getAnimalLabelFromMap,
  getImgFromGrupo as getImgFromGrupoFromMap,
} from "../../constants/bichoMap";

import { buildPalpiteV2 } from "../../utils/buildPalpites";
import { getKingBoundsByUf } from "../../services/kingResultsService";
import { buildRanking } from "../../utils/buildRanking";

/* =========================
   DATA MODE
========================= */
const DATA_MODE = "firestore";
const RANKING_JSON_URL = "/data/ranking_current.json";

const ALL_POSITIONS = [1, 2, 3, 4, 5, 6, 7];

/* =========================
   Persistência (Dashboard State)
   - Não inclui filtros (filtros ficam no App.js)
========================= */
const DASH_STATE_KEY = "pp_dash_state_v1";

/* =========================
   Sessão / Guest (demo)
========================= */
const ACCOUNT_SESSION_KEY = "pp_session_v1";
const SESSION_POLL_MS = 1500;

function safeParseJSON(s) {
  try {
    const obj = JSON.parse(s);
    return obj && typeof obj === "object" ? obj : null;
  } catch {
    return null;
  }
}

function loadSessionObj() {
  try {
    const raw = localStorage.getItem(ACCOUNT_SESSION_KEY);
    if (!raw) return null;
    const s = String(raw || "").trim();
    if (!s.startsWith("{")) return null;
    return safeParseJSON(s);
  } catch {
    return null;
  }
}

function isGuestSession(sess) {
  const s = sess || loadSessionObj();
  if (!s || s.ok !== true) return false;
  const t = String(s.loginType || "").toLowerCase();
  const id = String(s.loginId || "").toLowerCase();
  return t === "guest" || id === "guest" || s.skipped === true || String(s.mode || "") === "skip";
}

/* =========================
   Banner
========================= */
const DEFAULT_BANNER_SRC =
  "https://images.unsplash.com/photo-1546182990-dffeafbe841d?auto=format&fit=crop&w=1400&q=80";

function safeReadJSON(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function safeWriteJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

function isValidGrupo(g) {
  const n = Number(g);
  return Number.isFinite(n) && n >= 1 && n <= 25;
}

function preloadImage(src) {
  return new Promise((resolve, reject) => {
    if (!src) return reject(new Error("src vazio"));
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => reject(new Error("falha ao carregar"));
    img.src = src;
  });
}

/* =========================
   Helpers (UI -> Bucket)
========================= */

function normalizeHourBucket(h) {
  const raw = String(h ?? "").trim();
  if (!raw || raw.toLowerCase() === "todos") return null;

  // normaliza: remove espaços e deixa upper pra pegar HS/hs
  const s = raw.replace(/\s+/g, "").toUpperCase();

  // 1) "09HS" / "9HS" / "09H" / "9H"
  let m = s.match(/^(\d{1,2})(?:H|HS)$/);
  if (m) return `${String(m[1]).padStart(2, "0")}h`;

  // 2) "09:10" / "9:10" / "09:10:00"
  m = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (m) return `${String(m[1]).padStart(2, "0")}h`;

  // 3) "09" / "9"
  m = s.match(/^(\d{1,2})$/);
  if (m) return `${String(m[1]).padStart(2, "0")}h`;

  // 4) fallback: extrai a 1ª hora que aparecer ("...09HS..." etc.)
  m = s.match(/(\d{1,2})/);
  if (m) {
    const hh = Number(m[1]);
    if (Number.isFinite(hh) && hh >= 0 && hh <= 23) return `${String(hh).padStart(2, "0")}h`;
  }

  return null;
}

function normalizePositions(pos) {
  const s = String(pos || "").trim();
  if (!s || s.toLowerCase() === "todos") return [1, 2, 3, 4, 5, 6, 7];

  const m = s.match(/^(\d+)/);
  if (m) {
    const n = Number(m[1]);
    if (Number.isFinite(n) && n >= 1 && n <= 7) return [n];
  }

  return [1, 2, 3, 4, 5, 6, 7];
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function isISODate(s) {
  return /^(\d{4})-(\d{2})-(\d{2})$/.test(String(s || ""));
}

function normalizeToYMD(input) {
  if (!input) return null;

  if (typeof input === "object" && typeof input.toDate === "function") {
    const d = input.toDate();
    if (d instanceof Date && !Number.isNaN(d.getTime())) {
      return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    }
  }

  if (
    typeof input === "object" &&
    (Number.isFinite(Number(input.seconds)) || Number.isFinite(Number(input._seconds)))
  ) {
    const sec = Number.isFinite(Number(input.seconds)) ? Number(input.seconds) : Number(input._seconds);

    const d = new Date(sec * 1000);
    if (!Number.isNaN(d.getTime())) {
      return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    }
  }

  if (input instanceof Date && !Number.isNaN(input.getTime())) {
    return `${input.getFullYear()}-${pad2(input.getMonth() + 1)}-${pad2(input.getDate())}`;
  }

  const s = String(input).trim();
  if (!s) return null;

  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;

  return null;
}

function getDrawDate(d) {
  if (!d) return null;
  const raw = d.date ?? d.ymd ?? d.draw_date ?? d.close_date ?? d.data ?? d.dt ?? null;
  return normalizeToYMD(raw);
}

function getDrawCloseHour(d) {
  if (!d) return "";

  // tenta campos mais comuns primeiro (inclui raw)
  const cand =
    d.close_hour_raw ??
    d.closeHourRaw ??
    d.close_hour ??
    d.closeHour ??
    d.close_hour_bucket ??
    d.closeHourBucket ??
    d.hour ??
    d.hora ??
    "";

  return String(cand ?? "").trim();
}

function yearRangeToDates(minYear, maxYear) {
  const a = Number(minYear);
  const b = Number(maxYear);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  const y = Math.min(a, b);
  const z = Math.max(a, b);
  return { from: `${y}-01-01`, to: `${z}-12-31` };
}

function extractYearsFromDraws(drawsRaw) {
  if (!Array.isArray(drawsRaw) || !drawsRaw.length) return [];
  const set = new Set();
  for (const d of drawsRaw) {
    const ymd = getDrawDate(d);
    if (!ymd) continue;
    const y = Number(ymd.slice(0, 4));
    if (Number.isFinite(y)) set.add(y);
  }
  return Array.from(set).sort((a, b) => a - b);
}

const MONTH_NAME_TO_MM = {
  janeiro: "01",
  fevereiro: "02",
  março: "03",
  marco: "03",
  abril: "04",
  maio: "05",
  junho: "06",
  julho: "07",
  agosto: "08",
  setembro: "09",
  outubro: "10",
  novembro: "11",
  dezembro: "12",
};

function ymdToWeekdayShortPT(ymd) {
  const m = String(ymd || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;

  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!y || !mo || !d) return null;

  const dt = new Date(Date.UTC(y, mo - 1, d));
  const idx = dt.getUTCDay();

  const arr = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  return arr[idx] || null;
}

function normalizeKey(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function getLabelByGrupo(g) {
  const n = Number(g);
  if (!Number.isFinite(n) || n < 1 || n > 25) return "";
  try {
    if (typeof getAnimalLabelFromMap === "function") {
      const a = getAnimalLabelFromMap({ grupo: n, animal: "" });
      const sa = String(a ?? "").trim();
      if (sa) return sa;
    }
  } catch {}
  try {
    if (typeof getAnimalLabelFromMap === "function") {
      const b = getAnimalLabelFromMap(n);
      const sb = String(b ?? "").trim();
      if (sb) return sb;
    }
  } catch {}
  return "";
}

function safeAnimalLabel({ grupo, animal }) {
  try {
    if (typeof getAnimalLabelFromMap === "function") {
      const out = getAnimalLabelFromMap({ grupo, animal });
      const s = String(out ?? "").trim();
      if (s) return s;
    }
  } catch {}
  const byGrupo = getLabelByGrupo(grupo);
  if (byGrupo) return byGrupo;
  return String(animal || "").trim();
}

function mapRankingJsonToApp(json) {
  const safe = json && typeof json === "object" ? json : null;
  if (!safe) return null;

  const totals = safe.totals || {};
  const meta = safe.meta || {};

  const ranking = Array.isArray(safe.ranking) ? safe.ranking : [];
  const byGrupo = Array.isArray(safe.byGrupo) ? safe.byGrupo : [];

  const rankingData = byGrupo.map((r) => ({
    grupo: String(r?.grupo || "").replace(/^0/, ""),
    animal: r?.animal || "",
    total: Number(r?.apar || 0),
    share: r?.share || "0.00%",
  }));

  const top3 = ranking.slice(0, 3).map((r) => ({
    grupo: String(r?.grupo || "").replace(/^0/, ""),
    animal: r?.animal || "",
    total: Number(r?.apar || 0),
    share: r?.share || "0.00%",
  }));

  const rankingMeta = {
    mode: "json",
    uf: meta.uf || null,
    positionFilter: meta.positionFilter || "all",
    dateFrom: meta.d1 || null,
    dateTo: meta.d2 || null,
    totalDraws: Number(totals.draws || 0),
    totalOcorrencias: Number(totals.ocorrencias || 0),
    totalDays: Number(totals.days || totals.dias || totals.uniqueDays || totals.unique_days || 0) || 0,
    generatedAt: meta.generatedAt || null,
    top3,
  };

  return { rankingData, rankingMeta, drawsRaw: [] };
}

function PremiumInfoBox({ title, description, extra }) {
  return (
    <div
      style={{
        border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: 14,
        background: "rgba(0,0,0,0.45)",
        padding: 14,
        boxShadow: "0 18px 45px rgba(0,0,0,0.55)",
      }}
    >
      <div style={{ fontWeight: 1000, letterSpacing: 0.25, marginBottom: 6 }}>{title}</div>
      <div style={{ opacity: 0.86, lineHeight: 1.35, fontWeight: 700 }}>{description}</div>
      {extra ? (
        <div
          style={{
            marginTop: 10,
            opacity: 0.75,
            fontSize: 12,
            lineHeight: 1.35,
            whiteSpace: "pre-line",
          }}
        >
          {extra}
        </div>
      ) : null}
    </div>
  );
}

function PremiumTopRightSkeleton({ message }) {
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <PremiumInfoBox
        title="Carregando período disponível"
        description={message || "Consultando base para identificar min/max reais..."}
        extra="Enquanto o período não for resolvido, o painel não exibe estatísticas para evitar zeros e inconsistências."
      />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div
          style={{
            border: "1px solid rgba(255,255,255,0.10)",
            borderRadius: 14,
            background: "rgba(0,0,0,0.35)",
            padding: 14,
            minHeight: 76,
          }}
        />
        <div
          style={{
            border: "1px solid rgba(255,255,255,0.10)",
            borderRadius: 14,
            background: "rgba(0,0,0,0.35)",
            padding: 14,
            minHeight: 76,
          }}
        />
      </div>
    </div>
  );
}

function isIndexErrorMessage(err) {
  const msg = String(err?.message || err || "").toLowerCase();
  return (
    msg.includes("failed-precondition") ||
    msg.includes("failed_precondition") ||
    msg.includes("requires an index") ||
    (msg.includes("index") && msg.includes("create")) ||
    (msg.includes("índice") && msg.includes("criar")) ||
    (msg.includes("indice") && msg.includes("criar"))
  );
}

function clampRangeToBounds(next, minDate, maxDate) {
  const f = next?.from;
  const t = next?.to;

  if (!isISODate(f) || !isISODate(t)) return null;
  if (!minDate || !maxDate) return null;

  const from = f < minDate ? minDate : f > maxDate ? maxDate : f;
  const to = t < minDate ? minDate : t > maxDate ? maxDate : t;

  if (from > to) return { from: to, to: to };
  return { from, to };
}

function normalizeLoteriaKey(v) {
  const raw = String(v ?? "").trim();
  if (!raw) return "RJ";
  const key = raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (key === "federal" || key === "fed" || key === "br" || key === "brasil") return "FEDERAL";
  return "RJ";
}

/**
 * ✅ Dashboard recebe filtros do App.js
 * - filters: objeto
 * - setFilters: setter
 */
export default function Dashboard(props) {
  const externalFilters = props && typeof props === "object" ? props.filters : null;
  const externalSetFilters = props && typeof props === "object" ? props.setFilters : null;

  const fallbackFilters = useMemo(
    () => ({
      loteria: "RJ",
      mes: "Todos",
      diaMes: "Todos",
      diaSemana: "Todos",
      horario: "Todos",
      animal: "Todos",
      posicao: "Todos",
    }),
    []
  );

  // ✅ sessão/guest (demo)
  const [isGuest, setIsGuest] = useState(() => isGuestSession(loadSessionObj()));

  useEffect(() => {
    const refresh = () => setIsGuest(isGuestSession(loadSessionObj()));

    const onStorage = (e) => {
      if (e && e.key && e.key !== ACCOUNT_SESSION_KEY) return;
      refresh();
    };

    const onVisibility = () => {
      // ao voltar pra aba, atualiza imediatamente
      if (document.visibilityState === "visible") refresh();
    };

    window.addEventListener("storage", onStorage);
    document.addEventListener("visibilitychange", onVisibility);

    const t = setInterval(() => {
      // evita ficar “martelando” quando aba está oculta
      if (document.visibilityState !== "visible") return;
      refresh();
    }, SESSION_POLL_MS);

    return () => {
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onVisibility);
      clearInterval(t);
    };
  }, []);

  // ✅ filtros estáveis
  const rawFilters = useMemo(() => {
    return externalFilters && typeof externalFilters === "object" ? externalFilters : fallbackFilters;
  }, [externalFilters, fallbackFilters]);

  // ✅ no guest, força "Todos" (vitrine) — mantém loteria em RJ (não vale FEDERAL no demo)
  const filters = useMemo(() => {
    if (!isGuest) return { ...fallbackFilters, ...rawFilters };
    return fallbackFilters;
  }, [isGuest, rawFilters, fallbackFilters]);

  // ✅ setter estável
  const noopSetFilters = useCallback(() => {}, []);
  const setFilters = useMemo(() => {
    if (isGuest) return noopSetFilters;
    return typeof externalSetFilters === "function" ? externalSetFilters : noopSetFilters;
  }, [externalSetFilters, noopSetFilters, isGuest]);

  const loteriaKey = useMemo(() => normalizeLoteriaKey(filters?.loteria), [filters?.loteria]);
  const isFederal = loteriaKey === "FEDERAL";

  // ✅ FEDERAL: força horário = 20h (se não for guest)
  useEffect(() => {
    if (isGuest) return;
    if (!isFederal) return;

    const cur = String(filters?.horario ?? "");
    if (cur !== "20h") {
      setFilters((prev) => ({ ...prev, horario: "20h" }));
    }
  }, [isFederal, isGuest, filters?.horario, setFilters]);

  const locationLabel = isFederal ? "FEDERAL (Brasil) — 20h" : "Rio de Janeiro, RJ, Brasil";
  const uf = isFederal ? "FEDERAL" : "PT_RIO";

  // ✅ restaura apenas estado auxiliar (range/anos/grupo) do localStorage
  const savedDashState = useMemo(() => safeReadJSON(DASH_STATE_KEY), []);

  const [selectedGrupo, setSelectedGrupo] = useState(() => {
    const g = Number(savedDashState?.selectedGrupo);
    return Number.isFinite(g) && g >= 1 && g <= 25 ? g : null;
  });

  const [bounds, setBounds] = useState({
    loading: DATA_MODE === "firestore",
    minDate: null,
    maxDate: null,
    error: null,
  });

  const didInitRangeFromBoundsRef = useRef(false);

  const [dateRange, setDateRange] = useState(() => {
    const dr = savedDashState?.dateRange;
    if (dr?.from && dr?.to && isISODate(dr.from) && isISODate(dr.to)) {
      return { from: dr.from, to: dr.to };
    }
    return null;
  });

  const [dateRangeQuery, setDateRangeQuery] = useState(() => {
    const dr = savedDashState?.dateRangeQuery;
    if (dr?.from && dr?.to && isISODate(dr.from) && isISODate(dr.to)) {
      return { from: dr.from, to: dr.to };
    }
    return null;
  });

  const debounceTimerRef = useRef(null);

  const [selectedYears, setSelectedYears] = useState(() => {
    const arr = Array.isArray(savedDashState?.selectedYears) ? savedDashState.selectedYears : [];
    return arr.map((y) => Number(y)).filter((y) => Number.isFinite(y));
  });

  const [bannerSrc, setBannerSrc] = useState(DEFAULT_BANNER_SRC);
  const bannerReqIdRef = useRef(0);

  useEffect(() => {
    if (DATA_MODE !== "firestore") return;

    let alive = true;

    (async () => {
      try {
        setBounds((b) => ({ ...b, loading: true, error: null }));

        const res = await getKingBoundsByUf({ uf });
        if (!alive) return;

        const minYmd = normalizeToYMD(res?.minYmd) || null;
        const maxYmd = normalizeToYMD(res?.maxYmd) || null;

        if (!minYmd || !maxYmd) {
          setBounds({
            loading: false,
            minDate: null,
            maxDate: null,
            error: "Sem bounds confiáveis (min/max não retornados).",
          });
          return;
        }

        setBounds({
          loading: false,
          minDate: minYmd,
          maxDate: maxYmd,
          error: res?.ok === false ? "Sem bounds confiáveis (índice/campos)." : null,
        });

        if (!didInitRangeFromBoundsRef.current) {
          didInitRangeFromBoundsRef.current = true;

          const hasRestoredRange =
            dateRange?.from && dateRange?.to && isISODate(dateRange.from) && isISODate(dateRange.to);

          const hasRestoredQuery =
            dateRangeQuery?.from &&
            dateRangeQuery?.to &&
            isISODate(dateRangeQuery.from) &&
            isISODate(dateRangeQuery.to);

          if (hasRestoredRange && hasRestoredQuery) return;

          const init = { from: minYmd, to: maxYmd };
          setDateRange(init);
          setDateRangeQuery(init);
          setSelectedYears([]);
        }
      } catch (e) {
        if (!alive) return;

        setBounds({
          loading: false,
          minDate: null,
          maxDate: null,
          error: e?.message || String(e),
        });
      }
    })();

    return () => {
      alive = false;
    };
  }, [uf, dateRange?.from, dateRange?.to, dateRangeQuery?.from, dateRangeQuery?.to]);

  const MIN_DATE = bounds.minDate;
  const MAX_DATE = bounds.maxDate;
  const boundsReady = !!(MIN_DATE && MAX_DATE && !bounds.loading);

  // ✅ Guest (demo): força SEMPRE período completo e filtros "Todos"
  useEffect(() => {
    if (!isGuest) return;
    if (!boundsReady || !MIN_DATE || !MAX_DATE) return;

    setSelectedGrupo(null);
    setSelectedYears([]);

    const full = { from: MIN_DATE, to: MAX_DATE };
    setDateRange(full);
    setDateRangeQuery(full);
  }, [isGuest, boundsReady, MIN_DATE, MAX_DATE]);

  useEffect(() => {
    if (!boundsReady || !MAX_DATE) return;

    const f = dateRange?.from;
    const t = dateRange?.to;

    if (!isISODate(f) || !isISODate(t)) {
      if (MIN_DATE && MAX_DATE) {
        const fix = { from: MIN_DATE, to: MAX_DATE };
        setDateRange(fix);
        setDateRangeQuery(fix);
      }
      return;
    }

    const clamped = clampRangeToBounds({ from: f, to: t }, MIN_DATE, MAX_DATE);
    if (!clamped) return;

    if (clamped.from !== f || clamped.to !== t) {
      setDateRange(clamped);
      setDateRangeQuery(clamped);
    }
  }, [boundsReady, MIN_DATE, MAX_DATE, dateRange?.from, dateRange?.to]);

  const applyDateRange = useCallback(
    (next) => {
      if (!next) return;
      if (isGuest) return;

      setDateRange(next);

      let clampedNext = next;
      if (boundsReady && MIN_DATE && MAX_DATE) {
        const c = clampRangeToBounds(next, MIN_DATE, MAX_DATE);
        clampedNext = c || { from: MIN_DATE, to: MAX_DATE };
      }

      if (clampedNext?.from && clampedNext?.to && clampedNext.from === clampedNext.to) {
        setSelectedYears([]);
      }

      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = setTimeout(() => {
        setDateRangeQuery(clampedNext);
      }, 250);
    },
    [boundsReady, MIN_DATE, MAX_DATE, isGuest]
  );

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, []);

  const queryDate = useMemo(() => {
    if (dateRangeQuery?.from && dateRangeQuery?.to && dateRangeQuery.from === dateRangeQuery.to)
      return dateRangeQuery.from;
    return null;
  }, [dateRangeQuery]);

  const dateFrom = useMemo(() => {
    if (!dateRangeQuery?.from || !dateRangeQuery?.to) return null;
    if (dateRangeQuery.from === dateRangeQuery.to) return null;
    return dateRangeQuery.from;
  }, [dateRangeQuery]);

  const dateTo = useMemo(() => {
    if (!dateRangeQuery?.from || !dateRangeQuery?.to) return null;
    if (dateRangeQuery.from === dateRangeQuery.to) return null;
    return dateRangeQuery.to;
  }, [dateRangeQuery]);

  const canQueryFirestore = DATA_MODE === "firestore" ? !!(boundsReady && dateRangeQuery) : true;

  const { loading: fsLoading, error: fsError, meta: fsRankingMeta, drawsRaw: fsDrawsRaw } =
    useKingRanking({
      uf,
      date: canQueryFirestore ? queryDate : null,
      dateFrom: canQueryFirestore ? dateFrom : null,
      dateTo: canQueryFirestore ? dateTo : null,
      closeHourBucket: null,
      positions: ALL_POSITIONS,
    });

  const [jsonState, setJsonState] = useState({
    loading: DATA_MODE === "json",
    error: null,
    rankingData: [],
    rankingMeta: null,
    drawsRaw: [],
  });

  useEffect(() => {
    if (DATA_MODE !== "json") return;

    let alive = true;

    (async () => {
      try {
        setJsonState((s) => ({ ...s, loading: true, error: null }));

        const res = await fetch(RANKING_JSON_URL, { cache: "no-store" });
        if (!res.ok) throw new Error(`Falha ao carregar JSON: ${res.status} ${res.statusText}`);

        const json = await res.json();
        const mapped = mapRankingJsonToApp(json);
        if (!mapped) throw new Error("JSON inválido (estrutura não reconhecida).");

        if (!alive) return;

        setJsonState({
          loading: false,
          error: null,
          rankingData: mapped.rankingData,
          rankingMeta: mapped.rankingMeta,
          drawsRaw: mapped.drawsRaw,
        });
      } catch (e) {
        if (!alive) return;
        setJsonState((s) => ({
          ...s,
          loading: false,
          error: e?.message || String(e),
        }));
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  const isHydrating = useMemo(() => {
    if (DATA_MODE !== "firestore") return false;
    return !!fsRankingMeta?.hydrating;
  }, [fsRankingMeta]);

  const rankingLoading = DATA_MODE === "json" ? jsonState.loading : fsLoading;
  const rankingError = DATA_MODE === "json" ? jsonState.error : fsError;

  const rankingMeta = DATA_MODE === "json" ? jsonState.rankingMeta : fsRankingMeta;

  const loadingEffective = !!rankingLoading || !!isHydrating;

  const drawsRaw = DATA_MODE === "json" ? jsonState.drawsRaw : fsDrawsRaw;
  const drawsForUi = useMemo(() => (Array.isArray(drawsRaw) ? drawsRaw : []), [drawsRaw]);

  const dataReady = useMemo(() => {
    if (DATA_MODE === "json") return true;
    if (!boundsReady || !dateRangeQuery) return false;
    if (loadingEffective) return false;
    if (rankingError) return false;
    return true;
  }, [boundsReady, dateRangeQuery, loadingEffective, rankingError]);

  const closeHourBucketLocal = useMemo(() => normalizeHourBucket(filters.horario), [filters.horario]);
  const positionsLocal = useMemo(() => normalizePositions(filters.posicao), [filters.posicao]);

  const findGrupoByAnimalLabel = useCallback((animalLabel) => {
    const label = String(animalLabel || "").trim();
    if (!label || label.toLowerCase() === "todos") return null;

    const target = normalizeKey(label);

    for (const b of Array.isArray(BICHO_MAP) ? BICHO_MAP : []) {
      const g = Number(b?.grupo);
      if (!Number.isFinite(g)) continue;

      const lbl = safeAnimalLabel({ grupo: g, animal: b?.animal || "" });
      if (normalizeKey(lbl) === target) return g;
    }

    for (let g = 1; g <= 25; g += 1) {
      const lbl = getLabelByGrupo(g);
      if (lbl && normalizeKey(lbl) === target) return g;
    }

    return null;
  }, []);

  /* =========================
     ✅ Guest Toast (fix)
  ========================= */
  const [guestToast, setGuestToast] = useState("");
  const toastTimerRef = useRef(null);

  const showGuestToast = useCallback((msg) => {
    setGuestToast(String(msg || "Disponível no PRO/VIP."));
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setGuestToast(""), 2400);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    };
  }, []);

  const handleFilterChange = useCallback(
    (name, value) => {
      if (isGuest) {
        showGuestToast("Modo demonstração: filtros estão bloqueados. Faça login para usar.");
        return;
      }

      setFilters((prev) => ({ ...prev, [name]: value }));

      if (name === "animal") {
        const g = findGrupoByAnimalLabel(value);
        setSelectedGrupo(g);
      }
    },
    [findGrupoByAnimalLabel, setFilters, isGuest, showGuestToast]
  );

  const drawsForView = useMemo(() => {
    if (!dataReady) return [];

    const list = Array.isArray(drawsForUi) ? drawsForUi : [];
    if (!list.length) return [];

    const fMes = normalizeKey(filters.mes);
    const fDiaMes = String(filters.diaMes || "").trim();
    const fDiaSemana = String(filters.diaSemana || "").trim();

    const wantMes = fMes && fMes !== "todos" ? MONTH_NAME_TO_MM[fMes] || null : null;

    const wantDiaMes =
      fDiaMes && fDiaMes.toLowerCase() !== "todos" ? String(Number(fDiaMes)).padStart(2, "0") : null;

    const wantDiaSemana = fDiaSemana && fDiaSemana.toLowerCase() !== "todos" ? fDiaSemana : null;

    const wantBucket = closeHourBucketLocal;

    const posSet =
      Array.isArray(positionsLocal) && positionsLocal.length
        ? new Set(positionsLocal.map((n) => Number(n)).filter((n) => Number.isFinite(n)))
        : null;

    const grupoTarget = Number.isFinite(Number(selectedGrupo)) ? Number(selectedGrupo) : null;

    const wantsPositionFilter = String(filters.posicao || "").trim().toLowerCase() !== "todos";
    const wantsGrupoFilter = !!grupoTarget;
    const requiresPrizes = wantsPositionFilter || wantsGrupoFilter;

    return list
      .filter((d) => {
        const ymd = getDrawDate(d);
        if (!ymd) return false;

        const mm = ymd.slice(5, 7);
        const dd = ymd.slice(8, 10);

        if (wantMes && mm !== wantMes) return false;
        if (wantDiaMes && dd !== wantDiaMes) return false;

        if (wantDiaSemana) {
          const wd = ymdToWeekdayShortPT(ymd);
          if (wd !== wantDiaSemana) return false;
        }

        if (wantBucket) {
          const b = normalizeHourBucket(getDrawCloseHour(d));
          if (b !== wantBucket) return false;
        }

        return true;
      })
      .map((d) => {
        const prizes = Array.isArray(d?.prizes) ? d.prizes : null;

        if (requiresPrizes && !prizes) return null;
        if (!prizes) return d;

        let next = prizes;

        if (posSet && posSet.size) {
          next = next.filter((p) => posSet.has(Number(p?.position ?? p?.pos ?? p?.colocacao)));
        }

        if (grupoTarget) {
          next = next.filter((p) => {
            const g =
              Number(p?.grupo) ||
              Number(String(p?.group || p?.grupo2 || "").replace(/^0/, "")) ||
              null;
            return Number(g) === Number(grupoTarget);
          });
        }

        if (!next.length) return null;

        return { ...d, prizes: next };
      })
      .filter(Boolean);
  }, [
    dataReady,
    drawsForUi,
    filters.mes,
    filters.diaMes,
    filters.diaSemana,
    filters.posicao,
    closeHourBucketLocal,
    positionsLocal,
    selectedGrupo,
  ]);

  const hasAnyDrawsView = drawsForView.length > 0;

  const rankingDataGlobalForLabels = useMemo(() => {
    if (!Array.isArray(drawsForUi) || !drawsForUi.length) return [];
    try {
      const built = buildRanking(drawsForUi);
      const arr = Array.isArray(built?.byGrupo)
        ? built.byGrupo
        : Array.isArray(built?.ranking)
        ? built.ranking
        : [];

      return arr.map((r) => ({
        grupo: String(r?.grupo ?? r?.group ?? "").replace(/^0/, ""),
        animal: r?.animal ?? r?.label ?? "",
        total: Number(r?.apar ?? r?.total ?? r?.count ?? 0),
      }));
    } catch {
      return [];
    }
  }, [drawsForUi]);

  const rankingDataForLeftTable = useMemo(() => {
    if (!Array.isArray(drawsForView) || !drawsForView.length) return [];
    try {
      const built = buildRanking(drawsForView);
      const arr = Array.isArray(built?.byGrupo)
        ? built.byGrupo
        : Array.isArray(built?.ranking)
        ? built.ranking
        : [];

      return arr.map((r) => ({
        grupo: String(r?.grupo ?? r?.group ?? "").replace(/^0/, ""),
        animal: r?.animal ?? r?.label ?? "",
        total: Number(r?.apar ?? r?.total ?? r?.count ?? 0),
      }));
    } catch {
      return [];
    }
  }, [drawsForView]);

  const rankingDataForCharts = useMemo(() => {
    const built = buildRanking(drawsForView);
    return Array.isArray(built?.ranking) ? built.ranking : [];
  }, [drawsForView]);

  const palpitesByGrupo = useMemo(() => {
    if (!dataReady || !hasAnyDrawsView) return {};
    try {
      const out = buildPalpiteV2(drawsForView, { closeHourBucket: null });
      return out?.palpitesByGrupo && typeof out.palpitesByGrupo === "object" ? out.palpitesByGrupo : {};
    } catch {
      return {};
    }
  }, [drawsForView, dataReady, hasAnyDrawsView]);

  const options = useMemo(() => {
    const animais = ["Todos"];
    for (let g = 1; g <= 25; g += 1) {
      const lbl = getLabelByGrupo(g);
      animais.push(lbl || `Grupo ${pad2(g)}`);
    }

    // horários disponíveis (RJ) + FEDERAL 20h
    const baseBuckets = new Set();
    if (Array.isArray(drawsForUi) && drawsForUi.length) {
      for (const d of drawsForUi) {
        const b = normalizeHourBucket(getDrawCloseHour(d));
        if (b) baseBuckets.add(b);
      }
    }

    if (isFederal) baseBuckets.add("20h");

    const horarios = Array.from(baseBuckets)
      .sort((a, b) => a.localeCompare(b))
      .map((b) => ({ label: b, value: b }));

    const diasSemana = [
      { label: "Todos", value: "Todos" },
      { label: "Domingo", value: "Dom" },
      { label: "Segunda-Feira", value: "Seg" },
      { label: "Terça-Feira", value: "Ter" },
      { label: "Quarta-Feira", value: "Qua" },
      { label: "Quinta-Feira", value: "Qui" },
      { label: "Sexta-Feira", value: "Sex" },
      { label: "Sábado", value: "Sáb" },
    ];

    const posicoes = [
      { label: "Todos", value: "Todos" },
      { label: "1º", value: "1º" },
      { label: "2º", value: "2º" },
      { label: "3º", value: "3º" },
      { label: "4º", value: "4º" },
      { label: "5º", value: "5º" },
      { label: "6º", value: "6º" },
      { label: "7º", value: "7º" },
    ];

    return {
      animais,
      horarios: [{ label: "Todos", value: "Todos" }, ...horarios],
      diasSemana,
      posicoes,
    };
  }, [drawsForUi, isFederal]);

  const yearsAvailable = useMemo(() => {
    const fromDraws = extractYearsFromDraws(drawsForUi);
    if (fromDraws.length) return fromDraws;

    if (!MIN_DATE || !MAX_DATE) return [];

    const yMin = Number(String(MIN_DATE).slice(0, 4));
    const yMax = Number(String(MAX_DATE).slice(0, 4));
    if (!Number.isFinite(yMin) || !Number.isFinite(yMax)) return [];

    const out = [];
    for (let y = Math.min(yMin, yMax); y <= Math.max(yMin, yMax); y += 1) out.push(y);
    return out;
  }, [drawsForUi, MIN_DATE, MAX_DATE]);

  const applyAllYearsFull = useCallback(() => {
    if (!MIN_DATE || !MAX_DATE) return;
    setSelectedYears([]);
    if (isGuest) return;
    const full = { from: MIN_DATE, to: MAX_DATE };
    setDateRange(full);
    setDateRangeQuery(full);
  }, [MIN_DATE, MAX_DATE, isGuest]);

  const onClearYears = useCallback(() => {
    if (isGuest) {
      showGuestToast("Modo demonstração: período está bloqueado. Faça login para usar.");
      return;
    }
    applyAllYearsFull();
  }, [applyAllYearsFull, isGuest, showGuestToast]);

  const onToggleYear = useCallback(
    (year) => {
      if (isGuest) {
        showGuestToast("Modo demonstração: período está bloqueado. Faça login para usar.");
        return;
      }

      const y = Number(year);
      if (!Number.isFinite(y)) return;

      setSelectedYears((prev) => {
        const has = prev.includes(y);
        const next = has ? prev.filter((k) => k !== y) : [...prev, y];
        next.sort((a, b) => a - b);

        if (!next.length) {
          applyAllYearsFull();
          return [];
        }

        const minY = next[0];
        const maxY = next[next.length - 1];
        const yr = yearRangeToDates(minY, maxY);
        if (yr) {
          setDateRange(yr);
          setDateRangeQuery(yr);
        }

        return next;
      });
    },
    [applyAllYearsFull, isGuest, showGuestToast]
  );

  const kpiItems = useMemo(() => {
    if (!dataReady || !hasAnyDrawsView) {
      return [
        { key: "dias", title: "Qtde Dias de sorteios", value: null, icon: "calendar" },
        { key: "sorteios", title: "Qtde de sorteios", value: null, icon: "ticket" },
      ];
    }

    const diasFromDraws = new Set(drawsForView.map((d) => getDrawDate(d)).filter(Boolean)).size;
    const totalDrawsFromDraws = drawsForView.length;

    return [
      { key: "dias", title: "Qtde Dias de sorteios", value: diasFromDraws, icon: "calendar" },
      { key: "sorteios", title: "Qtde de sorteios", value: totalDrawsFromDraws, icon: "ticket" },
    ];
  }, [drawsForView, dataReady, hasAnyDrawsView]);

  const onSelectGrupo = useCallback(
    (grupoNum) => {
      if (isGuest) {
        showGuestToast("Modo demonstração: seleção de bicho está bloqueada. Faça login para usar.");
        return;
      }

      const g = Number(grupoNum);
      if (!Number.isFinite(g) || g < 1 || g > 25) {
        setSelectedGrupo(null);
        setFilters((prev) => ({ ...prev, animal: "Todos" }));
        return;
      }

      setSelectedGrupo((prev) => {
        const next = prev === g ? null : g;

        if (!next) {
          setFilters((p) => ({ ...p, animal: "Todos" }));
        } else {
          const row = Array.isArray(rankingDataGlobalForLabels)
            ? rankingDataGlobalForLabels.find((r) => Number(String(r?.grupo || "").replace(/^0/, "")) === next)
            : null;

          const label = safeAnimalLabel({ grupo: next, animal: row?.animal || "" });
          setFilters((p) => ({
            ...p,
            animal: label || getLabelByGrupo(next) || "Todos",
          }));
        }

        return next;
      });
    },
    [rankingDataGlobalForLabels, setFilters, isGuest, showGuestToast]
  );

  const onSelectPosicao = useCallback(
    (posNumberString) => {
      if (isGuest) {
        showGuestToast("Modo demonstração: filtro por posição está bloqueado. Faça login para usar.");
        return;
      }

      const raw = String(posNumberString ?? "").trim();
      const m = raw.match(/^(\d+)/);
      const n = m ? Number(m[1]) : NaN;

      if (!Number.isFinite(n) || n < 1 || n > 7) return;
      setFilters((prev) => ({ ...prev, posicao: `${n}º` }));
    },
    [setFilters, isGuest, showGuestToast]
  );

  const boundsMessage = useMemo(() => {
    if (bounds.loading) return "Carregando período disponível...";
    if (!boundsReady) return bounds.error || "Não foi possível obter bounds reais.";
    return null;
  }, [bounds.loading, boundsReady, bounds.error]);

  const uiBlockedByBounds = DATA_MODE === "firestore" ? !boundsReady : false;

  const emptyForRange = useMemo(() => {
    if (!dataReady) return false;
    return !hasAnyDrawsView;
  }, [dataReady, hasAnyDrawsView]);

  const indexErrorHint = useMemo(() => {
    return (
      "Os índices já foram criados e estão como Ativado. Se este erro aparecer, normalmente é um destes cenários:\n" +
      "1) Cache/aba antiga: faça Ctrl+Shift+R ou teste em aba anônima.\n" +
      "2) Query ainda está batendo em 'date' ou em campo diferente do esperado (ymd/uf/lottery_key/close_hour).\n" +
      "3) Algum documento não tem o campo usado no filtro (ex.: ymd ausente em parte da base).\n" +
      "4) O filtro de hora está em formato divergente do salvo (ex.: '11h' vs '11:10')."
    );
  }, []);

  const selectedPosition = useMemo(() => {
    const n = Number(String(filters.posicao || "").replace(/\D/g, ""));
    return Number.isFinite(n) && n >= 1 && n <= 7 ? n : null;
  }, [filters.posicao]);

  useEffect(() => {
    const reqId = (bannerReqIdRef.current += 1);

    const run = async () => {
      if (!isValidGrupo(selectedGrupo)) {
        setBannerSrc(DEFAULT_BANNER_SRC);
        return;
      }

      const cand128 =
        typeof getImgFromGrupoFromMap === "function" ? getImgFromGrupoFromMap(Number(selectedGrupo), 128) : "";

      const candBase =
        typeof getImgFromGrupoFromMap === "function" ? getImgFromGrupoFromMap(Number(selectedGrupo)) : "";

      try {
        if (cand128) {
          await preloadImage(cand128);
          if (bannerReqIdRef.current === reqId) setBannerSrc(cand128);
          return;
        }
      } catch {}

      try {
        if (candBase) {
          await preloadImage(candBase);
          if (bannerReqIdRef.current === reqId) setBannerSrc(candBase);
          return;
        }
      } catch {}

      if (bannerReqIdRef.current === reqId) setBannerSrc(DEFAULT_BANNER_SRC);
    };

    run();
  }, [selectedGrupo]);

  useEffect(() => {
    if (isGuest) return;

    safeWriteJSON(DASH_STATE_KEY, {
      selectedGrupo,
      selectedYears,
      dateRange,
      dateRangeQuery,
    });
  }, [selectedGrupo, selectedYears, dateRange, dateRangeQuery, isGuest]);

  const hydratingBox = useMemo(() => {
    if (!isHydrating) return null;

    const from = dateFrom || queryDate || MIN_DATE || "";
    const to = dateTo || queryDate || MAX_DATE || "";

    return (
      <PremiumInfoBox
        title="Carregando detalhes do período"
        description='Você selecionou um intervalo grande ("Todos"). O sistema está hidratando os prizes para garantir estatística correta (sem “meio certo”).'
        extra={`Intervalo: ${from} → ${to}\nAguarde concluir para liberar KPIs, ranking filtrado e gráficos.`}
      />
    );
  }, [isHydrating, dateFrom, dateTo, queryDate, MIN_DATE, MAX_DATE]);

  const demoBox = useMemo(() => {
    if (!isGuest) return null;
    const from = MIN_DATE || "2022-01-01";
    const to = MAX_DATE || "—";

    return (
      <PremiumInfoBox
        title="Modo Demonstração (sem login)"
        description="Você está vendo o painel geral da base (desde 2022). Para proteger as funcionalidades, filtros e ações estão bloqueados."
        extra={
          `Período: ${from} → ${to}\n` +
          "Bloqueado no DEMO:\n" +
          "• Alterar filtros e período\n" +
          "• Selecionar bicho/posição\n" +
          "• Ações premium (Top 3 completo, Busca, Centenas+, Downloads)\n" +
          "Faça login para liberar."
        }
      />
    );
  }, [isGuest, MIN_DATE, MAX_DATE]);

  return (
    <div className="dashRoot">
      <aside className="dashLeft">
        <LeftRankingTable
          locationLabel={locationLabel}
          loading={uiBlockedByBounds ? true : loadingEffective}
          error={uiBlockedByBounds ? null : rankingError}
          data={uiBlockedByBounds || !dataReady ? [] : rankingDataForLeftTable}
          selectedGrupo={selectedGrupo}
          onSelectGrupo={onSelectGrupo}
          palpitesByGrupo={uiBlockedByBounds || !dataReady ? {} : palpitesByGrupo}
        />
      </aside>

      <main className="dashMain">
        <section className="dashTop" style={{ position: "relative", zIndex: 1 }}>
          <div className="dashBanner" style={{ position: "relative", zIndex: 1, pointerEvents: "none" }}>
            <img
              src={bannerSrc}
              alt="Banner"
              loading="eager"
              decoding="async"
              style={{ pointerEvents: "none" }}
              onError={() => setBannerSrc(DEFAULT_BANNER_SRC)}
            />
          </div>

          <div className="dashTopRight" style={{ position: "relative", zIndex: 5, pointerEvents: "auto" }}>
            {uiBlockedByBounds ? (
              <PremiumTopRightSkeleton message={boundsMessage} />
            ) : (
              <>
                {demoBox}

                {MIN_DATE && MAX_DATE && dateRange ? (
                  <div style={{ position: "relative", zIndex: 10, pointerEvents: "auto" }}>
                    <div style={{ position: "relative" }}>
                      <div style={isGuest ? { opacity: 0.55, filter: "grayscale(0.2)" } : null}>
                        <DateRangeControl
                          value={dateRange}
                          onChange={applyDateRange}
                          minDate={MIN_DATE}
                          maxDate={MAX_DATE}
                          years={yearsAvailable}
                          selectedYears={selectedYears}
                          onToggleYear={onToggleYear}
                          onClearYears={onClearYears}
                        />
                      </div>

                      {isGuest ? (
                        <div
                          role="button"
                          aria-label="Período bloqueado no modo demonstração"
                          onClick={() => showGuestToast("Modo demonstração: período está bloqueado. Faça login para usar.")}
                          style={{
                            position: "absolute",
                            inset: 0,
                            cursor: "not-allowed",
                            background: "transparent",
                          }}
                        />
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <PremiumInfoBox
                    title="Período indisponível"
                    description={boundsMessage || "Não foi possível resolver o intervalo de datas."}
                    extra="Se isso persistir, valide se todos os docs possuem o campo 'ymd' e se a coleção consultada é a mesma do app."
                  />
                )}

                {isHydrating ? (
                  hydratingBox
                ) : (
                  <KpiCards
                    items={kpiItems}
                    drawsRaw={dataReady ? drawsForView : []}
                    selectedGrupo={selectedGrupo}
                    selectedAnimalLabel={filters.animal}
                    selectedPosition={selectedPosition}
                  />
                )}
              </>
            )}
          </div>
        </section>

        <section className="dashFilters">
          <div style={{ position: "relative" }}>
            <div style={isGuest ? { opacity: 0.65, filter: "grayscale(0.2)" } : null}>
              <FiltersBar filters={filters} onChange={handleFilterChange} options={options} />
            </div>

            {isGuest ? (
              <div
                role="button"
                aria-label="Filtros bloqueados no modo demonstração"
                onClick={() => showGuestToast("Modo demonstração: filtros bloqueados. Faça login para usar.")}
                style={{
                  position: "absolute",
                  inset: 0,
                  cursor: "not-allowed",
                  background: "transparent",
                }}
              />
            ) : null}
          </div>

          {guestToast ? (
            <div
              style={{
                marginTop: 10,
                border: "1px solid rgba(201,168,62,0.25)",
                background: "rgba(201,168,62,0.10)",
                color: "rgba(255,255,255,0.92)",
                borderRadius: 12,
                padding: "10px 12px",
                fontWeight: 850,
                letterSpacing: 0.15,
                boxShadow: "0 16px 44px rgba(0,0,0,0.55)",
              }}
            >
              {guestToast}
            </div>
          ) : null}
        </section>

        <section className="dashCharts">
          {uiBlockedByBounds ? (
            <PremiumInfoBox
              title="Painel aguardando período real"
              description="O sistema precisa identificar min/max reais no Firestore para garantir consistência estatística. Assim evitamos gráficos zerados e rankings incorretos."
              extra="Assim que os bounds forem resolvidos, o painel libera automaticamente os gráficos e o ranking."
            />
          ) : rankingError && isIndexErrorMessage(rankingError) ? (
            <PremiumInfoBox
              title="Falha ao executar consulta (Firestore)"
              description="O Firestore retornou um erro típico de índice/consulta composta. Como os índices já estão criados, este erro costuma ser cache, query antiga ou divergência de campos."
              extra={indexErrorHint}
            />
          ) : isHydrating ? (
            hydratingBox
          ) : emptyForRange ? (
            <PremiumInfoBox
              title="Sem registros no período / filtro atual"
              description="O período selecionado retornou zero draws. Ajuste o intervalo de datas ou filtros (horário, mês, dia, etc.) para voltar a exibir estatísticas."
              extra={`Dica rápida: ajuste o intervalo dentro de ${MIN_DATE} a ${MAX_DATE}.`}
            />
          ) : (
            <ChartsGrid
              drawsRaw={drawsForView}
              drawsRawGlobal={drawsForUi}
              rankingData={rankingDataForCharts}
              rankingMeta={rankingMeta}
              filters={filters}
              loading={loadingEffective}
              error={rankingError}
              selectedGrupo={selectedGrupo}
              onSelectPosicao={onSelectPosicao}
            />
          )}
        </section>
      </main>
    </div>
  );
}

