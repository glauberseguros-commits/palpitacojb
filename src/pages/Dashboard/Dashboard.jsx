// src/pages/Dashboard/Dashboard.jsx
import React, { useEffect, useMemo, useState } from "react";
import "./dashboard.css";

import LeftRankingTable from "./components/LeftRankingTable";
import FiltersBar from "./components/FiltersBar";
import KpiCards from "./components/KpiCards";
import ChartsGrid from "./components/ChartsGrid";

import { useKingRanking } from "../../hooks/useKingRanking";

/* =========================
   Helpers (UI -> Query)
========================= */

// "14h" -> "14:00"  |  "14:09" mantém "14:09"
function normalizeCloseHour(h) {
  const s = String(h || "").trim();
  if (!s || s.toLowerCase() === "todos") return null;

  const m1 = s.match(/^(\d{1,2})h$/i);
  if (m1) return `${String(m1[1]).padStart(2, "0")}:00`;

  const m2 = s.match(/^(\d{1,2}):(\d{2})$/);
  if (m2) return `${String(m2[1]).padStart(2, "0")}:${m2[2]}`;

  return s;
}

// "1º" -> [1] | "Todos" -> null | "1,2,3" -> [1,2,3]
function normalizePositions(pos) {
  const s = String(pos || "").trim();
  if (!s || s.toLowerCase() === "todos") return null;

  const m = s.match(/^(\d+)\s*º$/);
  if (m) return [Number(m[1])];

  const r = s.match(/^(\d+)\s*-\s*(\d+)$/);
  if (r) {
    const a = Number(r[1]);
    const b = Number(r[2]);
    if (Number.isFinite(a) && Number.isFinite(b) && a <= b) {
      return Array.from({ length: b - a + 1 }, (_, i) => a + i);
    }
  }

  const parts = s.split(",").map((x) => Number(String(x).trim()));
  const clean = parts.filter((n) => Number.isFinite(n));
  return clean.length ? clean : null;
}

// monta YYYY-MM-DD a partir de "Mês + Dia do mês + Ano"
function buildDateFromFilters({ mes, diaMes }, year = 2025) {
  if (!mes || mes === "Todos") return null;
  if (!diaMes || diaMes === "Todos") return null;

  const monthMap = {
    Janeiro: "01",
    Fevereiro: "02",
    Março: "03",
    Abril: "04",
    Maio: "05",
    Junho: "06",
    Julho: "07",
    Agosto: "08",
    Setembro: "09",
    Outubro: "10",
    Novembro: "11",
    Dezembro: "12",
  };

  const mm = monthMap[String(mes)] || null;
  const dd = String(diaMes).padStart(2, "0");
  if (!mm) return null;

  return `${year}-${mm}-${dd}`;
}

// monta {dateFrom,dateTo} a partir de "Mês + Ano" (para modo range)
// OBS: por enquanto dateTo vai até 29 para bater com a base que você importou (01..29).
function buildRangeFromMonth(mes, year = 2025) {
  if (!mes || mes === "Todos") return null;

  const monthMap = {
    Janeiro: "01",
    Fevereiro: "02",
    Março: "03",
    Abril: "04",
    Maio: "05",
    Junho: "06",
    Julho: "07",
    Agosto: "08",
    Setembro: "09",
    Outubro: "10",
    Novembro: "11",
    Dezembro: "12",
  };

  const mm = monthMap[String(mes)] || null;
  if (!mm) return null;

  return {
    dateFrom: `${year}-${mm}-01`,
    dateTo: `${year}-${mm}-29`,
  };
}

// auditoria: conta occurrences por grupo diretamente dos drawsRaw
function pad2(n) {
  return String(n).padStart(2, "0");
}

function countByGrupoFromDraws(draws) {
  const map = new Map();
  let total = 0;

  for (const d of draws || []) {
    const prizes = Array.isArray(d?.prizes) ? d.prizes : [];
    for (const p of prizes) {
      const gRaw = p?.grupo ?? p?.group;
      const gNum = Number(gRaw);
      if (!Number.isFinite(gNum) || gNum < 1 || gNum > 25) continue;
      const g = pad2(gNum);
      map.set(g, (map.get(g) || 0) + 1);
      total += 1;
    }
  }

  const rows = Array.from({ length: 25 }, (_, i) => {
    const g = pad2(i + 1);
    return { grupo: g, raw: map.get(g) || 0 };
  });

  return { rows, total };
}

function diffBuiltVsRaw(rankingRows, rawRows) {
  const builtMap = new Map();
  for (const r of rankingRows || []) {
    const g = pad2(Number(r.grupo));
    builtMap.set(g, Number(r.total || 0));
  }

  const rawMap = new Map();
  for (const r of rawRows || []) {
    rawMap.set(String(r.grupo), Number(r.raw || 0));
  }

  return Array.from({ length: 25 }, (_, i) => {
    const grupo = pad2(i + 1);
    const built = builtMap.get(grupo) ?? 0;
    const raw = rawMap.get(grupo) ?? 0;
    const delta = built - raw;
    return { grupo, built, raw, delta, status: delta === 0 ? "OK" : "DIF" };
  });
}

export default function Dashboard() {
  // ✅ já nasce casando com o que foi importado (Dez/29)
  const [filters, setFilters] = useState({
    mes: "Dezembro",
    diaMes: "29",
    diaSemana: "Todos",
    horario: "Todos", // se quiser “14h”, coloque "14h"
    animal: "Todos",
    posicao: "Todos",
  });

  const handleFilterChange = (name, value) => {
    setFilters((prev) => ({ ...prev, [name]: value }));
  };

  const options = useMemo(() => {
    return {};
  }, []);

  const locationLabel = "Rio de Janeiro, RJ, Brasil";

  // ✅ UF correta (igual ao Firestore)
  const uf = "PT_RIO";

  // Por enquanto fixo em 2025 (seu range importado)
  const activeYear = 2025;

  const queryDate = useMemo(
    () => buildDateFromFilters(filters, activeYear),
    [filters, activeYear]
  );

  // range entra automaticamente quando diaMes for "Todos"
  const monthRange = useMemo(
    () => buildRangeFromMonth(filters.mes, activeYear),
    [filters.mes, activeYear]
  );

  const dateFrom = filters.diaMes === "Todos" ? monthRange?.dateFrom || null : null;
  const dateTo = filters.diaMes === "Todos" ? monthRange?.dateTo || null : null;

  const closeHour = useMemo(
    () => normalizeCloseHour(filters.horario),
    [filters.horario]
  );

  const positions = useMemo(
    () => normalizePositions(filters.posicao),
    [filters.posicao]
  );

  const {
    loading: rankingLoading,
    error: rankingError,
    data: rankingData,
    meta: rankingMeta,
    drawsRaw,
  } = useKingRanking({
    uf,
    date: queryDate,     // mantém compatibilidade (dia único)
    dateFrom,            // ativa range quando diaMes === "Todos"
    dateTo,
    closeHour,
    positions,
  });

  // ✅ AUDITORIA (linha a linha 01..25)
  useEffect(() => {
    if (rankingLoading || rankingError) return;
    if (!Array.isArray(drawsRaw) || !drawsRaw.length) return;

    const raw = countByGrupoFromDraws(drawsRaw);
    const diffs = diffBuiltVsRaw(rankingData, raw.rows);

    console.group("AUDITORIA — Contagem por Grupo (01..25)");
    console.log("mode:", rankingMeta?.mode);
    console.log(
      "period:",
      rankingMeta?.mode === "range"
        ? `${rankingMeta?.dateFrom} -> ${rankingMeta?.dateTo}`
        : rankingMeta?.date
    );
    console.log("totalDraws(meta):", rankingMeta?.totalDraws, "drawsRaw:", drawsRaw.length);
    console.log("meta.totalOcorrencias:", rankingMeta?.totalOcorrencias);
    console.log("raw.total:", raw.total);
    console.table(diffs);
    console.log("DIFs:", diffs.filter((d) => d.status === "DIF").length);
    console.groupEnd();
  }, [rankingLoading, rankingError, drawsRaw, rankingData, rankingMeta]);

  const kpiItems = useMemo(() => {
    // Agora já dá para ter KPIs reais usando meta
    const totalDraws = Number(rankingMeta?.totalDraws || 0);

    // "dias" real (simplificado): quantidade de dias distintos nos drawsRaw
    const dias =
      Array.isArray(drawsRaw) && drawsRaw.length
        ? new Set(drawsRaw.map((d) => d?.date).filter(Boolean)).size
        : 0;

    if (!Array.isArray(rankingData) || !rankingData.length) {
      return [
        { key: "dias", title: "Qtde Dias de sorteio", value: dias || 0, icon: "calendar" },
        { key: "sorteios", title: "Qtde de sorteios", value: totalDraws || 0, icon: "ticket" },
      ];
    }

    return [
      { key: "dias", title: "Qtde Dias de sorteio", value: dias || 0, icon: "calendar" },
      { key: "sorteios", title: "Qtde de sorteios", value: totalDraws || 0, icon: "ticket" },
    ];
  }, [rankingData, rankingMeta, drawsRaw]);

  const dateLabel =
    filters.diaMes === "Todos"
      ? (dateFrom && dateTo ? `${dateFrom} → ${dateTo}` : "Selecione Mês")
      : (queryDate || "Selecione Mês + Dia");

  return (
    <div className="dashRoot">
      <aside className="dashLeft">
        <LeftRankingTable
          locationLabel={locationLabel}
          loading={rankingLoading}
          error={rankingError}
          data={rankingData}
        />
      </aside>

      <main className="dashMain" style={{ minHeight: 0, overflow: "hidden" }}>
        <section className="dashTop">
          <div className="dashBanner">
            <img
              src="https://images.unsplash.com/photo-1546182990-dffeafbe841d?auto=format&fit=crop&w=1400&q=80"
              alt="Banner"
            />
            <div
              style={{
                position: "absolute",
                inset: 0,
                background:
                  "linear-gradient(90deg, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.30) 55%, rgba(0,0,0,0.00) 100%)",
                pointerEvents: "none",
              }}
            />
          </div>

          <div className="dashTopRight">
            <div className="dashDateRow">
              <div className="dashDateBox">{dateLabel}</div>
              <div className="dashDateBox">{closeHour || "Todos horários"}</div>

              <div className="dashYearButtons">
                <button className="dashYearBtn isActive">{activeYear}</button>
              </div>
            </div>

            <KpiCards items={kpiItems} />
          </div>
        </section>

        <section className="dashFilters">
          <FiltersBar filters={filters} onChange={handleFilterChange} options={options} />
        </section>

        <section
          className="dashCharts"
          style={{
            flex: "1 1 auto",
            minHeight: 0,
            height: "100%",
            overflow: "hidden",
          }}
        >
          <ChartsGrid />
        </section>
      </main>
    </div>
  );
}
