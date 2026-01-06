// src/pages/Dashboard/Dashboard.jsx
import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import "./dashboard.css";

import LeftRankingTable from "./components/LeftRankingTable";
import FiltersBar from "./components/FiltersBar";
import KpiCards from "./components/KpiCards";
import ChartsGrid from "./components/ChartsGrid";
import DateRangeControl from "./components/DateRangeControl";

import { useKingRanking } from "../../hooks/useKingRanking";
import { getAnimalLabel as getAnimalLabelFromMap } from "../../constants/bichoMap";
import { buildRanking } from "../../utils/buildRanking";

// ✅ bounds reais da base (min/max)
import { getKingBoundsByUf } from "../../services/kingResultsService";

/* =========================
   DATA MODE
========================= */
const DATA_MODE = "firestore";
const RANKING_JSON_URL = "/data/ranking_current.json";

/* =========================
   Helpers (UI -> Bucket)
========================= */

function normalizeHourBucket(h) {
  const s = String(h || "").trim();
  if (!s || s.toLowerCase() === "todos") return null;

  const m1 = s.match(/^(\d{1,2})h$/i);
  if (m1) return `${String(m1[1]).padStart(2, "0")}h`;

  const m2 = s.match(/^(\d{1,2}):(\d{2})$/);
  if (m2) return `${String(m2[1]).padStart(2, "0")}h`;

  return null;
}

/**
 * ✅ POSIÇÃO (UI -> hook)
 * Regras:
 * - "Todos" => [1..7] (escopo do produto)
 * - "1º" => [1], "2º" => [2], ...
 * - ✅ robusto: aceita "1" também
 */
function normalizePositions(pos) {
  const s = String(pos || "").trim();
  if (!s || s.toLowerCase() === "todos") return [1, 2, 3, 4, 5, 6, 7];

  // aceita "1º" e "1"
  const m = s.match(/^(\d+)\s*º?$/);
  if (m) {
    const n = Number(m[1]);
    return Number.isFinite(n) ? [n] : [1];
  }

  // fallback seguro
  return [1, 2, 3, 4, 5, 6, 7];
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

/** ✅ valida YYYY-MM-DD */
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

function getDrawDate(d) {
  if (!d) return null;
  const raw =
    d.date ?? d.ymd ?? d.draw_date ?? d.close_date ?? d.data ?? d.dt ?? null;
  return normalizeToYMD(raw);
}

function getDrawCloseHour(d) {
  if (!d) return "";
  return String(d.close_hour ?? d.closeHour ?? d.hour ?? d.hora ?? "").trim();
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

  const dt = new Date(y, mo - 1, d);
  const idx = dt.getDay();

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

function safeAnimalLabel({ grupo, animal }) {
  try {
    if (typeof getAnimalLabelFromMap === "function") {
      const out = getAnimalLabelFromMap({ grupo, animal });
      const s = String(out ?? "").trim();
      if (s) return s;
    }
  } catch {}
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
    totalDays:
      Number(
        totals.days ||
          totals.dias ||
          totals.uniqueDays ||
          totals.unique_days ||
          0
      ) || 0,
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
      <div style={{ fontWeight: 1000, letterSpacing: 0.25, marginBottom: 6 }}>
        {title}
      </div>
      <div style={{ opacity: 0.86, lineHeight: 1.35, fontWeight: 700 }}>
        {description}
      </div>
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

/* =========================
   Index detection (mensagem)
========================= */

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

export default function Dashboard() {
  const [filters, setFilters] = useState({
    mes: "Todos",
    diaMes: "Todos",
    diaSemana: "Todos",
    horario: "Todos",
    animal: "Todos",
    posicao: "Todos", // ✅ não trava mais em 1º
  });

  const [selectedGrupo, setSelectedGrupo] = useState(null);

  const handleFilterChange = useCallback((name, value) => {
    setFilters((prev) => ({ ...prev, [name]: value }));
    if (name === "animal") setSelectedGrupo(null);
  }, []);

  const locationLabel = "Rio de Janeiro, RJ, Brasil";
  const uf = "PT_RIO";

  const [bounds, setBounds] = useState({
    loading: DATA_MODE === "firestore",
    minDate: null,
    maxDate: null,
    error: null,
  });

  const didInitRangeFromBoundsRef = useRef(false);
  const [dateRange, setDateRange] = useState(null);
  const [selectedYears, setSelectedYears] = useState([]);

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
          setDateRange({ from: maxYmd, to: maxYmd });
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
  }, [uf]);

  const MIN_DATE = bounds.minDate;
  const MAX_DATE = bounds.maxDate;
  const boundsReady = !!(MIN_DATE && MAX_DATE && !bounds.loading);

  useEffect(() => {
    if (!boundsReady || !MAX_DATE) return;

    const f = dateRange?.from;
    const t = dateRange?.to;

    if (!isISODate(f) || !isISODate(t)) {
      if (f !== MAX_DATE || t !== MAX_DATE) {
        setDateRange({ from: MAX_DATE, to: MAX_DATE });
      }
      return;
    }

    const clamped = clampRangeToBounds({ from: f, to: t }, MIN_DATE, MAX_DATE);
    if (!clamped) return;

    if (clamped.from !== f || clamped.to !== t) {
      setDateRange(clamped);
    }
  }, [boundsReady, MIN_DATE, MAX_DATE, dateRange?.from, dateRange?.to]);

  const applyDateRange = useCallback(
    (next) => {
      if (!boundsReady || !MIN_DATE || !MAX_DATE) {
        setDateRange(next);
        return;
      }

      const clamped = clampRangeToBounds(next, MIN_DATE, MAX_DATE);
      if (!clamped) {
        setSelectedYears([]);
        setDateRange({ from: MAX_DATE, to: MAX_DATE });
        return;
      }

      if (clamped.from === clamped.to) setSelectedYears([]);

      setDateRange(clamped);
    },
    [boundsReady, MIN_DATE, MAX_DATE]
  );

  const queryDate = useMemo(() => {
    if (dateRange?.from && dateRange?.to && dateRange.from === dateRange.to) {
      return dateRange.from;
    }
    return null;
  }, [dateRange]);

  const dateFrom = useMemo(() => {
    if (!dateRange?.from || !dateRange?.to) return null;
    if (dateRange.from === dateRange.to) return null;
    return dateRange.from;
  }, [dateRange]);

  const dateTo = useMemo(() => {
    if (!dateRange?.from || !dateRange?.to) return null;
    if (dateRange.from === dateRange.to) return null;
    return dateRange.to;
  }, [dateRange]);

  const closeHourBucket = useMemo(
    () => normalizeHourBucket(filters.horario),
    [filters.horario]
  );

  const positions = useMemo(
    () => normalizePositions(filters.posicao),
    [filters.posicao]
  );

  const canQueryFirestore =
    DATA_MODE === "firestore" ? !!(boundsReady && dateRange) : true;

  const {
    loading: fsLoading,
    error: fsError,
    data: fsRankingData,
    meta: fsRankingMeta,
    drawsRaw: fsDrawsRaw,
  } = useKingRanking({
    uf,
    date: canQueryFirestore ? queryDate : null,
    dateFrom: canQueryFirestore ? dateFrom : null,
    dateTo: canQueryFirestore ? dateTo : null,
    closeHourBucket,
    positions,
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
        if (!res.ok) {
          throw new Error(`Falha ao carregar JSON: ${res.status} ${res.statusText}`);
        }

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

  const rankingLoading = DATA_MODE === "json" ? jsonState.loading : fsLoading;
  const rankingError = DATA_MODE === "json" ? jsonState.error : fsError;
  const rankingData = DATA_MODE === "json" ? jsonState.rankingData : fsRankingData;
  const rankingMeta = DATA_MODE === "json" ? jsonState.rankingMeta : fsRankingMeta;
  const drawsRaw = DATA_MODE === "json" ? jsonState.drawsRaw : fsDrawsRaw;

  const drawsForUi = useMemo(() => {
    return Array.isArray(drawsRaw) ? drawsRaw : [];
  }, [drawsRaw]);

  const dataReady = useMemo(() => {
    if (DATA_MODE === "json") return true;
    if (!boundsReady || !dateRange) return false;
    if (rankingLoading) return false;
    if (rankingError) return false;
    return true;
  }, [boundsReady, dateRange, rankingLoading, rankingError]);

  /**
   * ✅ FILTROS LOCAIS (Mês/Dia do mês/Dia semana)
   * Importante: isso precisa refletir em KPIs, EmptyState e Charts.
   */
  const drawsForView = useMemo(() => {
    const list = Array.isArray(drawsForUi) ? drawsForUi : [];
    if (!list.length) return [];

    const fMes = normalizeKey(filters.mes);
    const fDiaMes = String(filters.diaMes || "").trim();
    const fDiaSemana = String(filters.diaSemana || "").trim();

    const wantMes =
      fMes && fMes !== "todos" ? MONTH_NAME_TO_MM[fMes] || null : null;

    const wantDiaMes =
      fDiaMes && fDiaMes.toLowerCase() !== "todos"
        ? String(Number(fDiaMes)).padStart(2, "0")
        : null;

    const wantDiaSemana =
      fDiaSemana && fDiaSemana.toLowerCase() !== "todos" ? fDiaSemana : null;

    return list.filter((d) => {
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

      return true;
    });
  }, [drawsForUi, filters.mes, filters.diaMes, filters.diaSemana]);

  const hasAnyDrawsView = drawsForView.length > 0;

  const rankingDataForTable = useMemo(() => {
    const built = buildRanking(drawsForView);
    const base = Array.isArray(built?.ranking) ? built.ranking : [];

    const fAnimal = String(filters.animal || "").trim();
    if (!fAnimal || fAnimal.toLowerCase() === "todos") return base;

    const target = normalizeKey(fAnimal);

    const match = base.find((r) => {
      const gNum = Number(String(r?.grupo || "").replace(/^0/, ""));
      const grupo = Number.isFinite(gNum) ? gNum : 0;

      const label = safeAnimalLabel({ grupo, animal: r?.animal });
      return normalizeKey(label) === target;
    });

    if (!match) return [];

    const gMatch = String(match.grupo || "").replace(/^0/, "");
    return base.filter((r) => String(r?.grupo || "").replace(/^0/, "") === gMatch);
  }, [drawsForView, filters.animal]);

  const options = useMemo(() => {
    const list = Array.isArray(rankingData) ? rankingData : [];

    const setAnimais = new Set();
    for (const r of list) {
      const gNum = Number(r?.grupo);
      const grupo = Number.isFinite(gNum)
        ? gNum
        : Number(String(r?.grupo || "").replace(/^0/, ""));

      const label = safeAnimalLabel({ grupo, animal: r?.animal });
      const clean = String(label || "").trim();
      if (clean) setAnimais.add(clean);
    }

    const setBuckets = new Set();
    if (Array.isArray(drawsForUi) && drawsForUi.length) {
      for (const d of drawsForUi) {
        const b = normalizeHourBucket(getDrawCloseHour(d));
        if (b) setBuckets.add(b);
      }
    }

    const horarios = Array.from(setBuckets)
      .sort((a, b) => a.localeCompare(b))
      .map((b) => ({ label: b, value: b }));

    const diasSemana = [
      { label: "Todos", value: "Todos" },
      { label: "Domingo", value: "Dom" },
      { label: "Segunda", value: "Seg" },
      { label: "Terça", value: "Ter" },
      { label: "Quarta", value: "Qua" },
      { label: "Quinta", value: "Qui" },
      { label: "Sexta", value: "Sex" },
      { label: "Sábado", value: "Sáb" },
    ];

    // ✅ UI coerente: "Todos" + 1º..7º
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
      animais: Array.from(setAnimais),
      horarios: [{ label: "Todos", value: "Todos" }, ...horarios],
      diasSemana,
      posicoes,
    };
  }, [rankingData, drawsForUi]);

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

  const onClearYears = useCallback(() => {
    if (!MAX_DATE) return;
    setSelectedYears([]);
    setDateRange({ from: MAX_DATE, to: MAX_DATE });
  }, [MAX_DATE]);

  const onToggleYear = useCallback(
    (year) => {
      if (!MIN_DATE || !MAX_DATE) return;

      const y = Number(year);
      if (!Number.isFinite(y)) return;

      setSelectedYears((prev) => {
        const has = prev.includes(y);
        const next = has ? prev.filter((k) => k !== y) : [...prev, y];
        next.sort((a, b) => a - b);

        if (!next.length) {
          setDateRange({ from: MAX_DATE, to: MAX_DATE });
          return [];
        }

        const minY = next[0];
        const maxY = next[next.length - 1];
        const yr = yearRangeToDates(minY, maxY);

        if (yr) applyDateRange(yr);

        return next;
      });
    },
    [MIN_DATE, MAX_DATE, applyDateRange]
  );

  /**
   * ✅ KPIs devem refletir o MESMO recorte de visualização (drawsForView)
   * - (Hook já filtrou por período/hora/posição; aqui aplicamos mês/dia/diaSemana)
   */
  const kpiItems = useMemo(() => {
    if (!dataReady || !hasAnyDrawsView) {
      return [
        { key: "dias", title: "Qtde Dias de sorteio", value: null, icon: "calendar" },
        { key: "sorteios", title: "Qtde de sorteios", value: null, icon: "ticket" },
      ];
    }

    const diasFromDraws = new Set(
      drawsForView.map((d) => getDrawDate(d)).filter(Boolean)
    ).size;

    const totalDrawsFromDraws = drawsForView.length;

    return [
      { key: "dias", title: "Qtde Dias de sorteio", value: diasFromDraws, icon: "calendar" },
      { key: "sorteios", title: "Qtde de sorteios", value: totalDrawsFromDraws, icon: "ticket" },
    ];
  }, [drawsForView, dataReady, hasAnyDrawsView]);

  const onSelectGrupo = useCallback((grupoNum) => {
    const g = Number(grupoNum);
    if (!Number.isFinite(g) || g < 1 || g > 25) {
      setSelectedGrupo(null);
      return;
    }
    setSelectedGrupo((prev) => (prev === g ? null : g));
  }, []);

  /**
   * ✅ Clique no gráfico de "Posição" (ChartsGrid)
   * ✅ robusto: aceita "1" e "1º" e limita 1..7
   */
  const onSelectPosicao = useCallback((posNumberString) => {
    const raw = String(posNumberString ?? "").trim();
    const m = raw.match(/^(\d+)\s*º?$/);
    const n = m ? Number(m[1]) : NaN;

    if (!Number.isFinite(n) || n < 1 || n > 7) return;
    setFilters((prev) => ({ ...prev, posicao: `${n}º` }));
  }, []);

  const boundsMessage = useMemo(() => {
    if (bounds.loading) return "Carregando período disponível...";
    if (!boundsReady) return bounds.error || "Não foi possível obter bounds reais.";
    return null;
  }, [bounds.loading, boundsReady, bounds.error]);

  const uiBlockedByBounds = DATA_MODE === "firestore" ? !boundsReady : false;

  // ✅ Agora o "vazio" respeita filtros locais (mês/dia/diaSemana)
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

  return (
    <div className="dashRoot">
      <aside className="dashLeft">
        <LeftRankingTable
          locationLabel={locationLabel}
          loading={uiBlockedByBounds ? true : rankingLoading}
          error={uiBlockedByBounds ? null : rankingError}
          data={uiBlockedByBounds ? [] : rankingDataForTable}
          selectedGrupo={selectedGrupo}
          onSelectGrupo={onSelectGrupo}
        />
      </aside>

      <main className="dashMain">
        <section className="dashTop">
          <div className="dashBanner">
            <img
              src="https://images.unsplash.com/photo-1546182990-dffeafbe841d?auto=format&fit=crop&w=1400&q=80"
              alt="Banner"
              loading="lazy"
            />
          </div>

          <div className="dashTopRight">
            {uiBlockedByBounds ? (
              <PremiumTopRightSkeleton message={boundsMessage} />
            ) : (
              <>
                {MIN_DATE && MAX_DATE && dateRange ? (
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
                ) : (
                  <PremiumInfoBox
                    title="Período indisponível"
                    description={
                      boundsMessage || "Não foi possível resolver o intervalo de datas."
                    }
                    extra="Se isso persistir, valide se todos os docs possuem o campo 'ymd' e se a coleção consultada é a mesma do app."
                  />
                )}

                <KpiCards items={kpiItems} drawsRaw={dataReady ? drawsForView : []} />
              </>
            )}
          </div>
        </section>

        <section className="dashFilters">
          <FiltersBar filters={filters} onChange={handleFilterChange} options={options} />
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
          ) : emptyForRange ? (
            <PremiumInfoBox
              title="Sem registros no período / filtro atual"
              description="O período selecionado retornou zero draws. Ajuste o intervalo de datas ou filtros (horário, mês, dia, etc.) para voltar a exibir estatísticas."
              extra={`Dica rápida: ajuste o intervalo dentro de ${MIN_DATE} a ${MAX_DATE}.`}
            />
          ) : (
            <ChartsGrid
              drawsRaw={drawsForView}
              rankingData={rankingDataForTable}
              rankingMeta={rankingMeta}
              filters={filters}
              loading={rankingLoading}
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
