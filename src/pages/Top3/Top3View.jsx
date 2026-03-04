// src/pages/Top3/Top3View.jsx
import React, { useMemo, useState, useCallback } from "react";

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

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
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
 * Completa milhares até targetCount, SEM repetir centena (últimos 3 dígitos).
 * ✅ Fallback respeita as dezenas do grupo (01-04, 05-08, ...).
 */
function fillTo20UniqueCentena({ grupo, baseMilhares, targetCount = 20 }) {
  const g = Number(grupo);
  const out = [];

  const seenCent = new Set();
  const seenMilhar = new Set();

  const push = (m) => {
    const m4 = normalizeMilharStr(m);
    if (!m4) return;
    const c = centenaFromMilhar(m4);
    if (!c) return;
    if (seenCent.has(c)) return; // ✅ não repete centena
    if (seenMilhar.has(m4)) return;
    seenCent.add(c);
    seenMilhar.add(m4);
    out.push(m4);
  };

  // 1) entra com os que vieram do motor (normaliza + remove centena repetida)
  (Array.isArray(baseMilhares) ? baseMilhares : []).forEach(push);

  // 2) fallback determinístico POR GRUPO respeitando dezenas fixas
  // gera milhares do tipo: <prefixo><dezenaFix><unidade>
  // exemplo dezena 53 => 0 53 0..9, depois 1 53 0..9, etc.
  const dezenasFixas = getDezenasFixasFromGrupo(g);
  if (dezenasFixas.length) {
    // 25 * 4 dezenas => garante coerência JB
    for (let prefix = 0; prefix <= 9 && out.length < targetCount; prefix += 1) {
      for (const dz of dezenasFixas) {
        for (let u = 0; u <= 9 && out.length < targetCount; u += 1) {
          const m4 = `${prefix}${dz}${u}`; // 4 dígitos
          push(m4);
        }
      }
    }
  }

  // 3) se por qualquer motivo ainda faltou (grupo inválido), completa genérico
  for (let i = 0; i < 9999 && out.length < targetCount; i++) {
    const m4 = String(i).padStart(4, "0");
    push(m4);
  }

  return out.slice(0, targetCount);
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

  const copyText = useCallback(async (txt) => {
    const s = String(txt || "").trim();
    if (!s) return;

    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(s);
        return;
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
    } catch {}
  }, []);

  return (
    <div style={{ padding: 16, color: t.text }}>
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
        // ✅ Layout: 1º isolado (span total), 2º e 3º lado a lado (desktop)
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
            // 1) prioriza item.milhares20 / item.milhares (já vindo do hook)
            let milharesBase = [];
            const m20 = Array.isArray(item?.milhares20) ? item.milhares20 : null;
            const mAny = Array.isArray(item?.milhares) ? item.milhares : null;

            if (m20 && m20.length) milharesBase = m20.slice(0);
            else if (mAny && mAny.length) milharesBase = mAny.slice(0);

            // 2) fallback: props.buildMilhares(grupo, 20) ou props.build16(grupo)
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

            // ✅ GARANTIA: 20 reais, sem repetir centena, respeitando dezenas do grupo
            const grupoNum = Number(item?.grupo);
            const milhares20 = fillTo20UniqueCentena({
              grupo: grupoNum,
              baseMilhares: milharesBase,
              targetCount: 20,
            });

            const copyAll = () => {
              copyText(milhares20.join(" "));
            };

            const key = `${String(item?.grupo ?? "g")}__${animal || "x"}__${idx}`;

            const title =
              idx === 0
                ? "1º MAIS FORTE"
                : idx === 1
                ? "2º MAIS FORTE"
                : "3º MAIS FORTE";

            const gridRows = chunk(milhares20, 4); // 20 => 5 linhas de 4

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

                {/* Milhares */}
                <div
                  style={{
                    borderTop: "1px solid rgba(255,255,255,0.08)",
                    paddingTop: 12,
                    display: "grid",
                    gap: 10,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 10,
                    }}
                  >
                    <div style={{ fontWeight: 900 }}>📌 20 MILHARES RECOMENDADAS</div>

                    <button
                      type="button"
                      onClick={copyAll}
                      style={{
                        borderRadius: 999,
                        padding: "8px 10px",
                        background: "rgba(201,168,62,0.18)",
                        border: "1px solid rgba(201,168,62,0.35)",
                        color: t.text,
                        fontWeight: 900,
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                      }}
                      title="Copiar as 20 milhares"
                    >
                      Copiar 20
                    </button>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gap: 8,
                      padding: 12,
                      borderRadius: 14,
                      background: "rgba(0,0,0,0.30)",
                      border: "1px solid rgba(201,168,62,0.22)",
                    }}
                  >
                    {gridRows.map((row, rIdx) => (
                      <div
                        key={rIdx}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                          gap: 10,
                        }}
                      >
                        {row.map((m, cIdx) => (
                          <div
                            key={`${rIdx}-${cIdx}`}
                            style={{
                              padding: "10px 10px",
                              borderRadius: 12,
                              textAlign: "center",
                              fontWeight: 950,
                              letterSpacing: 1.2,
                              background: "rgba(201,168,62,0.10)",
                              border: "1px solid rgba(201,168,62,0.28)",
                              color: t.text,
                              userSelect: "text",
                              cursor: "pointer",
                            }}
                            title="Clique para copiar"
                            onClick={() => copyText(m)}
                          >
                            {m}
                          </div>
                        ))}
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