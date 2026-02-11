// src/pages/Centenas/Centenas.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getKingBoundsByUf, getKingResultsByRange } from "../../services/kingResultsService";
import {
  getAnimalLabel as getAnimalLabelFn,
  getImgFromGrupo as getImgFromGrupoFn,
} from "../../constants/bichoMap";

/**
 * Centenas+ (PREMIUM)
 * ✅ Performance:
 * - chunks em paralelo (concorrência controlada)
 * - cache em memória por (lottery + closeHour + positions)
 *
 * ✅ UX:
 * - persistência de filtros no localStorage (não apaga ao trocar de página)
 * - status de progresso por chunks
 *
 * ✅ Imagem nítida:
 * - tenta usar getImgFromGrupo(grupo, 128) quando disponível
 * - tenta "upar" _64/_96 -> _128 no banner e nos cards
 *
 * ✅ FIX (Horário):
 * - Firestore/King pode salvar close_hour como 21:10 / 11:10 etc.
 * - O filtro "21h" precisa bater por bucket de hora (HH:00), ignorando minutos.
 *
 * ✅ FIX (Frequência 0):
 * - Nem sempre o service devolve draw.prizes dentro de cada draw.
 * - Alguns retornos vêm com prizes separados (prizesAll / prizesAllSorted).
 * - Agora: se draw.prizes não existir, agrupamos prizes flat por (ymd + hourBucket).
 *
 * ✅ FIX CRÍTICO (rebuild indevido):
 * - openGrupo não pode entrar nas deps do build.
 * - abrir/fechar card NÃO deve disparar rebuild do histórico.
 */

const LOTTERY_KEY = "PT_RIO";
const FILTERS_LS_KEY = "pp_centenas_filters_v1";

// tuning
const CHUNK_DAYS = 45; // manter < 60 para não cair no aggregated
const CHUNKS_CONCURRENCY = 3;

function pad2(n) {
  return String(n).padStart(2, "0");
}
function isYMD(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || "").trim());
}
function ymdToBR(ymd) {
  const m = String(ymd || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "";
  return `${m[3]}/${m[2]}/${m[1]}`;
}
function ymdToUTCDate(ymd) {
  const m = String(ymd || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}
function addDaysUTC(ymd, days) {
  const dt = ymdToUTCDate(ymd);
  if (!dt) return ymd;
  dt.setUTCDate(dt.getUTCDate() + Number(days || 0));
  const y = dt.getUTCFullYear();
  const m = pad2(dt.getUTCMonth() + 1);
  const d = pad2(dt.getUTCDate());
  return `${y}-${m}-${d}`;
}
function todayYMDLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function sortPTBR(a, b) {
  return String(a).localeCompare(String(b), "pt-BR", { sensitivity: "base" });
}
function isTodos(v) {
  return String(v || "").trim().toLowerCase() === "todos";
}

/**
 * Normaliza "hora" em formato HH:MM (quando possível)
 */
function normalizeHourLike(value) {
  const s0 = String(value ?? "").trim();
  if (!s0) return "";
  const s = s0.replace(/\s+/g, "");

  const mhx = s.match(/^(\d{1,2})(?:h|hs|hr|hrs)$/i);
  if (mhx) return `${pad2(mhx[1])}:00`;

  const mISO = s.match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/);
  if (mISO) return `${pad2(mISO[1])}:${pad2(mISO[2])}`;

  const m2 = s.match(/^(\d{1,2})$/);
  if (m2) return `${pad2(m2[1])}:00`;

  return s0.trim();
}

/**
 * ✅ Bucketiza para HH:00, ignorando minutos/segundos.
 * Ex: "21:10" -> "21:00", "21h" -> "21:00", "09:00" -> "09:00"
 */
function toHourBucketHH00(value) {
  const norm = normalizeHourLike(value);
  if (!norm) return "";
  const m = String(norm).match(/^(\d{2})/);
  if (!m) return "";
  const hh = m[1];
  const n = Number(hh);
  if (!Number.isFinite(n) || n < 0 || n > 23) return "";
  return `${hh}:00`;
}

function extractHourFromText(text) {
  const s = String(text ?? "").trim();
  if (!s) return "";
  const mh = s.match(/\b(\d{1,2})\s*(?:h|hs|hr|hrs)\b/i);
  if (mh) return `${pad2(mh[1])}:00`;
  const mIso = s.match(/\b(\d{1,2}):(\d{2})(?::\d{2})?\b/);
  if (mIso) return `${pad2(mIso[1])}:${pad2(mIso[2])}`;
  const mBare = s.match(/(?:^|\D)(\d{1,2})(?:\D|$)/);
  if (mBare) {
    const n = Number(mBare[1]);
    if (Number.isFinite(n) && n >= 0 && n <= 23) return `${pad2(n)}:00`;
  }
  return "";
}

function pickDrawYmd(draw) {
  const y =
    draw?.dateYmd ||
    draw?.ymd ||
    draw?.date ||
    draw?.data ||
    draw?.day ||
    draw?.date_ymd ||
    draw?.drawYmd ||
    "";
  return isYMD(y) ? y : "";
}
function pickDrawHour(draw) {
  const directCandidates = [draw?.closeHour, draw?.hour, draw?.horario, draw?.close_hour, draw?.close];
  for (const c of directCandidates) {
    const norm = normalizeHourLike(c);
    if (norm) return norm;
  }

  const nested = draw?.lottery || draw?.loteria || draw?.meta || null;
  if (nested) {
    const nestedCandidates = [
      nested?.closeHour,
      nested?.close_hour,
      nested?.hour,
      nested?.horario,
      nested?.close,
      nested?.drawHour,
      nested?.draw_hour,
    ];
    for (const c of nestedCandidates) {
      const norm = normalizeHourLike(c);
      if (norm) return norm;
    }
  }

  const textCandidates = [
    draw?.lotteryLabel,
    draw?.lotteryName,
    draw?.loteriaLabel,
    draw?.loteriaName,
    draw?.label,
    draw?.name,
    draw?.title,
    draw?.descricao,
    draw?.description,
    draw?.key,
    nested?.label,
    nested?.name,
    nested?.title,
    nested?.key,
  ];
  for (const t of textCandidates) {
    const ex = extractHourFromText(t);
    if (ex) return ex;
  }

  return "";
}

function getWeekdayPTBRFromYMD(ymd) {
  const dt = ymdToUTCDate(ymd);
  if (!dt) return "";
  const day = dt.getUTCDay();
  const map = ["Domingo", "Segunda-Feira", "Terça-Feira", "Quarta-Feira", "Quinta-Feira", "Sexta-Feira", "Sábado"];
  return map[day] || "";
}
function monthNamePTBR(m) {
  const map = [
    "Janeiro",
    "Fevereiro",
    "Março",
    "Abril",
    "Maio",
    "Junho",
    "Julho",
    "Agosto",
    "Setembro",
    "Outubro",
    "Novembro",
    "Dezembro",
  ];
  return map[(Number(m) || 0) - 1] || "";
}

/* ========= centenas por grupo ========= */

function dezenasDoGrupo(grupo) {
  const g = Number(grupo);
  if (!Number.isFinite(g) || g < 1 || g > 25) return [];
  const start = (g - 1) * 4 + 1;
  return [start, start + 1, start + 2, start + 3].map((n) => pad2(n));
}
function centenas40DoGrupo(grupo) {
  const dezenas = dezenasDoGrupo(grupo);
  const out = [];
  for (const dz of dezenas) {
    for (let p = 0; p <= 9; p += 1) out.push(`${p}${dz}`);
  }
  return out;
}

/* ========= prize extractors ========= */

function digitsOnly(v) {
  return String(v ?? "").replace(/\D+/g, "");
}

function pickMilhar4(prize) {
  const candidates = [
    prize?.milhar4,
    prize?.milhar,
    prize?.numero,
    prize?.number,
    prize?.num,
    prize?.n,
    prize?.valor,
    prize?.value,
    prize?.resultado,
    prize?.result,
  ];
  for (const c of candidates) {
    const d = digitsOnly(c);
    if (!d) continue;
    if (d.length >= 4) return d.slice(-4).padStart(4, "0");
  }
  return "";
}

function pickCentena3(prize) {
  const direct = [prize?.centena3, prize?.centena, prize?.centena_3, prize?.centena3dig, prize?.c3];
  for (const c of direct) {
    const d = digitsOnly(c);
    if (!d) continue;
    if (d.length === 3) return d.padStart(3, "0");
    if (d.length > 3) return d.slice(-3).padStart(3, "0");
  }
  const milhar4 = pickMilhar4(prize);
  if (milhar4 && milhar4.length === 4) return milhar4.slice(1); // ex 3033 -> 033
  return "";
}

function pickDezenaFinal(prize) {
  const c3 = pickCentena3(prize);
  if (!/^\d{3}$/.test(c3)) return "";
  return c3.slice(1);
}

function inferGrupoFromPrize(prize) {
  const gRaw = Number(prize?.grupo ?? prize?.grupo2 ?? prize?.group ?? prize?.grupo_num);
  if (Number.isFinite(gRaw) && gRaw >= 1 && gRaw <= 25) return gRaw;

  const dz = pickDezenaFinal(prize);
  if (!/^\d{2}$/.test(dz)) return null;

  const d = Number(dz);
  if (!Number.isFinite(d) || d < 1 || d > 100) return null;

  return Math.floor((d - 1) / 4) + 1;
}

/* ========= posição robusta ========= */
function pickPrizePositionNumber(prize) {
  const direct = prize?.position;
  const nDirect = direct === null || direct === undefined || direct === "" ? NaN : Number(direct);
  if (Number.isFinite(nDirect) && nDirect > 0) return nDirect;

  const candidates = [prize?.posicao, prize?.pos, prize?.colocacao, prize?.place, prize?.prizePosition];
  for (const c of candidates) {
    const s = String(c ?? "").trim();
    if (!s) continue;
    const m = s.match(/(\d{1,2})/);
    const n = m ? Number(m[1]) : NaN;
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

/* ========= chunking ========= */

function splitRangeIntoChunks(fromYmd, toYmd, chunkDays = CHUNK_DAYS) {
  const out = [];
  if (!isYMD(fromYmd) || !isYMD(toYmd)) return out;
  if (fromYmd > toYmd) return out;

  let curFrom = fromYmd;
  while (curFrom <= toYmd) {
    const curTo = addDaysUTC(curFrom, chunkDays - 1);
    const boundedTo = curTo > toYmd ? toYmd : curTo;
    out.push({ from: curFrom, to: boundedTo });
    const next = addDaysUTC(boundedTo, 1);
    if (next <= curFrom) break;
    curFrom = next;
  }
  return out;
}

function normalizeDrawsResult(maybe) {
  if (Array.isArray(maybe)) return maybe;
  if (Array.isArray(maybe?.draws)) return maybe.draws;
  if (Array.isArray(maybe?.drawsRaw)) return maybe.drawsRaw;
  if (Array.isArray(maybe?.data)) return maybe.data;
  if (Array.isArray(maybe?.results)) return maybe.results;
  return [];
}

/**
 * ✅ Pega prizes flat vindas do service em qualquer chave comum
 */
function normalizePrizesArray(res) {
  const candidates = [
    res?.prizesAllSorted,
    res?.prizesAll,
    res?.prizes,
    res?.prizeRows,
    res?.items,
    res?.data?.prizesAllSorted,
    res?.data?.prizesAll,
    res?.data?.prizes,
  ];
  for (const c of candidates) {
    if (Array.isArray(c)) return c;
  }
  return [];
}

/**
 * ✅ Extrai ymd/hora direto da prize (para quando draws vierem sem prizes)
 */
function pickPrizeYmd(prize) {
  const candidates = [
    prize?.dateYmd,
    prize?.ymd,
    prize?.date_ymd,
    prize?.drawYmd,
    prize?.draw_ymd,
    prize?.date,
    prize?.data,
    prize?.day,
  ];
  for (const c of candidates) {
    const s = String(c ?? "").trim();
    if (isYMD(s)) return s;
  }
  return "";
}

function pickPrizeHour(prize) {
  const candidates = [
    prize?.closeHour,
    prize?.close_hour,
    prize?.hour,
    prize?.horario,
    prize?.drawHour,
    prize?.draw_hour,
    prize?.lotteryCloseHour,
  ];
  for (const c of candidates) {
    const n = normalizeHourLike(c);
    if (n) return n;
  }
  const textCandidates = [prize?.lotteryLabel, prize?.loteriaLabel, prize?.label, prize?.name, prize?.title];
  for (const t of textCandidates) {
    const ex = extractHourFromText(t);
    if (ex) return ex;
  }
  return "";
}

/* ========= milhar palpite ========= */

function digitFromKey(key) {
  const s = String(key || "");
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return String(h % 10);
}
function dailyDigitForRow(ymd, grupo2, centena3) {
  return digitFromKey(`${String(ymd || "")}#${String(grupo2 || "")}#${String(centena3 || "")}`);
}

/* ========= utils: concorrência ========= */

async function mapWithConcurrency(items, limitN, mapper) {
  const arr = Array.isArray(items) ? items : [];
  const concurrency = Math.max(1, Number(limitN) || 3);
  const results = new Array(arr.length);
  let idx = 0;

  async function worker() {
    while (idx < arr.length) {
      const current = idx++;
      results[current] = await mapper(arr[current], current);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, arr.length) }, worker));
  return results;
}

/* ========= imagem: tentar _128 ========= */

function upgradeImg(src, target = 128) {
  const s = String(src || "").trim();
  if (!s) return "";
  return s.replace(/_(64|96|128)\.(png|jpg|jpeg|webp)$/i, `_${target}.$2`);
}

function tryGetImg(getImgFromGrupo, grupo, size) {
  try {
    const v = getImgFromGrupo?.(grupo, size);
    if (v) return String(v);
  } catch {}
  try {
    const v2 = getImgFromGrupo?.(grupo);
    if (v2) return String(v2);
  } catch {}
  return "";
}

export default function Centenas() {
  const LOTTERY_OPTIONS = useMemo(
    () => [
      { id: "ALL", label: "Todas as loterias", closeHour: null },
      { id: "09", label: "LT PT RIO 09HS", closeHour: "09:00" },
      { id: "11", label: "LT PT RIO 11HS", closeHour: "11:00" },
      { id: "14", label: "LT PT RIO 14HS", closeHour: "14:00" },
      { id: "16", label: "LT PT RIO 16HS", closeHour: "16:00" },
      { id: "18", label: "LT PT RIO 18HS", closeHour: "18:00" },
      { id: "21", label: "LT PT RIO 21HS", closeHour: "21:00" },
    ],
    []
  );

  const prizePositions = useMemo(() => [1, 2, 3, 4, 5, 6, 7], []);
  const todayYmd = todayYMDLocal();

  // filtros
  const [lotteryOptId, setLotteryOptId] = useState("ALL");
  const [fMes, setFMes] = useState("Todos");
  const [fDiaMes, setFDiaMes] = useState("Todos");
  const [fDiaSemana, setFDiaSemana] = useState("Todos");
  const [fHorario, setFHorario] = useState("Todos");
  const [fAnimal, setFAnimal] = useState("Todos");
  const [fPosicao, setFPosicao] = useState("Todos");
  const [showOnlyHits, setShowOnlyHits] = useState(false);

  // bounds
  const [bounds, setBounds] = useState({ minYmd: null, maxYmd: null, source: "" });
  const [loadingBounds, setLoadingBounds] = useState(false);

  // data
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [groups, setGroups] = useState([]);
  const [openGrupo, setOpenGrupo] = useState(19);

  // ✅ ref para NÃO disparar rebuild quando abre/fecha card
  const openGrupoRef = useRef(openGrupo);
  useEffect(() => {
    openGrupoRef.current = openGrupo;
  }, [openGrupo]);

  // progresso
  const [progress, setProgress] = useState({ done: 0, total: 0, label: "" });

  const abortedRef = useRef(false);
  const buildSeqRef = useRef(0);
  const autoTimerRef = useRef(null);

  const getAnimalLabel = useMemo(() => getAnimalLabelFn, []);
  const getImgFromGrupo = useMemo(() => getImgFromGrupoFn, []);

  // cache em memória
  const baseCacheRef = useRef(new Map());

  const selectedLottery = useMemo(
    () => LOTTERY_OPTIONS.find((x) => x.id === lotteryOptId) || LOTTERY_OPTIONS[0],
    [lotteryOptId, LOTTERY_OPTIONS]
  );

  const selectedCloseHour = useMemo(() => {
    return selectedLottery?.closeHour ? normalizeHourLike(selectedLottery.closeHour) : null;
  }, [selectedLottery]);

  const boundsReady = !!(bounds?.minYmd && bounds?.maxYmd);

  // ========= persistência de filtros =========

  useEffect(() => {
    try {
      const raw = localStorage.getItem(FILTERS_LS_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved && typeof saved === "object") {
          if (saved.lotteryOptId) setLotteryOptId(String(saved.lotteryOptId));
          if (saved.fMes) setFMes(String(saved.fMes));
          if (saved.fDiaMes) setFDiaMes(String(saved.fDiaMes));
          if (saved.fDiaSemana) setFDiaSemana(String(saved.fDiaSemana));
          if (saved.fHorario) setFHorario(String(saved.fHorario));
          if (saved.fAnimal) setFAnimal(String(saved.fAnimal));
          if (saved.fPosicao) setFPosicao(String(saved.fPosicao));
          if (typeof saved.showOnlyHits === "boolean") setShowOnlyHits(saved.showOnlyHits);
          if (Number.isFinite(Number(saved.openGrupo))) setOpenGrupo(Number(saved.openGrupo));
        }
      }
    } catch {}
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      try {
        localStorage.setItem(
          FILTERS_LS_KEY,
          JSON.stringify({
            lotteryOptId,
            fMes,
            fDiaMes,
            fDiaSemana,
            fHorario,
            fAnimal,
            fPosicao,
            showOnlyHits,
            openGrupo,
          })
        );
      } catch {}
    }, 150);
    return () => clearTimeout(t);
  }, [lotteryOptId, fMes, fDiaMes, fDiaSemana, fHorario, fAnimal, fPosicao, showOnlyHits, openGrupo]);

  // ========= options =========

  const mesOptions = useMemo(() => {
    const out = [{ v: "Todos", label: "Todos" }];
    for (let m = 1; m <= 12; m += 1) out.push({ v: String(m), label: monthNamePTBR(m) });
    return out;
  }, []);

  const diaMesOptions = useMemo(() => {
    const out = [{ v: "Todos", label: "Todos" }];
    for (let d = 1; d <= 31; d += 1) out.push({ v: String(d), label: pad2(d) });
    return out;
  }, []);

  const diaSemanaOptions = useMemo(() => {
    const out = [{ v: "Todos", label: "Todos" }];
    ["Domingo", "Segunda-Feira", "Terça-Feira", "Quarta-Feira", "Quinta-Feira", "Sexta-Feira", "Sábado"].forEach((x) =>
      out.push({ v: x, label: x })
    );
    return out;
  }, []);

  const horarioOptions = useMemo(() => {
    const base = ["09:00", "11:00", "14:00", "16:00", "18:00", "21:00"];
    return [{ v: "Todos", label: "Todos" }, ...base.map((h) => ({ v: h, label: h.replace(":00", "h") }))];
  }, []);

  const animalOptions = useMemo(() => {
    const out = [{ v: "Todos", label: "Todos" }];
    for (let g = 1; g <= 25; g += 1) {
      const g2 = pad2(g);
      const label = (getAnimalLabel && getAnimalLabel(g)) || `Grupo ${g2}`;
      out.push({ v: g2, label });
    }
    return out;
  }, [getAnimalLabel]);

  const posicaoOptions = useMemo(() => {
    const out = [{ v: "Todos", label: "Todos" }];
    for (let p = 1; p <= 7; p += 1) out.push({ v: String(p), label: `${p}º` });
    return out;
  }, []);

  // ========= bounds =========

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoadingBounds(true);
      setError("");
      try {
        const b = await getKingBoundsByUf({ uf: LOTTERY_KEY });
        if (!alive) return;
        setBounds({
          minYmd: b?.minYmd || null,
          maxYmd: b?.maxYmd || null,
          source: b?.source || "",
        });
      } catch (e) {
        if (!alive) return;
        setError(String(e?.message || e));
      } finally {
        if (alive) setLoadingBounds(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // ========= filtros (draw-level) =========

  const applyDrawFiltersToEntry = useCallback(
    (entry) => {
      const ymd = entry?.ymd || "";
      const hr = entry?.hourBucket || entry?.hourNorm || "";
      if (!ymd) return false;

      if (!isTodos(fMes)) {
        const mm = Number(String(ymd).slice(5, 7));
        if (String(mm) !== String(fMes)) return false;
      }
      if (!isTodos(fDiaMes)) {
        const dd = Number(String(ymd).slice(8, 10));
        if (String(dd) !== String(fDiaMes)) return false;
      }
      if (!isTodos(fDiaSemana)) {
        const wd = getWeekdayPTBRFromYMD(ymd);
        if (wd !== String(fDiaSemana)) return false;
      }

      // ✅ FIX: compara por bucket HH:00 (ignora minutos)
      if (!isTodos(fHorario)) {
        const want = toHourBucketHH00(fHorario);
        const got = toHourBucketHH00(hr);
        if (!got || got !== want) return false;
      }

      return true;
    },
    [fMes, fDiaMes, fDiaSemana, fHorario]
  );

  // ========= filtros (prize-level) =========

  const applyPrizeFilters = useCallback(
    (prizes) => {
      const out = [];
      const animalGrupo = !isTodos(fAnimal) ? Number(fAnimal) : null;
      const pos = !isTodos(fPosicao) ? Number(fPosicao) : null;

      for (const p of prizes || []) {
        if (animalGrupo) {
          const pg = inferGrupoFromPrize(p);
          if (pg !== animalGrupo) continue;
        }
        if (pos) {
          const pp = pickPrizePositionNumber(p);
          if (!pp || pp !== pos) continue;
        }
        out.push(p);
      }
      return out;
    },
    [fAnimal, fPosicao]
  );

  // ========= build base dataset (cacheado por closeHour) =========

  const buildBaseKey = useMemo(() => {
    const h = selectedCloseHour ? normalizeHourLike(selectedCloseHour) : "all";
    return `${LOTTERY_KEY}::close=${h}::pos=${prizePositions.join(",")}`;
  }, [selectedCloseHour, prizePositions]);

  const build = useCallback(async () => {
    const mySeq = ++buildSeqRef.current;
    abortedRef.current = false;

    setLoading(true);
    setError("");
    setProgress({ done: 0, total: 0, label: "" });

    try {
      if (!boundsReady) {
        setError("Bounds ainda não carregaram.");
        return;
      }

      const cachedBase = baseCacheRef.current.get(buildBaseKey);
      let entriesBase = cachedBase?.entries || null;

      if (!entriesBase) {
        const chunks = splitRangeIntoChunks(bounds.minYmd, bounds.maxYmd, CHUNK_DAYS);
        setProgress({ done: 0, total: chunks.length, label: "Carregando histórico..." });

        const results = await mapWithConcurrency(chunks, CHUNKS_CONCURRENCY, async (ch, idx) => {
          if (abortedRef.current) return { ok: false, entries: [] };
          if (buildSeqRef.current !== mySeq) return { ok: false, entries: [] };

          const res = await getKingResultsByRange({
            uf: LOTTERY_KEY,
            dateFrom: ch.from,
            dateTo: ch.to,
            closeHour: selectedCloseHour || null,
            positions: prizePositions,
            mode: "detailed",
          });

          const drawsChunk = normalizeDrawsResult(res);
          const prizesFlat = normalizePrizesArray(res);

          const entries = [];

          // (A) caminho 1: draws já vêm hidratados com prizes
          for (const d of drawsChunk || []) {
            const ymd = pickDrawYmd(d);
            if (!ymd) continue;

            const hrRaw = pickDrawHour(d);
            const hourNorm = normalizeHourLike(hrRaw);
            const hourBucket = toHourBucketHH00(hourNorm);

            const prizes = Array.isArray(d?.prizes) ? d.prizes : null;
            if (prizes && prizes.length) {
              entries.push({ ymd, hourNorm, hourBucket, prizes });
            }
          }

          // (B) caminho 2: draws sem prizes -> usa prizesFlat agrupadas por (ymd + hourBucket)
          if (!entries.length && Array.isArray(prizesFlat) && prizesFlat.length) {
            const map = new Map(); // key -> { ymd, hourNorm, hourBucket, prizes: [] }
            for (const p of prizesFlat) {
              const ymd = pickPrizeYmd(p);
              if (!ymd) continue;

              const hrRaw = pickPrizeHour(p);
              const hourNorm = normalizeHourLike(hrRaw);
              const hourBucket = toHourBucketHH00(hourNorm);

              if (selectedCloseHour) {
                const want = toHourBucketHH00(selectedCloseHour);
                if (want && hourBucket && hourBucket !== want) continue;
              }

              const key = `${ymd}#${hourBucket || "??"}`;
              if (!map.has(key)) map.set(key, { ymd, hourNorm, hourBucket, prizes: [] });
              map.get(key).prizes.push(p);
            }
            entries.push(...Array.from(map.values()));
          }

          setProgress((p) => ({
            done: Math.min((p?.done || 0) + 1, chunks.length),
            total: chunks.length,
            label: `Carregando histórico... (${idx + 1}/${chunks.length})`,
          }));

          return { ok: true, entries };
        });

        if (abortedRef.current) return;
        if (buildSeqRef.current !== mySeq) return;

        entriesBase = results.flatMap((r) => (r && r.ok ? r.entries : []));
        baseCacheRef.current.set(buildBaseKey, { entries: entriesBase });
      }

      // aplica filtros por draw (data/hora) e junta prizes
      const prizesAll = [];
      for (const e of entriesBase || []) {
        if (!applyDrawFiltersToEntry(e)) continue;
        const prizes = Array.isArray(e?.prizes) ? e.prizes : [];
        for (const p of prizes) prizesAll.push(p);
      }

      const allPrizes = applyPrizeFilters(prizesAll);

      const out = [];
      for (let g = 1; g <= 25; g += 1) {
        if (!isTodos(fAnimal) && Number(fAnimal) !== g) continue;

        const grupo2 = pad2(g);
        const animal = (getAnimalLabel && getAnimalLabel(g)) || "";

        const imgRaw = tryGetImg(getImgFromGrupo, g, 128) || tryGetImg(getImgFromGrupo, g, 96) || "";
        const img = upgradeImg(imgRaw, 128);

        const c40 = centenas40DoGrupo(g);
        const set40 = new Set(c40);
        const counts = new Map();
        for (const c of c40) counts.set(c, 0);

        for (const p of allPrizes) {
          const pg = inferGrupoFromPrize(p);
          if (pg !== g) continue;

          const c3 = pickCentena3(p);
          if (!/^\d{3}$/.test(c3)) continue;
          if (!set40.has(c3)) continue;

          counts.set(c3, (counts.get(c3) || 0) + 1);
        }

        const list40 = c40
          .map((c) => ({ centena: c, count: counts.get(c) || 0 }))
          .sort((a, b) => {
            if (b.count !== a.count) return b.count - a.count;
            return String(a.centena).localeCompare(String(b.centena));
          });

        const totalHits = list40.reduce((acc, it) => acc + (Number(it.count) || 0), 0);
        out.push({ grupo: g, grupo2, animal, img, totalHits, list40 });
      }

      out.sort((a, b) => {
        if (b.totalHits !== a.totalHits) return b.totalHits - a.totalHits;
        const an = sortPTBR(a.animal, b.animal);
        if (an !== 0) return an;
        return a.grupo - b.grupo;
      });

      setGroups(out);

      // ✅ NÃO usa openGrupo (state) como dep: usa ref
      const openWanted = !isTodos(fAnimal) ? Number(fAnimal) : Number(openGrupoRef.current);

      if (Number.isFinite(openWanted) && out.find((x) => x.grupo === openWanted)) {
        setOpenGrupo(openWanted);
      } else if (out[0]?.grupo) {
        setOpenGrupo(out[0].grupo);
      }
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      if (!abortedRef.current) setLoading(false);
      setProgress((p) => ({ ...p, label: "" }));
    }
  }, [
    boundsReady,
    bounds?.minYmd,
    bounds?.maxYmd,
    selectedCloseHour,
    prizePositions,
    buildBaseKey,
    applyDrawFiltersToEntry,
    applyPrizeFilters,
    getAnimalLabel,
    getImgFromGrupo,
    fAnimal,
  ]);

  useEffect(() => {
    if (!boundsReady) return;
    build();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boundsReady]);

  useEffect(() => {
    if (!boundsReady) return;
    if (autoTimerRef.current) clearTimeout(autoTimerRef.current);
    autoTimerRef.current = setTimeout(() => build(), 220);
    return () => {
      if (autoTimerRef.current) clearTimeout(autoTimerRef.current);
    };
  }, [boundsReady, build, fMes, fDiaMes, fDiaSemana, fHorario, fAnimal, fPosicao, lotteryOptId]);

  useEffect(() => {
    return () => {
      abortedRef.current = true;
    };
  }, []);

  const subtitle = useMemo(() => {
    const lotTxt = selectedLottery?.label || "Todas as loterias";
    const rangeTxt =
      boundsReady && bounds?.minYmd && bounds?.maxYmd ? `${ymdToBR(bounds.minYmd)} até ${ymdToBR(bounds.maxYmd)}` : "";
    return `Frequência das 40 centenas · Prêmio 1º ao 7º · ${lotTxt} · Loteria ${LOTTERY_KEY}${
      rangeTxt ? ` · Período ${rangeTxt}` : ""
    }`;
  }, [selectedLottery, boundsReady, bounds?.minYmd, bounds?.maxYmd]);

  const bannerGrupo = useMemo(() => {
    if (!isTodos(fAnimal)) {
      const g = Number(fAnimal);
      if (Number.isFinite(g) && g >= 1 && g <= 25) return g;
    }
    if (openGrupo) return Number(openGrupo);
    return Number(groups?.[0]?.grupo || 1);
  }, [fAnimal, openGrupo, groups]);

  const bannerImg = useMemo(() => {
    const raw =
      tryGetImg(getImgFromGrupo, bannerGrupo, 128) ||
      tryGetImg(getImgFromGrupo, bannerGrupo, 96) ||
      tryGetImg(getImgFromGrupo, bannerGrupo, 64) ||
      "";
    return upgradeImg(raw, 128);
  }, [getImgFromGrupo, bannerGrupo]);

  const bannerLabel = useMemo(() => (getAnimalLabel && getAnimalLabel(bannerGrupo)) || "", [getAnimalLabel, bannerGrupo]);

  const css = useMemo(() => {
    return `
      .cx0_wrap{
        width:100%;
        height:100%;
        padding:14px;
        color:#e9e9e9;
        display:flex;
        flex-direction:column;
        gap:12px;
        box-sizing:border-box;
      }
      .cx0_title{ text-align:center; font-weight:1000; letter-spacing:.8px; margin:0; font-size:18px; }
      .cx0_sub{ text-align:center; font-size:11px; color:rgba(233,233,233,.72); }

      .cx0_filters{
        border-radius:14px;
        border:1px solid rgba(255,255,255,0.10);
        background:rgba(0,0,0,0.45);
        box-shadow:0 18px 60px rgba(0,0,0,0.55);
        padding:12px;
        display:grid;
        grid-template-columns: 1fr;
        gap:10px;
      }
      @media (min-width: 720px){ .cx0_filters{ grid-template-columns: repeat(2, minmax(0, 1fr)); } }
      @media (min-width: 1100px){ .cx0_filters{ grid-template-columns: repeat(6, minmax(0, 1fr)); } }

      .cx0_fItem{
        display:flex;
        flex-direction:column;
        gap:8px;
        min-width:0;
        align-items:center;
      }
      .cx0_fLab{
        width:100%;
        text-align:center;
        font-weight:900;
        font-size:13px;
        color:rgba(233,233,233,0.92);
      }

      .cx0_selWrap{
        position:relative;
        width:100%;
        border-radius:12px;
        border:1px solid rgba(255,255,255,0.12);
        background:rgba(0,0,0,0.55);
        height:48px;
        display:flex;
        align-items:center;
        padding:0 14px;
        box-sizing:border-box;
      }
      .cx0_sel{
        width:100%;
        appearance:none;
        background:transparent;
        border:none;
        outline:none;
        color:#fff;
        font-weight:900;
        font-size:15px;
        cursor:pointer;
        padding-right:28px;
        text-align:left;
      }
      .cx0_sel option{ background:#0b0b0b; color:#e9e9e9; }
      .cx0_chev{
        position:absolute; right:12px; top:50%;
        transform:translateY(-50%);
        width:0;height:0;
        border-left:7px solid transparent;
        border-right:7px solid transparent;
        border-top:9px solid rgba(233,233,233,0.72);
        pointer-events:none;
      }

      .cx0_controls{
        display:flex;
        justify-content:center;
        align-items:center;
        gap:10px;
        flex-wrap:wrap;
      }
      .cx0_chip{
        display:inline-flex; align-items:center; gap:8px;
        padding:8px 10px;
        border-radius:999px;
        background:rgba(0,0,0,0.55);
        border:1px solid rgba(202,166,75,0.18);
        box-shadow:0 10px 30px rgba(0,0,0,0.35);
      }
      .cx0_chip label{ font-size:10px; color:rgba(233,233,233,0.62); }
      .cx0_chip select{ background:transparent; border:none; outline:none; color:#e9e9e9; font-weight:900; font-size:12px; }
      .cx0_chip select option{ background:#0b0b0b; color:#e9e9e9; }

      .cx0_btn{
        cursor:pointer;
        border-radius:999px;
        padding:9px 14px;
        font-weight:900;
        font-size:12px;
        letter-spacing:0.4px;
        background:rgba(0,0,0,0.6);
        color:#e9e9e9;
        border:1px solid rgba(202,166,75,0.30);
        box-shadow:0 12px 34px rgba(0,0,0,0.35);
      }
      .cx0_btn:disabled{ opacity:.55; cursor:not-allowed; }

      .cx0_status{
        text-align:center;
        font-size:11px;
        color:rgba(233,233,233,0.70);
        padding:6px 8px;
      }
      .cx0_bar{
        height:6px;
        border-radius:999px;
        background:rgba(255,255,255,0.08);
        overflow:hidden;
        margin:6px auto 0;
        max-width:520px;
      }
      .cx0_bar > div{
        height:100%;
        background:rgba(202,166,75,0.55);
        width:0%;
      }

      .cx0_err{
        padding:9px 11px;
        border-radius:12px;
        border:1px solid rgba(255,80,80,0.25);
        background:rgba(255,80,80,0.08);
        color:rgba(255,220,220,0.92);
        white-space:pre-wrap;
        font-size:12px;
      }

      .cx0_panel{
        border-radius:14px;
        border:1px solid rgba(202,166,75,0.16);
        background:
          radial-gradient(1000px 500px at 20% 0%, rgba(202,166,75,0.08), transparent 55%),
          radial-gradient(900px 500px at 85% 20%, rgba(255,255,255,0.05), transparent 50%),
          rgba(0,0,0,0.45);
        box-shadow:0 20px 60px rgba(0,0,0,0.45);
        overflow:hidden;
      }

      .cx0_grid{
        display:grid;
        grid-template-columns: 1fr;
        gap:10px;
        padding:10px;
        align-items:start;
      }
      @media (min-width: 980px){ .cx0_grid{ grid-template-columns: 320px 1fr; } }

      .cx0_banner{
        border-radius:14px;
        border:1px solid rgba(255,255,255,0.10);
        background:rgba(0,0,0,0.35);
        box-shadow:0 14px 40px rgba(0,0,0,0.45);
        overflow:hidden;
        padding:12px;
        position:sticky;
        top:10px;
        align-self:start;
      }

      .cx0_bImg{
        width:252px; height:252px;
        max-width:100%;
        border-radius:10px;
        border:2px solid rgba(202,166,75,0.60);
        box-shadow:0 18px 55px rgba(0,0,0,0.55);
        overflow:hidden;
        background:rgba(0,0,0,0.55);
        margin:0 auto;
        padding:3px;
        box-sizing:border-box;
      }
      .cx0_bImg img{
        width:100%; height:100%;
        border-radius:8px;
        object-fit:cover;
        display:block;
        transform:translateZ(0);
        backface-visibility:hidden;
      }

      .cx0_bTxt{ margin-top:10px; text-align:center; }
      .cx0_bGrp{ font-weight:1000; letter-spacing:.5px; font-size:12px; opacity:.95; }
      .cx0_bAn{ margin-top:4px; font-weight:900; font-size:14px; color:rgba(233,233,233,0.85); }

      .cx0_list{ min-height:0; display:flex; flex-direction:column; gap:10px; }

      .cx0_card{
        border-radius:14px;
        border:1px solid rgba(255,255,255,0.08);
        background:rgba(0,0,0,0.35);
        box-shadow:0 14px 40px rgba(0,0,0,0.45);
        overflow:hidden;
      }
      .cx0_head{
        display:flex; align-items:center; justify-content:space-between;
        gap:12px; padding:10px 12px; cursor:pointer; user-select:none;
      }
      .cx0_hLeft{ display:flex; align-items:center; gap:10px; min-width:0; }
      .cx0_hImg{
        width:38px; height:38px;
        border-radius:10px;
        border:2px solid rgba(202,166,75,0.55);
        box-shadow:0 14px 34px rgba(0,0,0,0.45);
        background:rgba(0,0,0,0.55);
        overflow:hidden;
        flex:0 0 auto;
        padding:2px;
        box-sizing:border-box;
      }
      .cx0_hImg img{
        width:100%; height:100%;
        border-radius:8px;
        object-fit:cover;
        display:block;
      }
      .cx0_hNames{ display:flex; flex-direction:column; gap:2px; min-width:0; }
      .cx0_hGrp{ font-weight:1000; letter-spacing:.4px; font-size:12px; white-space:nowrap; }
      .cx0_hAn{ font-weight:800; color:rgba(233,233,233,.82); font-size:11px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }

      .cx0_hRight{ display:flex; align-items:center; gap:12px; }
      .cx0_kpi{ text-align:right; }
      .cx0_kpiK{ font-size:10px; color:rgba(233,233,233,0.62); }
      .cx0_kpiV{ font-size:12px; font-weight:1000; color:#caa64b; }

      .cx0_body{
        border-top:1px solid rgba(255,255,255,0.06);
        padding:10px 12px 12px;
        background:linear-gradient(180deg, rgba(202,166,75,0.06), rgba(0,0,0,0.16));
      }

      .cx0_bodyTop{
        display:flex; align-items:center; justify-content:space-between;
        gap:10px; flex-wrap:wrap;
        font-size:11px; color:rgba(233,233,233,0.78);
        margin-bottom:10px;
      }
      .cx0_bodyTop b{ color:#caa64b; }
      .cx0_toggle{
        cursor:pointer; border-radius:999px; padding:8px 10px;
        font-weight:900; font-size:11px;
        background:rgba(0,0,0,0.35);
        color:#e9e9e9;
        border:1px solid rgba(202,166,75,0.25);
      }

      .cx0_tbl{
        width:100%;
        border-radius:12px;
        border:1px solid rgba(255,255,255,0.08);
        background:rgba(0,0,0,0.28);
        overflow:hidden;
      }
      .cx0_row{
        display:grid;
        grid-template-columns: 90px 140px 140px 1fr;
        gap:0;
        align-items:center;
      }
      .cx0_row > div{
        padding:10px 12px;
        border-bottom:1px solid rgba(255,255,255,0.06);
        white-space:nowrap;
        overflow:hidden;
        text-overflow:ellipsis;
        text-align:center;
        font-size:12px;
        color:rgba(233,233,233,0.92);
      }
      .cx0_headRow > div{
        background:rgba(0,0,0,0.72);
        font-size:10px;
        text-transform:uppercase;
        letter-spacing:.6px;
        color:rgba(233,233,233,0.75);
        font-weight:900;
      }
      .cx0_scroll{
        max-height: min(420px, 55vh);
        overflow:auto;
      }
      .cx0_row:hover > div{ background:rgba(202,166,75,0.06); }

      .cx0_mono{
        font-variant-numeric:tabular-nums;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
        letter-spacing:0.3px;
        font-weight:900;
      }
      .cx0_count b{ color:#caa64b; }

      @media (max-width: 820px){
        .cx0_row{ grid-template-columns: 70px 110px 110px 1fr; }
      }
    `;
  }, []);

  const progressPct = useMemo(() => {
    const total = Number(progress?.total || 0);
    const done = Number(progress?.done || 0);
    if (!total) return 0;
    return Math.max(0, Math.min(100, Math.round((done / total) * 100)));
  }, [progress]);

  return (
    <div className="cx0_wrap">
      <style>{css}</style>

      <div>
        <h1 className="cx0_title">CENTENAS +</h1>
        <div className="cx0_sub">{subtitle}</div>
      </div>

      <div className="cx0_filters">
        <div className="cx0_fItem">
          <div className="cx0_fLab">Mês</div>
          <div className="cx0_selWrap">
            <select className="cx0_sel" value={fMes} onChange={(e) => setFMes(String(e.target.value || "Todos"))}>
              {mesOptions.map((o) => (
                <option key={o.v} value={o.v}>
                  {o.label}
                </option>
              ))}
            </select>
            <div className="cx0_chev" />
          </div>
        </div>

        <div className="cx0_fItem">
          <div className="cx0_fLab">Dia do Mês</div>
          <div className="cx0_selWrap">
            <select className="cx0_sel" value={fDiaMes} onChange={(e) => setFDiaMes(String(e.target.value || "Todos"))}>
              {diaMesOptions.map((o) => (
                <option key={o.v} value={o.v}>
                  {o.label}
                </option>
              ))}
            </select>
            <div className="cx0_chev" />
          </div>
        </div>

        <div className="cx0_fItem">
          <div className="cx0_fLab">Dia da Semana</div>
          <div className="cx0_selWrap">
            <select
              className="cx0_sel"
              value={fDiaSemana}
              onChange={(e) => setFDiaSemana(String(e.target.value || "Todos"))}
            >
              {diaSemanaOptions.map((o) => (
                <option key={o.v} value={o.v}>
                  {o.label}
                </option>
              ))}
            </select>
            <div className="cx0_chev" />
          </div>
        </div>

        <div className="cx0_fItem">
          <div className="cx0_fLab">Horário</div>
          <div className="cx0_selWrap">
            <select className="cx0_sel" value={fHorario} onChange={(e) => setFHorario(String(e.target.value || "Todos"))}>
              {horarioOptions.map((o) => (
                <option key={o.v} value={o.v}>
                  {o.label}
                </option>
              ))}
            </select>
            <div className="cx0_chev" />
          </div>
        </div>

        <div className="cx0_fItem">
          <div className="cx0_fLab">Animal</div>
          <div className="cx0_selWrap">
            <select
              className="cx0_sel"
              value={fAnimal}
              onChange={(e) => {
                const v = String(e.target.value || "Todos");
                setFAnimal(v);
                if (!isTodos(v)) {
                  const g = Number(v);
                  if (Number.isFinite(g) && g >= 1 && g <= 25) setOpenGrupo(g);
                }
              }}
            >
              {animalOptions.map((o) => (
                <option key={o.v} value={o.v}>
                  {o.label}
                </option>
              ))}
            </select>
            <div className="cx0_chev" />
          </div>
        </div>

        <div className="cx0_fItem">
          <div className="cx0_fLab">Posição</div>
          <div className="cx0_selWrap">
            <select className="cx0_sel" value={fPosicao} onChange={(e) => setFPosicao(String(e.target.value || "Todos"))}>
              {posicaoOptions.map((o) => (
                <option key={o.v} value={o.v}>
                  {o.label}
                </option>
              ))}
            </select>
            <div className="cx0_chev" />
          </div>
        </div>
      </div>

      <div className="cx0_controls">
        <div className="cx0_chip">
          <label>Loterias</label>
          <select value={lotteryOptId} onChange={(e) => setLotteryOptId(String(e.target.value || "ALL"))}>
            {LOTTERY_OPTIONS.map((x) => (
              <option key={x.id} value={x.id}>
                {x.label}
              </option>
            ))}
          </select>
        </div>

        <button className="cx0_btn" onClick={build} disabled={loading || loadingBounds || !boundsReady}>
          {loading ? "Carregando..." : "Atualizar"}
        </button>
      </div>

      {loading && progress?.total ? (
        <div className="cx0_status">
          {progress.label || "Carregando..."} · {progress.done}/{progress.total} · {progressPct}%
          <div className="cx0_bar">
            <div style={{ width: `${progressPct}%` }} />
          </div>
        </div>
      ) : null}

      {error ? <div className="cx0_err">{error}</div> : null}

      <div className="cx0_panel">
        <div className="cx0_grid">
          <div className="cx0_banner">
            <div className="cx0_bImg">{bannerImg ? <img src={bannerImg} alt={bannerLabel || ""} /> : null}</div>
            <div className="cx0_bTxt">
              <div className="cx0_bGrp">GRUPO {pad2(bannerGrupo)}</div>
              <div className="cx0_bAn">{bannerLabel || "—"}</div>
            </div>
          </div>

          <div className="cx0_list">
            {!loading && (!groups || !groups.length) ? (
              <div style={{ padding: 14, textAlign: "center", color: "rgba(233,233,233,0.7)" }}>Sem dados para exibir.</div>
            ) : null}

            {(groups || []).map((g) => {
              const isOpen = Number(openGrupo) === Number(g.grupo);
              const rows = showOnlyHits ? (g.list40 || []).filter((x) => (Number(x.count) || 0) > 0) : g.list40 || [];

              return (
                <div className="cx0_card" key={g.grupo}>
                  <div
                    className="cx0_head"
                    role="button"
                    tabIndex={0}
                    onClick={() => setOpenGrupo(isOpen ? null : g.grupo)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") setOpenGrupo(isOpen ? null : g.grupo);
                    }}
                    title={`Grupo ${g.grupo2} · ${g.animal}`}
                  >
                    <div className="cx0_hLeft">
                      <div className="cx0_hImg">{g.img ? <img src={g.img} alt={g.animal || ""} /> : null}</div>
                      <div className="cx0_hNames">
                        <div className="cx0_hGrp">GRUPO {g.grupo2}</div>
                        <div className="cx0_hAn">{g.animal || "—"}</div>
                      </div>
                    </div>

                    <div className="cx0_hRight">
                      <div className="cx0_kpi">
                        <div className="cx0_kpiK">Total</div>
                        <div className="cx0_kpiV">{g.totalHits}</div>
                      </div>
                    </div>
                  </div>

                  {isOpen ? (
                    <div className="cx0_body">
                      <div className="cx0_bodyTop">
                        <div>
                          Mostrando <b>{rows.length}</b> de <b>40</b>
                        </div>

                        <button className="cx0_toggle" type="button" onClick={() => setShowOnlyHits((v) => !v)}>
                          {showOnlyHits ? "Mostrar todas (40)" : "Mostrar só ocorridas"}
                        </button>
                      </div>

                      <div className="cx0_tbl">
                        <div className="cx0_row cx0_headRow">
                          <div>Posição</div>
                          <div>Centena</div>
                          <div>Frequência</div>
                          <div>Milhar Palpite</div>
                        </div>

                        <div className="cx0_scroll">
                          {(rows || []).map((it, idx) => {
                            const posTxt = `${idx + 1}º`;
                            const dig = dailyDigitForRow(todayYmd, g.grupo2, it.centena);
                            const milharPalpite = `${dig}${it.centena}`;
                            return (
                              <div className="cx0_row" key={`${g.grupo}-${it.centena}`}>
                                <div style={{ color: "rgba(233,233,233,0.70)" }}>{posTxt}</div>
                                <div className="cx0_mono">{it.centena}</div>
                                <div className="cx0_count">
                                  <b>{it.count}</b>
                                </div>
                                <div className="cx0_mono">{milharPalpite}</div>
                              </div>
                            );
                          })}

                          {!rows || !rows.length ? (
                            <div className="cx0_row">
                              <div
                                style={{
                                  gridColumn: "1 / -1",
                                  textAlign: "left",
                                  padding: 12,
                                  color: "rgba(233,233,233,0.70)",
                                }}
                              >
                                Nenhuma centena com ocorrência para os filtros atuais. Use “Mostrar todas (40)” para ver também as zeros.
                              </div>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
