import React, { useMemo } from "react";

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

export default function Top3View(props) {
  const {
    loading,
    error,
    top3,
    layerMetaText,
    lastLabel,
    prevLabel,
    theme,
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

  return (
    <div style={{ padding: 16, color: t.text }}>
      <div
        style={{
          background: t.panel,
          border: `1px solid ${t.border}`,
          borderRadius: 14,
          padding: 14,
          marginBottom: 12,
        }}
      >
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

      {loading ? (
        <div style={{ color: t.muted }}>Carregando…</div>
      ) : error ? (
        <div style={{ color: "#ff6b6b", fontWeight: 700 }}>
          {String(error)}
        </div>
      ) : !list.length ? (
        <div style={{ color: t.muted }}>Sem dados para calcular TOP3.</div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {list.map((item, idx) => {
            const grupoTxt = formatGrupo(item?.grupo);
            const animal = String(item?.animal || "").trim();

            // ✅ PROBABILIDADE: se não vier score pronto, deriva de freq / (samples * 7)
            const samplesRaw = Number(item?.meta?.samples ?? item?.samples ?? 0);
            const samples = Number.isFinite(samplesRaw) ? Math.max(0, Math.trunc(samplesRaw)) : 0;

            const freqRaw = Number(item?.freq ?? 0);
            const freq = Number.isFinite(freqRaw) ? Math.max(0, Math.trunc(freqRaw)) : 0;

            const denom = samples > 0 ? samples * 7 : 0; // 7 posições (1º..7º)
            const derivedScore = denom > 0 ? freq / denom : 0;

            // ✅ Prioriza o que o hook calculou (probPct)
            const pct = toPercent(item?.probPct ?? item?.score ?? derivedScore);

            const key = `${String(item?.grupo ?? "g")}__${animal || "x"}__${idx}`;

            return (
              <div
                key={key}
                style={{
                  background: t.panel,
                  border: `1px solid ${t.border}`,
                  borderRadius: 14,
                  padding: 14,
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
                  <div style={{ fontWeight: 900, fontSize: 16 }}>
                    #{idx + 1} • G{grupoTxt}
                    {animal ? " • " + animal.toUpperCase() : ""}
                  </div>
                  <div style={{ color: t.muted, fontSize: 12 }}>
                    Amostras: <b style={{ color: t.text }}>{samples}</b>
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                  }}
                >
                  <div style={{ color: t.muted, fontSize: 13 }}>
                    Probabilidade:{" "}
                    <span style={{ color: t.accent, fontWeight: 900 }}>
                      {pct.toFixed(2)}%
                    </span>
                  </div>
                  <div style={{ color: t.muted, fontSize: 12 }}>
                    Freq: <b style={{ color: t.text }}>{freq}</b>
                  </div>
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
                      opacity: 0.7,
                    }}
                  />
                </div>

                {Array.isArray(item?.reasons) && item.reasons.length ? (
                  <div style={{ color: t.muted, fontSize: 12, lineHeight: 1.25 }}>
                    {item.reasons.slice(0, 6).map((r, i) => (
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