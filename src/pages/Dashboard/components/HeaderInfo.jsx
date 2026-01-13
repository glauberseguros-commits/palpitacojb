// src/pages/Dashboard/components/HeaderInformational.jsx
import React from "react";

export default function HeaderInformational({
  title = "Análise Geral",
  subtitle = "Padrões estatísticos consolidados",
  insight = "Distribuição equilibrada com leve concentração em horários específicos",
  badges = ["Premium", "Base Oficial", "Dados Reais"],
}) {
  const safeTitle = String(title || "").trim();
  const safeSubtitle = String(subtitle || "").trim();
  const safeInsight = String(insight || "").trim();

  const safeBadges = Array.isArray(badges)
    ? badges.map((b) => String(b || "").trim()).filter(Boolean)
    : [];

  return (
    <div className="headerInfo">
      <div className="headerInfoTop">
        <h1>{safeTitle}</h1>
        {safeSubtitle ? (
          <span className="headerSubtitle">{safeSubtitle}</span>
        ) : null}
      </div>

      {safeInsight ? (
        <p className="headerInsight">{safeInsight}</p>
      ) : null}

      {safeBadges.length > 0 ? (
        <div className="headerBadges">
          {safeBadges.map((b, idx) => (
            <span
              key={`${b}_${idx}`}
              className="headerBadge"
            >
              {b}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
