// src/pages/Top3/Top3View.jsx
import React, { useMemo, useState, useCallback, useEffect } from "react";

function toPercent(score) {
  const n = Number(score);
  if (!Number.isFinite(n)) return 0;
  // Heurística: se vier 0..1, converte para 0..100
  const pct = n <= 1 ? n * 100 : n;
  return Math.max(0, Math.min(100, pct));
}

function formatGrupo(grupo) {
  const g = Number(grupo);
  if (!Number.isFinite(g) || g <= 0) return "—";
  return String(Math.trunc(g)).padStart(2, "0");
}

function pickSeal(pct) {
  const p = Number(pct || 0);
  if (p >= 8) return { label: "MAIS FORTE", emoji: "🔥" };
  if (p >= 5) return { label: "EQUILIBRADO", emoji: "⚖️" };
  return { label: "OPORTUNIDADE", emoji: "🎯" };
}

function normalizeMilharStr(v) {
  const s = String(v || "").trim();
  if (!s) return "";
  // mantém somente dígitos
  const dig = s.replace(/\D+/g, "");
  if (!dig) return "";
  // milhar = 4 dígitos (preserva zero à esquerda)
  return dig.length >= 4 ? dig.slice(-4) : dig.padStart(4, "0");
}

function centenaFromMilhar(m4) {
  const s = normalizeMilharStr(m4);
  if (!s) return "";
  return s.slice(-3);
}

function dezenaFromMilhar(m4) {
  const s = normalizeMilharStr(m4);
  if (!s) return "";
  return s.slice(-2);
}

function getDezenasFixasFromGrupo(grupo) {
  const g = Number(grupo);
  if (!Number.isFinite(g) || g < 1 || g > 25) return [];
  const start = (g - 1) * 4 + 1; // 01,05,09,...,53
  const out = [];
  for (let i = 0; i < 4; i += 1) out.push(String(start + i).padStart(2, "0"));
  return out;
}

/**
 * ✅ MONTA 20 MILHARES EM 4 COLUNAS (5 POR DEZENA FIXA)
 * - cada grupo tem 4 dezenas fixas
 * - cada coluna = 1 dezena fixa
 * - cada coluna precisa ter 5 milhares
 * - mantém "sem repetir centena" GLOBAL (últimos 3 dígitos)
 *
 * Retorna:
 * - dezenas: ["53","54","55","56"]
 * - cols: { "53":[...5], "54":[...5], ... }
 * - rows: [[c53_1,c54_1,c55_1,c56_1], ... x5]
 * - flat20: rows.flat() (ordem igual ao grid)
 */
function build20ByDezena({ grupo, baseMilhares, perCol = 5 }) {
  const g = Number(grupo);
  const dezenas = getDezenasFixasFromGrupo(g);
  if (!dezenas.length) {
    return { dezenas: [], cols: {}, rows: [], flat20: [] };
  }

  const input = Array.isArray(baseMilhares) ? baseMilhares : [];
  const normalized = input.map(normalizeMilharStr).filter(Boolean);

  // buckets por dezena (somente das dezenas fixas)
  const byDz = new Map(); // dz -> [m4...]
  for (const dz of dezenas) byDz.set(dz, []);
  for (const m4 of normalized) {
    const dz = dezenaFromMilhar(m4);
    if (byDz.has(dz)) byDz.get(dz).push(m4);
  }

  // seletores com restrição global de centena
  const seenCent = new Set();
  const seenMilhar = new Set();

  const cols = {};
  for (const dz of dezenas) cols[dz] = [];

  const tryPush = (dz, m4) => {
    const mm = normalizeMilharStr(m4);
    if (!mm) return false;
    const c3 = centenaFromMilhar(mm);
    if (!c3) return false;

    if (seenCent.has(c3)) return false; // ✅ não repete centena (global)
    if (seenMilhar.has(mm)) return false;

    cols[dz].push(mm);
    seenCent.add(c3);
    seenMilhar.add(mm);
    return true;
  };

  // 1) primeiro: aproveita o que veio do motor, por dezena, na ordem em que chegou
  for (const dz of dezenas) {
    const arr = byDz.get(dz) || [];
    for (const m4 of arr) {
      if (cols[dz].length >= perCol) break;
      tryPush(dz, m4);
    }
  }

  // 2) fallback determinístico por dezena fixa (respeitando dezenas)
  // gera: <prefix><dz><u> (4 dígitos)
  for (let prefix = 0; prefix <= 9; prefix += 1) {
    let doneAll = true;

    for (const dz of dezenas) {
      if (cols[dz].length >= perCol) continue;

      doneAll = false;
      for (let u = 0; u <= 9 && cols[dz].length < perCol; u += 1) {
        const m4 = `${prefix}${dz}${u}`;
        tryPush(dz, m4);
      }
    }

    if (doneAll) break;
  }

  // 3) último recurso (não deveria precisar): completa com varredura geral,
  // mas ainda tentando manter a dezena correta de cada coluna.
  for (let i = 0; i < 9999; i += 1) {
    let allOk = true;

    for (const dz of dezenas) {
      if (cols[dz].length >= perCol) continue;
      allOk = false;

      const m4 = String(i).padStart(4, "0");
      if (dezenaFromMilhar(m4) !== dz) continue;
      tryPush(dz, m4);
    }

    if (allOk) break;
  }

  // garante tamanho exato por coluna (sem undefined)
  for (const dz of dezenas) {
    while (cols[dz].length < perCol) cols[dz].push("");
    if (cols[dz].length > perCol) cols[dz] = cols[dz].slice(0, perCol);
  }

  // monta 5 linhas x 4 colunas
  const rows = [];
  for (let r = 0; r < perCol; r += 1) {
    rows.push(dezenas.map((dz) => cols[dz][r] || ""));
  }

  // ordem do grid (linha a linha)
  const flat20 = rows.flat().filter(Boolean);

  return { dezenas, cols, rows, flat20 };
}

/** Imagem com fallback (array de srcs) */
function ImgWithFallback({ srcs, alt, size = 84, style }) {
  const list = Array.isArray(srcs) ? srcs.filter(Boolean) : [];
  const [i, setI] = useState(0);
  const src = list[i] || "";
  const onError = () => {
    if (i < list.length - 1) setI((x) => x + 1);
  };

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 14,
        border: "1px solid rgba(201,168,62,0.40)",
        background: "rgba(0,0,0,0.35)",
        display: "grid",
        placeItems: "center",
        overflow: "hidden",
        ...style,
      }}
    >
      {src ? (
        <img
          src={src}
          alt={alt || ""}
          width={size}
          height={size}
          onError={onError}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
            imageRendering: "auto",
          }}
        />
      ) : (
        <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 12 }}>
          sem imagem
        </div>
      )}
    </div>
  );
}

export default function Top3View(props) {
  const {
    loading,
    error,
    top3,
    layerMetaText,
    lastLabel,
    prevLabel,
    theme,

    // ✅ opcionais (se o controller passar)
    build16, // (grupo2) => { dezenas, slots:[{dezena,milhar}] }
    buildMilhares, // (grupo2, count) => { slots:[...]} ou array
  } = props || {};

  const list = Array.isArray(top3) ? top3.slice(0, 3) : [];

  const meta = useMemo(() => {
    const last = lastLabel || "—";
    const prev = prevLabel || "—";
    const layer = layerMetaText || "—";
    return { last, prev, layer };
  }, [lastLabel, prevLabel, layerMetaText]);

  const t = theme || {
    bg: "#050505",
    panel: "rgba(0,0,0,0.55)",
    border: "rgba(255,255,255,0.18)",
    text: "rgba(255,255,255,0.92)",
    muted: "rgba(255,255,255,0.72)",
    accent: "rgba(201,168,62,0.92)",
  };

  const [showTech, setShowTech] = useState(false);

  // ✅ feedback premium de copiar (por card / por célula)
  const [copiedAllKey, setCopiedAllKey] = useState("");
  const [copiedCellKey, setCopiedCellKey] = useState("");

  useEffect(() => {
    if (!copiedAllKey) return;
    const id = setTimeout(() => setCopiedAllKey(""), 900);
    return () => clearTimeout(id);
  }, [copiedAllKey]);

  useEffect(() => {
    if (!copiedCellKey) return;
    const id = setTimeout(() => setCopiedCellKey(""), 750);
    return () => clearTimeout(id);
  }, [copiedCellKey]);

  const copyText = useCallback(async (txt) => {
    const s = String(txt || "").trim();
    if (!s) return false;

    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(s);
        return true;
      }
    } catch {
      // cai no fallback abaixo
    }

    // fallback antigo
    try {
      const ta = document.createElement("textarea");
      ta.value = s;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      ta.style.top = "0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      return true;
    } catch {
      return false;
    }
  }, []);

  return (
    <div style={{ padding: 16, color: t.text }}>
      {/* CSS local (hover/active/shine) */}
      <style>{`
        .pp-m20wrap{
          position: relative;
        }
        .pp-m20hdr{
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:10px;
        }
        .pp-btn{
          border-radius: 999px;
          padding: 9px 12px;
          background: rgba(201,168,62,0.16);
          border: 1px solid rgba(201,168,62,0.35);
          color: rgba(255,255,255,0.92);
          font-weight: 950;
          cursor: pointer;
          white-space: nowrap;
          transition: transform .12s ease, box-shadow .18s ease, background .18s ease, border-color .18s ease;
          box-shadow: 0 0 0 rgba(201,168,62,0.0);
        }
        .pp-btn:hover{
          transform: translateY(-1px);
          background: rgba(201,168,62,0.22);
          border-color: rgba(201,168,62,0.48);
          box-shadow: 0 10px 24px rgba(0,0,0,0.35), 0 0 0 1px rgba(201,168,62,0.10);
        }
        .pp-btn:active{
          transform: translateY(0px);
        }

        .pp-chipRow{
          display:grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 10px;
          padding: 0 12px;
          margin-top: 2px;
        }
        .pp-chip{
          display:flex;
          justify-content:center;
          align-items:center;
          height: 26px;
          border-radius: 999px;
          font-size: 12px;
          font-weight: 950;
          letter-spacing: 1.4px;
          color: rgba(255,255,255,0.90);
          background: linear-gradient(180deg, rgba(201,168,62,0.22), rgba(201,168,62,0.10));
          border: 1px solid rgba(201,168,62,0.35);
          box-shadow: 0 10px 26px rgba(0,0,0,0.35);
        }

        .pp-gridBox{
          position: relative;
          display: grid;
          gap: 8px;
          padding: 12px;
          border-radius: 14px;
          background: radial-gradient(1200px 260px at 50% 0%, rgba(201,168,62,0.10), rgba(0,0,0,0.28));
          border: 1px solid rgba(201,168,62,0.22);
          overflow:hidden;
        }
        .pp-gridBox:before{
          content:"";
          position:absolute;
          inset:-120px -60px auto -60px;
          height:160px;
          background: radial-gradient(closest-side, rgba(201,168,62,0.14), rgba(201,168,62,0.0));
          pointer-events:none;
          filter: blur(1px);
        }

        .pp-row{
          display:grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 10px;
        }

        .pp-pill{
          position: relative;
          padding: 11px 10px;
          border-radius: 14px;
          text-align:center;
          font-weight: 1000;
          letter-spacing: 1.6px;
          color: rgba(255,255,255,0.92);
          user-select: text;
          transition: transform .10s ease, box-shadow .18s ease, background .18s ease, border-color .18s ease, opacity .18s ease;
          background: linear-gradient(180deg, rgba(201,168,62,0.14), rgba(201,168,62,0.08));
          border: 1px solid rgba(201,168,62,0.28);
          box-shadow: 0 10px 26px rgba(0,0,0,0.28);
        }
        .pp-pill[data-empty="1"]{
          opacity: .32;
          cursor: default;
          box-shadow: none;
        }
        .pp-pill:not([data-empty="1"]){
          cursor:pointer;
        }
        .pp-pill:not([data-empty="1"]):hover{
          transform: translateY(-1px);
          border-color: rgba(201,168,62,0.52);
          background: linear-gradient(180deg, rgba(201,168,62,0.22), rgba(201,168,62,0.10));
          box-shadow: 0 16px 34px rgba(0,0,0,0.42), 0 0 0 1px rgba(201,168,62,0.10);
        }
        .pp-pill:not([data-empty="1"]):active{
          transform: translateY(0px);
        }
        .pp-copiedBadge{
          position:absolute;
          right: 10px;
          top: 10px;
          font-size: 11px;
          font-weight: 900;
          color: rgba(0,0,0,0.92);
          background: rgba(201,168,62,0.92);
          padding: 4px 8px;
          border-radius: 999px;
          box-shadow: 0 10px 20px rgba(0,0,0,0.35);
        }

        .pp-miniNote{
          color: rgba(255,255,255,0.68);
          font-size: 12px;
          font-weight: 800;
        }
      `}</style>

      {/* Cabeçalho */}
      <div
        style={{
          background: t.panel,
          border: `1px solid ${t.border}`,
          borderRadius: 14,
          padding: 14,
          marginBottom: 12,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div>
            <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 6 }}>
              TOP3 (Próximo sorteio)
            </div>
            <div style={{ color: t.muted, fontSize: 13, lineHeight: 1.25 }}>
              <div>
                <b>Último:</b> {meta.last}
              </div>
              <div>
                <b>Anterior:</b> {meta.prev}
              </div>
              <div>
                <b>Condição:</b> {meta.layer}
              </div>
            </div>
          </div>

          {/* Toggle técnico */}
          <button
            type="button"
            onClick={() => setShowTech((v) => !v)}
            style={{
              borderRadius: 999,
              padding: "8px 10px",
              background: "rgba(0,0,0,0.35)",
              border: `1px solid rgba(201,168,62,0.35)`,
              color: t.text,
              fontWeight: 800,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
            title="Mostrar/ocultar detalhes técnicos"
          >
            {showTech ? "Ocultar detalhes" : "Ver detalhes"}
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ color: t.muted }}>Carregando…</div>
      ) : error ? (
        <div style={{ color: "#ff6b6b", fontWeight: 700 }}>
          {String(error)}
        </div>
      ) : !list.length ? (
        <div style={{ color: t.muted }}>Sem dados para calcular TOP3.</div>
      ) : (
        <div
          style={{
            display: "grid",
            gap: 12,
            gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))",
            alignItems: "start",
          }}
        >
          {list.map((item, idx) => {
            const grupoTxt = formatGrupo(item?.grupo);
            const animal = String(item?.animal || "").trim();

            const samplesRaw = Number(item?.meta?.samples ?? item?.samples ?? 0);
            const samples = Number.isFinite(samplesRaw)
              ? Math.max(0, Math.trunc(samplesRaw))
              : 0;

            const freqRaw = Number(item?.freq ?? 0);
            const freq = Number.isFinite(freqRaw)
              ? Math.max(0, Math.trunc(freqRaw))
              : 0;

            const denom = samples > 0 ? samples * 7 : 0;
            const derivedScore = denom > 0 ? freq / denom : 0;

            const pct = toPercent(item?.probPct ?? item?.score ?? derivedScore);
            const seal = pickSeal(pct);

            const iconSrcs = Array.isArray(item?.imgIcon)
              ? item.imgIcon
              : Array.isArray(item?.imgBg)
              ? item.imgBg
              : [];

            // ========= Milhares (20) =========
            let milharesBase = [];
            const m20 = Array.isArray(item?.milhares20) ? item.milhares20 : null;
            const mAny = Array.isArray(item?.milhares) ? item.milhares : null;

            if (m20 && m20.length) milharesBase = m20.slice(0);
            else if (mAny && mAny.length) milharesBase = mAny.slice(0);

            // fallback: props.buildMilhares(grupo, 20) ou props.build16(grupo)
            if (!milharesBase.length) {
              const g = Number(item?.grupo);
              if (Number.isFinite(g) && g > 0) {
                if (typeof buildMilhares === "function") {
                  const out = buildMilhares(g, 20);
                  if (Array.isArray(out)) {
                    milharesBase = out.slice(0);
                  } else if (out && Array.isArray(out.slots)) {
                    milharesBase = out.slots.map((x) => x?.milhar).filter(Boolean);
                  }
                } else if (typeof build16 === "function") {
                  const out16 = build16(g);
                  const slots16 = Array.isArray(out16?.slots) ? out16.slots : [];
                  milharesBase = slots16.map((x) => x?.milhar).filter(Boolean);
                }
              }
            }

            // ✅ aqui é a correção: 4 colunas (dezena fixa) x 5 linhas
            const grupoNum = Number(item?.grupo);
            const grid = build20ByDezena({
              grupo: grupoNum,
              baseMilhares: milharesBase,
              perCol: 5,
            });

            const dezenasHeader = grid.dezenas; // ["53","54","55","56"]
            const gridRows = grid.rows; // 5x4

            const key = `${String(item?.grupo ?? "g")}__${animal || "x"}__${idx}`;
            const title =
              idx === 0
                ? "1º MAIS FORTE"
                : idx === 1
                ? "2º MAIS FORTE"
                : "3º MAIS FORTE";

            const doCopyAll = async () => {
              const ok = await copyText(grid.flat20.join(" "));
              if (ok) setCopiedAllKey(key);
            };

            const doCopyOne = async (m, rIdx, cIdx) => {
              const mm = normalizeMilharStr(m);
              if (!mm) return;
              const ok = await copyText(mm);
              if (ok) setCopiedCellKey(`${key}__${rIdx}__${cIdx}`);
            };

            return (
              <div
                key={key}
                style={{
                  background: t.panel,
                  border: `1px solid ${t.border}`,
                  borderRadius: 16,
                  padding: 16,
                  display: "grid",
                  gap: 12,
                  ...(idx === 0 ? { gridColumn: "1 / -1" } : null),
                }}
              >
                {/* Top strip */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 10,
                        display: "grid",
                        placeItems: "center",
                        background: "rgba(201,168,62,0.15)",
                        border: "1px solid rgba(201,168,62,0.35)",
                        fontWeight: 900,
                        color: t.accent,
                      }}
                    >
                      {idx + 1}
                    </div>

                    <div style={{ display: "grid", gap: 2 }}>
                      <div style={{ fontWeight: 900, letterSpacing: 0.4 }}>
                        🏅 {title}
                      </div>
                      <div style={{ color: t.muted, fontSize: 12 }}>
                        {seal.emoji} {seal.label}
                      </div>
                    </div>
                  </div>

                  <div style={{ color: t.muted, fontSize: 12 }}>
                    Amostras: <b style={{ color: t.text }}>{samples}</b>
                    {"  "}•{"  "}
                    Freq: <b style={{ color: t.text }}>{freq}</b>
                  </div>
                </div>

                {/* Main header */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "96px 1fr 180px",
                    gap: 14,
                    alignItems: "center",
                  }}
                >
                  <ImgWithFallback
                    srcs={iconSrcs}
                    alt={animal ? `${animal}` : `G${grupoTxt}`}
                    size={96}
                  />

                  <div style={{ display: "grid", gap: 6 }}>
                    <div style={{ fontSize: 12, color: t.muted, fontWeight: 800 }}>
                      GRUPO {grupoTxt}
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 950, letterSpacing: 0.6 }}>
                      {animal ? animal.toUpperCase() : "—"}
                    </div>
                    <div style={{ color: t.muted, fontSize: 12 }}>
                      Próximo sorteio (TOP3)
                    </div>
                  </div>

                  <div
                    style={{
                      justifySelf: "end",
                      textAlign: "right",
                      display: "grid",
                      gap: 6,
                    }}
                  >
                    <div style={{ color: t.muted, fontSize: 12, fontWeight: 800 }}>
                      CONFIANÇA
                    </div>
                    <div
                      style={{
                        fontSize: 34,
                        fontWeight: 950,
                        color: t.accent,
                        lineHeight: 1,
                      }}
                    >
                      {pct.toFixed(2)}%
                    </div>

                    <div
                      style={{
                        height: 8,
                        borderRadius: 999,
                        background: "rgba(255,255,255,0.10)",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          width: `${pct}%`,
                          background: t.accent,
                          opacity: 0.75,
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* Milhares (Premium) */}
                <div
                  className="pp-m20wrap"
                  style={{
                    borderTop: "1px solid rgba(255,255,255,0.08)",
                    paddingTop: 12,
                    display: "grid",
                    gap: 10,
                  }}
                >
                  <div className="pp-m20hdr">
                    <div style={{ display: "grid", gap: 2 }}>
                      <div style={{ fontWeight: 950 }}>📌 20 MILHARES RECOMENDADAS</div>
                      <div className="pp-miniNote">
                        Clique em uma milhar para copiar • Grade por dezena fixa
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={doCopyAll}
                      className="pp-btn"
                      title="Copiar as 20 milhares"
                    >
                      {copiedAllKey === key ? "✅ Copiado" : "Copiar 20"}
                    </button>
                  </div>

                  {/* Chips das dezenas */}
                  {dezenasHeader.length ? (
                    <div className="pp-chipRow">
                      {dezenasHeader.map((dz) => (
                        <div key={dz} className="pp-chip">
                          {dz}
                        </div>
                      ))}
                    </div>
                  ) : null}

                  <div className="pp-gridBox">
                    {gridRows.map((row, rIdx) => (
                      <div key={rIdx} className="pp-row">
                        {row.map((m, cIdx) => {
                          const mm = normalizeMilharStr(m);
                          const empty = !mm ? "1" : "0";
                          const cKey = `${key}__${rIdx}__${cIdx}`;
                          const isCopied = copiedCellKey === cKey;

                          return (
                            <div
                              key={`${rIdx}-${cIdx}`}
                              className="pp-pill"
                              data-empty={empty}
                              title={mm ? "Clique para copiar" : ""}
                              onClick={() => doCopyOne(mm, rIdx, cIdx)}
                            >
                              {mm || "—"}
                              {isCopied ? (
                                <div className="pp-copiedBadge">COPIADO</div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Detalhes técnicos (opcional) */}
                {showTech && Array.isArray(item?.reasons) && item.reasons.length ? (
                  <div
                    style={{
                      borderTop: "1px solid rgba(255,255,255,0.08)",
                      paddingTop: 12,
                      color: t.muted,
                      fontSize: 12,
                      lineHeight: 1.25,
                      display: "grid",
                      gap: 6,
                    }}
                  >
                    <div style={{ fontWeight: 900, color: t.text }}>
                      Detalhes técnicos
                    </div>
                    {item.reasons.slice(0, 10).map((r, i) => (
                      <div key={i}>• {String(r)}</div>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}