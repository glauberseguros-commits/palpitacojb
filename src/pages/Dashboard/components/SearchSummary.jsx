// src/pages/Search/components/SearchSummary.jsx
import React, { useMemo } from "react";

function ymdToBR(ymd) {
  const m = String(ymd || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "";
  return `${m[3]}/${m[2]}/${m[1]}`;
}

export default function SearchSummary({ queryInfo, totalMatches, meta, filters }) {
  const qLabel = queryInfo?.label || "—";
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
        }
        .ppSearchSummary .kpi{
          display:flex;
          align-items:baseline;
          justify-content:space-between;
          gap:10px;
        }
        .ppSearchSummary .kpi .big{
          font-size:20px;
          font-weight:900;
          letter-spacing:0.3px;
        }
        .ppSearchSummary .kpi .big b{ color:#caa64b; }
        .ppSearchSummary .kpi .lbl{
          font-size:10px;
          color:rgba(233,233,233,0.65);
          text-transform:uppercase;
          letter-spacing:0.6px;
        }
        .ppSearchSummary .grid{
          display:grid;
          grid-template-columns:1fr 1fr;
          gap:8px 12px;
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
        }
        .ppSearchSummary .it .v b{ color:#caa64b; }
      `}</style>

      <div className="kpi">
        <div>
          <div className="lbl">Ocorrências</div>
          <div className="big"><b>{totalMatches}</b></div>
        </div>

        <div style={{ textAlign: "right" }}>
          <div className="lbl">Tipo</div>
          <div className="big" style={{ fontSize: 14 }}>{modeLabel}</div>
        </div>
      </div>

      <div className="grid">
        <div className="it">
          <div className="t">Consulta</div>
          <div className="v"><b>{qLabel}</b></div>
        </div>
        <div className="it">
          <div className="t">Período</div>
          <div className="v">{period}</div>
        </div>

        <div className="it">
          <div className="t">Draws</div>
          <div className="v">{meta?.draws ?? 0}</div>
        </div>
        <div className="it">
          <div className="t">Prizes filtrados</div>
          <div className="v">{meta?.prizes ?? 0}</div>
        </div>
      </div>
    </div>
  );
}
