// src/pages/Dashboard/components/LeftRankingTable.jsx
import React, { useMemo } from "react";

/**
 * ESCOLHA 1 (RECOMENDADO SE EXISTE /src/constants/bichoMap.js):
 * Descomente este e comente o outro.
 */
// import { getImgFromGrupo, guessPalpiteFromGrupo } from "../../../constants/bichoMap";

/**
 * ESCOLHA 2 (SE O SEU bichoMap.js ESTÁ NA MESMA PASTA components):
 * Descomente este e comente o de cima.
 */
import { getImgFromGrupo, guessPalpiteFromGrupo } from "./bichoMap";

/**
 * LeftRankingTable (Premium Fit Desktop - FIX)
 * - Consome ranking real do Dashboard: props { loading, error, data }
 * - data esperado: [{ grupo, animal, total }]
 * - Apar. = total
 * - Palpite = guessPalpiteFromGrupo(grupo)
 * - Imagem = getImgFromGrupo(grupo, 64) -> /img/<slug>_64.png
 */

export default function LeftRankingTable({
  locationLabel = "Rio de Janeiro, RJ, Brasil",
  loading = false,
  error = null,
  data = [],
}) {
  const rows = useMemo(() => {
    if (Array.isArray(data) && data.length) {
      return data.map((r) => {
        const gNum = Number(r.grupo);
        return {
          grupo: gNum,
          animal: r.animal || "",
          apar: Number(r.total || 0),
          palpite: guessPalpiteFromGrupo(gNum),
          img: getImgFromGrupo(gNum, 64),
        };
      });
    }
    return [];
  }, [data]);

  const formatGrupo2 = (n) => String(Number(n || 0)).padStart(2, "0");

  const renderBody = () => {
    if (loading) {
      return (
        <div style={ui.emptyWrap}>
          <div style={ui.emptyTitle}>Carregando…</div>
          <div style={ui.emptyHint}>Buscando sorteios na base.</div>
        </div>
      );
    }

    if (error) {
      return (
        <div style={ui.emptyWrap}>
          <div style={ui.emptyTitle}>Erro ao carregar</div>
          <div style={ui.emptyHint}>
            {String(error?.message || error || "Erro desconhecido")}
          </div>
        </div>
      );
    }

    if (!rows.length) {
      return (
        <div style={ui.emptyWrap}>
          <div style={ui.emptyTitle}>Sem dados</div>
          <div style={ui.emptyHint}>Selecione filtros para exibir o ranking.</div>
        </div>
      );
    }

    return (
      <div style={ui.bodyNoScroll}>
        {rows.map((r) => (
          <div key={`g_${formatGrupo2(r.grupo)}`} style={ui.row}>
            <div style={ui.cellImg}>
              <div style={ui.imgFrame}>
                <img
                  src={r.img}
                  alt={r.animal || `Grupo ${formatGrupo2(r.grupo)}`}
                  style={ui.img}
                  loading="lazy"
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                  }}
                />
              </div>
            </div>

            <div style={{ ...ui.td, ...ui.center }}>{formatGrupo2(r.grupo)}</div>

            <div style={ui.animalTxt} title={String(r.animal || "").toUpperCase()}>
              {String(r.animal || "").toUpperCase()}
            </div>

            <div style={{ ...ui.td, ...ui.right }}>{Number(r.apar || 0)}</div>

            <div style={{ ...ui.td, ...ui.right }}>
              {String(r.palpite || "----").padStart(4, "0")}
            </div>
          </div>
        ))}
      </div>
    );
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

        {renderBody()}
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
    fontWeight: 800,
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
    padding: "3px 8px",
    borderTop: "1px solid rgba(255,255,255,0.28)",
    columnGap: 6,
  },

  td: {
    fontWeight: 700,
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
    textOverflow: "ellipsis",
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

  emptyWrap: {
    padding: 14,
    display: "grid",
    gap: 6,
  },
  emptyTitle: {
    fontWeight: 900,
    letterSpacing: 0.2,
    opacity: 0.95,
  },
  emptyHint: {
    fontSize: 12.5,
    opacity: 0.75,
    lineHeight: 1.35,
  },
};
