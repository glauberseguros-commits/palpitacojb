// src/pages/Dashboard/components/HeaderInfo.jsx
import React, { useMemo } from "react";

/**
 * HeaderInformational (Premium / Freeze-safe)
 *
 * - Header informativo do dashboard
 * - Seguro contra valores inválidos
 * - Namespace isolado (pp_header)
 * - Preparado para modo DEMO / bloqueio futuro
 */

export default function HeaderInformational({
  title = "Análise Geral",
  subtitle = "Padrões estatísticos consolidados",
  insight = "Distribuição equilibrada com leve concentração em horários específicos",
  badges = ["Premium", "Base Oficial", "Dados Reais"],

  // 🔒 preparado para modo demo / freeze
  disabled = false,
}) {
  const safeTitle = String(title ?? "").trim();
  const safeSubtitle = String(subtitle ?? "").trim();
  const safeInsight = String(insight ?? "").trim();

  const safeBadges = useMemo(() => {
    if (!Array.isArray(badges)) return [];
    return badges.map((b) => String(b ?? "").trim()).filter(Boolean);
  }, [badges]);

  return (
    <section
      className="pp_header"
     
      aria-label="Resumo informacional do painel"
     
      style={{
        opacity: disabled ? 0.72 : 1,
        filter: disabled ? "grayscale(18%)" : "none",
        pointerEvents: disabled ? "none" : "auto",
      }}
    >
      <div className="pp_header_top">
        <h1 className="pp_header_title">{safeTitle}</h1>

        {safeSubtitle ? (
          <span className="pp_header_subtitle" title={safeSubtitle}>
            {safeSubtitle}
          </span>
        ) : null}
      </div>

      {safeInsight ? (
        <p className="pp_header_insight" title={safeInsight}>
          {safeInsight}
        </p>
      ) : null}

      {safeBadges.length > 0 ? (
        <div className="pp_header_badges">
          {safeBadges.map((b, idx) => {
            const keySafe = b.replace(/\s+/g, "_").slice(0, 40);
            return (
              <span
                key={`${keySafe}_${idx}`}
                className="pp_header_badge"
                aria-label={`Selo ${b}`}
              >
                {b}
              </span>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

