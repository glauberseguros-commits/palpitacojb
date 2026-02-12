import React, { useMemo } from "react";
import { useTop3Controller } from "./top3.hooks";

function pad2(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return String(n).padStart(2, "0");
}

function toPercent(score) {
  const n = Number(score);
  if (!Number.isFinite(n)) return 0;

  // Heurística: se vier 0..1, converte para 0..100
  const pct = n <= 1 ? n * 100 : n;
  return Math.max(0, Math.min(100, pct));
}

function getIconSrc(item) {
  const v = item?.imgIcon;
  if (!v) return "";
  if (Array.isArray(v)) return String(v[0] || "");
  return String(v || "");
}

function rankTheme(idx) {
  // idx: 0,1,2
  if (idx === 0) {
    return {
      label: "1º",
      accent: "#FFD700",
      bg: "rgba(255,215,0,0.12)",
      border: "rgba(255,215,0,0.35)",
      glow: "rgba(255,215,0,0.20)",
    };
  }
  if (idx === 1) {
    return {
      label: "2º",
      accent: "#C0C0C0",
      bg: "rgba(192,192,192,0.10)",
      border: "rgba(192,192,192,0.30)",
      glow: "rgba(192,192,192,0.16)",
    };
  }
  return {
    label: "3º",
    accent: "#CD7F32",
    bg: "rgba(205,127,50,0.10)",
    border: "rgba(205,127,50,0.30)",
    glow: "rgba(205,127,50,0.16)",
  };
}

export default function Top3View() {
  const { loading, error, top3, layerMetaText, lastLabel, prevLabel } =
    useTop3Controller();

  const list = Array.isArray(top3) ? top3.slice(0, 3) : [];

  const meta = useMemo(() => {
    const last = lastLabel || "—";
    const prev = prevLabel || "—";
    const layer = layerMetaText || "";
    return { last, prev, layer };
  }, [lastLabel, prevLabel, layerMetaText]);

  return (
    <div style={{ padding: 16, color: "#fff" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <h2 style={{ margin: "0 0 12px" }}>Top 3</h2>
        {!loading && !error && (
          <span style={{ opacity: 0.7, fontSize: 12 }}>
            (ranking do filtro atual)
          </span>
        )}
      </div>

      {loading && <div>Carregando…</div>}

      {!loading && error && (
        <div style={{ marginTop: 12, color: "#ff6b6b" }}>
          <b>Erro:</b> {String(error)}
        </div>
      )}

      {!loading && !error && list.length === 0 && (
        <div style={{ opacity: 0.8 }}>
          Nenhum Top 3 disponível para os critérios atuais.
        </div>
      )}

      {!loading && !error && list.length > 0 && (
        <>
          {/* Meta */}
          <div style={{ marginBottom: 12, opacity: 0.85 }}>
            <div>
              <b>Último:</b> {meta.last}
            </div>
            <div>
              <b>Anterior:</b> {meta.prev}
            </div>
            {!!meta.layer && (
              <div style={{ marginTop: 4, fontSize: 13 }}>{meta.layer}</div>
            )}
          </div>

          {/* Cards Top 3 */}
          <div style={{ display: "grid", gap: 12 }}>
            {list.map((item, idx) => {
              const theme = rankTheme(idx);
              const iconSrc = getIconSrc(item);

              const grupoTxt = pad2(item?.grupo);
              const animalTxt = String(item?.animal || "—");
              const pct = toPercent(item?.score);

              return (
                <div
                  key={`${String(item?.grupo ?? "g")}__${String(
                    item?.animal ?? "a"
                  )}__${idx}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: 14,
                    borderRadius: 16,
                    background: theme.bg,
                    border: `1px solid ${theme.border}`,
                    boxShadow: `0 0 0 1px rgba(0,0,0,0.25), 0 10px 24px ${theme.glow}`,
                  }}
                >
                  {/* Rank */}
                  <div
                    style={{
                      display: "grid",
                      placeItems: "center",
                      width: 44,
                      height: 44,
                      borderRadius: 14,
                      background: "rgba(0,0,0,0.35)",
                      border: `1px solid ${theme.border}`,
                      color: theme.accent,
                      fontWeight: 900,
                      letterSpacing: 0.2,
                      flex: "0 0 auto",
                    }}
                    title={theme.label}
                  >
                    {theme.label}
                  </div>

                  {/* Ícone */}
                  {iconSrc ? (
                    <img
                      src={iconSrc}
                      alt={animalTxt}
                      style={{
                        width: 56,
                        height: 56,
                        borderRadius: 12,
                        objectFit: "cover",
                        border: `1px solid ${theme.border}`,
                        background: "rgba(0,0,0,0.25)",
                        flex: "0 0 auto",
                      }}
                      loading="lazy"
                    />
                  ) : (
                    <div
                      style={{
                        width: 56,
                        height: 56,
                        borderRadius: 12,
                        border: `1px dashed ${theme.border}`,
                        background: "rgba(0,0,0,0.20)",
                        display: "grid",
                        placeItems: "center",
                        color: "rgba(255,255,255,0.65)",
                        fontSize: 11,
                        flex: "0 0 auto",
                      }}
                      title="Sem ícone"
                    >
                      sem foto
                    </div>
                  )}

                  {/* Texto */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: 800,
                        fontSize: 16,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                      title={`G${grupoTxt} • ${animalTxt}`}
                    >
                      G{grupoTxt} • {animalTxt}
                    </div>

                    <div style={{ fontSize: 13, opacity: 0.85, marginTop: 2 }}>
                      Probabilidade:{" "}
                      <span style={{ color: theme.accent, fontWeight: 800 }}>
                        {pct.toFixed(2)}%
                      </span>
                    </div>

                    {/* barra leve (opcional, ajuda visualmente) */}
                    <div
                      style={{
                        marginTop: 8,
                        height: 6,
                        borderRadius: 999,
                        background: "rgba(255,255,255,0.10)",
                        overflow: "hidden",
                      }}
                      aria-hidden="true"
                    >
                      <div
                        style={{
                          height: "100%",
                          width: `${pct}%`,
                          background: theme.accent,
                          opacity: 0.65,
                        }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
