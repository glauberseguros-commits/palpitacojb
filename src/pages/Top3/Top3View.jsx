// src/pages/Top3/Top3View.jsx
import React, { useMemo, useState, useCallback, useEffect } from "react";
import { getAnimalLabel, getImgFromGrupo } from "../../constants/bichoMap";

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

function hourBucketToSortValue(hour) {
  const s = String(hour || "").trim().toLowerCase();
  const m = s.match(/^(\d{1,2})(?::(\d{2}))?h?$/);
  if (!m) return -1;
  const hh = Number(m[1]);
  const mm = Number(m[2] || 0);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return -1;
  return hh * 60 + mm;
}

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
  const listKey = useMemo(() => list.join("|"), [list]);

  useEffect(() => {
    setI(0);
  }, [listKey]);

  const src = list[i] || "";

  const onError = () => {
    setI((prev) => (prev < list.length - 1 ? prev + 1 : prev));
  };

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 16,
        border: "1px solid rgba(201,168,62,0.36)",
        background:
          "linear-gradient(180deg, rgba(255,255,255,0.04), rgba(0,0,0,0.28))",
        display: "grid",
        placeItems: "center",
        overflow: "hidden",
        boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.04)",
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

function Top3Card({
  item,
  idx,
  theme,
  copiedAllKey,
  copiedCellKey,
  setCopiedAllKey,
  setCopiedCellKey,
  copyText,
  build16,
  buildMilhares,
  build20,
}) {
  const t = theme;

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

  const iconSrcs =
    Array.isArray(item?.imgIcon) && item.imgIcon.length
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
  const rank = idx + 1;
  const isHero = idx === 0;

  const title =
    idx === 0 ? "1º MAIS FORTE" : idx === 1 ? "2º MAIS FORTE" : "3º MAIS FORTE";

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
    <article
      className={`top3-card ${isHero ? "top3-card--hero" : "top3-card--secondary"}`}
    >
      <div className="top3-card__topline">
        <div className="top3-rankBadge">{rank}</div>
        <div className="top3-card__label">🏅 {title}</div>
      </div>

      <div className="top3-card__summary">
        <div className="top3-card__identity">
          <ImgWithFallback
            srcs={iconSrcs}
            alt={animal ? animal : `G${grupoTxt}`}
            size={isHero ? 92 : 84}
          />

          <div className="top3-card__identityText">
            <div className="top3-card__group">GRUPO {grupoTxt}</div>
            <div className="top3-card__animal">
              {animal ? animal.toUpperCase() : "—"}
            </div>
          </div>
        </div>

        <div className="top3-card__confidence">
          <div className="top3-card__confidenceLabel">CONFIANÇA</div>
          <div className="top3-card__confidenceValue">{pct.toFixed(2)}%</div>
          <div className="top3-card__confidenceBar">
            <div
              className="top3-card__confidenceBarFill"
              style={{ width: `${pct}%`, background: t.accent }}
            />
          </div>
        </div>
      </div>

      <div className="top3-card__body">
        <div className="top3-card__actions">
          <div className="top3-card__sectionTitle">Combinações principais</div>

          <button
            type="button"
            onClick={doCopyAll}
            className="pp-btn"
            title="Copiar as 20 milhares"
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
                    {isCopied ? <div className="pp-copiedBadge">COPIADO</div> : null}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </article>
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
  const [log, setLog] = useState([]);

  useEffect(() => {
    try {
      const data = JSON.parse(localStorage.getItem("top3_log") || "[]");
      setLog(Array.isArray(data) ? data : []);
    } catch {
      setLog([]);
    }
  }, []);

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
  const heroItem = list[0] || null;
  const secondaryItems = list.slice(1, 3);

  const historyAnchorYmd = useMemo(() => {
    const y = String(analysisYmd || "").trim();
    if (isYMD(y)) return y;

    const last = log[log.length - 1];
    const fallback = String(last?.target?.ymd || "").trim();
    return isYMD(fallback) ? fallback : "";
  }, [analysisYmd, log]);

  const historyRows = useMemo(() => {
    if (!log.length || !historyAnchorYmd) return [];

    return [...log]
      .filter((item) => String(item?.target?.ymd || "").trim() === historyAnchorYmd)
      .sort((a, b) => {
        const ah = hourBucketToSortValue(a?.target?.hour);
        const bh = hourBucketToSortValue(b?.target?.hour);
        return bh - ah;
      });
  }, [log, historyAnchorYmd]);

  return (
    <div
      style={{
        padding: 16,
        color: t.text,
        background: t.bg,
        minHeight: "100%",
        "--top3-bg": t.bg,
        "--top3-panel": t.panel,
        "--top3-border": t.border,
        "--top3-text": t.text,
        "--top3-muted": t.muted,
        "--top3-accent": t.accent,
      }}
    >
      <style>{`
        .top3-page{
          width: 100%;
          max-width: 1380px;
          margin: 0 auto;
          display: grid;
          gap: 18px;
        }

        .top3-shell{
          background:
            linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.00)),
            var(--top3-panel);
          border: 1px solid var(--top3-border);
          border-radius: 20px;
          padding: 18px;
          box-shadow:
            0 20px 50px rgba(0,0,0,0.34),
            inset 0 0 0 1px rgba(255,255,255,0.03);
        }

        .top3-header{
          display:grid;
          gap:14px;
        }

        .top3-header__title{
          font-weight: 950;
          font-size: 18px;
          letter-spacing: 0.2px;
        }

        .top3-context{
          display:grid;
          gap:6px;
          color: rgba(255,255,255,0.92);
          font-size: 13px;
          line-height: 1.35;
        }

        .top3-context b{
          color: rgba(255,255,255,0.98);
        }

        .top3-helper{
          color: var(--top3-muted);
          font-size: 13px;
          line-height: 1.4;
        }

        .pp-tabs{
          display:flex;
          gap:8px;
          flex-wrap:wrap;
          margin-top: 2px;
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

        .top3-metaGrid{
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 10px;
        }

        .top3-metaItem{
          background: rgba(255,255,255,0.025);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 14px;
          padding: 10px 12px;
          display: grid;
          gap: 4px;
          min-width: 0;
        }

        .top3-metaItem__label{
          color: var(--top3-muted);
          font-size: 11px;
          font-weight: 900;
          letter-spacing: 0.9px;
          text-transform: uppercase;
        }

        .top3-metaItem__value{
          color: var(--top3-text);
          font-size: 13px;
          font-weight: 800;
          line-height: 1.35;
          word-break: break-word;
        }

        .top3-stage{
          display: grid;
          gap: 16px;
        }

        .top3-heroWrap{
          width: 100%;
          max-width: 1120px;
          margin: 0 auto;
        }

        .top3-secondaryRow{
          width: 100%;
          max-width: 1120px;
          margin: 0 auto;
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 16px;
          align-items: start;
          justify-content: center;
        }

        .top3-card{
          position: relative;
          background:
            radial-gradient(1100px 280px at 50% 0%, rgba(201,168,62,0.08), transparent 55%),
            linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.00)),
            var(--top3-panel);
          border: 1px solid var(--top3-border);
          border-radius: 20px;
          padding: 16px;
          display: grid;
          gap: 14px;
          box-shadow:
            0 18px 44px rgba(0,0,0,0.30),
            inset 0 0 0 1px rgba(255,255,255,0.03);
          overflow: hidden;
        }

        .top3-card::after{
          content: "";
          position: absolute;
          inset: 0;
          border-radius: inherit;
          pointer-events: none;
          box-shadow: inset 0 0 0 1px rgba(201,168,62,0.05);
        }

        .top3-card--hero{
          padding: 18px;
        }

        .top3-card__topline{
          display:flex;
          align-items:center;
          gap:10px;
        }

        .top3-rankBadge{
          width: 30px;
          height: 30px;
          border-radius: 10px;
          display: grid;
          place-items: center;
          background: rgba(201,168,62,0.15);
          border: 1px solid rgba(201,168,62,0.35);
          font-weight: 950;
          color: var(--top3-accent);
          flex: 0 0 auto;
        }

        .top3-card__label{
          font-weight: 950;
          letter-spacing: 0.4px;
          font-size: 14px;
        }

        .top3-card__summary{
          display:grid;
          grid-template-columns: minmax(0, 1fr) 170px;
          gap: 14px;
          align-items: center;
        }

        .top3-card--hero .top3-card__summary{
          grid-template-columns: minmax(0, 1fr) 190px;
        }

        .top3-card__identity{
          display:flex;
          align-items:center;
          gap:14px;
          min-width: 0;
        }

        .top3-card__identityText{
          display:grid;
          gap: 6px;
          min-width: 0;
        }

        .top3-card__group{
          font-size: 11px;
          color: var(--top3-muted);
          font-weight: 900;
          letter-spacing: 1px;
        }

        .top3-card__animal{
          font-size: 24px;
          font-weight: 950;
          letter-spacing: 0.6px;
          line-height: 1.05;
          word-break: break-word;
        }

        .top3-card--secondary .top3-card__animal{
          font-size: 20px;
        }

        .top3-card__confidence{
          justify-self: end;
          width: 100%;
          max-width: 190px;
          text-align: right;
          display:grid;
          gap: 6px;
        }

        .top3-card__confidenceLabel{
          color: var(--top3-muted);
          font-size: 11px;
          font-weight: 900;
          letter-spacing: 0.9px;
        }

        .top3-card__confidenceValue{
          font-size: 30px;
          font-weight: 950;
          color: var(--top3-accent);
          line-height: 1;
        }

        .top3-card--secondary .top3-card__confidenceValue{
          font-size: 26px;
        }

        .top3-card__confidenceBar{
          height: 7px;
          border-radius: 999px;
          background: rgba(255,255,255,0.10);
          overflow: hidden;
        }

        .top3-card__confidenceBarFill{
          height: 100%;
          border-radius: inherit;
          opacity: 0.78;
        }

        .top3-card__body{
          border-top: 1px solid rgba(255,255,255,0.07);
          padding-top: 12px;
          display:grid;
          gap: 10px;
        }

        .top3-card__actions{
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:12px;
        }

        .top3-card__sectionTitle{
          font-weight: 900;
          font-size: 13px;
          color: rgba(255,255,255,0.92);
          letter-spacing: 0.2px;
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
          margin-top: 2px;
        }

        .pp-chip{
          display:flex;
          justify-content:center;
          align-items:center;
          min-height: 28px;
          border-radius: 999px;
          font-size: 12px;
          font-weight: 950;
          letter-spacing: 1.4px;
          color: rgba(255,255,255,0.90);
          background: linear-gradient(180deg, rgba(201,168,62,0.22), rgba(201,168,62,0.10));
          border: 1px solid rgba(201,168,62,0.35);
          box-shadow: 0 10px 26px rgba(0,0,0,0.25);
        }

        .pp-gridBox{
          position: relative;
          display: grid;
          gap: 8px;
          padding: 12px;
          border-radius: 16px;
          background: radial-gradient(1200px 260px at 50% 0%, rgba(201,168,62,0.10), rgba(0,0,0,0.28));
          border: 1px solid rgba(201,168,62,0.22);
          overflow: hidden;
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
          letter-spacing: 1.4px;
          color: rgba(255,255,255,0.92);
          user-select: text;
          transition: transform .10s ease, box-shadow .18s ease, background .18s ease, border-color .18s ease, opacity .18s ease;
          background: linear-gradient(180deg, rgba(201,168,62,0.14), rgba(201,168,62,0.08));
          border: 1px solid rgba(201,168,62,0.28);
          box-shadow: 0 10px 26px rgba(0,0,0,0.24);
          min-width: 0;
        }

        .pp-pill[data-empty="1"]{
          opacity: .30;
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
          box-shadow: 0 16px 34px rgba(0,0,0,0.34), 0 0 0 1px rgba(201,168,62,0.10);
        }

        .pp-pill:not([data-empty="1"]):active{
          transform: translateY(0px);
        }

        .pp-copiedBadge{
          position:absolute;
          right: 8px;
          top: 8px;
          font-size: 10px;
          font-weight: 900;
          color: rgba(0,0,0,0.92);
          background: rgba(201,168,62,0.92);
          padding: 4px 7px;
          border-radius: 999px;
          box-shadow: 0 10px 20px rgba(0,0,0,0.35);
        }

        .top3-empty{
          color: var(--top3-muted);
          padding: 6px 0;
        }

        .top3-error{
          color: #ff6b6b;
          font-weight: 800;
          padding: 6px 0;
        }

        .top3-historyRow{
          display:grid;
          grid-template-columns: 170px 1fr 250px 60px;
          align-items:center;
          gap: 12px;
          padding: 10px 12px;
          border-radius: 12px;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          font-size: 13px;
        }

        .top3-historyResult{
          display:flex;
          align-items:center;
          gap:10px;
          min-width:0;
        }

        .top3-historyResultText{
          display:grid;
          gap:2px;
          min-width:0;
        }

        .top3-historyResultGroup{
          font-weight:900;
        }

        .top3-historyResultAnimal{
          font-size:11px;
          color: var(--top3-muted);
          text-transform: uppercase;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        @media (max-width: 1180px){
          .top3-secondaryRow{
            max-width: 980px;
          }
        }

        @media (max-width: 980px){
          .top3-page{
            gap: 14px;
          }

          .top3-shell{
            padding: 14px;
            border-radius: 18px;
          }

          .top3-metaGrid{
            grid-template-columns: 1fr 1fr;
          }

          .top3-heroWrap,
          .top3-secondaryRow{
            max-width: none;
          }

          .top3-secondaryRow{
            grid-template-columns: 1fr;
            gap: 14px;
          }

          .top3-card,
          .top3-card--hero{
            padding: 14px;
            border-radius: 18px;
          }

          .top3-card__summary,
          .top3-card--hero .top3-card__summary{
            grid-template-columns: 1fr;
            gap: 12px;
          }

          .top3-card__confidence{
            justify-self: stretch;
            text-align: left;
            max-width: none;
          }

          .top3-card__confidenceValue{
            font-size: 28px;
          }

          .top3-card__actions{
            align-items: stretch;
            flex-direction: column;
          }

          .pp-btn{
            width: 100%;
          }

          .top3-historyRow{
            grid-template-columns: 1fr;
            align-items:start;
          }
        }

        @media (max-width: 640px){
          .top3-page{
            gap: 12px;
          }

          .top3-shell{
            padding: 12px;
            border-radius: 16px;
          }

          .top3-header__title{
            font-size: 17px;
          }

          .top3-card__topline{
            gap: 8px;
          }

          .top3-rankBadge{
            width: 28px;
            height: 28px;
            border-radius: 9px;
          }

          .top3-card__identity{
            gap: 10px;
            align-items: center;
          }

          .top3-card__animal{
            font-size: 18px;
            letter-spacing: 0.35px;
          }

          .top3-card--secondary .top3-card__animal{
            font-size: 18px;
          }

          .top3-card__confidenceValue,
          .top3-card--secondary .top3-card__confidenceValue{
            font-size: 24px;
          }

          .pp-chipRow{
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .pp-row{
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .pp-pill{
            padding: 10px 8px;
            font-size: 13px;
            letter-spacing: 1px;
          }

          .pp-copiedBadge{
            right: 6px;
            top: 6px;
            font-size: 9px;
            padding: 3px 6px;
          }

          .top3-metaGrid{
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 420px){
          .top3-shell{
            padding: 10px;
          }

          .top3-card,
          .top3-card--hero{
            padding: 12px;
          }

          .top3-card__group{
            font-size: 10px;
          }

          .top3-card__animal{
            font-size: 16px;
          }

          .top3-card__confidenceValue{
            font-size: 22px;
          }

          .pp-gridBox{
            padding: 10px;
            gap: 7px;
          }

          .pp-row,
          .pp-chipRow{
            gap: 8px;
          }
        }
      `}</style>

      <div className="top3-page">
        <section className="top3-shell">
          <div className="top3-header">
            <div className="top3-header__title">TOP3 — Próximo sorteio</div>

            <div className="top3-context">
              <div><b>Base:</b> {headerBase}</div>
              <div><b>Previsão:</b> {headerForecast}</div>
              <div><b>Transição:</b> {headerTransition}</div>
            </div>

            <div className="top3-helper">
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

            <div className="top3-metaGrid">
              <div className="top3-metaItem">
                <div className="top3-metaItem__label">Último</div>
                <div className="top3-metaItem__value">{meta.last}</div>
              </div>

              <div className="top3-metaItem">
                <div className="top3-metaItem__label">Anterior</div>
                <div className="top3-metaItem__value">{meta.prev}</div>
              </div>

              <div className="top3-metaItem">
                <div className="top3-metaItem__label">Condição</div>
                <div className="top3-metaItem__value">{meta.layer}</div>
              </div>
            </div>
          </div>
        </section>

        {loading ? (
          <div className="top3-empty">Carregando…</div>
        ) : error ? (
          <div className="top3-error">{String(error)}</div>
        ) : !list.length ? (
          <div className="top3-empty">Sem dados para calcular TOP3.</div>
        ) : (
          <section className="top3-stage">
            {heroItem ? (
              <div className="top3-heroWrap">
                <Top3Card
                  item={heroItem}
                  idx={0}
                  theme={t}
                  copiedAllKey={copiedAllKey}
                  copiedCellKey={copiedCellKey}
                  setCopiedAllKey={setCopiedAllKey}
                  setCopiedCellKey={setCopiedCellKey}
                  copyText={copyText}
                  build16={build16}
                  buildMilhares={buildMilhares}
                  build20={build20}
                />
              </div>
            ) : null}

            {secondaryItems.length ? (
              <div className="top3-secondaryRow">
                {secondaryItems.map((item, localIdx) => (
                  <Top3Card
                    key={`${String(item?.grupo ?? "g")}__${String(item?.animal || "")}__${localIdx + 1}`}
                    item={item}
                    idx={localIdx + 1}
                    theme={t}
                    copiedAllKey={copiedAllKey}
                    copiedCellKey={copiedCellKey}
                    setCopiedAllKey={setCopiedAllKey}
                    setCopiedCellKey={setCopiedCellKey}
                    copyText={copyText}
                    build16={build16}
                    buildMilhares={buildMilhares}
                    build20={build20}
                  />
                ))}
              </div>
            ) : null}
          </section>
        )}

        <section className="top3-shell">
          <div className="top3-header__title">
            Histórico recente {historyAnchorYmd ? `— ${ymdToBR(historyAnchorYmd)}` : ""}
          </div>

          <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
            {!historyRows.length ? (
              <div className="top3-empty">Sem histórico para a data analisada.</div>
            ) : (
              historyRows.map((item) => {
                const y = String(item?.target?.ymd || "");
                const h = String(item?.target?.hour || "");

                const picks = Array.isArray(item?.picks)
                  ? item.picks.map((g) => formatGrupo(g)).join(" - ")
                  : "--- - --- - ---";

                const resultGrupo = Number(
                  item?.result ?? item?.grupo ?? item?.prizes?.[0]?.grupo
                );
                const hasResult = Number.isFinite(resultGrupo);

                const resultAnimal = hasResult
                  ? (item?.animal || getAnimalLabel(resultGrupo))
                  : "";
                const resultImg = hasResult
                  ? getImgFromGrupo(resultGrupo, 64)
                  : "";

                return (
                  <div
                    key={String(item?.targetKey || `${y}_${h}`)}
                    className="top3-historyRow"
                  >
                    <div style={{ fontWeight: 800 }}>
                      {ymdToBR(y)} {h}
                    </div>

                    <div style={{ letterSpacing: 1 }}>
                      {picks}
                    </div>

                    <div className="top3-historyResult">
                      {hasResult ? (
                        <>
                          <ImgWithFallback
                            srcs={[resultImg]}
                            alt={resultAnimal}
                            size={36}
                            style={{ borderRadius: 8 }}
                          />
                          <div className="top3-historyResultText">
                            <div className="top3-historyResultGroup">
                              G{formatGrupo(resultGrupo)}
                            </div>
                            <div className="top3-historyResultAnimal">
                              {String(resultAnimal || "").toUpperCase()}
                            </div>
                          </div>
                        </>
                      ) : (
                        <>
                          <ImgWithFallback
                            srcs={[]}
                            alt="pendente"
                            size={36}
                            style={{ borderRadius: 8 }}
                          />
                          <div className="top3-historyResultText">
                            <div className="top3-historyResultGroup">G—</div>
                            <div className="top3-historyResultAnimal">PENDENTE</div>
                          </div>
                        </>
                      )}
                    </div>

                    <div style={{ textAlign: "center", fontSize: 16 }}>
                      {item?.hit === true
                        ? "✅"
                        : item?.hit === false
                          ? "❌"
                          : "⏳"}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>
    </div>
  );
}