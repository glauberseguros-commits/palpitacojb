// src/pages/Dashboard/components/DateRangeControl.jsx
import React, { useCallback, useMemo, useRef } from "react";

/**
 * DateRangeControl (Premium, sem libs) — CONTROLADO DE VERDADE
 *
 * Regra:
 * - NÃO chama onChange() sozinho via useEffect.
 * - Só chama onChange() quando o usuário interage (inputs/slider/chips).
 * - minDate/maxDate devem vir do pai para o SLIDER funcionar bem.
 *
 * Importante:
 * - Inputs de data NÃO dependem de boundsReady (para o calendário nunca “morrer”).
 * - Se bounds não existirem, o componente ainda permite selecionar datas e chama onChange.
 *
 * Ajuste atual:
 * - Chips de anos: ✅ 1 linha e ocupa 100% (sem espaço vazio à direita)
 * - Compactação vertical (para caber no topo 250px com KPI sem cortar)
 *   mantendo o mesmo visual premium.
 *
 * Fix UX (parece "Todos" + outro ano selecionado):
 * - Remove “efeito de seleção” vindo de foco (focus/focus-visible) no chip.
 * - Após clicar, o chip dá blur para não ficar marcado.
 * - Seleção visual fica SOMENTE pelo chipActive.
 */

function pad2(n) {
  return String(n).padStart(2, "0");
}

function isISODate(s) {
  return /^(\d{4})-(\d{2})-(\d{2})$/.test(String(s || ""));
}

function formatBR(iso) {
  if (!isISODate(iso)) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function toUTCDate(iso) {
  if (!isISODate(iso)) return null;
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y, m - 1, d));
}

function fromUTCDate(dt) {
  if (!(dt instanceof Date) || !Number.isFinite(dt.getTime())) return null;
  const y = dt.getUTCFullYear();
  const m = pad2(dt.getUTCMonth() + 1);
  const d = pad2(dt.getUTCDate());
  return `${y}-${m}-${d}`;
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function clampDateISO(iso, minISO, maxISO) {
  const dt = toUTCDate(iso);
  const minDt = toUTCDate(minISO);
  const maxDt = toUTCDate(maxISO);

  if (!minDt || !maxDt) return isISODate(iso) ? iso : null;
  if (!dt) return maxISO;

  const clamped = new Date(clamp(dt.getTime(), minDt.getTime(), maxDt.getTime()));
  return fromUTCDate(clamped) || maxISO;
}

function daysBetweenUTC(aISO, bISO) {
  const a = toUTCDate(aISO);
  const b = toUTCDate(bISO);
  if (!a || !b) return 0;
  const ms = b.getTime() - a.getTime();
  if (!Number.isFinite(ms)) return 0;
  return Math.floor(ms / 86400000);
}

function addDaysUTC(iso, days) {
  const dt = toUTCDate(iso);
  if (!dt) return iso;
  dt.setUTCDate(dt.getUTCDate() + Number(days || 0));
  return fromUTCDate(dt);
}

/* =========================
   PREMIUM TOKENS (mesma família do dashboard)
   ✅ Compactado verticalmente
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
  shadowGlow: "0 0 0 1px rgba(200,178,90,0.10), 0 18px 50px rgba(0,0,0,0.55)",
  inputH: 38,
};

function CalendarIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M7 2v2M17 2v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M3.5 9.5h17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path
        d="M6.2 5h11.6c1.49 0 2.2 0.71 2.2 2.2v12.6c0 1.49-0.71 2.2-2.2 2.2H6.2C4.71 22 4 21.29 4 19.8V7.2C4 5.71 4.71 5 6.2 5Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function DateRangeControl({
  value = { from: "", to: "" },
  onChange = () => {},

  minDate = null,
  maxDate = null,

  years = null,
  selectedYears = null,
  onToggleYear = () => {},
  onClearYears = () => {},
}) {
  const fromRef = useRef(null);
  const toRef = useRef(null);

  const minISO = useMemo(() => (isISODate(minDate) ? minDate : null), [minDate]);
  const maxISO = useMemo(() => (isISODate(maxDate) ? maxDate : null), [maxDate]);
  const boundsReady = !!(minISO && maxISO);

  const rawFrom = isISODate(value?.from) ? value.from : "";
  const rawTo = isISODate(value?.to) ? value.to : "";

  // fallback visual quando bounds existem (sem auto-commit)
  const viewFrom = useMemo(() => {
    if (!boundsReady) return rawFrom || "";
    if (!rawFrom) return maxISO;
    return clampDateISO(rawFrom, minISO, maxISO);
  }, [boundsReady, rawFrom, minISO, maxISO]);

  const viewTo = useMemo(() => {
    if (!boundsReady) return rawTo || "";
    if (!rawTo) return maxISO;
    return clampDateISO(rawTo, minISO, maxISO);
  }, [boundsReady, rawTo, minISO, maxISO]);

  // normalização (se bounds existem, garante ordem)
  const normalized = useMemo(() => {
    if (!boundsReady) return { from: rawFrom || "", to: rawTo || "" };

    const f = toUTCDate(viewFrom);
    const t = toUTCDate(viewTo);
    if (!f || !t) return { from: maxISO, to: maxISO };

    if (f.getTime() <= t.getTime()) return { from: viewFrom, to: viewTo };
    return { from: viewTo, to: viewFrom };
  }, [boundsReady, rawFrom, rawTo, viewFrom, viewTo, maxISO]);

  const totalDays = useMemo(() => {
    if (!boundsReady) return 1;
    return Math.max(1, daysBetweenUTC(minISO, maxISO));
  }, [boundsReady, minISO, maxISO]);

  const fromOffset = useMemo(() => {
    if (!boundsReady) return 0;
    return clamp(daysBetweenUTC(minISO, normalized.from), 0, totalDays);
  }, [boundsReady, minISO, normalized.from, totalDays]);

  const toOffset = useMemo(() => {
    if (!boundsReady) return 0;
    return clamp(daysBetweenUTC(minISO, normalized.to), 0, totalDays);
  }, [boundsReady, minISO, normalized.to, totalDays]);

  const label = useMemo(() => {
    if (!normalized.from || !normalized.to) return "";
    return `${formatBR(normalized.from)} → ${formatBR(normalized.to)}`;
  }, [normalized.from, normalized.to]);

  const yearsArr = useMemo(() => {
    if (!Array.isArray(years)) return [];
    return years
      .map((y) => Number(y))
      .filter((y) => Number.isFinite(y))
      .sort((a, b) => a - b);
  }, [years]);

  const selectedYearsArr = useMemo(() => {
    if (!Array.isArray(selectedYears)) return [];
    return selectedYears
      .map((y) => Number(y))
      .filter((y) => Number.isFinite(y))
      .sort((a, b) => a - b);
  }, [selectedYears]);

  const isAllYears = useMemo(() => {
    if (!yearsArr.length) return false;
    if (!selectedYearsArr.length) return true;
    return selectedYearsArr.length === yearsArr.length;
  }, [yearsArr, selectedYearsArr]);

  const openPickerByRef = useCallback((ref) => {
    const el = ref?.current;
    if (!el) return;

    try {
      el.focus({ preventScroll: true });
    } catch {
      try {
        el.focus();
      } catch {}
    }

    if (typeof el.showPicker === "function") {
      try {
        el.showPicker();
      } catch {}
    }
  }, []);

  // commit que funciona COM ou SEM bounds
  const commit = useCallback(
    (nextFrom, nextTo) => {
      const fCandidate = isISODate(nextFrom) ? nextFrom : normalized.from;
      const tCandidate = isISODate(nextTo) ? nextTo : normalized.to;

      // sem bounds: valida ISO e dispara
      if (!boundsReady) {
        const fOk = isISODate(fCandidate) ? fCandidate : "";
        const tOk = isISODate(tCandidate) ? tCandidate : "";
        if (!fOk && !tOk) return;
        onChange({ from: fOk, to: tOk });
        return;
      }

      // com bounds: clamp + ordena
      const f = clampDateISO(fCandidate, minISO, maxISO);
      const t = clampDateISO(tCandidate, minISO, maxISO);

      const fDt = toUTCDate(f);
      const tDt = toUTCDate(t);
      if (!fDt || !tDt) return;

      if (fDt.getTime() <= tDt.getTime()) onChange({ from: f, to: t });
      else onChange({ from: t, to: f });
    },
    [boundsReady, onChange, normalized.from, normalized.to, minISO, maxISO]
  );

  const onInputFrom = (e) => commit(e.target.value, normalized.to);
  const onInputTo = (e) => commit(normalized.from, e.target.value);

  const onSliderFrom = (e) => {
    if (!boundsReady) return;
    const nextFrom = Number(e.target.value);
    const safeFrom = clamp(nextFrom, 0, toOffset);
    commit(addDaysUTC(minISO, safeFrom), normalized.to);
  };

  const onSliderTo = (e) => {
    if (!boundsReady) return;
    const nextTo = Number(e.target.value);
    const safeTo = clamp(nextTo, fromOffset, totalDays);
    commit(normalized.from, addDaysUTC(minISO, safeTo));
  };

  const lPct = boundsReady ? (fromOffset / totalDays) * 100 : 0;
  const rPct = boundsReady ? (toOffset / totalDays) * 100 : 0;

  const ui = {
    wrap: { display: "grid", gap: 8, minWidth: 0 },

    topBar: {
      border: `1px solid ${PP.strokeStrong}`,
      borderRadius: PP.rCard,
      background: `linear-gradient(180deg, ${PP.surface}, ${PP.surface2})`,
      padding: "8px 10px",
      boxShadow: PP.shadowGlow,
      minWidth: 0,
      display: "flex",
      alignItems: "flex-start",
      justifyContent: "flex-start",
    },

    // ✅ grid que estica e ocupa 100%
    chips: {
      display: "grid",
      width: "100%",
      minWidth: 0,
      gridAutoFlow: "column",
      gridAutoColumns: "minmax(76px, 1fr)",
      gap: 10,
      alignItems: "center",
    },

    chip: {
      border: `1px solid ${PP.stroke}`,
      background: "rgba(0,0,0,0.42)",
      color: PP.text,
      borderRadius: 12,
      padding: "7px 11px",
      fontWeight: 800,
      fontSize: 12,
      letterSpacing: 0.15,
      cursor: "pointer",
      userSelect: "none",
      width: "100%",
      textAlign: "center",
      whiteSpace: "nowrap",
      transition: "transform 140ms ease, border-color 140ms ease, box-shadow 140ms ease",
      outline: "none",
    },

    chipActive: {
      borderColor: "rgba(200,178,90,0.55)",
      boxShadow: "0 0 0 3px rgba(200,178,90,0.14)",
    },

    topTitle: {
      fontWeight: 800,
      letterSpacing: 0.2,
      color: PP.text,
      fontSize: 13,
      opacity: 0.92,
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis",
      minWidth: 0,
    },

    row: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 10,
      minWidth: 0,
      position: "relative",
      zIndex: 10,
    },

    inputWrap: { position: "relative", minWidth: 0, zIndex: 11 },

    input: {
      width: "100%",
      height: PP.inputH,
      borderRadius: 12,
      border: `1px solid ${PP.stroke}`,
      background: "rgba(0,0,0,0.42)",
      color: PP.text,
      fontWeight: 800,
      letterSpacing: 0.18,
      padding: "0 52px 0 12px",
      outline: "none",
      minWidth: 0,
      position: "relative",
      zIndex: 12,
      cursor: "pointer",
      boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.28)",
      transition: "border-color 160ms ease, box-shadow 160ms ease, transform 160ms ease",
    },

    iconBtn: {
      position: "absolute",
      right: 10,
      top: "50%",
      transform: "translateY(-50%)",
      height: 28,
      width: 32,
      display: "grid",
      placeItems: "center",
      borderRadius: 10,
      border: "1px solid rgba(200,178,90,0.26)",
      background: "rgba(0,0,0,0.35)",
      color: "rgba(255,255,255,0.92)",
      boxShadow: "0 0 0 1px rgba(0,0,0,0.35), 0 10px 20px rgba(0,0,0,0.45)",
      cursor: "pointer",
      zIndex: 20,
      padding: 0,
      transition:
        "transform 160ms ease, border-color 160ms ease, box-shadow 160ms ease, color 160ms ease",
    },

    sliderWrap: {
      position: "relative",
      height: 28,
      minWidth: 0,
      zIndex: 1,
      opacity: boundsReady ? 1 : 0.35,
      pointerEvents: boundsReady ? "auto" : "none",
    },

    track: {
      position: "absolute",
      left: 8,
      right: 8,
      top: "50%",
      transform: "translateY(-50%)",
      height: 6,
      borderRadius: 999,
      background: "rgba(255,255,255,0.10)",
      boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.45)",
    },

    highlight: {
      position: "absolute",
      left: `calc(${lPct}% + 8px)`,
      width: `calc(${Math.max(0, rPct - lPct)}% - 16px)`,
      top: "50%",
      transform: "translateY(-50%)",
      height: 6,
      borderRadius: 999,
      background: "rgba(184,158,71,0.40)",
      boxShadow: "0 0 0 1px rgba(184,158,71,0.18)",
    },

    slider: {
      position: "absolute",
      inset: 0,
      width: "100%",
      height: 28,
      background: "transparent",
      appearance: "none",
      WebkitAppearance: "none",
      outline: "none",
      margin: 0,
      pointerEvents: "auto",
    },

    styleTag: `
      .pp_range * { box-sizing: border-box; }

      /* Esconde o ícone nativo p/ não depender dele */
      .pp_range input[type="date"]::-webkit-calendar-picker-indicator{
        opacity: 0;
        display: none;
      }

      .pp_range input[type="range"]{
        -webkit-appearance: none;
        appearance: none;
      }

      /* Hover premium no input */
      .pp_range input[type="date"]:hover{
        border-color: rgba(255,255,255,0.22) !important;
        box-shadow: inset 0 0 0 1px rgba(0,0,0,0.28), 0 0 0 3px rgba(200,178,90,0.08) !important;
      }

      /* Focus premium consistente */
      .pp_range input:focus{
        border-color: rgba(200,178,90,0.55) !important;
        box-shadow: 0 0 0 3px rgba(200,178,90,0.14) !important;
      }

      /* Thumb premium */
      .pp_range input[type="range"]::-webkit-slider-thumb{
        -webkit-appearance: none;
        appearance: none;
        width: 22px;
        height: 22px;
        border-radius: 999px;
        background: rgba(255,255,255,0.96);
        border: 2px solid rgba(200,178,90,0.62);
        box-shadow: 0 12px 26px rgba(0,0,0,0.58);
        cursor: pointer;
      }
      .pp_range input[type="range"]::-moz-range-thumb{
        width: 22px;
        height: 22px;
        border-radius: 999px;
        background: rgba(255,255,255,0.96);
        border: 2px solid rgba(200,178,90,0.62);
        box-shadow: 0 12px 26px rgba(0,0,0,0.58);
        cursor: pointer;
      }

      .pp_range input[type="range"]::-webkit-slider-runnable-track{ height: 6px; background: transparent; }
      .pp_range input[type="range"]::-moz-range-track{ height: 6px; background: transparent; }

      /* Botão do calendário (hover/active) */
      .pp_range .pp_calbtn:hover{
        border-color: rgba(200,178,90,0.58);
        box-shadow: 0 0 0 3px rgba(200,178,90,0.12), 0 12px 28px rgba(0,0,0,0.60);
        transform: translateY(-50%) scale(1.03);
        color: rgba(255,255,255,0.98);
      }
      .pp_range .pp_calbtn:active{
        transform: translateY(-50%) scale(0.98);
      }

      /* Chips (hover) */
      .pp_range .pp_yearchip:hover{
        border-color: rgba(255,255,255,0.22);
        box-shadow: 0 0 0 3px rgba(200,178,90,0.08);
        transform: translateY(-1px);
      }

      /* ✅ Foco do chip NÃO parece "selecionado" */
      .pp_range .pp_yearchip:focus{
        outline: none !important;
      }
      .pp_range .pp_yearchip:focus-visible{
        outline: none !important;
        border-color: rgba(255,255,255,0.22) !important;
        box-shadow: 0 0 0 3px rgba(255,255,255,0.06) !important;
        transform: translateY(-1px);
      }

      /* ✅ Responsivo */
      @media (max-width: 760px){
        .pp_range_row{ grid-template-columns: 1fr !important; }
        .pp_yearchips{
          grid-auto-flow: row !important;
          grid-auto-columns: unset !important;
          grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
        }
      }
    `,
  };

  const handleClearYears = useCallback(
    (e) => {
      try {
        e?.currentTarget?.blur?.();
      } catch {}
      onClearYears();
    },
    [onClearYears]
  );

  const handleToggleYear = useCallback(
    (y, e) => {
      try {
        e?.currentTarget?.blur?.();
      } catch {}
      onToggleYear(y);
    },
    [onToggleYear]
  );

  const renderTop = () => {
    if (yearsArr.length) {
      return (
        <div style={ui.topBar}>
          <div className="pp_yearchips" style={ui.chips}>
            <button
              type="button"
              className="pp_yearchip"
              onMouseDown={(e) => e.preventDefault()}
              onClick={handleClearYears}
              style={{ ...ui.chip, ...(isAllYears ? ui.chipActive : null) }}
            >
              Todos
            </button>

            {yearsArr.map((y) => {
              const isActive = !isAllYears && selectedYearsArr.includes(y);
              return (
                <button
                  key={y}
                  type="button"
                  className="pp_yearchip"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={(e) => handleToggleYear(y, e)}
                  style={{ ...ui.chip, ...(isActive ? ui.chipActive : null) }}
                  title={String(y)}
                >
                  {y}
                </button>
              );
            })}
          </div>
        </div>
      );
    }

    return (
      <div style={ui.topBar} title={label || "Período"}>
        <span style={ui.topTitle}>{label || "Período"}</span>
      </div>
    );
  };

  return (
    <div className="pp_range" style={ui.wrap}>
      <style>{ui.styleTag}</style>

      {renderTop()}

      <div className="pp_range_row" style={ui.row}>
        <div style={ui.inputWrap}>
          <input
            ref={fromRef}
            type="date"
            value={normalized.from || rawFrom || ""}
            min={minISO || undefined}
            max={maxISO || undefined}
            onChange={onInputFrom}
            style={ui.input}
            aria-label="Data inicial"
          />

          <button
            type="button"
            className="pp_calbtn"
            style={ui.iconBtn}
            aria-label="Abrir calendário (data inicial)"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => openPickerByRef(fromRef)}
            title="Abrir calendário"
          >
            <CalendarIcon />
          </button>
        </div>

        <div style={ui.inputWrap}>
          <input
            ref={toRef}
            type="date"
            value={normalized.to || rawTo || ""}
            min={minISO || undefined}
            max={maxISO || undefined}
            onChange={onInputTo}
            style={ui.input}
            aria-label="Data final"
          />

          <button
            type="button"
            className="pp_calbtn"
            style={ui.iconBtn}
            aria-label="Abrir calendário (data final)"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => openPickerByRef(toRef)}
            title="Abrir calendário"
          >
            <CalendarIcon />
          </button>
        </div>
      </div>

      <div style={ui.sliderWrap}>
        <div style={ui.track} />
        <div style={ui.highlight} />

        <input
          type="range"
          min={0}
          max={totalDays}
          value={fromOffset}
          onChange={onSliderFrom}
          style={{ ...ui.slider, zIndex: 3 }}
          aria-label="Ajustar data inicial"
        />

        <input
          type="range"
          min={0}
          max={totalDays}
          value={toOffset}
          onChange={onSliderTo}
          style={{ ...ui.slider, zIndex: 2 }}
          aria-label="Ajustar data final"
        />
      </div>
    </div>
  );
}
