// src/pages/Results/Results.jsx
import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { getKingResultsByDate } from "../../services/kingResultsService";
import {
  getAnimalLabel,
  getImgFromGrupo,
  getSlugByGrupo,
} from "../../constants/bichoMap";

/* =========================
   Helpers (locais e robustos)
========================= */

function pad2(n) {
  return String(n).padStart(2, "0");
}

function safeStr(v) {
  return String(v ?? "").trim();
}

function isYMD(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || "").trim());
}

function ymdToBR(ymd) {
  const m = String(ymd || "")
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return safeStr(ymd);
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function todayYMDLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/**
 * ✅ Normaliza horário para "HH:MM"
 * Aceita: "09HS", "9 HS", "09HRS", "09HR", "09H", "9h", "09:00", "9", etc.
 */
function normalizeHourLike(value) {
  const s0 = safeStr(value);
  if (!s0) return "";

  const s = s0.replace(/\s+/g, "");

  const mhx = s.match(/^(\d{1,2})(?:h|hs|hr|hrs)$/i);
  if (mhx) return `${pad2(mhx[1])}:00`;

  const mISO = s.match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/);
  if (mISO) return `${pad2(mISO[1])}:${pad2(mISO[2])}`;

  const m2 = s.match(/^(\d{1,2})$/);
  if (m2) return `${pad2(m2[1])}:00`;

  return s0;
}

function hourToNum(h) {
  const s = normalizeHourLike(h);
  const m = s.match(/^(\d{2}):(\d{2})$/);
  if (!m) return -1;
  return Number(m[1]) * 100 + Number(m[2]);
}

/**
 * Mapeamento UI (UF) -> chave real do Firestore
 */
const UF_TO_LOTTERY_KEY = {
  RJ: "PT_RIO",
};

function normalizeUfToQueryKey(input) {
  const s = safeStr(input).toUpperCase();
  if (!s) return "";
  if (s.includes("_") || s.length > 2) return s;
  return UF_TO_LOTTERY_KEY[s] || s;
}

function lotteryLabelFromKey(key) {
  const s = safeStr(key).toUpperCase();
  if (s === "PT_RIO") return "RIO";
  if (s.length === 2) return s;
  const parts = s.split("_");
  return parts[parts.length - 1] || s;
}

/**
 * ✅ prizeNumber:
 * - Fonte da verdade é p.numero (já vem NORMALIZADO no service)
 */
function guessPrizeNumber(p) {
  if (!p) return "";

  const direct = safeStr(p?.numero);
  if (direct) return direct;

  const candidates = [
    p?.milhar,
    p?.milhares,
    p?.m,
    p?.number,
    p?.num,
    p?.n,
    p?.value,
    p?.valor,
    p?.resultado,
    p?.result,
    p?.premio,
    p?.premiation,
  ];

  for (const c of candidates) {
    const s = safeStr(c);
    if (!s) continue;
    const digits = s.replace(/\D+/g, "");
    return digits || s;
  }

  if (Array.isArray(p?.numbers) && p.numbers.length) {
    const s = safeStr(p.numbers[0]);
    const digits = s.replace(/\D+/g, "");
    return digits || s;
  }

  return "";
}

function guessPrizeAnimal(p) {
  return safeStr(p?.animal || p?.label || p?.bicho || "");
}

function guessPrizeGrupo(p) {
  const g = Number.isFinite(Number(p?.grupo))
    ? Number(p.grupo)
    : Number.isFinite(Number(p?.group))
    ? Number(p.group)
    : Number.isFinite(Number(p?.grupo2))
    ? Number(p.grupo2)
    : Number.isFinite(Number(p?.group2))
    ? Number(p.group2)
    : null;
  return g;
}

function guessPrizePos(p) {
  const pos = Number.isFinite(Number(p?.position))
    ? Number(p.position)
    : Number.isFinite(Number(p?.posicao))
    ? Number(p.posicao)
    : Number.isFinite(Number(p?.pos))
    ? Number(p.pos)
    : null;
  return pos;
}

/* =========================
   Imagens (PUBLIC_URL + fallback)
========================= */

function publicBase() {
  const b = String(process.env.PUBLIC_URL || "").trim();
  return b && b !== "/" ? b : "";
}

function normalizeImgSrc(src) {
  const s = safeStr(src);
  if (!s) return "";

  if (/^https?:\/\//i.test(s)) return s;

  const base = publicBase();

  if (s.startsWith("/")) return `${base}${s}`;
  if (s.startsWith("public/")) return `${base}/${s.slice("public/".length)}`;
  if (s.startsWith("img/")) return `${base}/${s}`;

  return `${base}/${s}`;
}

/**
 * ✅ Gera tentativas inteligentes:
 * - mantém base
 * - alterna case/extensão
 * - tenta JPG/JPEG
 * - ✅ tenta também o padrão com _<size> no filename (fallback)
 */
function makeImgVariantsFromGrupo(grupo, size) {
  const g = Number(grupo);
  if (!Number.isFinite(g) || g <= 0) return [];

  const s = Number(size) || 96;
  const g2 = pad2(g);
  const slug = safeStr(getSlugByGrupo(g));
  if (!slug) return [];

  const primary = normalizeImgSrc(getImgFromGrupo(g, s));

  const base = publicBase();
  const sizedName = `${base}/assets/animals/animais_${s}_png/${g2}_${slug}_${s}.png`;

  const seeds = [primary, sizedName].filter(Boolean);

  const out = [];
  for (const seed of seeds) {
    const clean = String(seed).split("?")[0];
    if (!clean) continue;

    out.push(clean);

    if (clean.match(/\.png$/)) out.push(clean.replace(/\.png$/, ".PNG"));
    if (clean.match(/\.PNG$/)) out.push(clean.replace(/\.PNG$/, ".png"));

    out.push(clean.replace(/\.(png|PNG)$/i, ".jpg"));
    out.push(clean.replace(/\.(png|PNG|jpg)$/i, ".jpeg"));
  }

  return Array.from(new Set(out.filter(Boolean)));
}

function RowImg({ variants, alt, fallbackText }) {
  const [failed, setFailed] = useState(false);

  if (!variants.length || failed) {
    return <div className="pp_imgFallback">{fallbackText || "—"}</div>;
  }

  return (
    <img
      className="pp_img"
      src={variants[0]}
      alt={alt}
      loading="lazy"
      data-try="0"
      onError={(e) => {
        const imgEl = e.currentTarget;
        const i = Number(imgEl.dataset.try || "0");
        const next = variants[i + 1];

        if (next) {
          imgEl.dataset.try = String(i + 1);
          imgEl.src = next;
        } else {
          setFailed(true);
        }
      }}
    />
  );
}

/**
 * ✅ Resolve label + imagem com prioridade:
 * 1) Grupo (mais confiável) -> bichoMap
 * 2) Animal vindo no prize (fallback)
 */
function resolveAnimalUI(prize) {
  const grupo = guessPrizeGrupo(prize);
  const animalRaw = guessPrizeAnimal(prize);

  if (grupo) {
    const label = safeStr(getAnimalLabel(grupo)) || (animalRaw ? animalRaw : "");
    const variants = makeImgVariantsFromGrupo(grupo, 96);
    return { grupo, label, imgVariants: variants };
  }

  const label = animalRaw ? animalRaw : "";
  return { grupo: null, label, imgVariants: [] };
}

/* =========================
   Dedup de draws (causa da duplicidade)
========================= */

function drawKeyForDedup(d, ufKey, ymd) {
  const id = safeStr(d?.drawId || d?.id || "");
  if (id) return `ID:${ufKey}|${ymd}|${id}`;

  const hour = normalizeHourLike(
    d?.close_hour || d?.closeHour || d?.hour || d?.hora || ""
  );
  return `DH:${ufKey}|${ymd}|${hour || "??"}`;
}

function countPrizes(d) {
  const p = Array.isArray(d?.prizes) ? d.prizes.length : 0;
  return p;
}

function pickBetterDraw(a, b) {
  const pa = countPrizes(a);
  const pb = countPrizes(b);
  if (pa !== pb) return pb > pa ? b : a;

  const ha = safeStr(a?.close_hour || a?.closeHour || a?.hour || a?.hora);
  const hb = safeStr(b?.close_hour || b?.closeHour || b?.hour || b?.hora);
  if (!!hb !== !!ha) return hb ? b : a;

  return a;
}

function dedupeDraws(list, ufKey, ymd) {
  const arr = Array.isArray(list) ? list : [];
  const map = new Map();

  for (const d of arr) {
    const k = drawKeyForDedup(d, ufKey, ymd);
    const prev = map.get(k);
    if (!prev) map.set(k, d);
    else map.set(k, pickBetterDraw(prev, d));
  }

  return Array.from(map.values());
}

/* =========================
   UI helpers
========================= */

function prizeRankClass(pos) {
  if (pos === 1) return "isP1";
  if (pos === 2) return "isP2";
  if (pos === 3) return "isP3";
  return "";
}

/**
 * ✅ Formata número por posição:
 * - 7º prêmio = CENTENA (3 dígitos, sem zero à esquerda)
 * - demais = MILHAR (4 dígitos, com padStart)
 */
function formatPrizeNumberByPos(value, pos) {
  const s = safeStr(value);
  if (!s) return "";

  const digits = s.replace(/\D+/g, "");
  if (!digits) return s;

  if (pos === 7) {
    // centena: SEM completar com zero
    return digits.slice(-3);
  }

  // milhar: completa para 4
  return digits.slice(-4).padStart(4, "0");
}

function prizeLabelByPos(pos) {
  return pos === 7 ? "CENTENA" : "MILHAR";
}

/* =========================
   Page
========================= */

export default function Results() {
  const DEFAULT_UF_UI = "RJ";

  const [ufUi, setUfUi] = useState(DEFAULT_UF_UI);
  const [ymd, setYmd] = useState(() => todayYMDLocal());

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [draws, setDraws] = useState([]);

  const [showAll, setShowAll] = useState(false);
  const [fitCount, setFitCount] = useState(0);
  const [needsToggle, setNeedsToggle] = useState(false);

  const centerRef = useRef(null);
  const topbarRef = useRef(null);
  const sampleCardRef = useRef(null);

  const ufQueryKey = useMemo(() => normalizeUfToQueryKey(ufUi), [ufUi]);
  const label = useMemo(
    () => lotteryLabelFromKey(ufQueryKey || ufUi),
    [ufQueryKey, ufUi]
  );

  const ymdSafe = useMemo(() => {
    const s = safeStr(ymd);
    return isYMD(s) ? s : todayYMDLocal();
  }, [ymd]);

  const dateBR = useMemo(() => ymdToBR(ymdSafe), [ymdSafe]);

  const load = useCallback(async () => {
    const uQuery = safeStr(ufQueryKey);
    const d = safeStr(ymdSafe);

    if (!uQuery || !isYMD(d)) {
      setDraws([]);
      setLoading(false);
      setError("");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const out = await getKingResultsByDate({
        uf: uQuery,
        date: d,
        closeHour: null,
        positions: null,
      });

      const deduped = dedupeDraws(Array.isArray(out) ? out : [], uQuery, d);
      setDraws(deduped);
    } catch (e) {
      setDraws([]);
      setError(String(e?.message || e || "Falha ao carregar resultados."));
    } finally {
      setLoading(false);
    }
  }, [ufQueryKey, ymdSafe]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setShowAll(false);
  }, [ufQueryKey, ymdSafe]);

  const drawsOrdered = useMemo(() => {
    const list = Array.isArray(draws) ? draws : [];
    return [...list].sort((a, b) => {
      const ha = hourToNum(a?.close_hour || a?.closeHour || a?.hour || a?.hora);
      const hb = hourToNum(b?.close_hour || b?.closeHour || b?.hour || b?.hora);
      if (ha !== hb) return hb - ha;

      const ia = safeStr(a?.drawId || a?.id || "");
      const ib = safeStr(b?.drawId || b?.id || "");
      return ib.localeCompare(ia);
    });
  }, [draws]);

  const recomputeFit = useCallback(() => {
    const centerEl = centerRef.current;
    if (!centerEl) return;

    const centerH = centerEl.clientHeight || 0;

    const topbarExists = !!topbarRef.current;
    const topbarH = topbarExists
      ? (topbarRef.current?.clientHeight || 0) + 10
      : 0;

    const available = Math.max(0, centerH - topbarH);

    const cardEl = sampleCardRef.current;
    const cardH = cardEl?.clientHeight || 0;

    const rowGap = 12;

    if (available <= 0 || cardH <= 0) return;

    const rowH = cardH + rowGap;
    const rowsFit = Math.max(1, Math.floor((available + rowGap) / rowH));

    const isSingleCol = window.matchMedia("(max-width: 980px)").matches;
    const cols = isSingleCol ? 1 : 2;

    setFitCount(rowsFit * cols);
  }, []);

  useLayoutEffect(() => {
    if (!centerRef.current) return;

    recomputeFit();

    const ro = new ResizeObserver(() => recomputeFit());
    ro.observe(centerRef.current);

    const onWin = () => recomputeFit();
    window.addEventListener("resize", onWin);

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", onWin);
    };
  }, [recomputeFit, drawsOrdered.length, loading, error, needsToggle, showAll]);

  useEffect(() => {
    if (!drawsOrdered.length) {
      setNeedsToggle(false);
      return;
    }

    const effectiveFit = fitCount > 0 ? fitCount : 4;

    if (drawsOrdered.length <= effectiveFit) {
      setNeedsToggle(false);
      setShowAll(true);
    } else {
      setNeedsToggle(true);
    }
  }, [drawsOrdered, fitCount]);

  const drawsForView = useMemo(() => {
    if (!drawsOrdered.length) return [];
    if (!needsToggle) return drawsOrdered;

    const effectiveFit = fitCount > 0 ? fitCount : 4;
    if (showAll) return drawsOrdered;

    return drawsOrdered.slice(0, effectiveFit);
  }, [drawsOrdered, needsToggle, fitCount, showAll]);

  /**
   * ✅ FIX DO “CORTANDO”:
   * - quando showAll=true (ou não precisa toggle), o miolo precisa ser scrollável.
   * - mantemos shell com overflow hidden (premium), e liberamos scroll só no .pp_body
   */
  const bodyScrollable = useMemo(() => {
    const isSmall = window.matchMedia?.("(max-width: 980px)")?.matches;
    if (isSmall) return true;
    return showAll || !needsToggle;
  }, [showAll, needsToggle]);

  const styles = useMemo(() => {
    return `
      :root{
        --pp-border: rgba(255,255,255,0.10);
        --pp-border2: rgba(255,255,255,0.14);

        --pp-gold: rgba(201,168,62,0.92);
        --pp-gold2: rgba(201,168,62,0.55);
        --pp-goldSoft: rgba(201,168,62,0.16);

        --pp-text: rgba(255,255,255,0.92);
        --pp-muted: rgba(255,255,255,0.62);

        --pp-bg: rgba(0,0,0,0.55);
        --pp-glass: rgba(10,10,10,0.42);

        --pp-blackA: rgba(0,0,0,0.35);
        --pp-blackB: rgba(0,0,0,0.65);

        --pp-radius: 18px;
      }

      .pp_wrap{
        height: 100dvh;
        min-height: 100vh;
        padding: 14px;
        overflow: hidden;
        min-width: 0;
        box-sizing: border-box;
      }

      .pp_shell{
        height: calc(100dvh - 28px);
        border: 1px solid var(--pp-border);
        border-radius: var(--pp-radius);
        background:
          radial-gradient(1000px 520px at 10% 0%, rgba(201,168,62,0.10), transparent 60%),
          radial-gradient(900px 500px at 90% 10%, rgba(201,168,62,0.08), transparent 62%),
          rgba(0,0,0,0.40);
        box-shadow: 0 16px 48px rgba(0,0,0,0.55);
        padding: 10px;
        display: grid;
        grid-template-rows: auto 1fr;
        gap: 10px;
        overflow: hidden;
        min-width: 0;
      }

      .pp_header{
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:12px;
        min-width:0;
      }

      .pp_title{
        font-size:16px;
        font-weight:1100;
        letter-spacing:0.35px;
        color: var(--pp-text);
        line-height:1.1;
      }

      .pp_gold{ color: var(--pp-gold); }

      .pp_controls{
        display:flex;
        align-items:center;
        gap:8px;
        flex-wrap:wrap;
        justify-content:flex-end;
      }

      .pp_input{
        height:34px;
        border-radius: 12px;
        border: 1px solid var(--pp-border);
        background: rgba(0,0,0,0.55);
        color: var(--pp-text);
        padding: 0 10px;
        outline:none;
        font-weight: 950;
        letter-spacing:0.2px;
        min-width:110px;
        font-size: 12px;
        box-sizing: border-box;
      }
      .pp_input:focus{
        border-color: rgba(201,168,62,0.55);
        box-shadow: 0 0 0 3px rgba(201,168,62,0.12);
      }

      .pp_btn{
        height:34px;
        border-radius: 12px;
        border: 1px solid var(--pp-border);
        background: rgba(255,255,255,0.06);
        color: var(--pp-text);
        font-weight: 1100;
        letter-spacing:0.2px;
        padding: 0 14px;
        cursor:pointer;
        white-space:nowrap;
        font-size: 12px;
        box-sizing: border-box;
      }
      .pp_btn:hover{ background: rgba(255,255,255,0.08); }
      .pp_btn:active{ transform: translateY(1px); }

      .pp_body{
        min-width:0;
        min-height:0;
        overflow: hidden;
        display: flex;
        justify-content: center;
        align-items: stretch;
      }

      .pp_body.isScroll{
        overflow: auto;
        padding-right: 2px;
      }

      .pp_center{
        width: 100%;
        max-width: 980px;
        height: 100%;
        display: grid;
        grid-template-rows: auto 1fr;
        gap: 10px;
        min-height: 0;
        min-width: 0;
      }

      .pp_state{
        border: 1px solid var(--pp-border);
        border-radius: 16px;
        background: rgba(0,0,0,0.26);
        padding: 12px 14px;
        font-weight: 850;
        color: var(--pp-text);
      }

      .pp_topbar{
        display:flex;
        align-items:center;
        justify-content:flex-end;
        gap: 10px;
        min-width:0;
      }

      .pp_grid2{
        display:grid;
        grid-template-columns: repeat(2, minmax(0, 460px));
        justify-content: center;
        gap: 12px;
        min-width:0;
        align-content: start;
        padding-bottom: 14px;
      }

      .pp_card{
        position: relative;
        border-radius: 18px;
        overflow: hidden;
        border: 1px solid rgba(255,255,255,0.12);
        background: rgba(10,10,10,0.34);
        box-shadow: 0 14px 34px rgba(0,0,0,0.48);
      }

      .pp_card::before{
        content:"";
        position:absolute;
        inset:0;
        pointer-events:none;
        background:
          linear-gradient(180deg, rgba(201,168,62,0.20), transparent 38%),
          radial-gradient(800px 380px at 15% 0%, rgba(201,168,62,0.16), transparent 62%),
          radial-gradient(700px 360px at 85% 10%, rgba(201,168,62,0.10), transparent 64%);
        opacity: 1;
      }

      .pp_card::after{
        content:"";
        position:absolute;
        inset:0;
        pointer-events:none;
        background:
          linear-gradient(180deg, rgba(0,0,0,0.32) 0%, rgba(0,0,0,0.55) 55%, rgba(0,0,0,0.74) 100%);
      }

      .pp_cardInner{
        position: relative;
        z-index: 1;
      }

      .pp_cardHead{
        padding: 10px 12px;
        border-bottom: 1px solid rgba(255,255,255,0.10);
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap: 10px;
      }

      .pp_headLeft{
        display:flex;
        flex-direction:column;
        gap: 2px;
        min-width:0;
      }

      .pp_headTitle{
        font-weight: 1100;
        letter-spacing: 0.55px;
        color: rgba(255,255,255,0.92);
        text-transform: uppercase;
        font-size: 11px;
        white-space: nowrap;
        overflow:hidden;
        text-overflow: ellipsis;
      }

      .pp_headSub{
        font-weight: 900;
        color: rgba(255,255,255,0.62);
        font-size: 11px;
      }

      .pp_headPill{
        border: 1px solid rgba(201,168,62,0.32);
        background: rgba(201,168,62,0.12);
        color: rgba(201,168,62,0.96);
        font-weight: 1100;
        letter-spacing: 0.3px;
        font-size: 12px;
        padding: 6px 10px;
        border-radius: 999px;
        white-space: nowrap;
      }

      .pp_rows{ display:grid; }

      .pp_row{
        display:grid;
        grid-template-columns: 58px 1fr 110px;
        gap: 10px;
        align-items:center;
        padding: 10px 12px;
        border-bottom: 1px solid rgba(255,255,255,0.08);
        min-width: 0;
      }
      .pp_row:last-child{ border-bottom:0; }

      .pp_posBadge{
        width: 46px;
        height: 34px;
        border-radius: 12px;
        border: 1px solid rgba(255,255,255,0.12);
        background: rgba(255,255,255,0.06);
        display:flex;
        align-items:center;
        justify-content:center;
        font-weight: 1200;
        letter-spacing: 0.4px;
        color: rgba(255,255,255,0.90);
        font-size: 12px;
        user-select: none;
      }

      .pp_posBadge.isP1,
      .pp_posBadge.isP2,
      .pp_posBadge.isP3{
        border-color: rgba(201,168,62,0.36);
        background: rgba(201,168,62,0.12);
        color: rgba(201,168,62,0.98);
        box-shadow: 0 10px 20px rgba(0,0,0,0.25);
      }

      .pp_mid{
        display:flex;
        align-items:center;
        gap: 10px;
        min-width: 0;
      }

      .pp_imgFrame{
        width: 42px;
        height: 42px;
        border-radius: 14px;
        border: 1px solid rgba(201,168,62,0.26);
        background: rgba(0,0,0,0.22);
        display:grid;
        place-items:center;
        overflow:hidden;
        flex: 0 0 auto;
        box-shadow: inset 0 0 0 1px rgba(255,255,255,0.06);
      }

      .pp_img{
        width: 32px;
        height: 32px;
        object-fit: contain;
        filter: drop-shadow(0 2px 0 rgba(0,0,0,0.25));
        display:block;
      }

      .pp_imgFallback{
        font-size: 10px;
        font-weight: 1200;
        color: rgba(201,168,62,0.88);
        letter-spacing: 0.3px;
        line-height: 1;
      }

      .pp_textBlock{
        min-width: 0;
        display:flex;
        flex-direction:column;
        gap: 2px;
      }

      .pp_group{
        color: rgba(255,255,255,0.65);
        font-weight: 950;
        text-transform: uppercase;
        white-space: nowrap;
        font-size: 11px;
        overflow:hidden;
        text-overflow:ellipsis;
      }

      .pp_animal{
        color: rgba(255,255,255,0.94);
        font-weight: 1200;
        text-transform: uppercase;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: 13px;
        letter-spacing: 0.35px;
      }

      .pp_num{
        display:flex;
        align-items:center;
        justify-content:flex-end;
        gap: 8px;
        white-space: nowrap;
        min-width: 0;
        font-variant-numeric: tabular-nums;
      }

      .pp_numValue{
        font-weight: 1300;
        font-size: 18px;
        letter-spacing: 1px;
        color: rgba(255,255,255,0.95);
        text-shadow: 0 10px 24px rgba(0,0,0,0.45);
      }

      .pp_numHint{
        color: rgba(201,168,62,0.92);
        font-weight: 1100;
        font-size: 11px;
        letter-spacing: 0.25px;
        border: 1px solid rgba(201,168,62,0.28);
        background: rgba(201,168,62,0.10);
        padding: 4px 8px;
        border-radius: 999px;
      }

      .pp_row:hover{
        background: rgba(255,255,255,0.03);
      }

      @media (max-width: 980px){
        .pp_body{ overflow: auto; }
        .pp_grid2{ grid-template-columns: 1fr; }
      }

      @media (max-width: 620px){
        .pp_header{ flex-direction: column; align-items: stretch; }
        .pp_controls{ justify-content:flex-start; }
        .pp_input, .pp_btn{ width:100%; min-width:0; }

        .pp_row{ grid-template-columns: 56px 1fr 104px; padding: 10px 10px; }
        .pp_numValue{ font-size: 17px; }
      }
    `;
  }, []);

  return (
    <div className="pp_wrap">
      <style>{styles}</style>

      <div className="pp_shell">
        <div className="pp_header">
          <div style={{ minWidth: 0 }}>
            <div className="pp_title">Resultados</div>
          </div>

          <div className="pp_controls">
            <input
              className="pp_input"
              value={ufUi}
              onChange={(e) => setUfUi(e.target.value)}
              placeholder="UF (ex.: RJ)"
              aria-label="UF"
              inputMode="text"
              maxLength={12}
            />

            <input
              className="pp_input"
              type="date"
              value={ymdSafe}
              onChange={(e) => setYmd(e.target.value)}
              aria-label="Data"
              title="Calendário"
              style={{ minWidth: 150 }}
            />

            <button
              className="pp_btn"
              onClick={load}
              type="button"
              title="Atualizar"
            >
              Atualizar
            </button>
          </div>
        </div>

        <div className={`pp_body ${bodyScrollable ? "isScroll" : ""}`}>
          <div className="pp_center" ref={centerRef}>
            {loading ? (
              <div className="pp_state">Carregando…</div>
            ) : error ? (
              <div className="pp_state">
                <div style={{ fontWeight: 1100, marginBottom: 6 }}>Erro</div>
                <div style={{ opacity: 0.9, whiteSpace: "pre-wrap" }}>
                  {error}
                </div>
              </div>
            ) : drawsOrdered.length === 0 ? (
              <div className="pp_state">
                Nenhum resultado para{" "}
                <span className="pp_gold">
                  {safeStr(ufUi).toUpperCase() || DEFAULT_UF_UI}
                </span>{" "}
                em <span className="pp_gold">{dateBR}</span>.
              </div>
            ) : (
              <>
                {needsToggle ? (
                  <div className="pp_topbar" ref={topbarRef}>
                    <button
                      className="pp_btn"
                      type="button"
                      onClick={() => setShowAll((v) => !v)}
                      title={showAll ? "Ver menos" : "Ver mais"}
                    >
                      {showAll ? "Ver menos" : "Ver mais"}
                    </button>
                  </div>
                ) : (
                  <div style={{ height: 0 }} />
                )}

                <div className="pp_grid2">
                  {drawsForView.map((d, idx) => {
                    const hour = normalizeHourLike(
                      d?.close_hour || d?.closeHour || d?.hour || d?.hora || ""
                    );
                    const id = safeStr(d?.drawId || d?.id || `idx_${idx}`);
                    const prizesRaw = Array.isArray(d?.prizes) ? d.prizes : [];

                    const byPos = new Map();
                    for (const p of prizesRaw) {
                      const pos = guessPrizePos(p);
                      if (!pos) continue;
                      if (!byPos.has(pos)) byPos.set(pos, p);
                    }

                    const rows = Array.from({ length: 7 }, (_, i) => {
                      const posWanted = i + 1;
                      const p = byPos.get(posWanted) || null;

                      const { grupo, label: animalLabelRaw, imgVariants } = p
                        ? resolveAnimalUI(p)
                        : { grupo: null, label: "", imgVariants: [] };

                      const numero = p ? guessPrizeNumber(p) : "";

                      return {
                        pos: posWanted,
                        grupo,
                        animalLabel: safeStr(animalLabelRaw),
                        imgVariants,
                        numero,
                      };
                    });

                    const hs = hour ? `${hour.slice(0, 2)}HS` : "—";

                    return (
                      <div
                        key={`${id}_${idx}`}
                        className="pp_card"
                        ref={idx === 0 ? sampleCardRef : null}
                      >
                        <div className="pp_cardInner">
                          <div className="pp_cardHead">
                            <div className="pp_headLeft">
                              <div className="pp_headTitle">{`Resultado • LT PT ${label}`}</div>
                              <div className="pp_headSub">{dateBR}</div>
                            </div>

                            <div className="pp_headPill">{hs}</div>
                          </div>

                          <div className="pp_rows">
                            {rows.map((r) => {
                              const gtxt = r.grupo ? `G${pad2(r.grupo)}` : "—";
                              const numFmt = r.numero
                                ? formatPrizeNumberByPos(r.numero, r.pos)
                                : "";

                              return (
                                <div
                                  key={`${id}_pos_${r.pos}`}
                                  className="pp_row"
                                >
                                  <div
                                    className={`pp_posBadge ${prizeRankClass(
                                      r.pos
                                    )}`}
                                  >
                                    {`${r.pos}º`}
                                  </div>

                                  <div className="pp_mid">
                                    <div
                                      className="pp_imgFrame"
                                      aria-hidden="true"
                                    >
                                      <RowImg
                                        variants={r.imgVariants || []}
                                        alt={
                                          r.animalLabel
                                            ? `Bicho ${r.animalLabel}`
                                            : "Bicho"
                                        }
                                        fallbackText={gtxt}
                                      />
                                    </div>

                                    <div className="pp_textBlock">
                                      <div className="pp_group">
                                        {r.grupo
                                          ? `GRUPO ${pad2(r.grupo)}`
                                          : "GRUPO —"}
                                      </div>
                                      <div className="pp_animal">
                                        {r.animalLabel
                                          ? r.animalLabel.toUpperCase()
                                          : "—"}
                                      </div>
                                    </div>
                                  </div>

                                  <div className="pp_num">
                                    {r.numero ? (
                                      <>
                                        <span className="pp_numHint">
                                          {prizeLabelByPos(r.pos)}
                                        </span>
                                        <span className="pp_numValue">
                                          {numFmt}
                                        </span>
                                      </>
                                    ) : (
                                      <span
                                        className="pp_numValue"
                                        style={{ opacity: 0.55 }}
                                      >
                                        —
                                      </span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
