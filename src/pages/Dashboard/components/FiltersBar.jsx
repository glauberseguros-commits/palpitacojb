// src/pages/Dashboard/components/FiltersBar.jsx
import React, { useMemo, useCallback } from "react";

/**
 * FiltersBar (Premium)
 *
 * posicaoMode:
 * - "full" (default): Todos + 1º..7º
 * - "v1": trava em 1º (desabilita select e lista só 1º)
 *
 * posicoesFromOptionsMode:
 * - "ignore" (default): IGNORA options.posicoes (posição é domínio fixo)
 * - "respect": respeita options.posicoes se vier (com fallback seguro)
 *
 * Opção A (Horário):
 * - Horário é DOMÍNIO FIXO (Todos + 09h/11h/14h/16h/18h/21h)
 * - IGNORA options.horarios (porque ele pode vir “podado” pelo filtro atual e causar UX ruim)
 */

function normalizeValue(v, fallback = "Todos") {
  const s = String(v ?? "").trim();
  return s ? s : fallback;
}

function sortPTBR(a, b) {
  return String(a).localeCompare(String(b), "pt-BR", { sensitivity: "base" });
}

/**
 * ✅ Normaliza entradas de posição para o formato da UI:
 * - "Todos" => "Todos"
 * - "2" => "2º"
 * - "2º" => "2º"
 */
function normalizePosicaoInput(v) {
  const s = String(v ?? "").trim();
  if (!s) return "Todos";
  if (s.toLowerCase() === "todos") return "Todos";

  const mNum = s.match(/^(\d{1,2})$/);
  if (mNum) return `${Number(mNum[1])}º`;

  const mOrd = s.match(/^(\d{1,2})\s*º$/);
  if (mOrd) return `${Number(mOrd[1])}º`;

  return s;
}

/**
 * ✅ Garante que o value do select exista na lista.
 */
function ensureValueInList({
  value,
  list,
  forceValue = null,
  fallback = "Todos",
  normalizeFn = null,
}) {
  const base = forceValue ?? value;
  const v0 = normalizeValue(base, fallback);
  const v = typeof normalizeFn === "function" ? normalizeFn(v0) : v0;

  const arr = Array.isArray(list) ? list : [];
  if (!arr.length) return v;

  const isObjList = typeof arr[0] === "object" && arr[0] && "value" in arr[0];

  if (isObjList) {
    const values = new Set(arr.map((x) => normalizeValue(x?.value, "")));
    if (values.has(v)) return v;
    if (values.has("Todos")) return "Todos";
    const first = normalizeValue(arr[0]?.value, "");
    return first || fallback;
  }

  const values = new Set(arr.map((x) => normalizeValue(x, "")));
  if (values.has(v)) return v;
  if (values.has("Todos")) return "Todos";

  const first = normalizeValue(arr[0], "");
  return first || fallback;
}

/* =========================
   PREMIUM TOKENS
========================= */
const PP = {
  surface: "#0B0B0C",
  surface2: "#0F0F12",
  stroke: "rgba(255,255,255,0.14)",
  strokeStrong: "rgba(255,255,255,0.22)",
  gold: "#B89E47",
  goldHi: "#C8B25A",
  text: "rgba(255,255,255,0.92)",
  text2: "rgba(255,255,255,0.78)",
  muted: "rgba(255,255,255,0.55)",
  rCard: 18,
  rInner: 14,
  shadowGlow:
    "0 0 0 1px rgba(200,178,90,0.10), 0 18px 50px rgba(0,0,0,0.55)",

  // ✅ melhor toque/leitura
  inputH: 48,

  // ✅ seleção do dropdown (substitui azul por dourado)
  selGoldA: "rgba(200,178,90,0.95)",
  selGoldB: "rgba(184,158,71,0.95)",
  selGoldSoft: "rgba(200,178,90,0.55)",
};

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
  posicaoMode = "full",
  posicoesFromOptionsMode = "ignore",
}) {
  const defaultOptions = useMemo(() => {
    const mesesDefault = [
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

    const diasSemanaDefault = [
      { label: "Todos", value: "Todos" },
      { label: "Domingo", value: "Dom" },
      { label: "Segunda-Feira", value: "Seg" },
      { label: "Terça-Feira", value: "Ter" },
      { label: "Quarta-Feira", value: "Qua" },
      { label: "Quinta-Feira", value: "Qui" },
      { label: "Sexta-Feira", value: "Sex" },
      { label: "Sábado", value: "Sáb" },
    ];

    // ✅ OPÇÃO A: domínio fixo (NÃO depende de dados filtrados)
    const horariosDefault = [
      { label: "Todos", value: "Todos" },
      { label: "09h", value: "09h" },
      { label: "11h", value: "11h" },
      { label: "14h", value: "14h" },
      { label: "16h", value: "16h" },
      { label: "18h", value: "18h" },
      { label: "21h", value: "21h" },
    ];

    const posicoesDefaultFull = [
      { label: "Todos", value: "Todos" },
      { label: "1º", value: "1º" },
      { label: "2º", value: "2º" },
      { label: "3º", value: "3º" },
      { label: "4º", value: "4º" },
      { label: "5º", value: "5º" },
      { label: "6º", value: "6º" },
      { label: "7º", value: "7º" },
    ];

    const posicoesDefaultV1 = [{ label: "1º", value: "1º" }];

    const normalizeLabelValueList = (arr, fallback) => {
      if (!Array.isArray(arr) || !arr.length) return fallback;
      const first = arr[0];

      if (
        typeof first === "object" &&
        first &&
        "label" in first &&
        "value" in first
      ) {
        return arr
          .map((x) => ({
            label: normalizeValue(x?.label, "Todos"),
            value: normalizeValue(x?.value, "Todos"),
          }))
          .filter((x) => x.label && x.value);
      }

      // lista simples de strings/números
      return arr
        .map((x) => {
          const v = normalizeValue(x, "");
          return v ? { label: v, value: v } : null;
        })
        .filter(Boolean);
    };

    const animais =
      Array.isArray(options.animais) && options.animais.length
        ? (() => {
            const cleaned = options.animais
              .map((x) => String(x ?? "").trim())
              .filter(Boolean)
              .filter((x) => x.toLowerCase() !== "todos");

            const uniq = Array.from(new Set(cleaned));
            uniq.sort(sortPTBR);

            return ["Todos", ...uniq];
          })()
        : ["Todos"];

    const diasMes =
      Array.isArray(options.diasMes) && options.diasMes.length
        ? [
            "Todos",
            ...options.diasMes
              .map((x) => String(x ?? "").trim())
              .filter(Boolean)
              .filter((x) => x.toLowerCase() !== "todos"),
          ]
        : ["Todos", ...Array.from({ length: 31 }, (_, i) => String(i + 1))];

    const diasSemanaFromParent =
      Array.isArray(options.diasSemana) && options.diasSemana.length
        ? normalizeLabelValueList(options.diasSemana, diasSemanaDefault)
        : diasSemanaDefault;

    // ✅ OPÇÃO A: não aceitar options.horarios (evita “sumir” horários após filtro)
    const horarios = horariosDefault;

    const posicoesFromParent =
      posicoesFromOptionsMode === "respect" &&
      Array.isArray(options.posicoes) &&
      options.posicoes.length
        ? normalizeLabelValueList(options.posicoes, posicoesDefaultFull)
        : null;

    const posicoes =
      posicoesFromParent ||
      (posicaoMode === "v1" ? posicoesDefaultV1 : posicoesDefaultFull);

    const meses =
      Array.isArray(options.meses) && options.meses.length
        ? (() => {
            const cleaned = options.meses
              .map((x) => String(x ?? "").trim())
              .filter(Boolean)
              .filter((x) => x.toLowerCase() !== "todos");
            const uniq = Array.from(new Set(cleaned));
            return ["Todos", ...uniq];
          })()
        : mesesDefault;

    return {
      meses,
      diasMes,
      diasSemana: diasSemanaFromParent,
      horarios,
      animais,
      posicoes,
    };
  }, [options, posicaoMode, posicoesFromOptionsMode]);

  const ui = {
    bar: {
      border: `1px solid ${PP.strokeStrong}`,
      borderRadius: PP.rCard,
      background: `linear-gradient(180deg, ${PP.surface}, ${PP.surface2})`,
      padding: 14,
      boxShadow: PP.shadowGlow,
      overflow: "hidden",
      minWidth: 0,
    },

    grid: {
      display: "grid",
      gridTemplateColumns: "repeat(12, minmax(0, 1fr))",
      gap: 12,
      alignItems: "end",
      minWidth: 0,
    },

    spanMes: { gridColumn: "span 2", minWidth: 0 },
    spanDiaMes: { gridColumn: "span 2", minWidth: 0 },
    spanDiaSemana: { gridColumn: "span 3", minWidth: 0 },
    spanHorario: { gridColumn: "span 2", minWidth: 0 },
    spanAnimal: { gridColumn: "span 2", minWidth: 0 },
    spanPosicao: { gridColumn: "span 1", minWidth: 0 },

    item: { display: "grid", gap: 8, minWidth: 0 },

    // ✅ label mais suave
    label: {
      fontWeight: 700,
      letterSpacing: 0.12,
      fontSize: "clamp(14px, 1.05vw, 16px)",
      color: PP.text,
      opacity: 0.9,
      lineHeight: 1.15,
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis",
      minWidth: 0,
    },

    selectWrap: { position: "relative", width: "100%", minWidth: 0 },

    // ✅ select mais suave
    select: {
      height: PP.inputH,
      borderRadius: 12,
      border: `1px solid ${PP.stroke}`,
      background: "rgba(0,0,0,0.42)",
      color: PP.text,
      padding: "0 44px 0 14px",
      outline: "none",
      width: "100%",
      fontWeight: 650,
      fontSize: "clamp(14px, 1.05vw, 16px)",
      letterSpacing: 0.1,
      appearance: "none",
      WebkitAppearance: "none",
      MozAppearance: "none",
      boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.28)",
      cursor: "pointer",
      minWidth: 0,
      transition:
        "border-color 160ms ease, box-shadow 160ms ease, transform 160ms ease",

      // ✅ FIX (mínimo e freeze-safe): evita cortar “Todos” em “Tod”
      whiteSpace: "nowrap",
      textOverflow: "clip",
    },

    selectDisabled: {
      opacity: 0.62,
      cursor: "not-allowed",
      filter: "grayscale(18%)",
    },

    caret: {
      position: "absolute",
      right: 14,
      top: "50%",
      transform: "translateY(-50%)",
      width: 0,
      height: 0,
      borderLeft: "7px solid transparent",
      borderRight: "7px solid transparent",
      borderTop: `8px solid ${PP.text2}`,
      pointerEvents: "none",
      opacity: 0.9,
    },

    styleTag: `
      .pp_filters_grid * { box-sizing: border-box; }

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

      /* Mantém tema escuro */
      .pp_filters_grid select{ color-scheme: dark; }

      /* Focus premium (não muda layout) */
      .pp_filters_grid select:focus{
        border-color: rgba(200,178,90,0.55) !important;
        box-shadow: 0 0 0 3px rgba(200,178,90,0.14) !important;
      }

      /* Hover */
      .pp_filters_grid select:hover{
        border-color: rgba(200,178,90,0.20);
      }

      /* ====== TROCA DO AZUL PARA DOURADO (SELEÇÃO DO MENU) ======
         Limitação: o <select> nativo pode ser parcialmente “travado” pelo SO/navegador.
         Essas regras fazem o máximo possível sem alterar layout/componente.
      */
      .pp_filters_grid select option{
        background: #0B0B0C;
        color: rgba(255,255,255,0.92);
      }

      /* Selecionado (substitui o azul padrão sempre que o navegador permitir) */
      .pp_filters_grid select option:checked{
        background-color: ${PP.selGoldA} !important;
        color: #0B0B0C !important;
      }

      /* Hover no item do menu (quando o navegador respeitar) */
      .pp_filters_grid select option:hover{
        background-color: ${PP.selGoldSoft} !important;
        color: #0B0B0C !important;
      }

      /* Active/pressed */
      .pp_filters_grid select option:active{
        background-color: ${PP.selGoldB} !important;
        color: #0B0B0C !important;
      }

      /* Tentativa de “degradê” (alguns browsers ignoram, mas não quebra) */
      .pp_filters_grid select option:checked{
        background: linear-gradient(180deg, ${PP.selGoldA}, ${PP.selGoldB}) !important;
      }

      /* (Opcional) remove aquele brilho azul de foco do Windows em alguns cenários */
      .pp_filters_grid select:focus-visible{
        outline: none;
      }
    `,
  };

  const lockPosicaoV1 = posicaoMode === "v1";
  const posicaoForcedValue = lockPosicaoV1 ? "1º" : null;

  const handleChange = useCallback(
    (name, next) => {
      if (lockPosicaoV1 && name === "posicao") {
        onChange("posicao", "1º");
        return;
      }

      const nextValue = name === "posicao" ? normalizePosicaoInput(next) : next;
      onChange(name, nextValue);
    },
    [lockPosicaoV1, onChange]
  );

  const Item = ({
    label,
    value,
    name,
    list,
    wrapClassName,
    wrapStyle,
    disabled = false,
    forceValue = null,
  }) => {
    const normalizedValue = ensureValueInList({
      value,
      list,
      forceValue,
      fallback: "Todos",
      normalizeFn: name === "posicao" ? normalizePosicaoInput : null,
    });

    const isObjList =
      Array.isArray(list) && list.length && typeof list[0] === "object" && list[0];

    return (
      <div className={wrapClassName} style={{ ...wrapStyle, minWidth: 0 }}>
        <div style={ui.item}>
          <div style={ui.label} title={label}>
            {label}
          </div>

          <div style={ui.selectWrap}>
            <select
              value={normalizedValue}
              disabled={disabled}
              onChange={(e) => handleChange(name, e.target.value)}
              style={{
                ...ui.select,
                ...(disabled ? ui.selectDisabled : null),
              }}
            >
              {isObjList
                ? list.map((opt, idx) => (
                    <option
                      key={`${name}_${String(opt?.value)}_${idx}`}
                      value={opt?.value}
                    >
                      {opt?.label}
                    </option>
                  ))
                : (list || ["Todos"]).map((opt, idx) => (
                    <option key={`${name}_${String(opt)}_${idx}`} value={opt}>
                      {opt}
                    </option>
                  ))}
            </select>

            <span aria-hidden="true" style={ui.caret} />
          </div>
        </div>
      </div>
    );
  };

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
          disabled={lockPosicaoV1}
          forceValue={posicaoForcedValue}
        />
      </div>
    </div>
  );
}
