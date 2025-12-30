// src/pages/Dashboard/Dashboard.jsx
import React, { useMemo, useState } from "react";
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
  } = useKingRanking({
    uf,
    date: queryDate,
    closeHour,
    positions,
  });

  const kpiItems = useMemo(() => {
    if (!Array.isArray(rankingData) || !rankingData.length) {
      return [
        { key: "dias", title: "Qtde Dias de sorteio", value: 0, icon: "calendar" },
        { key: "sorteios", title: "Qtde de sorteios", value: 0, icon: "ticket" },
      ];
    }

    // Por ora: não-zero quando houver retorno.
    // (Depois a gente calcula “dias” e “sorteios” reais quando o hook devolver também os draws.)
    return [
      { key: "dias", title: "Qtde Dias de sorteio", value: 1, icon: "calendar" },
      { key: "sorteios", title: "Qtde de sorteios", value: 1, icon: "ticket" },
    ];
  }, [rankingData]);

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
              <div className="dashDateBox">{queryDate || "Selecione Mês + Dia"}</div>
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
