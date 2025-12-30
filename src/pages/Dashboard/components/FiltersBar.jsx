// src/pages/Dashboard/components/FiltersBar.jsx
import React, { useMemo } from "react";

export default function FiltersBar({
  filters = {
    mes: "Todos",
    diaMes: "Todos",
    diaSemana: "Todos",
    horario: "Todos",
    animal: "Todos",
    posicao: "Todos",
  },
  onChange = () => {},
  options = {},
}) {
  const defaultOptions = useMemo(() => {
    const meses = [
      "Todos",
      "Janeiro",
      "Fevereiro",
      "Março",
      "Abril",
      "Maio",
      "Junho",
      "Julho",
      "Agosto",
      "Setembro",
      "Outubro",
      "Novembro",
      "Dezembro",
    ];

    const diasSemana = [
      "Todos",
      "Segunda",
      "Terça",
      "Quarta",
      "Quinta",
      "Sexta",
      "Sábado",
      "Domingo",
    ];

    const horarios = ["Todos", "10h", "12h", "14h", "16h", "18h", "20h"];

    const posicoes = ["Todos", "1º", "2º", "3º", "4º", "5º"];

    const animais =
      Array.isArray(options.animais) && options.animais.length
        ? ["Todos", ...options.animais]
        : ["Todos"];

    const diasMes =
      Array.isArray(options.diasMes) && options.diasMes.length
        ? ["Todos", ...options.diasMes]
        : ["Todos", ...Array.from({ length: 31 }, (_, i) => String(i + 1))];

    return {
      meses:
        Array.isArray(options.meses) && options.meses.length
          ? ["Todos", ...options.meses]
          : meses,
      diasMes,
      diasSemana:
        Array.isArray(options.diasSemana) && options.diasSemana.length
          ? ["Todos", ...options.diasSemana]
          : diasSemana,
      horarios:
        Array.isArray(options.horarios) && options.horarios.length
          ? ["Todos", ...options.horarios]
          : horarios,
      animais,
      posicoes:
        Array.isArray(options.posicoes) && options.posicoes.length
          ? ["Todos", ...options.posicoes]
          : posicoes,
    };
  }, [options]);

  const ui = {
    bar: {
      border: "1px solid rgba(255,255,255,0.16)",
      borderRadius: 16,
      background: "rgba(0,0,0,0.62)",
      padding: 14,
      boxShadow: "0 18px 50px rgba(0,0,0,0.55)",
      overflow: "hidden",
    },
    grid: {
      display: "grid",
      gridTemplateColumns: "repeat(12, minmax(0, 1fr))",
      gap: 12,
      alignItems: "end",
    },

    // Spans desktop (12 col)
    spanMes: { gridColumn: "span 2" },
    spanDiaMes: { gridColumn: "span 2" },
    spanDiaSemana: { gridColumn: "span 3" },
    spanHorario: { gridColumn: "span 2" },
    spanAnimal: { gridColumn: "span 2" },
    spanPosicao: { gridColumn: "span 1" },

    item: {
      display: "grid",
      gap: 6,
      minWidth: 0,
    },
    label: {
      fontWeight: 900,
      opacity: 0.92,
      letterSpacing: 0.25,
      fontSize: 13,
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis",
    },

    selectWrap: {
      position: "relative",
      width: "100%",
    },

    select: {
      height: 42,
      borderRadius: 12,
      border: "1px solid rgba(255,255,255,0.16)",
      background: "rgba(0,0,0,0.55)",
      color: "#fff",
      padding: "0 38px 0 12px", // espaço para a seta
      outline: "none",
      width: "100%",
      fontWeight: 800,
      letterSpacing: 0.2,
      appearance: "none",
      WebkitAppearance: "none",
      MozAppearance: "none",
      boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.25)",
      cursor: "pointer",
    },

    caret: {
      position: "absolute",
      right: 12,
      top: "50%",
      transform: "translateY(-50%)",
      width: 0,
      height: 0,
      borderLeft: "6px solid transparent",
      borderRight: "6px solid transparent",
      borderTop: "7px solid rgba(255,255,255,0.85)",
      pointerEvents: "none",
      opacity: 0.9,
    },

    hint: {
      opacity: 0.7,
      fontSize: 12,
      marginTop: 10,
    },

    styleTag: `
      /* Grid responsivo (local / sem JS) */
      @media (max-width: 1200px){
        .pp_filters_grid{ grid-template-columns: repeat(8, minmax(0, 1fr)); }
        .pp_f_mes{ grid-column: span 2 !important; }
        .pp_f_diaMes{ grid-column: span 2 !important; }
        .pp_f_diaSemana{ grid-column: span 4 !important; }
        .pp_f_horario{ grid-column: span 2 !important; }
        .pp_f_animal{ grid-column: span 2 !important; }
        .pp_f_posicao{ grid-column: span 2 !important; }
      }
      @media (max-width: 760px){
        .pp_filters_grid{ grid-template-columns: repeat(4, minmax(0, 1fr)); }
        .pp_f_mes,
        .pp_f_diaMes,
        .pp_f_diaSemana,
        .pp_f_horario,
        .pp_f_animal,
        .pp_f_posicao{ grid-column: span 4 !important; }
      }

      /* Micro refinamentos */
      .pp_filters_grid select:focus{
        border-color: rgba(201,168,62,0.55) !important;
        box-shadow: 0 0 0 3px rgba(201,168,62,0.12) !important;
      }
    `,
  };

  const Item = ({ label, value, name, list, wrapClassName, wrapStyle }) => (
    <div className={wrapClassName} style={{ ...wrapStyle }}>
      <div style={ui.item}>
        <div style={ui.label} title={label}>
          {label}
        </div>

        <div style={ui.selectWrap}>
          <select
            value={value || "Todos"}
            onChange={(e) => onChange(name, e.target.value)}
            style={ui.select}
          >
            {(list || ["Todos"]).map((opt) => (
              <option key={`${name}_${opt}`} value={opt}>
                {opt}
              </option>
            ))}
          </select>
          <span aria-hidden="true" style={ui.caret} />
        </div>
      </div>
    </div>
  );

  return (
    <div style={ui.bar}>
      <style>{ui.styleTag}</style>

      <div className="pp_filters_grid" style={ui.grid}>
        <Item
          label="Mês"
          name="mes"
          value={filters.mes}
          list={defaultOptions.meses}
          wrapClassName="pp_f_mes"
          wrapStyle={ui.spanMes}
        />

        <Item
          label="Dia do Mês"
          name="diaMes"
          value={filters.diaMes}
          list={defaultOptions.diasMes}
          wrapClassName="pp_f_diaMes"
          wrapStyle={ui.spanDiaMes}
        />

        <Item
          label="Dia da Semana"
          name="diaSemana"
          value={filters.diaSemana}
          list={defaultOptions.diasSemana}
          wrapClassName="pp_f_diaSemana"
          wrapStyle={ui.spanDiaSemana}
        />

        <Item
          label="Horário"
          name="horario"
          value={filters.horario}
          list={defaultOptions.horarios}
          wrapClassName="pp_f_horario"
          wrapStyle={ui.spanHorario}
        />

        <Item
          label="Animal"
          name="animal"
          value={filters.animal}
          list={defaultOptions.animais}
          wrapClassName="pp_f_animal"
          wrapStyle={ui.spanAnimal}
        />

        <Item
          label="Posição"
          name="posicao"
          value={filters.posicao}
          list={defaultOptions.posicoes}
          wrapClassName="pp_f_posicao"
          wrapStyle={ui.spanPosicao}
        />
      </div>
    </div>
  );
}
