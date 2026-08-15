// src/pages/Dashboard/components/FiltersBar.jsx
import React, { useMemo, useCallback } from "react";

/**
 * FiltersBar (Premium)
 *
 * Ô£à Loteria:
 * - filters.loteria: "PT_RIO" | "FEDERAL" | "LOOK" | "NACIONAL"
 *   (default: "PT_RIO")
 *
 * Ô£à Hor├írio (dom├¡nio pr├│prio por loteria):
 * - PT_RIO: Todos + 09h/11h/14h/16h/18h/19:30h/21h
 * - FEDERAL: Todos + 19h/20h
 * - LOOK: Todos + 07h/09h/11h/14h/16h/18h/21h/23h
 * - NACIONAL: Todos + 02h/08h/10h/12h/15h/17h/20h/21h/23h
 *
 * Ô£à Seguran├ºa:
 * - Ao trocar loteria, reseta filtros sens├¡veis:
 *   horario -> "Todos"
 *   animal  -> "Todos"
 *   posicao -> "Todos"
 *
 * posicaoMode:
 * - "full" (default): Todos + 1┬║..7┬║
 * - "v1": trava em 1┬║ (desabilita select e lista s├│ 1┬║)
 *
 * posicoesFromOptionsMode:
 * - "ignore" (default): IGNORA options.posicoes (posi├º├úo ├® dom├¡nio fixo)
 * - "respect": respeita options.posicoes se vier (com fallback seguro)
 *
 * Extras (freeze-safe):
 * - disabledAll: trava todos selects (├║til para modo DEMO)
 * - onBlocked: callback quando usu├írio tenta interagir enquanto bloqueado
 */

function normalizeValue(v, fallback = "Todos") {
  const s = String(v ?? "").trim();
  return s ? s : fallback;
}

function sortPTBR(a, b) {
  return String(a).localeCompare(String(b), "pt-BR", { sensitivity: "base" });
}

function normalizeLoteriaInput(v) {
  const raw = String(v ?? "").trim();
  if (!raw) return "PT_RIO";

  const key = raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (key === "federal" || key === "fed" || key === "br" || key === "brasil")
    return "FEDERAL";
  if (key === "rj" || key === "rio" || key === "pt_rio" || key === "pt-rio")
    return "PT_RIO";

  const out = key
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return out || "PT_RIO";
}

/** Normaliza posi├º├úo para "1┬║..7┬║" ou "Todos" */
function normalizePosicaoInput(v) {
  const s = String(v ?? "").trim();
  if (!s) return "Todos";
  if (s.toLowerCase() === "todos") return "Todos";

  const mNum = s.match(/^(\d{1,2})$/);
  if (mNum) return `${Number(mNum[1])}┬║`;

  const mOrd = s.match(/^(\d{1,2})\s*┬║$/);
  if (mOrd) return `${Number(mOrd[1])}┬║`;

  return s;
}

/** Ô£à Normaliza Dia da Semana para o formato curto: Dom/Seg/Ter/Qua/Qui/Sex/S├íb/Todos */
function normalizeDiaSemanaInput(v) {
  const raw = String(v ?? "").trim();
  if (!raw) return "Todos";

  const key = raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (key === "todos") return "Todos";

  const map = {
    dom: "Dom",
    domingo: "Dom",
    seg: "Seg",
    "segunda-feira": "Seg",
    "segunda feira": "Seg",
    segunda: "Seg",
    ter: "Ter",
    "terca-feira": "Ter",
    "terca feira": "Ter",
    terca: "Ter",
    qua: "Qua",
    "quarta-feira": "Qua",
    "quarta feira": "Qua",
    quarta: "Qua",
    qui: "Qui",
    "quinta-feira": "Qui",
    "quinta feira": "Qui",
    quinta: "Qui",
    sex: "Sex",
    "sexta-feira": "Sex",
    "sexta feira": "Sex",
    sexta: "Sex",
    sab: "S├íb",
    sabado: "S├íb",
    "sabado-feira": "S├íb",
    "sabado feira": "S├íb",
    sabb: "S├íb",
    s├íb: "S├íb",
    s├íbado: "S├íb",
  };

  return map[key] || raw;
}

/** Garante que o value exista na lista */
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

  const norm = (x) => {
    const s = normalizeValue(x, "");
    return typeof normalizeFn === "function" ? normalizeFn(s) : s;
  };

  if (isObjList) {
    const values = new Set(arr.map((x) => norm(x?.value)));
    if (values.has(v)) return v;
    if (values.has("Todos")) return "Todos";
    const first = norm(arr[0]?.value);
    return first || fallback;
  }

  const values = new Set(arr.map((x) => norm(x)));
  if (values.has(v)) return v;
  if (values.has("Todos")) return "Todos";

  const first = norm(arr[0]);
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
  inputH: 44,
  selGoldA: "rgba(200,178,90,0.95)",
  selGoldB: "rgba(184,158,71,0.95)",
  selGoldSoft: "rgba(200,178,90,0.55)",
};

export default function FiltersBar({
  filters = {
    loteria: "PT_RIO",
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
  disabledAll = false,
  onBlocked = null,
}) {
  const loteria = useMemo(
    () => normalizeLoteriaInput(filters?.loteria),
    [filters?.loteria]
  );
  const defaultOptions = useMemo(() => {
    const loteriasDefault = [
      { label: "RJ", value: "PT_RIO" },
      { label: "FEDERAL", value: "FEDERAL" },
      { label: "LOOK", value: "LOOK" },
      { label: "NACIONAL", value: "NACIONAL" },
    ];

    const mesesDefault = [
      "Todos",
      "Janeiro",
      "Fevereiro",
      "Mar├ºo",
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
      { label: "Ter├ºa-Feira", value: "Ter" },
      { label: "Quarta-Feira", value: "Qua" },
      { label: "Quinta-Feira", value: "Qui" },
      { label: "Sexta-Feira", value: "Sex" },
      { label: "S├íbado", value: "S├íb" },
    ];

    // Ô£à PT_RIO (dom├¡nio fixo)
    const horariosRJ = [
      { label: "Todos", value: "Todos" },
      { label: "09h", value: "09h" },
      { label: "11h", value: "11h" },
      { label: "14h", value: "14h" },
      { label: "16h", value: "16h" },
      { label: "18h", value: "18h" },
      { label: "19:30h", value: "19h" },
      { label: "21h", value: "21h" },
    ];

    // Ô£à FEDERAL
    const horariosFED = [
      { label: "Todos", value: "Todos" },
      { label: "19h", value: "19h" },
      { label: "20h", value: "20h" },
    ];

    // Ô£à LOOK
    const horariosLOOK = [
      { label: "Todos", value: "Todos" },
      { label: "07h", value: "07h" },
      { label: "09h", value: "09h" },
      { label: "11h", value: "11h" },
      { label: "14h", value: "14h" },
      { label: "16h", value: "16h" },
      { label: "18h", value: "18h" },
      { label: "21h", value: "21h" },
      { label: "23h", value: "23h" },
    ];

    // Ô£à NACIONAL
    // O label mant├®m o hor├írio oficial exibido ao usu├írio.
    // O value usa o bucket da hora real persistida no Firestore
    // (ex.: 14:50 pertence ao bucket 14h, mas ├® exibido como 15h).
    const horariosNACIONAL = [
      { label: "Todos", value: "Todos" },
      { label: "02h", value: "01h" },
      { label: "08h", value: "07h" },
      { label: "10h", value: "09h" },
      { label: "12h", value: "11h" },
      { label: "15h", value: "14h" },
      { label: "17h", value: "16h" },
      { label: "20h", value: "20h" },
      { label: "21h", value: "21h" },
      { label: "23h", value: "22h" },
    ];

    const posicoesDefaultFull = [
      { label: "Todos", value: "Todos" },
      { label: "1┬║", value: "1┬║" },
      { label: "2┬║", value: "2┬║" },
      { label: "3┬║", value: "3┬║" },
      { label: "4┬║", value: "4┬║" },
      { label: "5┬║", value: "5┬║" },
      { label: "6┬║", value: "6┬║" },
      { label: "7┬║", value: "7┬║" },
    ];

    const posicoesDefaultV1 = [{ label: "1┬║", value: "1┬║" }];

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

      return arr
        .map((x) => {
          const v = normalizeValue(x, "");
          return v ? { label: v, value: v } : null;
        })
        .filter(Boolean);
    };

    // aceita string OU {value,label} em options.animais
    const animais =
      Array.isArray(options.animais) && options.animais.length
        ? (() => {
            const cleaned = options.animais
              .map((x) => {
                if (x && typeof x === "object")
                  return String(x.value ?? x.label ?? "").trim();
                return String(x ?? "").trim();
              })
              .filter(Boolean)
              .filter((x) => x.toLowerCase() !== "todos");

            const uniq = Array.from(new Set(cleaned));
            uniq.sort(sortPTBR);
            return ["Todos", ...uniq];
          })()
        : ["Todos"];

    // aceita string OU {value,label} em options.diasMes + dedup
    const diasMes =
      Array.isArray(options.diasMes) && options.diasMes.length
        ? (() => {
            const cleaned = options.diasMes
              .map((x) => {
                if (x && typeof x === "object")
                  return String(x.value ?? x.label ?? "").trim();
                return String(x ?? "").trim();
              })
              .filter(Boolean)
              .filter((x) => x.toLowerCase() !== "todos");
            const uniq = Array.from(new Set(cleaned));
            return ["Todos", ...uniq];
          })()
        : ["Todos", ...Array.from({ length: 31 }, (_, i) => String(i + 1))];

    const diasSemanaFromParent =
      Array.isArray(options.diasSemana) && options.diasSemana.length
        ? normalizeLabelValueList(options.diasSemana, diasSemanaDefault)
        : diasSemanaDefault;

    // Ô£à Cada loteria mant├®m seu pr├│prio dom├¡nio de hor├írios.
    const horariosPorLoteria = {
      PT_RIO: horariosRJ,
      FEDERAL: horariosFED,
      LOOK: horariosLOOK,
      NACIONAL: horariosNACIONAL,
    };

    const horarios = horariosPorLoteria[loteria] || horariosRJ;

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
              .map((x) => {
                if (x && typeof x === "object")
                  return String(x.value ?? x.label ?? "").trim();
                return String(x ?? "").trim();
              })
              .filter(Boolean)
              .filter((x) => x.toLowerCase() !== "todos");
            const uniq = Array.from(new Set(cleaned));
            return ["Todos", ...uniq];
          })()
        : mesesDefault;

    return {
      loterias: loteriasDefault,
      meses,
      diasMes,
      diasSemana: diasSemanaFromParent,
      horarios,
      animais,
      posicoes,
    };
  }, [options, posicaoMode, posicoesFromOptionsMode, loteria]);

  const ui = {
    bar: {
      border: `1px solid ${PP.strokeStrong}`,
      borderRadius: PP.rCard,
      background: `linear-gradient(180deg, ${PP.surface}, ${PP.surface2})`,
      padding: 12,
      boxShadow: PP.shadowGlow,
      overflow: "hidden",
      minWidth: 0,
    },
    grid: {
      display: "grid",
      gridTemplateColumns: "repeat(12, minmax(0, 1fr))",
      gap: 10,
      alignItems: "end",
      minWidth: 0,
    },
    spanLoteria: { gridColumn: "span 2", minWidth: 0 },
    spanMes: { gridColumn: "span 2", minWidth: 0 },
    spanDiaMes: { gridColumn: "span 2", minWidth: 0 },
    spanDiaSemana: { gridColumn: "span 3", minWidth: 0 },
    spanHorario: { gridColumn: "span 1", minWidth: 0 },
    spanAnimal: { gridColumn: "span 1", minWidth: 0 },
    spanPosicao: { gridColumn: "span 1", minWidth: 0 },
    item: { display: "grid", gap: 7, minWidth: 0 },
    label: {
      fontWeight: 700,
      letterSpacing: 0.12,
      fontSize: "clamp(13px, 1.0vw, 15px)",
      color: PP.text,
      opacity: 0.9,
      lineHeight: 1.1,
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis",
      minWidth: 0,
    },
    selectWrap: { position: "relative", width: "100%", minWidth: 0 },
    select: {
      height: PP.inputH,
      borderRadius: 12,
      border: `1px solid ${PP.stroke}`,
      background: "rgba(0,0,0,0.42)",
      color: PP.text,
      padding: "0 44px 0 12px",
      outline: "none",
      width: "100%",
      fontWeight: 650,
      fontSize: "clamp(13px, 1.0vw, 15px)",
      letterSpacing: 0.1,
      appearance: "none",
      WebkitAppearance: "none",
      MozAppearance: "none",
      boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.28)",
      cursor: "pointer",
      minWidth: 0,
      transition:
        "border-color 160ms ease, box-shadow 160ms ease, transform 160ms ease",
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
        .pp_f_loteria{ grid-column: span 2 !important; }
        .pp_f_mes{ grid-column: span 2 !important; }
        .pp_f_diaMes{ grid-column: span 2 !important; }
        .pp_f_diaSemana{ grid-column: span 4 !important; }
        .pp_f_horario{ grid-column: span 2 !important; }
        .pp_f_animal{ grid-column: span 2 !important; }
        .pp_f_posicao{ grid-column: span 2 !important; }
      }
      @media (max-width: 760px){
        .pp_filters_grid{ grid-template-columns: repeat(4, minmax(0, 1fr)); }
        .pp_f_loteria,
        .pp_f_mes,
        .pp_f_diaMes,
        .pp_f_diaSemana,
        .pp_f_horario,
        .pp_f_animal,
        .pp_f_posicao{ grid-column: span 4 !important; }
      }

      .pp_filters_grid select{ color-scheme: dark; }

      .pp_filters_grid select:focus{
        border-color: rgba(200,178,90,0.55) !important;
        box-shadow: 0 0 0 3px rgba(200,178,90,0.14) !important;
      }

      .pp_filters_grid select:hover{
        border-color: rgba(200,178,90,0.20);
      }

      .pp_filters_grid select option{
        background: #0B0B0C;
        color: rgba(255,255,255,0.92);
      }

      .pp_filters_grid select option:checked{
        background-color: ${PP.selGoldA} !important;
        color: #0B0B0C !important;
      }

      .pp_filters_grid select option:hover{
        background-color: ${PP.selGoldSoft} !important;
        color: #0B0B0C !important;
      }

      .pp_filters_grid select option:active{
        background-color: ${PP.selGoldB} !important;
        color: #0B0B0C !important;
      }

      .pp_filters_grid select option:checked{
        background: linear-gradient(180deg, ${PP.selGoldA}, ${PP.selGoldB}) !important;
      }

      .pp_filters_grid select:focus-visible{
        outline: none;
      }
    `,
  };

  const lockPosicaoV1 = posicaoMode === "v1";
  const posicaoForcedValue = lockPosicaoV1 ? "1┬║" : null;

  const handleChange = useCallback(
    (name, next) => {
      if (disabledAll) {
        if (typeof onBlocked === "function") onBlocked(name);
        return;
      }

      // Ô£à Troca loteria: normaliza e reseta filtros sens├¡veis SEMPRE
      if (name === "loteria") {
        const nextLot = normalizeLoteriaInput(next);
        onChange("loteria", nextLot);

        // reset para evitar ÔÇ£estat├¡stica inv├ílidaÔÇØ por estado anterior
        onChange("horario", "Todos");
        onChange("animal", "Todos");
        onChange("posicao", "Todos");

        return;
      }

      if (lockPosicaoV1 && name === "posicao") {
        onChange("posicao", "1┬║");
        return;
      }

      if (name === "posicao") {
        onChange(name, normalizePosicaoInput(next));
        return;
      }

      if (name === "diaSemana") {
        onChange(name, normalizeDiaSemanaInput(next));
        return;
      }

      onChange(name, next);
    },
    [disabledAll, onBlocked, lockPosicaoV1, onChange]
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
    const normalizeFn =
      name === "posicao"
        ? normalizePosicaoInput
        : name === "diaSemana"
        ? normalizeDiaSemanaInput
        : name === "loteria"
        ? normalizeLoteriaInput
        : null;

    const normalizedValue = ensureValueInList({
      value,
      list,
      forceValue,
      fallback: name === "loteria" ? "PT_RIO" : "Todos",
      normalizeFn,
    });

    const isObjList =
      Array.isArray(list) && list.length && typeof list[0] === "object" && list[0];

    const finalDisabled = !!disabledAll || !!disabled;

    const block = (e) => {
      if (!finalDisabled) return;
      try {
        e?.preventDefault?.();
        e?.stopPropagation?.();
      } catch {}
      if (typeof onBlocked === "function") onBlocked(name);
    };

    return (
      <div className={wrapClassName} style={{ ...wrapStyle, minWidth: 0 }}>
        <div style={ui.item}>
          <div style={ui.label} title={label}>
            {label}
          </div>

          <div style={ui.selectWrap}>
            <select
              value={normalizedValue}
              aria-disabled={finalDisabled ? "true" : "false"}
              tabIndex={finalDisabled ? -1 : 0}   // Ô£à FIX: evita foco via TAB quando bloqueado
              onWheelCapture={block}              // Ô£à FIX: bloqueia troca por roda do mouse
              onMouseDownCapture={block}
              onClickCapture={block}
              onKeyDownCapture={(e) => {
                if (!finalDisabled) return;
                block(e);
              }}
              onChange={(e) => handleChange(name, e.target.value)}
              style={{
                ...ui.select,
                ...(finalDisabled ? ui.selectDisabled : null),
              }}
            >
              {isObjList
                ? list.map((opt, idx) => (
                    <option key={`${name}_${String(opt?.value)}_${idx}`} value={opt?.value}>
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

  // FEDERAL N├âO trava hor├írio ÔÇö s├│ troca a lista (Todos/19h/20h)
  const horarioForcedValue = null;
  const horarioDisabled = false;

  return (
    <div style={ui.bar}>
      <style>{ui.styleTag}</style>

      <div className="pp_filters_grid" style={ui.grid}>
        <Item
          label="Loteria"
          name="loteria"
          value={loteria}
          list={defaultOptions.loterias}
          wrapClassName="pp_f_loteria"
          wrapStyle={ui.spanLoteria}
        />

        <Item
          label="M├¬s"
          name="mes"
          value={filters.mes}
          list={defaultOptions.meses}
          wrapClassName="pp_f_mes"
          wrapStyle={ui.spanMes}
        />

        <Item
          label="Dia do M├¬s"
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
          label="Hor├írio"
          name="horario"
          value={filters.horario}
          list={defaultOptions.horarios}
          wrapClassName="pp_f_horario"
          wrapStyle={ui.spanHorario}
          disabled={horarioDisabled}
          forceValue={horarioForcedValue}
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
          label="Posi├º├úo"
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
