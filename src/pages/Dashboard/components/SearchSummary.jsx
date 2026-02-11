// src/pages/Search/components/SearchSummary.jsx
import React, { useMemo } from "react";

function ymdToBR(ymd) {
  const m = String(ymd || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "";
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function safeInt(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

function fmtIntPT(v) {
  const n = safeInt(v);
  try {
    return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(n);
  } catch {
    return String(n);
  }
}

function safeStr(v) {
  return String(v ?? "").trim();
}

export default function SearchSummary({ queryInfo, totalMatches, meta, filters }) {
  const qLabel = useMemo(() => {
    const s = safeStr(queryInfo?.label);
    return s ? s : "—";
  }, [queryInfo]);

  const modeLabel = useMemo(() => {
    if (queryInfo?.kind === "dezena") return "Dezena";
    if (queryInfo?.kind === "centena") return "Centena";
    if (queryInfo?.kind === "milhar") return "Milhar";
    return "—";
  }, [queryInfo]);

  const period = useMemo(() => {
    const from = filters?.from ? ymdToBR(filters.from) : "";
    const to = filters?.to ? ymdToBR(filters.to) : "";
    return from && to ? `${from} → ${to}` : "—";
  }, [filters]);

  const kpiMatches = useMemo(() => fmtIntPT(totalMatches), [totalMatches]);

  const draws = useMemo(() => fmtIntPT(meta?.draws), [meta?.draws]);
  const prizes = useMemo(() => fmtIntPT(meta?.prizes), [meta?.prizes]);

  return (
    <div className="ppSearchSummary">
      <style>{`
        .ppSearchSummary{
          border-radius:18px;
          border:1px solid rgba(202,166,75,0.16);
          background:rgba(0,0,0,0.35);
          box-shadow:0 20px 60px rgba(0,0,0,0.35);
          padding:12px;
          display:flex;
          flex-direction:column;
          gap:10px;
          min-height:110px;
          min-width:0;
        }

        .ppSearchSummary .kpi{
          display:flex;
          align-items:baseline;
          justify-content:space-between;
          gap:10px;
          min-width:0;
        }

        .ppSearchSummary .kpi .big{
          font-size:20px;
          font-weight:900;
          letter-spacing:0.3px;
          font-variant-numeric: tabular-nums;
          font-feature-settings: "tnum" 1, "lnum" 1;
          line-height: 1.05;
        }
        .ppSearchSummary .kpi .big b{ color:#caa64b; }

        .ppSearchSummary .kpi .lbl{
          font-size:10px;
          color:rgba(233,233,233,0.65);
          text-transform:uppercase;
          letter-spacing:0.6px;
          margin-bottom: 3px;
        }

        .ppSearchSummary .grid{
          display:grid;
          grid-template-columns:1fr 1fr;
          gap:8px 12px;
          min-width:0;
        }

        .ppSearchSummary .it{
          min-width:0;
        }

        .ppSearchSummary .it .t{
          font-size:10px;
          color:rgba(233,233,233,0.62);
          text-transform:uppercase;
          letter-spacing:0.6px;
          margin-bottom:2px;
        }

        .ppSearchSummary .it .v{
          font-size:12px;
          font-weight:900;
          color:rgba(233,233,233,0.90);
          white-space:nowrap;
          overflow:hidden;
          text-overflow:ellipsis;
          min-width:0;
          font-variant-numeric: tabular-nums;
          font-feature-settings: "tnum" 1, "lnum" 1;
        }
        .ppSearchSummary .it .v b{ color:#caa64b; }

        /* ✅ Responsivo: vira 1 coluna para não cortar */
        @media (max-width: 720px){
          .ppSearchSummary .grid{
            grid-template-columns: 1fr;
          }
        }
      `}</style>

      <div className="kpi">
        <div style={{ minWidth: 0 }}>
          <div className="lbl">Ocorrências</div>
          <div className="big">
            <b>{kpiMatches}</b>
          </div>
        </div>

        <div style={{ textAlign: "right", minWidth: 0 }}>
          <div className="lbl">Tipo</div>
          <div className="big" style={{ fontSize: 14 }} title={modeLabel}>
            {modeLabel}
          </div>
        </div>
      </div>

      <div className="grid">
        <div className="it">
          <div className="t">Consulta</div>
          <div className="v" title={qLabel}>
            <b>{qLabel}</b>
          </div>
        </div>

        <div className="it">
          <div className="t">Período</div>
          <div className="v" title={period}>
            {period}
          </div>
        </div>

        <div className="it">
          <div className="t">Draws</div>
          <div className="v">{draws}</div>
        </div>

        <div className="it">
          <div className="t">Prizes filtrados</div>
          <div className="v">{prizes}</div>
        </div>
      </div>
    </div>
  );
}

