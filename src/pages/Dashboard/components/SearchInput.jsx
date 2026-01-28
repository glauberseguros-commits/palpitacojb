// src/pages/Dashboard/components/SearchInput.jsx
import React, { useMemo, useRef, useState, useCallback } from "react";

function normalizeDigitsOnly(v) {
  return String(v ?? "").replace(/\D+/g, "");
}

function buildSlots(digits) {
  const d = String(digits || "").slice(0, 4);
  const len = d.length;

  // antes de 2 dígitos: só mostra “vazio” (bolinhas)
  if (len < 2) return ["", "", "", ""];

  const slots = ["", "", "", ""];

  // 2 dígitos = dezena (últimos 2) => **DD
  if (len === 2) {
    slots[0] = "*";
    slots[1] = "*";
    slots[2] = d[0];
    slots[3] = d[1];
    return slots;
  }

  // 3 dígitos = centena (últimos 3) => *DDD
  if (len === 3) {
    slots[0] = "*";
    slots[1] = d[0];
    slots[2] = d[1];
    slots[3] = d[2];
    return slots;
  }

  // 4 dígitos = milhar => DDDD
  slots[0] = d[0];
  slots[1] = d[1];
  slots[2] = d[2];
  slots[3] = d[3];
  return slots;
}

export default function SearchInput({
  value,
  onChange,
  loading,
  actions,
  onSubmit, // Enter dispara Buscar
  // ✅ novo: dados para “Ocorrências” e “Consulta”
  totalMatches = 0,
  queryInfo,
}) {
  const inputRef = useRef(null);
  const [focused, setFocused] = useState(false);

  const digits = useMemo(() => normalizeDigitsOnly(value).slice(0, 4), [value]);

  const hint = useMemo(() => {
    if (digits.length < 2)
      return "Digite 2, 3 ou 4 dígitos (ex: 00 / 000 / 0000)";
    if (digits.length === 2) return "Modo: Dezena (últimos 2 dígitos)";
    if (digits.length === 3) return "Modo: Centena (últimos 3 dígitos)";
    return "Modo: Milhar (4 dígitos)";
  }, [digits]);

  const slots = useMemo(() => buildSlots(digits), [digits]);

  const canSubmit = useMemo(() => digits.length >= 2 && !loading, [digits, loading]);

  const focusInput = useCallback(() => {
    if (loading) return;
    inputRef.current?.focus();
  }, [loading]);

  const trySubmit = useCallback(() => {
    if (!onSubmit) return;
    if (!canSubmit) return;
    onSubmit();
  }, [onSubmit, canSubmit]);

  const consultaLabel = useMemo(() => {
    const lbl = String(queryInfo?.label || "").trim();
    return lbl ? lbl : "—";
  }, [queryInfo]);

  return (
    <div className="ppSearchInput">
      <style>{`
        .ppSearchInput{
          border-radius:18px;
          border:1px solid rgba(202,166,75,0.16);
          background:rgba(0,0,0,0.35);
          box-shadow:0 20px 60px rgba(0,0,0,0.35);
          padding:12px;
          display:flex;
          flex-direction:column;
          gap:10px;
          min-height:120px;
          min-width:0; /* ✅ permite encolher sem cortar */
        }

        /* ✅ TÍTULO CENTRALIZADO */
        .ppSearchInput .ttl{
          font-size:12px;
          font-weight:900;
          letter-spacing:0.4px;
          text-transform:uppercase;
          color:rgba(233,233,233,0.85);
          text-align:center;
        }

        /* ✅ LINHA: quadradinhos + actions (dentro da borda) */
        .ppInputTopRow{
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:12px;
          width:100%;
          min-width:0;
        }

        .ppInputCenter{
          flex:1 1 auto;
          min-width:0;
          display:flex;
          align-items:center;
          justify-content:center;
        }

        .ppInputActionsIn{
          flex:0 0 auto;
          display:flex;
          align-items:center;
          justify-content:flex-end;
          gap:10px;
          padding-left:6px;
          min-width:0;
        }

        .ppBoxesWrap{
          position:relative;
          display:flex;
          align-items:center;
          justify-content:center;
          outline:none;
          min-width:0;
        }

        .ppHiddenInput{
          position:absolute;
          inset:0;
          opacity:0;
          width:100%;
          height:100%;
          border:none;
          outline:none;
          caret-color:transparent;
        }

        .ppBoxes{
          display:flex;
          gap:10px;
          user-select:none;
        }

        .ppBox{
          width:clamp(44px, 4.2vw, 54px);
          height:clamp(44px, 4.2vw, 54px);
          border-radius:14px;
          display:flex;
          align-items:center;
          justify-content:center;
          border:1px solid rgba(202,166,75,0.22);
          background:rgba(0,0,0,0.55);
          box-shadow:0 12px 34px rgba(0,0,0,0.30);
          font-size:clamp(18px, 1.6vw, 20px);
          font-weight:900;
          color:#e9e9e9;
          transition:all 0.12s ease;
        }

        .ppBox.muted{
          color:rgba(233,233,233,0.38);
        }

        .ppBoxesWrap.isFocused .ppBox{
          border-color:rgba(202,166,75,0.55);
          background:rgba(0,0,0,0.65);
        }

        .ppBox.active{
          transform:translateY(-1px);
          border-color:rgba(202,166,75,0.85);
          box-shadow:0 14px 40px rgba(0,0,0,0.38);
        }

        .ppSearchInput .hint{
          font-size:11px;
          color:rgba(233,233,233,0.70);
          line-height:1.25;
          text-align:center;
        }

        .ppSearchInput .hint b{
          color:#caa64b;
          font-weight:900;
        }

        /* ✅ mini KPIs dentro do card do input */
        .ppInputMiniKpis{
          display:flex;
          align-items:baseline;
          justify-content:space-between;
          gap:12px;
          padding-top:2px;
          min-width:0;
        }
        .ppMiniCol{
          display:flex;
          flex-direction:column;
          gap:2px;
          min-width:0;
          flex:1 1 0; /* ✅ divide o espaço e permite shrink */
        }
        .ppMiniT{
          font-size:10px;
          color:rgba(233,233,233,0.62);
          text-transform:uppercase;
          letter-spacing:0.6px;
        }
        .ppMiniV{
          font-size:13px;
          font-weight:900;
          color:rgba(233,233,233,0.92);
          white-space:nowrap;
          overflow:hidden;
          text-overflow:ellipsis;
          max-width:100%; /* ✅ remove teto fixo (520px) */
        }
        .ppMiniV b{ color:#caa64b; }

        /* ✅ RESPONSIVO: ações descem abaixo */
        @media (max-width: 900px){
          .ppInputTopRow{
            flex-direction:column;
            align-items:stretch;
          }
          .ppInputActionsIn{
            justify-content:center;
            padding-left:0;
          }
          .ppInputMiniKpis{
            flex-direction:column;
            align-items:center;
            text-align:center;
          }
          .ppMiniCol{
            width:100%;
            align-items:center;
            text-align:center;
          }
        }
      `}</style>

      <div className="ttl">Digite a dezena / centena / milhar</div>

      <div className="ppInputTopRow">
        <div className="ppInputCenter">
          <div
            className={["ppBoxesWrap", focused ? "isFocused" : ""].join(" ")}
            onClick={focusInput}
            role="button"
            tabIndex={0}
            aria-label="Digite a dezena, centena ou milhar"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (focused) trySubmit();
                else focusInput();
              }
              if (e.key === " ") {
                e.preventDefault();
                focusInput();
              }
            }}
          >
            <input
              ref={inputRef}
              className="ppHiddenInput"
              value={digits}
              onChange={(e) =>
                onChange(normalizeDigitsOnly(e.target.value || "").slice(0, 4))
              }
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="one-time-code"
              disabled={!!loading}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  trySubmit();
                }
              }}
            />

            <div className="ppBoxes">
              {slots.map((ch, idx) => {
                const activeIndex = Math.min(digits.length, 3);
                const isActive = focused && idx === activeIndex;

                const isMuted = ch === "";
                const display = ch === "" ? "•" : ch;

                return (
                  <div
                    key={idx}
                    className={[
                      "ppBox",
                      isMuted ? "muted" : "",
                      isActive ? "active" : "",
                    ].join(" ")}
                  >
                    {display}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ✅ BOTÕES DENTRO DO CARD */}
        {actions ? <div className="ppInputActionsIn">{actions}</div> : null}
      </div>

      {/* ✅ Ocorrências + Consulta DENTRO do card do input */}
      <div className="ppInputMiniKpis">
        <div className="ppMiniCol">
          <div className="ppMiniT">Ocorrências</div>
          <div className="ppMiniV">
            <b>{Number(totalMatches || 0)}</b>
          </div>
        </div>

        <div className="ppMiniCol" style={{ textAlign: "right", alignItems: "flex-end" }}>
          <div className="ppMiniT">Consulta</div>
          <div className="ppMiniV" title={consultaLabel}>
            <b>{consultaLabel}</b>
          </div>
        </div>
      </div>

      <div className="hint">
        {hint} {loading ? <b> · buscando...</b> : null}
      </div>
    </div>
  );
}
