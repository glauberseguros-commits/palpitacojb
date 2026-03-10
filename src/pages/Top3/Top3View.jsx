// src/pages/Top3/Top3View.jsx
import React, { useMemo, useState, useCallback, useEffect } from "react";

function toPercent(score) {
  const n = Number(score);
  if (!Number.isFinite(n)) return 0;
  const pct = n <= 1 ? n * 100 : n;
  return Math.max(0, Math.min(100, pct));
}

function formatGrupo(grupo) {
  const g = Number(grupo);
  if (!Number.isFinite(g) || g <= 0) return "—";
  return String(Math.trunc(g)).padStart(2, "0");
}

function normalizeMilharStr(v) {
  const s = String(v || "").trim();
  if (!s) return "";
  const dig = s.replace(/\D+/g, "");
  if (!dig) return "";
  return dig.length >= 4 ? dig.slice(-4) : dig.padStart(4, "0");
}

function centenaFromMilhar(m4) {
  const s = normalizeMilharStr(m4);
  return s ? s.slice(-3) : "";
}

function dezenaFromMilhar(m4) {
  const s = normalizeMilharStr(m4);
  return s ? s.slice(-2) : "";
}

function isYMD(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || "").trim());
}

function ymdToBR(ymd) {
  const s = String(ymd || "").trim();
  if (!isYMD(s)) return s || "—";
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y}`;
}

function formatYmdHour(ymd, hour) {
  const y = String(ymd || "").trim();
  const h = String(hour || "").trim();
  if (y && h) return `${ymdToBR(y)} ${h}`;
  if (y) return ymdToBR(y);
  if (h) return h;
  return "—";
}

/**
 * Wrap cíclico apenas para montar as 4 dezenas fixas do grupo.
 * NÃO é regra geral de transformação de centena em dezena.
 */
function wrapToDezena2(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "";
  const d = ((x % 100) + 100) % 100;
  return String(d).padStart(2, "0");
}

function getDezenasFixasFromGrupo(grupo) {
  const g = Number(grupo);
  if (!Number.isFinite(g) || g < 1 || g > 25) return [];

  const start = (g - 1) * 4 + 1;
  const out = [];

  for (let i = 0; i < 4; i += 1) {
    out.push(wrapToDezena2(start + i));
  }

  return out;
}

function clampColsFromItemMilharesCols(milharesCols, expectedCols = 4, perCol = 5) {
  const colsArr = Array.isArray(milharesCols) ? milharesCols : [];
  const out = [];

  for (let i = 0; i < Math.min(expectedCols, colsArr.length); i += 1) {
    const dz = String(colsArr[i]?.dezena || "").trim();
    const items0 = Array.isArray(colsArr[i]?.items) ? colsArr[i].items : [];

    const items = items0
      .map(normalizeMilharStr)
      .map((m) => (m && /^\d{4}$/.test(m) ? m : ""))
      .slice(0, perCol);

    while (items.length < perCol) items.push("");
    out.push({ dezena: dz, items });
  }

  while (out.length < expectedCols) {
    out.push({ dezena: "", items: Array(perCol).fill("") });
  }

  return out.slice(0, expectedCols);
}

/**
 * MONTA 20 MILHARES EM 4 COLUNAS (5 POR DEZENA FIXA)
 * - NÃO INVENTA NÚMEROS
 * - se faltar, completa com "" (vazio)
 * - respeita dezenas fixas do grupo
 * - mantém "sem repetir centena" GLOBAL
 */
function build20ByDezena({ grupo, baseMilhares, perCol = 5 }) {
  const g = Number(grupo);
  const dezenas = getDezenasFixasFromGrupo(g);

  if (!dezenas.length) {
    return { dezenas: [], rows: [], flat20: [] };
  }

  const input = Array.isArray(baseMilhares) ? baseMilhares : [];
  const normalized = input
    .map(normalizeMilharStr)
    .filter((x) => /^\d{4}$/.test(x));

  const byDz = new Map();
  for (const dz of dezenas) byDz.set(dz, []);

  for (const m4 of normalized) {
    const dz = dezenaFromMilhar(m4);
    if (byDz.has(dz)) byDz.get(dz).push(m4);
  }

  const seenCent = new Set();
  const seenMilhar = new Set();

  const cols = {};
  for (const dz of dezenas) cols[dz] = [];

  const tryPush = (dz, m4) => {
    const mm = normalizeMilharStr(m4);
    if (!mm) return false;

    const c3 = centenaFromMilhar(mm);
    if (!c3) return false;

    if (seenCent.has(c3)) return false;
    if (seenMilhar.has(mm)) return false;

    cols[dz].push(mm);
    seenCent.add(c3);
    seenMilhar.add(mm);
    return true;
  };

  for (const dz of dezenas) {
    const arr = byDz.get(dz) || [];
    for (const m4 of arr) {
      if (cols[dz].length >= perCol) break;
      tryPush(dz, m4);
    }
  }

  for (const dz of dezenas) {
    while (cols[dz].length < perCol) cols[dz].push("");
    if (cols[dz].length > perCol) cols[dz] = cols[dz].slice(0, perCol);
  }

  const rows = [];
  for (let r = 0; r < perCol; r += 1) {
    rows.push(dezenas.map((dz) => cols[dz][r] || ""));
  }

  const flat20 = rows.flat().filter(Boolean);
  return { dezenas, rows, flat20 };
}

function cleanLayerText(s) {
  const raw = String(s || "").trim();
  if (!raw) return "—";

  const noSamples = raw
    .replace(/\s*[•\-|]\s*Amostras:\s*\d+\s*$/i, "")
    .replace(/\s*Amostras:\s*\d+\s*$/i, "")
    .trim();

  return noSamples || "—";
}

function ImgWithFallback({ srcs, alt, size = 84, style }) {
  const list = useMemo(
    () => (Array.isArray(srcs) ? srcs.filter(Boolean) : []),
    [srcs]
  );

  const [i, setI] = useState(0);

  useEffect(() => {
    setI(0);
  }, [list.join("|")]);

  const src = list[i] || "";

  const onError = () => {
    setI((prev) => (prev < list.length - 1 ? prev + 1 : prev));
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

    LOTTERY_OPTIONS,
    lotteryKeySafe,
    setLotteryKey,

    build16,
    buildMilhares,
    build20,

    analysisYmd,
    analysisHourBucket,
    lastHourBucket,
  } = props || {};

  const list = Array.isArray(top3) ? top3.slice(0, 3) : [];

  const meta = useMemo(() => {
    const last = lastLabel || "—";
    const prev = prevLabel || "—";
    const layer = cleanLayerText(layerMetaText || "—");
    return { last, prev, layer };
  }, [lastLabel, prevLabel, layerMetaText]);

  const headerBase = useMemo(() => meta.last || "—", [meta.last]);

  const headerForecast = useMemo(() => {
    return formatYmdHour(analysisYmd, analysisHourBucket);
  }, [analysisYmd, analysisHourBucket]);

  const headerTransition = useMemo(() => {
    const from = String(lastHourBucket || "").trim();
    const to = String(analysisHourBucket || "").trim();
    if (from && to) return `${from} → ${to}`;
    return "—";
  }, [lastHourBucket, analysisHourBucket]);

  const t = theme || {
    bg: "#050505",
    panel: "rgba(0,0,0,0.55)",
    border: "rgba(255,255,255,0.18)",
    text: "rgba(255,255,255,0.92)",
    muted: "rgba(255,255,255,0.72)",
    accent: "rgba(201,168,62,0.92)",
  };

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
      if (typeof navigator !== "undefined" && navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(s);
        return true;
      }
    } catch {}

    try {
      if (typeof document === "undefined") return false;

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

  const baseLots = Array.isArray(LOTTERY_OPTIONS) ? LOTTERY_OPTIONS : [];
  const mustHave = [
    { value: "PT_RIO", label: "PT_RIO (RJ)" },
    { value: "FEDERAL", label: "Federal" },
  ];

  const map = new Map();

  [...baseLots, ...mustHave].forEach((op) => {
    const rawVal = String(op?.value ?? op?.key ?? "").toUpperCase();
    if (!rawVal) return;

    if (!map.has(rawVal)) {
      map.set(rawVal, {
        value: rawVal,
        label: op?.label || rawVal,
      });
    }
  });

  const lotOptions = [
    map.get("PT_RIO"),
    map.get("FEDERAL"),
    ...[...map.values()].filter(
      (x) => !["PT_RIO", "FEDERAL"].includes(String(x?.value || "").toUpperCase())
    ),
  ].filter(Boolean);

  const curLot = String(lotteryKeySafe || "PT_RIO").toUpperCase();

  return (
    <div
      style={{
        padding: 16,
        color: t.text,
        background: t.bg,
        minHeight: "100%",
      }}
    >
      <style>{`
        .pp-m20wrap{ position: relative; }
        .pp-m20hdr{ display:flex; align-items:center; justify-content:space-between; gap:10px; }

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
        .pp-btn:active{ transform: translateY(0px); }

        .pp-tabs{
          display:flex;
          gap:8px;
          flex-wrap:wrap;
          margin-top:10px;
        }
        .pp-tab{
          border-radius: 999px;
          padding: 8px 12px;
          background: rgba(0,0,0,0.35);
          border: 1px solid rgba(255,255,255,0.12);
          color: rgba(255,255,255,0.88);
          font-weight: 900;
          cursor: pointer;
          transition: transform .12s ease, box-shadow .18s ease, background .18s ease, border-color .18s ease;
          white-space: nowrap;
        }
        .pp-tab:hover{
          transform: translateY(-1px);
          border-color: rgba(201,168,62,0.40);
          box-shadow: 0 10px 24px rgba(0,0,0,0.35);
        }
        .pp-tab[data-active="1"]{
          background: rgba(201,168,62,0.16);
          border: 1px solid rgba(201,168,62,0.45);
          color: rgba(255,255,255,0.94);
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
        .pp-pill:not([data-empty="1"]){ cursor:pointer; }
        .pp-pill:not([data-empty="1"]):hover{
          transform: translateY(-1px);
          border-color: rgba(201,168,62,0.52);
          background: linear-gradient(180deg, rgba(201,168,62,0.22), rgba(201,168,62,0.10));
          box-shadow: 0 16px 34px rgba(0,0,0,0.42), 0 0 0 1px rgba(201,168,62,0.10);
        }
        .pp-pill:not([data-empty="1"]):active{ transform: translateY(0px); }
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

        .top3-context{
          display:grid;
          gap:6px;
          margin-top:10px;
          color: rgba(255,255,255,0.92);
          font-size: 13px;
          line-height: 1.35;
        }
      `}</style>

      <div
        style={{
          background: t.panel,
          border: `1px solid ${t.border}`,
          borderRadius: 14,
          padding: 14,
          marginBottom: 12,
        }}
      >
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ fontWeight: 900, fontSize: 18 }}>
            TOP3 — Próximo sorteio
          </div>

          <div className="top3-context">
            <div><b>Base:</b> {headerBase}</div>
            <div><b>Previsão:</b> {headerForecast}</div>
            <div><b>Transição:</b> {headerTransition}</div>
          </div>

          <div style={{ color: t.muted, fontSize: 13, marginTop: 2 }}>
            Previsão baseada na transição: <b>{meta.prev}</b> → <b>{meta.last}</b>
          </div>

          <div className="pp-tabs">
            {lotOptions.map((op) => {
              const k = String(op?.value || "").toUpperCase();
              const active = k === curLot ? "1" : "0";
              const canSet = typeof setLotteryKey === "function" && !!k;

              return (
                <button
                  key={k || op?.label}
                  type="button"
                  className="pp-tab"
                  data-active={active}
                  onClick={() => {
                    if (!canSet) return;
                    setLotteryKey(k);
                  }}
                  title={op?.label || k}
                  style={{
                    opacity: canSet ? 1 : 0.55,
                    cursor: canSet ? "pointer" : "default",
                  }}
                >
                  {op?.label || k}
                </button>
              );
            })}
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
      </div>

      {loading ? (
        <div style={{ color: t.muted }}>Carregando…</div>
      ) : error ? (
        <div style={{ color: "#ff6b6b", fontWeight: 700 }}>{String(error)}</div>
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

            const denom = samples > 0 ? samples * 5 : 0;
            const derivedScore = denom > 0 ? freq / denom : 0;

            const pct = toPercent(
              item?.probPct ??
                item?.prob ??
                item?.probCond ??
                item?.score ??
                derivedScore
            );

            const iconSrcs = Array.isArray(item?.imgIcon) && item.imgIcon.length
              ? item.imgIcon
              : Array.isArray(item?.imgBg)
              ? item.imgBg
              : [];

            const hasCols =
              Array.isArray(item?.milharesCols) &&
              item.milharesCols.length >= 4 &&
              Array.isArray(item.milharesCols[0]?.items);

            let dezenasHeader = [];
            let gridRows = Array.from({ length: 5 }, () => Array(4).fill(""));
            let flat20 = [];

            if (hasCols) {
              const cols4 = clampColsFromItemMilharesCols(item.milharesCols, 4, 5);
              dezenasHeader = cols4.map((c) => String(c.dezena || ""));
              gridRows = Array.from({ length: 5 }, (_, r) =>
                cols4.map((c) => c.items[r] || "")
              );
              flat20 = gridRows.flat().filter(Boolean);
            } else {
              let milharesBase = [];

              const m20 = Array.isArray(item?.milhares20) ? item.milhares20 : null;
              const mAny = Array.isArray(item?.milhares) ? item.milhares : null;

              if (m20 && m20.length) milharesBase = m20.slice(0);
              else if (mAny && mAny.length) milharesBase = mAny.slice(0);

              if (!milharesBase.length) {
                const g = Number(item?.grupo);

                if (Number.isFinite(g) && g > 0) {
                  if (typeof build20 === "function") {
                    const out20 = build20(g);
                    const slots20 = Array.isArray(out20?.slots) ? out20.slots : [];
                    milharesBase = slots20.map((x) => x?.milhar).filter(Boolean);
                  } else if (typeof buildMilhares === "function") {
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

              const grupoNum = Number(item?.grupo);
              const grid = build20ByDezena({
                grupo: grupoNum,
                baseMilhares: milharesBase,
                perCol: 5,
              });

              dezenasHeader = grid.dezenas;
              gridRows = grid.rows;
              flat20 = grid.flat20;
            }

            const key = `${String(item?.grupo ?? "g")}__${animal || "x"}__${idx}`;

            const title =
              idx === 0
                ? "1º MAIS FORTE"
                : idx === 1
                ? "2º MAIS FORTE"
                : "3º MAIS FORTE";

            const doCopyAll = async () => {
              const payload = flat20.join(" ").trim();
              if (!payload) return;

              const ok = await copyText(payload);
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
                    </div>
                  </div>
                </div>

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
                    alt={animal ? animal : `G${grupoTxt}`}
                    size={96}
                  />

                  <div style={{ display: "grid", gap: 6 }}>
                    <div style={{ fontSize: 12, color: t.muted, fontWeight: 800 }}>
                      GRUPO {grupoTxt}
                    </div>
                    <div
                      style={{
                        fontSize: 22,
                        fontWeight: 950,
                        letterSpacing: 0.6,
                      }}
                    >
                      {animal ? animal.toUpperCase() : "—"}
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
                      <div style={{ fontWeight: 950 }}>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={doCopyAll}
                      className="pp-btn"
                      title="Apostar"
                    >
                      {copiedAllKey === key ? "✅ Copiado" : "Copiar 20"}
                    </button>
                  </div>

                  {dezenasHeader.length ? (
                    <div className="pp-chipRow">
                      {dezenasHeader.map((dz, i) => (
                        <div key={`${dz}-${i}`} className="pp-chip">
                          {dz || "—"}
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
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}