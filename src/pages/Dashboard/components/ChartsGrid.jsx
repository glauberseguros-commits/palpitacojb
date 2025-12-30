// src/pages/Dashboard/components/ChartsGrid.jsx
import React from "react";

/**
 * ChartsGrid — alinhamento/proporção estilo MODELO
 * - Card "Mês" ocupa 2 linhas (coluna esquerda alta)
 * - À direita: 2 cards em cima (Aparições / Horário) + 2 embaixo (Dia Semana / Posição)
 * - Mesma altura por linha, tudo encaixado e proporcional
 * - Mantém visual premium discreto (sem borda exagerada)
 * - Grid elástico: sem scroll no desktop
 */

function Card({ title, right, children }) {
  return (
    <section style={ui.card}>
      <header style={ui.cardHeader}>
        <div style={ui.cardTitle}>{title}</div>
        {right ? <div style={ui.cardRight}>{right}</div> : null}
      </header>

      <div style={ui.cardBody}>
        <div style={ui.innerFrame}>{children}</div>
      </div>
    </section>
  );
}

function PlaceholderChart({ label = "Gráfico (placeholder)" }) {
  return (
    <div style={ui.placeholderWrap}>
      <div style={ui.placeholderGrid} />
      <div style={ui.placeholderLabel}>{label}</div>
    </div>
  );
}

export default function ChartsGrid() {
  return (
    <>
      <style>{ui._styleTag}</style>

      <div className="pp_charts_grid_model" style={ui.grid}>
        {/* ESQUERDA (2 linhas) */}
        <div className="pp_area_month" style={ui.areaMonth}>
          <Card title="Quantidade de Sorteios por Mês">
            <PlaceholderChart label="Bar chart (Mês)" />
          </Card>
        </div>

        {/* DIREITA - LINHA 1 */}
        <div className="pp_area_aparicoes" style={ui.areaAparicoes}>
          <Card title="Quantidade de Aparições">
            <PlaceholderChart label="Ranking (Animal)" />
          </Card>
        </div>

        <div className="pp_area_horario" style={ui.areaHorario}>
          <Card title="Quantidade de Aparições por Horário">
            <PlaceholderChart label="Distribuição (Horário)" />
          </Card>
        </div>

        {/* DIREITA - LINHA 2 */}
        <div className="pp_area_diaSemana" style={ui.areaDiaSemana}>
          <Card title="Quantidade de Sorteios por Dia da Semana">
            <PlaceholderChart label="Bar chart (Dia da Semana)" />
          </Card>
        </div>

        <div className="pp_area_posicao" style={ui.areaPosicao}>
          <Card title="Quantidade de Aparições por Posição">
            <PlaceholderChart label="Distribuição (Posição)" />
          </Card>
        </div>
      </div>
    </>
  );
}

/* =========================
   TOKENS (premium discreto)
========================= */
const BORDER = "rgba(255,255,255,0.18)";
const BORDER_SOFT = "rgba(255,255,255,0.10)";
const GLASS = "rgba(0,0,0,0.62)";

const ui = {
  /* =========================
     GRID — PROPORÇÃO DO MODELO
     Colunas: 5 / 4 / 3 (somando 12)
     Linhas:  1fr / 1fr
     Mês:     ocupa as duas linhas
  ========================= */
  grid: {
    display: "grid",
    gap: 14,

    // Proporção igual ao modelo (em vez de “span sequencial”)
    gridTemplateColumns: "5fr 4fr 3fr",
    gridTemplateRows: "minmax(0, 1fr) minmax(0, 1fr)",
    gridTemplateAreas: `
      "month aparicoes horario"
      "month diaSemana posicao"
    `,

    alignItems: "stretch",

    // Sem scroll: grid precisa respeitar o container
    height: "100%",
    minHeight: 0,
  },

  areaMonth: { gridArea: "month", minHeight: 0 },
  areaAparicoes: { gridArea: "aparicoes", minHeight: 0 },
  areaHorario: { gridArea: "horario", minHeight: 0 },
  areaDiaSemana: { gridArea: "diaSemana", minHeight: 0 },
  areaPosicao: { gridArea: "posicao", minHeight: 0 },

  /* =========================
     CARD
  ========================= */
  card: {
    border: `1px solid ${BORDER}`,
    borderRadius: 16,
    background: GLASS,
    padding: 12,
    position: "relative",
    overflow: "hidden",
    boxShadow: "0 18px 50px rgba(0,0,0,0.55)",

    height: "100%",
    minHeight: 0,

    display: "flex",
    flexDirection: "column",
  },

  cardHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingBottom: 10,
    marginBottom: 10,
    borderBottom: `1px solid ${BORDER_SOFT}`,
    flex: "0 0 auto",
  },

  cardTitle: {
    fontWeight: 900,
    letterSpacing: 0.3,
    fontSize: 14,
    opacity: 0.95,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },

  cardRight: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },

  cardBody: {
    position: "relative",
    flex: "1 1 auto",
    minHeight: 0,
  },

  // Moldura interna sutil (estilo modelo, porém discreto)
  innerFrame: {
    height: "100%",
    minHeight: 0,
    borderRadius: 14,
    border: `1px dashed rgba(255,255,255,0.16)`,
    background:
      "linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01))",
    overflow: "hidden",
    position: "relative",
  },

  /* =========================
     PLACEHOLDER (chart shell)
  ========================= */
  placeholderWrap: {
    height: "100%",
    minHeight: 0,
    borderRadius: 14,
    border: `1px dashed rgba(255,255,255,0.16)`,
    background: "rgba(0,0,0,0.25)",
    position: "relative",
    overflow: "hidden",
  },

  placeholderGrid: {
    position: "absolute",
    inset: 0,
    backgroundImage:
      "linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)",
    backgroundSize: "32px 32px",
    opacity: 0.28,
  },

  placeholderLabel: {
    position: "absolute",
    left: 12,
    bottom: 10,
    fontWeight: 800,
    opacity: 0.75,
    fontSize: 12,
    letterSpacing: 0.2,
    color: "#fff",
    textShadow: "0 2px 10px rgba(0,0,0,0.55)",
  },

  /* =========================
     RESPONSIVO LOCAL
     - Mantém proporção no desktop
     - Em telas menores, vira stack organizado
  ========================= */
  _styleTag: `
  @media (max-width: 1200px){
    .pp_charts_grid_model{
      grid-template-columns: 1fr 1fr;
      grid-template-rows: auto;
      grid-template-areas:
        "month month"
        "aparicoes horario"
        "diaSemana diaSemana"
        "posicao posicao";
    }
  }

  @media (max-width: 720px){
    .pp_charts_grid_model{
      grid-template-columns: 1fr;
      grid-template-areas:
        "month"
        "aparicoes"
        "horario"
        "diaSemana"
        "posicao";
    }
  }
  `,
};
