// src/pages/Dashboard/components/KpiCards.jsx
import React, { useMemo } from "react";

/**
 * KPI cards (top right) — premium compacto (desktop)
 * - Menos altura, menos “negritão”, número menor
 * - Mantém compatibilidade com props (items/columns/gap)
 * - Visual premium discreto (preto + dourado)
 */

export default function KpiCards({ items, columns = 2, gap = 12 }) {
  const data = useMemo(() => {
    if (Array.isArray(items) && items.length) return items;

    return [
      { key: "dias", title: "Qtde Dias de sorteio", value: 909, icon: "calendar" },
      { key: "sorteios", title: "Qtde de sorteios", value: 4573, icon: "ticket" },
    ];
  }, [items]);

  const ui = useMemo(() => {
    const BORDER = "rgba(255,255,255,0.16)";
    const BORDER_SOFT = "rgba(255,255,255,0.10)";
    const GLASS = "rgba(0,0,0,0.62)";
    const GOLD = "rgba(201, 168, 62, 0.92)";

    return {
      wrap: {
        display: "grid",
        gridTemplateColumns: `repeat(${Math.max(
          1,
          Number(columns) || 2
        )}, minmax(0, 1fr))`,
        gap,
        width: "100%",
        minWidth: 0,
      },

      card: {
        border: `1px solid ${BORDER}`,
        borderRadius: 16,
        background: GLASS,
        boxShadow: "0 18px 50px rgba(0,0,0,0.55)",

        /* compacto */
        padding: 10,
        minHeight: 78,

        display: "grid",
        gridTemplateRows: "auto 1fr",
        alignContent: "space-between",
        overflow: "hidden",
        position: "relative",
      },

      // brilho sutil (mais discreto)
      shine: {
        position: "absolute",
        inset: 0,
        background:
          "radial-gradient(900px 180px at 10% 0%, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.00) 55%)",
        pointerEvents: "none",
      },

      head: {
        display: "flex",
        alignItems: "center",
        gap: 8,

        /* menos pesado */
        fontWeight: 700,
        letterSpacing: 0.15,
        opacity: 0.92,

        minWidth: 0,
      },

      title: {
        opacity: 0.90,
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",

        /* menor */
        fontSize: 12.5,
        lineHeight: 1.1,
      },

      iconBox: {
        width: 28,
        height: 28,
        borderRadius: 10,
        border: `1px solid ${BORDER_SOFT}`,
        background: "rgba(0,0,0,0.72)",
        display: "grid",
        placeItems: "center",
        flex: "0 0 auto",
      },

      number: {
        /* menor e mais sóbrio */
        fontSize: 24,
        fontWeight: 800,
        letterSpacing: 0.3,
        lineHeight: 1,
        marginTop: 6,

        display: "flex",
        alignItems: "baseline",
        gap: 7,
      },

      accent: {
        height: 9,
        width: 9,
        borderRadius: 999,
        background: GOLD,
        boxShadow: `0 0 0 3px rgba(201,168,62,0.10)`,
        flex: "0 0 auto",
        transform: "translateY(-2px)",
        opacity: 0.85,
      },

      suffix: {
        fontSize: 11,
        fontWeight: 700,
        opacity: 0.7,
        letterSpacing: 0.15,
      },
    };
  }, [columns, gap]);

  const formatValue = (v) => {
    const n = Number(v);
    if (Number.isFinite(n)) return n.toLocaleString("pt-BR");
    return String(v ?? "");
  };

  // Ícones em SVG inline (leve, sem dependências)
  const CalendarIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path
        d="M7 2v3M17 2v3M3.5 9h17M5 5h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"
        stroke="rgba(255,255,255,0.88)"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M7 13h4M7 17h6"
        stroke="rgba(201,168,62,0.92)"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );

  const TicketIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path
        d="M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-3a2 2 0 0 0 0-4V7Z"
        stroke="rgba(255,255,255,0.88)"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M9 9h6M9 15h6"
        stroke="rgba(201,168,62,0.92)"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );

  const iconFor = (name) => {
    const n = String(name || "").toLowerCase();
    if (n === "calendar") return <CalendarIcon />;
    if (n === "ticket") return <TicketIcon />;
    return <TicketIcon />;
  };

  return (
    <div style={ui.wrap}>
      {data.map((kpi) => (
        <div key={kpi.key || kpi.title} style={ui.card}>
          <div style={ui.shine} />
          <div style={ui.head}>
            <div style={ui.iconBox}>{iconFor(kpi.icon)}</div>
            <div style={ui.title} title={kpi.title}>
              {kpi.title}
            </div>
          </div>

          <div style={ui.number}>
            <span style={ui.accent} aria-hidden="true" />
            <span>{formatValue(kpi.value)}</span>
            {kpi.suffix ? <span style={ui.suffix}>{kpi.suffix}</span> : null}
          </div>
        </div>
      ))}
    </div>
  );
}
