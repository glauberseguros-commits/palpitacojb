// src/pages/Results/Results.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

function ymdToDateLocal(ymd) {
  const m = String(ymd || "")
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  // local time (Brasil)
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
}

function weekdayLocal(ymd) {
  const d = ymdToDateLocal(ymd);
  if (!d || Number.isNaN(d.getTime())) return null;
  // 0=Dom..6=Sáb
  return d.getDay();
}

function isWedOrSat(ymd) {
  const wd = weekdayLocal(ymd);
  return wd === 3 || wd === 6; // Quarta ou Sábado
}

function prevWedOrSatFromYmd(ymd) {
  const d = ymdToDateLocal(ymd) || new Date();
  // volta no máximo 7 dias para achar o último (qua/sáb)
  for (let i = 0; i < 8; i += 1) {
    const y = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    if (isWedOrSat(y)) return y;
    d.setDate(d.getDate() - 1);
  }
  return ymd;
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
 * ✅ Extrai array de draws de qualquer retorno comum do service
 * (evita "vazio" quando out = { drawsRaw: [...] } etc.)
 */
function unwrapDraws(maybe) {
  if (Array.isArray(maybe)) return maybe;
  if (maybe && typeof maybe === "object") {
    if (Array.isArray(maybe.drawsRaw)) return maybe.drawsRaw;
    if (Array.isArray(maybe.draws)) return maybe.draws;
    if (Array.isArray(maybe.rows)) return maybe.rows;
    if (Array.isArray(maybe.data)) return maybe.data;
    if (maybe.result && Array.isArray(maybe.result)) return maybe.result;
  }
  return [];
}

/* =========================
   Escopos (RJ / Federal)
========================= */

const SCOPE_RJ = "RJ";
const SCOPE_FEDERAL = "FEDERAL";

const FEDERAL_INPUT_ALIASES = new Set([
  "FEDERAL",
  "FED",
  "LOTERIA FEDERAL",
  "LOTERIA_FEDERAL",
  "LOT FEDERAL",
  "LT_FEDERAL",
  "FED_BR",
]);

function isFederalInput(scope) {
  const up = safeStr(scope).toUpperCase();
  if (!up) return false;
  if (up === SCOPE_FEDERAL) return true;
  if (FEDERAL_INPUT_ALIASES.has(up)) return true;
  const compact = up.replace(/[\s_]+/g, " ").trim();
  if (FEDERAL_INPUT_ALIASES.has(compact)) return true;
  const unders = up.replace(/[\s_]+/g, "_");
  if (FEDERAL_INPUT_ALIASES.has(unders)) return true;
  return false;
}

/**
 * ✅ Mapeamento UI -> query key do service
 * - Agora o service já entende "RJ" e "FEDERAL", então aqui é só padronização.
 */
function normalizeScopeInput(input) {
  const s = safeStr(input).toUpperCase();
  if (!s) return SCOPE_RJ;
  if (s === SCOPE_RJ) return SCOPE_RJ;
  if (isFederalInput(s)) return SCOPE_FEDERAL;
  return s;
}

function scopeDisplayName(scope) {
  const up = safeStr(scope).toUpperCase();
  if (up === SCOPE_RJ) return "RIO";
  if (isFederalInput(up)) return "FEDERAL";
  return up;
}

/**
 * ✅ Regras do Federal
 * - 20h (20:00)
 * - Quarta e Sábado
 */
const FEDERAL_CLOSE_HOUR_BUCKET = "20h";
const FEDERAL_CLOSE_HOUR = "20:00";

/* =========================
   prizeNumber:
   - Fonte da verdade é p.numero (já vem NORMALIZADO no service)
========================= */

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
   Label robusto (bichoMap)
========================= */

function safeGetAnimalLabel(grupo, animalFallback) {
  const g = Number(grupo);
  if (!Number.isFinite(g)) return safeStr(animalFallback || "");

  // tenta assinatura "objeto" primeiro
  try {
    const a1 = getAnimalLabel({ grupo: g, animal: safeStr(animalFallback || "") });
    const s1 = safeStr(a1);
    if (s1) return s1;
  } catch {}

  // tenta assinatura "número"
  try {
    const a2 = getAnimalLabel(g);
    const s2 = safeStr(a2);
    if (s2) return s2;
  } catch {}

  return safeStr(animalFallback || "");
}

/* =========================
   Imagens (BASE_URL/Vite + PUBLIC_URL/CRA)
========================= */

function publicBase() {
  // ✅ Vite: BASE_URL (ex.: "/" ou "/palpitaco/")
  try {
    const viteBase = typeof import.meta !== "undefined" ? import.meta.env?.BASE_URL : "";
    const vb = String(viteBase || "").trim();
    if (vb) return vb.endsWith("/") ? vb.slice(0, -1) : vb;
  } catch {}

  // ✅ CRA: PUBLIC_URL
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
    const label = safeGetAnimalLabel(grupo, animalRaw);
    const variants = makeImgVariantsFromGrupo(grupo, 96);
    return { grupo, label, imgVariants: variants };
  }

  const label = animalRaw ? animalRaw : "";
  return { grupo: null, label, imgVariants: [] };
}

/* =========================
   Dedup de draws (✅ inclui lottery_code)
========================= */

function drawKeyForDedup(d, scopeKey, ymd) {
  // ✅ Nesta página (Resultados), a identidade lógica é: DATA + HORÁRIO (+ scope)
  // Isso elimina duplicações causadas por docs diferentes (drawId/lottery_code) para o mesmo horário.
  const hour = normalizeHourLike(
    d?.close_hour || d?.closeHour || d?.hour || d?.hora || ""
  );

  if (hour) return `HOUR:${scopeKey}|${ymd}|${hour}`;

  // fallback raríssimo: se não veio horário, tenta id
  const id = safeStr(d?.drawId || d?.id || "");
  return `ID:${scopeKey}|${ymd}|${id || "?"}`;
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

function dedupeDraws(list, scopeKey, ymd) {
  const arr = Array.isArray(list) ? list : [];
  const map = new Map();

  for (const d of arr) {
    const k = drawKeyForDedup(d, scopeKey, ymd);
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
 * - 7º prêmio = CENTENA (3 dígitos)
 * - demais = MILHAR (4 dígitos, com padStart)
 */
function formatPrizeNumberByPos(value, pos) {
  const s = safeStr(value);
  if (!s) return "";

  const digits = s.replace(/\D+/g, "");
  if (!digits) return s;

  if (pos === 7) {
    return digits.slice(-3);
  }

  return digits.slice(-4).padStart(4, "0");
}

function prizeLabelByPos(pos) {
  return pos === 7 ? "CENTENA" : "MILHAR";
}

function scopePillClass(active) {
  return active ? "pp_pill isActive" : "pp_pill";
}

/* =========================
   Page
========================= */

export default function Results() {
  const DEFAULT_SCOPE = SCOPE_RJ;

  const [scopeUi, setScopeUi] = useState(DEFAULT_SCOPE);
  const [ymd, setYmd] = useState(() => todayYMDLocal());

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [draws, setDraws] = useState([]);

  // ✅ Agora: Resultados mostra TUDO por padrão
  const [showAll, setShowAll] = useState(true);
  const [needsToggle, setNeedsToggle] = useState(false);

  const centerRef = useRef(null);

  const scopeKey = useMemo(() => normalizeScopeInput(scopeUi), [scopeUi]);
  const isFederal = useMemo(() => isFederalInput(scopeKey), [scopeKey]);

  const label = useMemo(() => scopeDisplayName(scopeKey), [scopeKey]);

  const ymdSafe = useMemo(() => {
    const s = safeStr(ymd);
    return isYMD(s) ? s : todayYMDLocal();
  }, [ymd]);

  const dateBR = useMemo(() => ymdToBR(ymdSafe), [ymdSafe]);

  const federalScheduleOk = useMemo(() => {
    if (!isFederal) return true;
    return isWedOrSat(ymdSafe);
  }, [isFederal, ymdSafe]);

  const load = useCallback(async () => {
    const sKey = safeStr(scopeKey);
    const d = safeStr(ymdSafe);

    if (!sKey || !isYMD(d)) {
      setDraws([]);
      setLoading(false);
      setError("");
      return;
    }

    setLoading(true);
    setError("");

    try {
      // ✅ Federal: força filtro de horário para não “misturar” outros draws
      const out = await getKingResultsByDate({
        uf: sKey,
        date: d,
        closeHour: isFederal ? FEDERAL_CLOSE_HOUR : null,
        closeHourBucket: isFederal ? FEDERAL_CLOSE_HOUR_BUCKET : null,
        positions: "1-7",
      });

      // ✅ robusto: aceita array OU objeto com arrays
      const list = unwrapDraws(out);
      const deduped = dedupeDraws(list, sKey, d);
      setDraws(deduped);
    } catch (e) {
      setDraws([]);
      setError(String(e?.message || e || "Falha ao carregar resultados."));
    } finally {
      setLoading(false);
    }
  }, [scopeKey, ymdSafe, isFederal]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    // quando troca escopo/data, mantemos "mostrar tudo"
    setShowAll(true);
  }, [scopeKey, ymdSafe]);

  const drawsOrdered = useMemo(() => {
    const list = Array.isArray(draws) ? draws : [];
    return [...list].sort((a, b) => {
      const ha = hourToNum(a?.close_hour || a?.closeHour || a?.hour || a?.hora);
      const hb = hourToNum(b?.close_hour || b?.closeHour || b?.hour || b?.hora);
      if (ha !== hb) return hb - ha;

      // ✅ estabilidade: lottery_code (quando existir)
      const la = safeStr(a?.lottery_code || a?.lotteryCode || "");
      const lb = safeStr(b?.lottery_code || b?.lotteryCode || "");
      if (la !== lb) return lb.localeCompare(la);

      const ia = safeStr(a?.drawId || a?.id || "");
      const ib = safeStr(b?.drawId || b?.id || "");
      return ib.localeCompare(ia);
    });
  }, [draws]);

  useEffect(() => {
    setNeedsToggle(drawsOrdered.length > 6);
  }, [drawsOrdered.length]);

  const drawsForView = useMemo(() => {
    if (!drawsOrdered.length) return [];
    if (!needsToggle) return drawsOrdered;
    if (showAll) return drawsOrdered;
    return drawsOrdered.slice(0, 6);
  }, [drawsOrdered, needsToggle, showAll]);

  const styles = useMemo(() => {
    return `
      :root{
        --pp-border: rgba(255,255,255,0.10);
        --pp-gold: rgba(201,168,62,0.92);
        --pp-text: rgba(255,255,255,0.92);
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
        border-radius: 18px;
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
        border: 1px solid rgba(255,255,255,0.10);
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
        border: 1px solid rgba(255,255,255,0.10);
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

      .pp_pills{
        display:flex;
        gap: 6px;
        align-items:center;
        flex-wrap: wrap;
      }

      .pp_pill{
        height: 34px;
        border-radius: 999px;
        border: 1px solid rgba(255,255,255,0.10);
        background: rgba(255,255,255,0.06);
        color: rgba(255,255,255,0.90);
        padding: 0 12px;
        font-weight: 1200;
        letter-spacing: 0.35px;
        cursor: pointer;
        font-size: 12px;
        user-select: none;
      }
      .pp_pill:hover{ background: rgba(255,255,255,0.08); }

      .pp_pill.isActive{
        border-color: rgba(201,168,62,0.36);
        background: rgba(201,168,62,0.12);
        color: rgba(201,168,62,0.98);
      }

      .pp_body{
        min-width:0;
        min-height:0;
        overflow: auto;
        padding-right: 2px;
        display: flex;
        justify-content: center;
        align-items: stretch;
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
        border: 1px solid rgba(255,255,255,0.10);
        border-radius: 16px;
        background: rgba(0,0,0,0.26);
        padding: 12px 14px;
        font-weight: 850;
        color: rgba(255,255,255,0.92);
      }

      .pp_warn{
        border: 1px solid rgba(201,168,62,0.26);
        background: rgba(201,168,62,0.10);
        color: rgba(255,255,255,0.92);
        border-radius: 14px;
        padding: 10px 12px;
        font-weight: 950;
        line-height: 1.25;
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
      }

      .pp_card::after{
        content:"";
        position:absolute;
        inset:0;
        pointer-events:none;
        background:
          linear-gradient(180deg, rgba(0,0,0,0.32) 0%, rgba(0,0,0,0.55) 55%, rgba(0,0,0,0.74) 100%);
      }

      .pp_cardInner{ position: relative; z-index: 1; }

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
      }

      .pp_img{
        width: 32px;
        height: 32px;
        object-fit: contain;
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

      .pp_row:hover{ background: rgba(255,255,255,0.03); }

      @media (max-width: 980px){
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

  const federalInfoText = useMemo(() => {
    if (!isFederal) return "";
    if (federalScheduleOk) {
      return "Federal: resultado às 20h (quarta e sábado).";
    }
    return "Federal só tem sorteio quarta e sábado às 20h. Clique em “Último Federal” para ir para a última data válida.";
  }, [isFederal, federalScheduleOk]);

  return (
    <div className="pp_wrap">
      <style>{styles}</style>

      <div className="pp_shell">
        <div className="pp_header">
          <div style={{ minWidth: 0 }}>
            <div className="pp_title">Resultados</div>
          </div>

          <div className="pp_controls">
            {/* ✅ Troca de escopo (RJ | Federal) */}
            <div className="pp_pills" aria-label="Escopo">
              <button
                type="button"
                className={scopePillClass(scopeKey === SCOPE_RJ)}
                onClick={() => setScopeUi(SCOPE_RJ)}
                title="Resultados do Rio (PT_RIO)"
              >
                RJ
              </button>

              <button
                type="button"
                className={scopePillClass(isFederal)}
                onClick={() => setScopeUi(SCOPE_FEDERAL)}
                title="Loteria Federal (20h qua/sáb)"
              >
                FEDERAL
              </button>
            </div>

            <input
              className="pp_input"
              type="date"
              value={ymdSafe}
              onChange={(e) => setYmd(e.target.value)}
              aria-label="Data"
              title="Calendário"
              style={{ minWidth: 150 }}
            />

            {isFederal ? (
              <button
                className="pp_btn"
                type="button"
                onClick={() =>
                  setYmd((prev) => prevWedOrSatFromYmd(prev || todayYMDLocal()))
                }
                title="Ir para a última quarta/sábado"
              >
                Último Federal
              </button>
            ) : null}

            <button className="pp_btn" onClick={load} type="button" title="Atualizar">
              Atualizar
            </button>
          </div>
        </div>

        <div className="pp_body">
          <div className="pp_center" ref={centerRef}>
            {isFederal ? <div className="pp_warn">{federalInfoText}</div> : null}

            {loading ? (
              <div className="pp_state">Carregando…</div>
            ) : error ? (
              <div className="pp_state">
                <div style={{ fontWeight: 1100, marginBottom: 6 }}>Erro</div>
                <div style={{ opacity: 0.9, whiteSpace: "pre-wrap" }}>{error}</div>
              </div>
            ) : drawsOrdered.length === 0 ? (
              <div className="pp_state">
                Nenhum resultado para{" "}
                <span className="pp_gold">{label || DEFAULT_SCOPE}</span> em{" "}
                <span className="pp_gold">{dateBR}</span>
                {isFederal && !federalScheduleOk ? (
                  <div style={{ marginTop: 8, opacity: 0.9 }}>
                    Dica: Federal é <b>quarta</b> e <b>sábado</b> às <b>20h</b>.
                  </div>
                ) : null}
                .
              </div>
            ) : (
              <>
                {needsToggle ? (
                  <div className="pp_topbar">
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
                      <div key={`${id}_${idx}`} className="pp_card">
                        <div className="pp_cardInner">
                          <div className="pp_cardHead">
                            <div className="pp_headLeft">
                              <div className="pp_headTitle">{`Resultado • ${label}`}</div>
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
                                <div key={`${id}_pos_${r.pos}`} className="pp_row">
                                  <div className={`pp_posBadge ${prizeRankClass(r.pos)}`}>
                                    {`${r.pos}º`}
                                  </div>

                                  <div className="pp_mid">
                                    <div className="pp_imgFrame" aria-hidden="true">
                                      <RowImg
                                        variants={r.imgVariants || []}
                                        alt={r.animalLabel ? `Bicho ${r.animalLabel}` : "Bicho"}
                                        fallbackText={gtxt}
                                      />
                                    </div>

                                    <div className="pp_textBlock">
                                      <div className="pp_group">
                                        {r.grupo ? `GRUPO ${pad2(r.grupo)}` : "GRUPO —"}
                                      </div>
                                      <div className="pp_animal">
                                        {r.animalLabel ? r.animalLabel.toUpperCase() : "—"}
                                      </div>
                                    </div>
                                  </div>

                                  <div className="pp_num">
                                    {r.numero ? (
                                      <>
                                        <span className="pp_numHint">{prizeLabelByPos(r.pos)}</span>
                                        <span className="pp_numValue">{numFmt}</span>
                                      </>
                                    ) : (
                                      <span className="pp_numValue" style={{ opacity: 0.55 }}>
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


