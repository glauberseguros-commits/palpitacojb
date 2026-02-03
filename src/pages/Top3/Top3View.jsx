import React from "react";
import { useTop3Controller } from "./top3.hooks";

export default function Top3View() {
  const {
    loading,
    error,
    top3,
    layerMetaText,
    lastLabel,
    prevLabel,
  } = useTop3Controller();

  return (
    <div style={{ padding: 16, color: "#fff" }}>
      <h2 style={{ margin: "0 0 12px" }}>Top 3</h2>

      {loading && <div>Carregando…</div>}

      {!loading && error && (
        <div style={{ marginTop: 12, color: "#ff6b6b" }}>
          <b>Erro:</b> {String(error)}
        </div>
      )}

      {!loading && !error && (!top3 || top3.length === 0) && (
        <div style={{ opacity: 0.8 }}>
          Nenhum Top 3 disponível para os critérios atuais.
        </div>
      )}

      {!loading && !error && Array.isArray(top3) && top3.length > 0 && (
        <>
          {/* Meta */}
          <div style={{ marginBottom: 12, opacity: 0.85 }}>
            <div><b>Último:</b> {lastLabel || "—"}</div>
            <div><b>Anterior:</b> {prevLabel || "—"}</div>
            <div style={{ marginTop: 4, fontSize: 13 }}>
              {layerMetaText}
            </div>
          </div>

          {/* Cards Top 3 */}
          <div style={{ display: "grid", gap: 12 }}>
            {top3.map((item, idx) => (
              <div
                key={`${item.grupo}-${idx}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: 14,
                  borderRadius: 14,
                  background: "rgba(255,215,0,0.08)",
                  border: "1px solid rgba(255,215,0,0.25)",
                }}
              >
                {/* Rank */}
                <div
                  style={{
                    fontSize: 22,
                    fontWeight: 800,
                    color: "#FFD700",
                    width: 32,
                    textAlign: "center",
                  }}
                >
                  #{idx + 1}
                </div>

                {/* Ícone */}
                {item?.imgIcon?.[0] && (
                  <img
                    src={item.imgIcon[0]}
                    alt={item.animal}
                    style={{
                      width: 56,
                      height: 56,
                      borderRadius: 12,
                      objectFit: "cover",
                      border: "1px solid rgba(255,215,0,0.35)",
                    }}
                  />
                )}

                {/* Texto */}
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>
                    G{String(item.grupo).padStart(2, "0")} • {item.animal}
                  </div>
                  <div style={{ fontSize: 13, opacity: 0.85 }}>
                    Probabilidade: {Number(item.score || 0).toFixed(2)}%
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
