// src/pages/Dashboard/components/LeftRankingTable.jsx
import React, { useMemo } from "react";

/**
 * LeftRankingTable (Premium Fit Desktop - FIX)
 * - 25 linhas sem scroll interno (layout compactado)
 * - 5 colunas SEM SUMIR: Imagem | Grupo | Animal | Apar. | Palpite
 * - Grid calibrado para caber no painel esquerdo (~380px) sem cortar
 * - Imagens em /public/img/<animal>.png
 */

export default function LeftRankingTable({
  locationLabel = "Rio de Janeiro, RJ, Brasil",
  rows: rowsProp,
}) {
  const rows = useMemo(() => {
    if (Array.isArray(rowsProp) && rowsProp.length) return rowsProp;

    return [
      { grupo: 1, animal: "AVESTRUZ", apar: 161, palpite: "2204" },
      { grupo: 2, animal: "ÁGUIA", apar: 194, palpite: "9905" },
      { grupo: 3, animal: "BURRO", apar: 178, palpite: "6610" },
      { grupo: 4, animal: "BORBOLETA", apar: 178, palpite: "5416" },
      { grupo: 5, animal: "CACHORRO", apar: 169, palpite: "4419" },
      { grupo: 6, animal: "CABRA", apar: 194, palpite: "8821" },
      { grupo: 7, animal: "CARNEIRO", apar: 175, palpite: "6626" },
      { grupo: 8, animal: "CAMELO", apar: 151, palpite: "3330" },
      { grupo: 9, animal: "COBRA", apar: 183, palpite: "7733" },
      { grupo: 10, animal: "COELHO", apar: 161, palpite: "4537" },
      { grupo: 11, animal: "CAVALO", apar: 206, palpite: "6643" },
      { grupo: 12, animal: "ELEFANTE", apar: 178, palpite: "7745" },
      { grupo: 13, animal: "GALO", apar: 161, palpite: "6651" },
      { grupo: 14, animal: "GATO", apar: 181, palpite: "4455" },
      { grupo: 15, animal: "JACARÉ", apar: 206, palpite: "7758" },
      { grupo: 16, animal: "LEÃO", apar: 204, palpite: "7061" },
      { grupo: 17, animal: "MACACO", apar: 180, palpite: "0066" },
      { grupo: 18, animal: "PORCO", apar: 191, palpite: "2269" },
      { grupo: 19, animal: "PAVÃO", apar: 168, palpite: "3375" },
      { grupo: 20, animal: "PERU", apar: 182, palpite: "0080" },
      { grupo: 21, animal: "TOURO", apar: 191, palpite: "6681" },
      { grupo: 22, animal: "TIGRE", apar: 204, palpite: "9985" },
      { grupo: 23, animal: "URSO", apar: 182, palpite: "7790" },
      { grupo: 24, animal: "VEADO", apar: 201, palpite: "9994" },
      { grupo: 25, animal: "VACA", apar: 194, palpite: "8899" },
    ];
  }, [rowsProp]);

  const formatGrupo2 = (n) => String(Number(n || 0)).padStart(2, "0");

  const animalToFile = (animal) => {
    const base = String(animal || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/ç/g, "c")
      .replace(/\s+/g, "_")
      .replace(/[^a-z0-9_]/g, "");
    return `/img/${base}.png`;
  };

  return (
    <div style={ui.wrap}>
      <div style={ui.locationRow}>
        <span style={ui.locationDot} aria-hidden="true" />
        <div style={ui.locationText} title={locationLabel}>
          {locationLabel}
        </div>
      </div>

      <div style={ui.tableShell}>
        <div style={ui.headerRow}>
          <div style={{ ...ui.th, ...ui.hLeft }}>Imagem</div>
          <div style={{ ...ui.th, ...ui.hCenter }}>Grupo</div>
          <div style={{ ...ui.th, ...ui.hLeft }}>Animal</div>
          <div style={{ ...ui.th, ...ui.hRight }}>Apar.</div>
          <div style={{ ...ui.th, ...ui.hRight }}>Palpite</div>
        </div>

        <div style={ui.bodyNoScroll}>
          {rows.map((r, idx) => (
            <div key={`${r.animal}_${idx}`} style={ui.row}>
              <div style={ui.cellImg}>
                <div style={ui.imgFrame}>
                  <img
                    src={animalToFile(r.animal)}
                    alt={r.animal}
                    style={ui.img}
                    loading="lazy"
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                    }}
                  />
                </div>
              </div>

              <div style={{ ...ui.td, ...ui.center }}>
                {formatGrupo2(r.grupo)}
              </div>

              <div style={ui.animalTxt} title={String(r.animal || "").toUpperCase()}>
                {String(r.animal || "").toUpperCase()}
              </div>

              <div style={{ ...ui.td, ...ui.right }}>{Number(r.apar || 0)}</div>

              <div style={{ ...ui.td, ...ui.right }}>
                {String(r.palpite || "").padStart(4, "0")}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* Compact Premium (desktop fit) — tuned for 5 columns in ~380px panel */
const ui = {
  wrap: {
    padding: 10,
    height: "100%",
    display: "flex",
    flexDirection: "column",
    gap: 8,
    minWidth: 0,
  },

  locationRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "4px 8px",
    fontWeight: 800, // menos “agressivo” que 900
    letterSpacing: 0.15,
    opacity: 0.98,
    minWidth: 0,
  },

  locationDot: {
    width: 9,
    height: 9,
    borderRadius: 999,
    background: "rgba(255,255,255,0.20)",
    boxShadow: "0 0 0 3px rgba(255,255,255,0.06)",
    flex: "0 0 auto",
  },

  locationText: {
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    fontSize: 14,
  },

  tableShell: {
    border: "1px solid rgba(255,255,255,0.24)",
    borderRadius: 18,
    overflow: "hidden",
    background: "rgba(0,0,0,0.55)",
    boxShadow: "0 18px 50px rgba(0,0,0,0.55)",
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
    flex: 1,
  },

  // FIX: colunas calibradas p/ caber e NÃO cortar Palpite
  // (img + grupo + apar + palpite fixos, animal com min menor)
  headerRow: {
    display: "grid",
    gridTemplateColumns: "46px 44px minmax(96px, 1fr) 64px 66px",
    alignItems: "end",
    padding: "7px 8px 6px 8px",
    borderBottom: "2px solid rgba(255,255,255,0.55)",
    background: "rgba(0,0,0,0.35)",
    columnGap: 6,
  },

  th: {
    fontWeight: 800,
    fontSize: 12,
    letterSpacing: 0.12,
    opacity: 0.95,
    whiteSpace: "nowrap",
  },

  hLeft: { textAlign: "left" },
  hCenter: { textAlign: "center" },
  hRight: { textAlign: "right" },

  bodyNoScroll: {
    overflow: "hidden",
  },

  row: {
    display: "grid",
    gridTemplateColumns: "46px 44px minmax(96px, 1fr) 64px 66px",
    alignItems: "center",
    padding: "3px 8px", // compacto p/ 25 linhas
    borderTop: "1px solid rgba(255,255,255,0.28)",
    columnGap: 6,
  },

  td: {
    fontWeight: 700, // menos pesado que 900 (premium mais “limpo”)
    fontSize: 12.5,
    letterSpacing: 0.1,
    minWidth: 0,
    lineHeight: 1.0,
  },

  animalTxt: {
    fontWeight: 800,
    fontSize: 12.8,
    letterSpacing: 0.18,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis", // se algum nome estourar, fica elegante
    minWidth: 0,
  },

  center: { textAlign: "center" },
  right: { textAlign: "right" },

  cellImg: { display: "flex", alignItems: "center" },

  imgFrame: {
    width: 26,
    height: 26,
    borderRadius: 9,
    border: "2px solid rgba(201,168,62,0.85)",
    background: "rgba(0,0,0,0.40)",
    overflow: "hidden",
    boxShadow: "0 10px 26px rgba(0,0,0,0.55)",
    flex: "0 0 auto",
  },

  img: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    display: "block",
  },
};
