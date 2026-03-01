// src/pages/Dashboard/components/LeftRankingTable.jsx
import React, { useMemo, useState } from "react";

import {
  getAnimalLabel as getAnimalLabelFn,
  getImgFromGrupo as getImgFromGrupoFn,
  guessPalpiteFromGrupo as guessPalpiteFromGrupoFn,
} from "../../../constants/bichoMap";

/**
 * LeftRankingTable
 * - Ordenável: Grupo | Animal | Apar.
 * - Não ordenável: Imagem | Palpite
 *
 * ✅ SEM SCROLL (nem vertical nem horizontal) e sem cortar:
 * - Body sem overflow
 * - Layout compactado para caber 25 linhas
 *
 * ✅ DEMO safe:
 * - prop `disabled`: bloqueia ordenação e seleção
 */

function digitsOnly(v) {
  const s = String(v ?? "").trim();
  if (!s) return "";
  return s.replace(/\D+/g, "");
}

function toMilhar4(v) {
  const d = digitsOnly(v);
  if (!d) return null;
  return d.length >= 4 ? d.slice(-4).padStart(4, "0") : d.padStart(4, "0");
}

function safeNumber(n) {
  const x = Number(n);
  return Number.isFinite(x) ? x : 0;
}

function pickAparCount(r) {
  return safeNumber(
    r?.total ??
      r?.apar ??
      r?.aparicoes ??
      r?.aparições ??
      r?.count ??
      r?.value ??
      0
  );
}

function fmtIntPT(n) {
  const x = safeNumber(n);
  try {
    return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(x);
  } catch {
    return String(x);
  }
}

function normalizeGrupoNumber(v) {
  const s = String(v ?? "").trim();
  if (!s) return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function grupoTo2(g) {
  const n = normalizeGrupoNumber(g);
  return String(n).padStart(2, "0");
}

function uniq(arr) {
  return Array.from(new Set(arr.filter(Boolean)));
}

function safeStr(v) {
  return String(v ?? "").trim();
}

/** ✅ Gera candidatos de imagem (robusto) */
function buildImgCandidates(getImgFromGrupo, grupo) {
  const base96 = safeStr(getImgFromGrupo(grupo, 96));
  const base128 = safeStr(getImgFromGrupo(grupo, 128));
  const base64 = safeStr(getImgFromGrupo(grupo, 64));

  const bases = [base128, base96, base64].filter(Boolean);

  const out = [];
  for (const src of bases) {
    out.push(src);

    if (/\.png(\?|#|$)/i.test(src)) {
      out.push(src.replace(/\.png(\?|#|$)/i, ".jpg$1"));
      out.push(src.replace(/\.png(\?|#|$)/i, ".jpeg$1"));
    }

    if (/\.jpe?g(\?|#|$)/i.test(src)) {
      out.push(src.replace(/\.jpe?g(\?|#|$)/i, ".png$1"));
    }
  }

  return uniq(out);
}

export default function LeftRankingTable({
  locationLabel = "Rio de Janeiro, RJ, Brasil",
  loading = false,
  error = null,
  data = [],
  selectedGrupo = null,
  onSelectGrupo = null,

  palpitesByGrupo = {},
  aparGlobalByGrupo = null,
  fillMissingGroups = false,

  // ✅ trava ações no DEMO
  disabled = false,
}) {
  const [sort, setSort] = useState({ key: "apar", dir: "desc" });

  const getAnimalLabel = useMemo(() => {
    return typeof getAnimalLabelFn === "function"
      ? getAnimalLabelFn
      : ({ animal }) => String(animal || "");
  }, []);

  const getImgFromGrupo = useMemo(() => {
    return typeof getImgFromGrupoFn === "function" ? getImgFromGrupoFn : () => "";
  }, []);

  const guessPalpiteFromGrupo = useMemo(() => {
    return typeof guessPalpiteFromGrupoFn === "function"
      ? guessPalpiteFromGrupoFn
      : () => "----";
  }, []);

  const rows = useMemo(() => {
    const arr = Array.isArray(data) ? data : [];
    const hasGlobal = aparGlobalByGrupo && typeof aparGlobalByGrupo === "object";

    const byGrupo2 = new Map();
    for (const r of arr) {
      const grupo = normalizeGrupoNumber(r?.grupo);
      if (!Number.isFinite(grupo) || grupo <= 0) continue;
      const g2 = grupoTo2(grupo);

      const prev = byGrupo2.get(g2);
      if (!prev) {
        byGrupo2.set(g2, r);
        continue;
      }

      const prevA = pickAparCount(prev);
      const curA = pickAparCount(r);
      if (curA >= prevA) byGrupo2.set(g2, r);
    }

    let gruposBase = [];

    if (fillMissingGroups) {
      gruposBase = Array.from({ length: 25 }, (_, i) => i + 1);
    } else {
      const keys = Array.from(byGrupo2.keys());
      if (!keys.length) return [];
      gruposBase = keys
        .map((g2) => Number(g2))
        .filter((n) => Number.isFinite(n) && n >= 1 && n <= 25)
        .sort((a, b) => a - b);
    }

    const out = [];
    for (const g of gruposBase) {
      const grupo = Number(g);
      const grupo2 = grupoTo2(grupo);
      const srcRow = byGrupo2.get(grupo2) || null;

      const animalRaw =
        (srcRow?.animal ?? srcRow?.label ?? srcRow?.animalLabel ?? "") || "";

      let animalLabel = "";
      try {
        animalLabel = getAnimalLabel({ grupo, animal: animalRaw }) || "";
      } catch {
        animalLabel = "";
      }
      animalLabel = String(animalLabel || animalRaw || "").trim();

      const palpiteFromByGrupo =
        palpitesByGrupo && typeof palpitesByGrupo === "object"
          ? toMilhar4(palpitesByGrupo[grupo2])
          : null;

      const palpiteFromRow =
        toMilhar4(
          srcRow?.palpite ??
            srcRow?.palpite4 ??
            srcRow?.milhar ??
            srcRow?.milhar4 ??
            srcRow?.palpiteMilhar ??
            srcRow?.palpite_milhar ??
            srcRow?.p ??
            null
        ) || null;

      const palpiteFallback = toMilhar4(guessPalpiteFromGrupo(grupo)) || "----";
      const palpite = palpiteFromByGrupo || palpiteFromRow || palpiteFallback;

      const aparFromGlobal = hasGlobal ? safeNumber(aparGlobalByGrupo[grupo2]) : NaN;
      const apar = Number.isFinite(aparFromGlobal) ? aparFromGlobal : pickAparCount(srcRow);

      const imgCandidates = buildImgCandidates(getImgFromGrupo, grupo);

      out.push({
        grupo,
        grupo2,
        animalRaw,
        animalLabel,
        apar,
        palpite,
        imgCandidates,
      });
    }

    return out;
  }, [
    data,
    getAnimalLabel,
    getImgFromGrupo,
    guessPalpiteFromGrupo,
    palpitesByGrupo,
    aparGlobalByGrupo,
    fillMissingGroups,
  ]);

  const sortedRows = useMemo(() => {
    const list = Array.isArray(rows) ? [...rows] : [];
    if (!list.length) return list;

    const dirMul = sort.dir === "asc" ? 1 : -1;

    const cmpText = (a, b) =>
      String(a || "").localeCompare(String(b || ""), "pt-BR", {
        sensitivity: "base",
      });

    list.sort((A, B) => {
      let vA;
      let vB;

      switch (sort.key) {
        case "grupo":
          vA = Number(A.grupo || 0);
          vB = Number(B.grupo || 0);
          if (vA === vB) return 0;
          return (vA - vB) * dirMul;

        case "animal":
          vA = String(A.animalLabel || A.animalRaw || "");
          vB = String(B.animalLabel || B.animalRaw || "");
          {
            const c = cmpText(vA, vB) * dirMul;
            if (c !== 0) return c;
            return (Number(A.grupo || 0) - Number(B.grupo || 0)) * 1;
          }

        case "apar":
        default:
          vA = Number(A.apar || 0);
          vB = Number(B.apar || 0);
          {
            const c = (vA - vB) * dirMul;
            if (c !== 0) return c;
            return (Number(A.grupo || 0) - Number(B.grupo || 0)) * 1;
          }
      }
    });

    return list;
  }, [rows, sort.key, sort.dir]);

  const formatGrupo2 = (n) => String(Number(n || 0)).padStart(2, "0");

  const toggleSort = (key) => {
    if (disabled) return;
    if (!["grupo", "animal", "apar"].includes(key)) return;

    setSort((prev) => {
      if (prev.key === key) {
        return { key, dir: prev.dir === "asc" ? "desc" : "asc" };
      }
      const defaultDir = key === "animal" ? "asc" : "desc";
      return { key, dir: defaultDir };
    });
  };

  const sortArrow = (key) => {
    if (sort.key === key) return sort.dir === "asc" ? "▲" : "▼";
    return "▼";
  };

  const arrowOpacity = (key) => (sort.key === key ? 1 : 0.28);

  const hasSelection =
    Number.isFinite(Number(selectedGrupo)) &&
    Number(selectedGrupo) >= 1 &&
    Number(selectedGrupo) <= 25;

  const canSelect = !disabled && typeof onSelectGrupo === "function";

  const handleSelectGrupo = (grupo) => {
    if (!canSelect) return;
    const g = Number(grupo);
    const cur = Number(selectedGrupo);
    if (Number.isFinite(cur) && cur === g) {
      onSelectGrupo(null);
      return;
    }
    onSelectGrupo(g);
  };

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

    if (!sortedRows.length) {
      return (
        <div style={ui.emptyWrap}>
          <div style={ui.emptyTitle}>Sem dados</div>
          <div style={ui.emptyHint}>
            Nenhum registro disponível para o filtro/período atual.
          </div>
        </div>
      );
    }

    return (
      <div className="pp_left_body" style={ui.bodyNoScroll}>
        {sortedRows.map((r) => {
          const isSel = Number(selectedGrupo) === Number(r.grupo);
          const dim = hasSelection && !isSel;

          const initialSrc =
            Array.isArray(r.imgCandidates) && r.imgCandidates.length
              ? r.imgCandidates[0]
              : "";

          return (
            <div
              key={`g_${formatGrupo2(r.grupo)}`}
              data-dim={dim ? "1" : "0"}
              aria-disabled={disabled ? "true" : "false"}
              style={{
                ...ui.row,
                ...(isSel ? ui.rowSelected : null),
                ...(dim ? ui.rowDim : null),
                ...(canSelect ? ui.rowClickable : null),
                cursor: disabled ? "not-allowed" : canSelect ? "pointer" : "default",
                opacity: disabled ? 0.72 : undefined,
                filter: disabled ? "grayscale(0.18)" : undefined,
              }}
              onClick={canSelect ? () => handleSelectGrupo(r.grupo) : undefined}
              title={
                disabled
                  ? "Bloqueado no modo demonstração"
                  : canSelect
                  ? "Clique para selecionar (toggle)"
                  : undefined
              }
            >
              <div style={ui.cellImg}>
                <div
                  style={{
                    ...ui.imgFrame,
                    ...(isSel ? ui.imgFrameSelected : null),
                    ...(dim ? ui.imgFrameDim : null),
                  }}
                >
                  {initialSrc ? (
                    <img
                      src={initialSrc}
                      alt={r.animalLabel || `Grupo ${formatGrupo2(r.grupo)}`}
                      style={{ ...ui.img, ...(dim ? ui.imgDim : null) }}
                      loading="lazy"
                      data-idx="0"
                      onError={(e) => {
                        const imgEl = e.currentTarget;
                        const list = Array.isArray(r.imgCandidates) ? r.imgCandidates : [];
                        const cur = Number(imgEl.dataset.idx || "0");
                        const next = cur + 1;

                        if (list[next]) {
                          imgEl.dataset.idx = String(next);
                          imgEl.src = list[next];
                          imgEl.style.visibility = "visible";
                          return;
                        }

                        imgEl.style.visibility = "hidden";
                        const wrap = imgEl.parentElement;
                        if (wrap && wrap instanceof HTMLElement) {
                          wrap.dataset.noimg = "1";
                        }
                      }}
                      onLoad={(e) => {
                        const imgEl = e.currentTarget;
                        imgEl.style.visibility = "visible";
                        const wrap = imgEl.parentElement;
                        if (wrap && wrap instanceof HTMLElement) {
                          wrap.dataset.noimg = "0";
                        }
                      }}
                    />
                  ) : null}

                  <div style={ui.imgPlaceholder} aria-hidden="true">
                    {formatGrupo2(r.grupo)}
                  </div>
                </div>
              </div>

              <div
                style={{
                  ...ui.td,
                  ...ui.cellCenter,
                  ...ui.numCell,
                  ...(dim ? ui.tdDim : null),
                }}
              >
                {formatGrupo2(r.grupo)}
              </div>

              <div
                style={{
                  ...ui.animalTxt,
                  ...ui.animalCell,
                  ...(isSel ? ui.animalTxtSelected : null),
                  ...(dim ? ui.textDim : null),
                }}
                title={String(r.animalLabel || "").toUpperCase()}
              >
                {String(r.animalLabel || "").toUpperCase()}
              </div>

              <div
                style={{
                  ...ui.td,
                  ...ui.cellCenter,
                  ...ui.numCell,
                  ...(dim ? ui.tdDim : null),
                }}
              >
                {fmtIntPT(r.apar || 0)}
              </div>

              <div
                style={{
                  ...ui.td,
                  ...ui.right,
                  ...ui.numCell,
                  ...ui.palpiteCell,
                  ...(dim ? ui.tdDim : null),
                }}
                title={String(r.palpite || "----")}
              >
                {String(r.palpite || "----")}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="pp_left" style={ui.wrap}>
      <style>{ui._styleTag}</style>

      <div style={ui.locationRow}>
        <span style={ui.locationDot} aria-hidden="true" />
        <div style={ui.locationText} title={locationLabel}>
          {locationLabel}
        </div>
      </div>

      <div className="pp_left_shell" style={ui.tableShell}>
        <div className="pp_left_header" style={ui.headerRow}>
          <div style={{ ...ui.th, ...ui.hLeft }} title="Imagem">
            Imagem
          </div>

          <button
            type="button"
            style={{
              ...ui.thBtn,
              ...ui.hCenter,
              ...(disabled ? ui.disabledBtn : null),
            }}
            onClick={() => toggleSort("grupo")}
            title={disabled ? "Bloqueado no modo demonstração" : "Ordenar por Grupo"}
            disabled={disabled}
          >
            <span style={{ ...ui.thLabel, ...ui.thLabelNoClip }}>Grupo</span>
            <span style={{ ...ui.sortIcon, opacity: disabled ? 0.18 : arrowOpacity("grupo") }}>
              {sortArrow("grupo")}
            </span>
          </button>

          <button
            type="button"
            style={{
              ...ui.thBtn,
              ...ui.hLeft,
              ...ui.animalCell,
              ...(disabled ? ui.disabledBtn : null),
            }}
            onClick={() => toggleSort("animal")}
            title={disabled ? "Bloqueado no modo demonstração" : "Ordenar por Animal"}
            disabled={disabled}
          >
            <span style={ui.thLabel}>Animal</span>
            <span style={{ ...ui.sortIcon, opacity: disabled ? 0.18 : arrowOpacity("animal") }}>
              {sortArrow("animal")}
            </span>
          </button>

          <button
            type="button"
            style={{
              ...ui.thBtn,
              ...ui.hCenter,
              ...(disabled ? ui.disabledBtn : null),
            }}
            onClick={() => toggleSort("apar")}
            title={disabled ? "Bloqueado no modo demonstração" : "Ordenar por Aparições"}
            disabled={disabled}
          >
            <span style={{ ...ui.thLabel, ...ui.thLabelNoClip }}>Apar.</span>
            <span style={{ ...ui.sortIcon, opacity: disabled ? 0.18 : arrowOpacity("apar") }}>
              {sortArrow("apar")}
            </span>
          </button>

          <div style={{ ...ui.th, ...ui.hRight }} title="Palpite">
            <span style={ui.thLabelNoClip}>Palpite</span>
          </div>
        </div>

        {renderBody()}
      </div>
    </div>
  );
}

/**
 * ✅ GRID mais “estreito” (não estoura e não corta Palpite)
 * Soma mínima bem menor + gaps/padding menores.
 */
const GRID_COLS =
  "46px 46px minmax(96px, 1fr) 48px minmax(52px, 60px)";

const ui = {
  wrap: {
    padding: 10,
    display: "flex",
    flexDirection: "column",
    gap: 8,
    minWidth: 0,
    minHeight: 0,
    height: "auto", // ✅ evita esticar e sobrar espaço vazio embaixo
    boxSizing: "border-box",
    overflow: "hidden",
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
    boxSizing: "border-box",
    flex: "0 0 auto",
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
    overflowX: "hidden",
    background: "rgba(0,0,0,0.55)",
    boxShadow: "0 18px 50px rgba(0,0,0,0.55)",
    display: "flex",
    flexDirection: "column",
    boxSizing: "border-box",
    minHeight: 0,
    flex: "0 0 auto", // ✅ não estica => reduz “vazio” no rodapé do card
  },

  headerRow: {
    display: "grid",
    gridTemplateColumns: GRID_COLS,
    alignItems: "end",
    padding: "5px 4px",
    borderBottom: "2px solid rgba(255,255,255,0.55)",
    background: "rgba(0,0,0,0.35)",
    columnGap: 4, // ✅ menor
    boxSizing: "border-box",
    flex: "0 0 auto",
    position: "sticky",
    top: 0,
    zIndex: 5,
    backdropFilter: "blur(6px)",
  },

  th: {
    fontWeight: 800,
    fontSize: 12,
    letterSpacing: 0.12,
    opacity: 0.95,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    lineHeight: 1.05,
    minWidth: 0,
  },

  thBtn: {
    width: "100%",
    minWidth: 0,
    appearance: "none",
    border: "none",
    background: "transparent",
    color: "inherit",
    padding: 0,
    margin: 0,
    display: "flex",
    alignItems: "center",
    gap: 3,
    fontWeight: 800,
    fontSize: 12,
    letterSpacing: 0.12,
    opacity: 0.95,
    whiteSpace: "nowrap",
    cursor: "pointer",
    userSelect: "none",
    overflow: "hidden",
  },

  disabledBtn: {
    cursor: "not-allowed",
    opacity: 0.65,
    filter: "grayscale(0.18)",
  },

  thLabel: {
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    minWidth: 0,
  },

  thLabelNoClip: {
    overflow: "visible",
    textOverflow: "clip",
    whiteSpace: "nowrap",
    minWidth: "auto",
    flex: "0 0 auto",
  },

  sortIcon: {
    width: 9,
    flex: "0 0 9px",
    textAlign: "center",
    fontSize: 11.5,
    transform: "translateY(-0.5px)",
  },

  hLeft: { textAlign: "left", justifyContent: "flex-start" },
  hCenter: { textAlign: "center", justifyContent: "center" },
  hRight: { textAlign: "right", justifyContent: "flex-end" },

  bodyNoScroll: {
    overflow: "hidden",
    minHeight: 0,
    flex: "1 1 auto",
  },

  row: {
    display: "grid",
    gridTemplateColumns: GRID_COLS,
    alignItems: "center",
    padding: "2px 4px", // ✅ menor
    borderTop: "1px solid rgba(255,255,255,0.28)",
    columnGap: 4, // ✅ menor
    transition:
      "background 160ms ease, transform 160ms ease, opacity 160ms ease, filter 160ms ease",
    boxSizing: "border-box",
  },

  rowClickable: { userSelect: "none" },

  rowSelected: {
    background: "rgba(201,168,62,0.10)",
    boxShadow: "inset 0 0 0 1px rgba(201,168,62,0.24)",
    opacity: 1,
    filter: "none",
  },

  rowDim: {
    opacity: 0.58,
    filter: "grayscale(0.18)",
  },

  td: {
    fontWeight: 700,
    fontSize: 11.4,
    letterSpacing: 0.08,
    minWidth: 0,
    lineHeight: 1.0,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },

  tdDim: { opacity: 0.78 },

  numCell: {
    fontVariantNumeric: "tabular-nums",
    fontFeatureSettings: '"tnum" 1, "lnum" 1',
  },

  animalTxt: {
    fontWeight: 850,
    fontSize: 10.1,
    letterSpacing: 0.14,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    minWidth: 0,
  },

  textDim: { opacity: 0.86 },

  animalTxtSelected: {
    color: "rgba(201,168,62,0.95)",
    textShadow: "0 8px 18px rgba(0,0,0,0.55)",
  },

  animalCell: { paddingLeft: 6, boxSizing: "border-box" },

  cellCenter: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
  },

  right: { textAlign: "right" },

  palpiteCell: {
    paddingRight: 4,
    minWidth: 0,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },

  cellImg: { display: "flex", alignItems: "center" },

  imgFrame: {
    width: 22,
    height: 22,
    borderRadius: 6,
    border: "2px solid rgba(201,168,62,0.85)",
    background: "rgba(0,0,0,0.40)",
    overflow: "hidden",
    boxShadow: "0 10px 26px rgba(0,0,0,0.55)",
    flex: "0 0 auto",
    position: "relative",
    padding: 2,
    boxSizing: "border-box",
  },

  imgFrameSelected: {
    boxShadow:
      "0 14px 34px rgba(201,168,62,0.22), 0 10px 26px rgba(0,0,0,0.55)",
    border: "2px solid rgba(201,168,62,0.95)",
  },

  imgFrameDim: {
    border: "2px solid rgba(201,168,62,0.42)",
    boxShadow: "0 10px 26px rgba(0,0,0,0.50)",
  },

  imgDim: { opacity: 0.92 },

  img: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    display: "block",
    position: "relative",
    zIndex: 2,
    borderRadius: 4,
  },

  imgPlaceholder: {
    position: "absolute",
    inset: 0,
    display: "grid",
    placeItems: "center",
    fontWeight: 950,
    fontSize: 10,
    letterSpacing: 0.2,
    color: "rgba(201,168,62,0.85)",
    background: "rgba(0,0,0,0.20)",
    zIndex: 1,
    pointerEvents: "none",
  },

  emptyWrap: { padding: 14, display: "grid", gap: 6 },
  emptyTitle: { fontWeight: 900, letterSpacing: 0.2, opacity: 0.95 },
  emptyHint: { fontSize: 12.5, opacity: 0.75, lineHeight: 1.35 },

  _styleTag: `
    .pp_left_body{ overflow: hidden !important; }
  `,
};