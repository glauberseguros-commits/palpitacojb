// src/pages/Centenas/Centenas.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getKingBoundsByUf,
  getKingResultsByRange,
} from "../../services/kingResultsService";
import {
  getAnimalLabel as getAnimalLabelFn,
  getImgFromGrupo as getImgFromGrupoFn,
} from "../../constants/bichoMap";

/**
 * Centenas + — Premium (mobile-first)
 *
 * ✅ Regras:
 * - Para cada grupo (01..25), gera as 40 centenas:
 *   4 dezenas do grupo × prefixo 0..9 => 40 centenas.
 * - Conta frequência usando prizes (APARIÇÕES), via getKingResultsByRange(mode:"detailed").
 *
 * ✅ Filtros:
 * - Contexto (draw): Mês | Dia do Mês | Dia da Semana | Horário
 * - Aparição (prize): Animal (Grupo) | Posição
 *
 * ✅ UX:
 * - Banner acompanha Animal filtrado (se houver) senão acompanha grupo aberto.
 * - Auto-build (debounced) ao mudar filtros IMPORTANTES (não rebuild em showOnlyHits).
 * - Mostrar todas (40) vs somente ocorridas (client-side).
 *
 * ✅ FIX:
 * - Considera prêmios 1º..7º (fixo, sem seletor).
 *
 * ✅ TABELA:
 * - Colunas: Posição > Centena > Frequência > Milhar Palpite
 * - "Milhar Palpite" = (unidade determinística POR DIA e por linha) + centena
 *
 * ✅ PERÍODO:
 * - Sempre considera TODA A BASE (bounds) e exibe esse período no topo.
 */

function pad2(n) {
  return String(n).padStart(2, "0");
}

function isYMD(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || "").trim());
}

function ymdToBR(ymd) {
  const m = String(ymd || "")
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})$/);
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

/** hash simples e estável (0..9) a partir de uma chave */
function digitFromKey(key) {
  const s = String(key || "");
  let h = 0;
  for (let i = 0; i < s.length; i += 1) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return String(h % 10);
}

/**
 * unidade do milhar POR LINHA:
 * - muda a cada dia
 * - varia por centena/grupo
 * - determinística no mesmo dia
 */
function dailyDigitForRow(ymd, grupo2, centena3) {
  return digitFromKey(
    `${String(ymd || "")}#${String(grupo2 || "")}#${String(centena3 || "")}`
  );
}

/** 4 dezenas por grupo: (g-1)*4+1 .. g*4 */
function dezenasDoGrupo(grupo) {
  const g = Number(grupo);
  if (!Number.isFinite(g) || g < 1 || g > 25) return [];
  const start = (g - 1) * 4 + 1;
  return [start, start + 1, start + 2, start + 3].map((n) => pad2(n));
}

/** 40 centenas = prefixo 0..9 + dezena (XY) */
function centenas40DoGrupo(grupo) {
  const dezenas = dezenasDoGrupo(grupo);
  const out = [];
  for (const dz of dezenas) {
    for (let p = 0; p <= 9; p += 1) out.push(`${p}${dz}`);
  }
  return out;
}

function sortPTBR(a, b) {
  return String(a).localeCompare(String(b), "pt-BR", { sensitivity: "base" });
}

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

function pickDrawYmd(draw) {
  const y =
    draw?.dateYmd ||
    draw?.ymd ||
    draw?.date ||
    draw?.data ||
    draw?.day ||
    "";
  return isYMD(y) ? y : "";
}

function pickDrawHour(draw) {
  const h =
    draw?.closeHour ||
    draw?.hour ||
    draw?.horario ||
    draw?.close_hour ||
    draw?.close ||
    "";
  const hh = normalizeHourLike(h);
  return hh || "";
}

function getWeekdayPTBRFromYMD(ymd) {
  const dt = ymdToUTCDate(ymd);
  if (!dt) return "";
  const day = dt.getUTCDay();
  const map = [
    "Domingo",
    "Segunda",
    "Terça",
    "Quarta",
    "Quinta",
    "Sexta",
    "Sábado",
  ];
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

function isTodos(v) {
  return String(v || "").trim().toLowerCase() === "todos";
}

/* =========================
   Extratores robustos (centena/grupo)
========================= */

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
    if (d.length === 4) return d;
  }
  return "";
}

function pickCentena3(prize) {
  const direct = [
    prize?.centena3,
    prize?.centena,
    prize?.centena_3,
    prize?.centena3dig,
    prize?.c3,
  ];

  for (const c of direct) {
    const d = digitsOnly(c);
    if (!d) continue;
    if (d.length === 3) return d.padStart(3, "0");
    if (d.length > 3) return d.slice(-3).padStart(3, "0");
  }

  const milhar4 = pickMilhar4(prize);
  if (milhar4 && milhar4.length === 4) return milhar4.slice(1);
  return "";
}

function pickDezenaFinal(prize) {
  const c3 = pickCentena3(prize);
  if (!/^\d{3}$/.test(c3)) return "";
  return c3.slice(1);
}

function inferGrupoFromPrize(prize) {
  const gRaw = Number(prize?.grupo);
  if (Number.isFinite(gRaw) && gRaw >= 1 && gRaw <= 25) return gRaw;

  const dz = pickDezenaFinal(prize);
  if (!/^\d{2}$/.test(dz)) return null;

  const d = Number(dz);
  if (!Number.isFinite(d) || d < 1 || d > 100) return null;

  return Math.floor((d - 1) / 4) + 1;
}

/* =========================
   Chunking (base inteira)
========================= */

function splitRangeIntoChunks(fromYmd, toYmd, chunkDays = 200) {
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

export default function Centenas() {
  const LOTTERY_KEY = "PT_RIO";

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

  // Controles que permanecem
  const [lotteryOptId, setLotteryOptId] = useState("ALL");

  // ✅ prêmios fixos: 1º ao 7º (sem seletor)
  const prizePositions = useMemo(() => [1, 2, 3, 4, 5, 6, 7], []);

  // filtros premium
  const [fMes, setFMes] = useState("Todos");
  const [fDiaMes, setFDiaMes] = useState("Todos");
  const [fDiaSemana, setFDiaSemana] = useState("Todos");
  const [fHorario, setFHorario] = useState("Todos");
  const [fAnimal, setFAnimal] = useState("Todos");
  const [fPosicao, setFPosicao] = useState("Todos");

  // UX: mostrar só ocorridas (CLIENT-SIDE: não refaz build)
  const [showOnlyHits, setShowOnlyHits] = useState(false);

  const [bounds, setBounds] = useState({
    minYmd: null,
    maxYmd: null,
    source: "",
  });
  const [loadingBounds, setLoadingBounds] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [groups, setGroups] = useState([]);
  const [openGrupo, setOpenGrupo] = useState(4);

  const abortedRef = useRef(false);
  const didAutoBuildRef = useRef(false);
  const autoBuildTimerRef = useRef(null);

  const getAnimalLabel = useMemo(() => getAnimalLabelFn, []);
  const getImgFromGrupo = useMemo(() => getImgFromGrupoFn, []);

  const selectedLottery = useMemo(() => {
    return (
      LOTTERY_OPTIONS.find((x) => x.id === lotteryOptId) || LOTTERY_OPTIONS[0]
    );
  }, [lotteryOptId, LOTTERY_OPTIONS]);

  const selectedCloseHour = useMemo(() => {
    return selectedLottery?.closeHour
      ? normalizeHourLike(selectedLottery.closeHour)
      : null;
  }, [selectedLottery]);

  const boundsReady = !!(bounds?.minYmd && bounds?.maxYmd);

  // ✅ data local usada para o “Milhar Palpite” (muda diariamente)
  // (não memoizamos com [] para não “congelar” caso a aba fique aberta virando o dia)
  const todayYmd = todayYMDLocal();

  // options UI
  const mesOptions = useMemo(() => {
    const out = [{ v: "Todos", label: "Todos" }];
    for (let m = 1; m <= 12; m += 1)
      out.push({ v: String(m), label: monthNamePTBR(m) });
    return out;
  }, []);

  const diaMesOptions = useMemo(() => {
    const out = [{ v: "Todos", label: "Todos" }];
    for (let d = 1; d <= 31; d += 1)
      out.push({ v: String(d), label: pad2(d) });
    return out;
  }, []);

  const diaSemanaOptions = useMemo(() => {
    const out = [{ v: "Todos", label: "Todos" }];
    [
      "Domingo",
      "Segunda",
      "Terça",
      "Quarta",
      "Quinta",
      "Sexta",
      "Sábado",
    ].forEach((x) => out.push({ v: x, label: x }));
    return out;
  }, []);

  const horarioOptions = useMemo(() => {
    const base = ["09:00", "11:00", "14:00", "16:00", "18:00", "21:00"];
    return [
      { v: "Todos", label: "Todos" },
      ...base.map((h) => ({ v: h, label: h.replace(":00", "h") })),
    ];
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

  // bounds
  useEffect(() => {
    let alive = true;

    (async () => {
      setLoadingBounds(true);
      setError("");

      try {
        const b = await getKingBoundsByUf({ uf: LOTTERY_KEY });
        if (!alive) return;

        const minYmd = b?.minYmd || null;
        const maxYmd = b?.maxYmd || null;
        setBounds({ minYmd, maxYmd, source: b?.source || "" });

        if (!minYmd || !maxYmd) {
          setError(
            `Bounds não encontrados para "${LOTTERY_KEY}". Fonte: ${String(
              b?.source || ""
            )}`
          );
        }
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
  }, [LOTTERY_KEY]);

  const applyDrawFilters = useCallback(
    (draws) => {
      const out = [];
      for (const d of draws || []) {
        const ymd = pickDrawYmd(d);
        const hr = pickDrawHour(d);
        if (!ymd) continue;

        if (!isTodos(fMes)) {
          const mm = Number(String(ymd).slice(5, 7));
          if (String(mm) !== String(fMes)) continue;
        }

        if (!isTodos(fDiaMes)) {
          const dd = Number(String(ymd).slice(8, 10));
          if (String(dd) !== String(fDiaMes)) continue;
        }

        if (!isTodos(fDiaSemana)) {
          const wd = getWeekdayPTBRFromYMD(ymd);
          if (wd !== String(fDiaSemana)) continue;
        }

        if (!isTodos(fHorario)) {
          const want = normalizeHourLike(fHorario);
          if (!hr || hr !== want) continue;
        }

        out.push(d);
      }
      return out;
    },
    [fMes, fDiaMes, fDiaSemana, fHorario]
  );

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
          const pp = Number(p?.posicao ?? p?.position ?? p?.prizePosition);
          if (pp !== pos) continue;
        }
        out.push(p);
      }
      return out;
    },
    [fAnimal, fPosicao]
  );

  const build = useCallback(async () => {
    abortedRef.current = false;
    setLoading(true);
    setError("");

    try {
      if (!boundsReady) {
        setError("Bounds ainda não carregaram.");
        return;
      }

      // ✅ Sempre TODA A BASE
      const effectiveFrom = bounds.minYmd;
      const effectiveTo = bounds.maxYmd;

      const chunks = splitRangeIntoChunks(effectiveFrom, effectiveTo, 200);

      const prizesAll = [];

      for (const ch of chunks) {
        if (abortedRef.current) return;

        const drawsChunk = await getKingResultsByRange({
          uf: LOTTERY_KEY,
          dateFrom: ch.from,
          dateTo: ch.to,
          closeHour: selectedCloseHour || null,
          positions: prizePositions,
          mode: "detailed",
        });

        if (abortedRef.current) return;

        const drawsFiltered = applyDrawFilters(drawsChunk);

        for (const d of drawsFiltered || []) {
          const prizes = Array.isArray(d?.prizes) ? d.prizes : [];
          for (const p of prizes) prizesAll.push(p);
        }
      }

      const allPrizes = applyPrizeFilters(prizesAll);

      const out = [];
      for (let g = 1; g <= 25; g += 1) {
        if (!isTodos(fAnimal) && Number(fAnimal) !== g) continue;

        const grupo2 = pad2(g);
        const animal = (getAnimalLabel && getAnimalLabel(g)) || "";
        const img = (getImgFromGrupo && getImgFromGrupo(g)) || "";

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

        const totalHits = list40.reduce(
          (acc, it) => acc + (Number(it.count) || 0),
          0
        );

        out.push({
          grupo: g,
          grupo2,
          animal,
          img,
          totalHits,
          list40,
        });
      }

      out.sort((a, b) => {
        if (b.totalHits !== a.totalHits) return b.totalHits - a.totalHits;
        const an = sortPTBR(a.animal, b.animal);
        if (an !== 0) return an;
        return a.grupo - b.grupo;
      });

      setGroups(out);

      const openWanted = !isTodos(fAnimal) ? Number(fAnimal) : openGrupo;
      if (
        Number.isFinite(openWanted) &&
        out.find((x) => x.grupo === openWanted)
      ) {
        setOpenGrupo(openWanted);
      } else if (out[0]?.grupo) {
        setOpenGrupo(out[0].grupo);
      }
    } catch (e) {
      if (abortedRef.current) return;
      setError(String(e?.message || e));
    } finally {
      if (!abortedRef.current) setLoading(false);
    }
  }, [
    LOTTERY_KEY,
    boundsReady,
    bounds?.minYmd,
    bounds?.maxYmd,
    selectedCloseHour,
    prizePositions,
    applyDrawFilters,
    applyPrizeFilters,
    getAnimalLabel,
    getImgFromGrupo,
    openGrupo,
    fAnimal,
  ]);

  useEffect(() => {
    if (!boundsReady) return;
    if (didAutoBuildRef.current) return;
    didAutoBuildRef.current = true;
    build();
  }, [boundsReady, build]);

  useEffect(() => {
    return () => {
      abortedRef.current = true;
    };
  }, []);

  // ✅ Auto-build só quando muda filtro que altera QUERY/CONTAGEM.
  // showOnlyHits é só visual (client-side), então NÃO entra.
  useEffect(() => {
    if (!boundsReady) return;
    if (!didAutoBuildRef.current) return;

    if (autoBuildTimerRef.current) clearTimeout(autoBuildTimerRef.current);
    autoBuildTimerRef.current = setTimeout(() => build(), 250);

    return () => {
      if (autoBuildTimerRef.current) clearTimeout(autoBuildTimerRef.current);
    };
  }, [
    boundsReady,
    build,
    fMes,
    fDiaMes,
    fDiaSemana,
    fHorario,
    fAnimal,
    fPosicao,
    lotteryOptId,
  ]);

  const subtitle = useMemo(() => {
    const lotTxt = selectedLottery?.label || "Todas as loterias";
    const rangeTxt =
      boundsReady && bounds?.minYmd && bounds?.maxYmd
        ? `${ymdToBR(bounds.minYmd)} até ${ymdToBR(bounds.maxYmd)}`
        : "";
    return `Frequência das 40 centenas · Prêmio 1º ao 7º · ${lotTxt} · Loteria ${LOTTERY_KEY}${
      rangeTxt ? ` · Período ${rangeTxt}` : ""
    }`;
  }, [selectedLottery, LOTTERY_KEY, boundsReady, bounds?.minYmd, bounds?.maxYmd]);

  const bannerGrupo = useMemo(() => {
    if (!isTodos(fAnimal)) {
      const g = Number(fAnimal);
      if (Number.isFinite(g) && g >= 1 && g <= 25) return g;
    }
    if (openGrupo) return Number(openGrupo);
    return Number(groups?.[0]?.grupo || 1);
  }, [fAnimal, openGrupo, groups]);

  const bannerImg = useMemo(() => {
    return (getImgFromGrupo && getImgFromGrupo(bannerGrupo)) || "";
  }, [getImgFromGrupo, bannerGrupo]);

  const bannerLabel = useMemo(() => {
    return (getAnimalLabel && getAnimalLabel(bannerGrupo)) || "";
  }, [getAnimalLabel, bannerGrupo]);

  // ✅ CSS mobile-first e compatível com AppShell (main é quem rola).
  // - Removemos 100vh interno (causava corte / scroll duplo / bottom bar por cima).
  // - Filtros viram grid responsivo: 1 coluna no mobile, 2 em telas médias, 6 no desktop.
  const css = useMemo(() => {
    return `
      .ppC_wrap{
        width:100%;
        height:100%;
        min-height:0;

        padding: 14px;
        color:#e9e9e9;

        display:flex;
        flex-direction:column;
        gap:12px;

        /* ✅ não “prende” o scroll: quem rola é o main do AppShell */
        overflow: visible;
      }

      .ppC_titleWrap{
        display:flex;
        flex-direction:column;
        align-items:center;
        justify-content:center;
        gap:4px;
      }

      .ppC_title{
        font-size:18px;
        font-weight:900;
        letter-spacing:0.6px;
        text-transform:uppercase;
        text-align:center;
        margin:0;
        line-height:1.05;
      }

      .ppC_subtitle{
        font-size:11px;
        color:rgba(233,233,233,0.72);
        text-align:center;
        line-height:1.25;
        padding: 0 6px;
      }

      /* =========================
         Filtros (mobile-first)
      ========================= */

      .ppF_bar{
        border-radius:18px;
        border:1px solid rgba(255,255,255,0.10);
        background:rgba(0,0,0,0.45);
        box-shadow:0 18px 60px rgba(0,0,0,0.55);
        padding:12px;

        display:grid;
        grid-template-columns: 1fr; /* ✅ mobile */
        gap:10px;
      }

      .ppF_item{ display:flex; flex-direction:column; gap:8px; min-width:0; }

      .ppF_label{
        font-weight:900;
        font-size:13px;
        color:rgba(233,233,233,0.92);
        letter-spacing:0.2px;
      }

      .ppF_selectWrap{
        position:relative;
        border-radius:16px;
        border:1px solid rgba(255,255,255,0.12);
        background:rgba(0,0,0,0.55);
        box-shadow: inset 0 0 0 1px rgba(202,166,75,0.10);
        height:48px;
        display:flex;
        align-items:center;
        padding:0 14px;
        overflow:hidden;
      }

      .ppF_select{
        width:100%;
        appearance:none;
        background:transparent;
        border:none;
        outline:none;
        color:#fff;
        font-weight:900;
        font-size:15px;
        letter-spacing:0.3px;
        cursor:pointer;
        padding-right:28px;
      }
      .ppF_select option{ background:#0b0b0b; color:#e9e9e9; }

      .ppF_chev{
        position:absolute;
        right:12px;
        top:50%;
        transform:translateY(-50%);
        width:0;height:0;
        border-left:7px solid transparent;
        border-right:7px solid transparent;
        border-top:9px solid rgba(233,233,233,0.72);
        pointer-events:none;
      }

      @media (min-width: 720px){
        .ppF_bar{
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }

      @media (min-width: 1100px){
        .ppF_bar{
          grid-template-columns: repeat(6, minmax(0, 1fr));
        }
      }

      /* =========================
         Controles
      ========================= */

      .ppC_controls{
        display:flex;
        justify-content:center;
        align-items:center;
        gap:8px;
        flex-wrap:wrap;
      }

      .ppCtl{
        display:inline-flex;
        align-items:center;
        gap:8px;
        padding:8px 10px;
        border-radius:999px;
        background:rgba(0,0,0,0.55);
        border:1px solid rgba(202,166,75,0.18);
        box-shadow:0 10px 30px rgba(0,0,0,0.35);
      }
      .ppCtl label{ font-size:10px; color:rgba(233,233,233,0.62); }
      .ppCtl select{
        background:transparent;
        border:none;
        outline:none;
        color:#e9e9e9;
        font-weight:900;
        font-size:12px;
      }
      .ppCtl select option{ background:#0b0b0b; color:#e9e9e9; }

      .ppBtn{
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
      .ppBtn:disabled{ opacity:0.55; cursor:not-allowed; }

      .ppErr{
        padding:9px 11px;
        border-radius:12px;
        border:1px solid rgba(255,80,80,0.25);
        background:rgba(255,80,80,0.08);
        color:rgba(255,220,220,0.92);
        white-space:pre-wrap;
        font-size:12px;
      }

      /* =========================
         Painel (mobile-first)
      ========================= */

      .ppC_panel{
        border-radius:18px;
        border:1px solid rgba(202,166,75,0.16);
        background:
          radial-gradient(1000px 500px at 20% 0%, rgba(202,166,75,0.08), transparent 55%),
          radial-gradient(900px 500px at 85% 20%, rgba(255,255,255,0.05), transparent 50%),
          rgba(0,0,0,0.45);
        box-shadow:0 20px 60px rgba(0,0,0,0.45);
        overflow:hidden;

        display:flex;
        flex-direction:column;
        min-height: 0;
      }

      .ppC_bodyGrid{
        display:grid;
        grid-template-columns: 1fr;  /* ✅ mobile: banner em cima, lista embaixo */
        gap:10px;
        padding:10px;
        min-height: 0;
      }

      @media (min-width: 980px){
        .ppC_bodyGrid{
          grid-template-columns: 320px 1fr; /* desktop/tablet grande */
        }
      }

      .ppB_banner{
        border-radius:18px;
        border:1px solid rgba(255,255,255,0.10);
        background:rgba(0,0,0,0.35);
        box-shadow:0 14px 40px rgba(0,0,0,0.45);
        overflow:hidden;
        display:flex;
        flex-direction:column;
      }

      .ppB_imgWrap{ padding:12px; display:flex; justify-content:center; align-items:center; }
      .ppB_img{
        width: 220px; height: 220px;
        border-radius:20px;
        border:3px solid rgba(202,166,75,0.60);
        box-shadow:0 18px 55px rgba(0,0,0,0.55);
        overflow:hidden;
        background:rgba(0,0,0,0.55);
      }
      .ppB_img img{ width:100%; height:100%; object-fit:cover; display:block; }

      @media (min-width: 980px){
        .ppB_img{ width:260px; height:260px; }
      }

      .ppB_text{ padding:0 14px 14px; }
      .ppB_grp{ font-weight:1000; letter-spacing:0.5px; font-size:12px; opacity:0.95; }
      .ppB_an{ margin-top:4px; font-weight:900; font-size:14px; color:rgba(233,233,233,0.85); }
      .ppB_hint{ margin-top:8px; font-size:11px; color:rgba(233,233,233,0.62); line-height:1.25; }

      .ppC_list{
        padding:0;
        min-height:0;
        display:flex;
        flex-direction:column;
        gap:10px;
      }

      .ppC_card{
        border-radius:16px;
        border:1px solid rgba(255,255,255,0.08);
        background:rgba(0,0,0,0.35);
        box-shadow:0 14px 40px rgba(0,0,0,0.45);
        overflow:hidden;
      }

      .ppC_cardHead{
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:12px;
        padding:10px 12px;
        cursor:pointer;
        user-select:none;
      }

      .ppC_left{ display:flex; align-items:center; gap:10px; min-width:0; }

      .ppC_img{
        width:38px; height:38px;
        border-radius:14px;
        border:2px solid rgba(202,166,75,0.55);
        box-shadow:0 14px 34px rgba(0,0,0,0.45);
        background:rgba(0,0,0,0.55);
        overflow:hidden;
        flex:0 0 auto;
      }
      .ppC_img img{ width:100%; height:100%; object-fit:cover; display:block; }

      .ppC_names{ display:flex; flex-direction:column; gap:2px; min-width:0; }
      .ppC_grp{ font-weight:1000; letter-spacing:0.4px; font-size:12px; white-space:nowrap; }
      .ppC_an{
        font-weight:800;
        color:rgba(233,233,233,0.82);
        font-size:11px;
        white-space:nowrap;
        overflow:hidden;
        text-overflow:ellipsis;
        max-width: 260px;
      }

      .ppC_right{ display:flex; align-items:center; gap:12px; }
      .ppC_kpi{ display:flex; flex-direction:column; align-items:flex-end; gap:2px; }
      .ppC_kpi .k{ font-size:10px; color:rgba(233,233,233,0.62); }
      .ppC_kpi .v{ font-size:12px; font-weight:1000; }
      .ppC_kpi .v b{ color:#caa64b; }

      .ppC_cardBody{
        border-top:1px solid rgba(255,255,255,0.06);
        padding:10px 12px 12px;
        background:linear-gradient(180deg, rgba(202,166,75,0.06), rgba(0,0,0,0.16));
      }

      .ppC_smallToggle{
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:10px;
        padding:8px 2px 10px;
        color: rgba(233,233,233,0.75);
        font-size: 11px;
        flex-wrap: wrap;
      }
      .ppC_smallToggle b{ color:#caa64b; }

      .ppC_toggleBtn{
        cursor:pointer;
        border-radius:999px;
        padding:8px 10px;
        font-weight:900;
        font-size:11px;
        background:rgba(0,0,0,0.35);
        color:#e9e9e9;
        border:1px solid rgba(202,166,75,0.25);
      }

      .ppC_tableWrap{
        width:100%;
        overflow:auto;
        border-radius:14px;
        border:1px solid rgba(255,255,255,0.08);
        background:rgba(0,0,0,0.28);

        /* ✅ sem altura fixa “mágica”; usa viewport de forma segura */
        max-height: min(420px, 55vh);
      }

      @media (max-width: 420px){
        .ppC_tableWrap{
          max-height: min(380px, 52vh);
        }
      }

      .ppC_table{ width:100%; border-collapse:collapse; table-layout:fixed; }
      .ppC_table th, .ppC_table td{
        text-align:center;
        padding:8px 10px;
        border-bottom:1px solid rgba(255,255,255,0.06);
        white-space:nowrap;
        overflow:hidden;
        text-overflow:ellipsis;
      }
      .ppC_table thead th{
        position:sticky;
        top:0;
        z-index:2;
        background:rgba(0,0,0,0.72);
        backdrop-filter:blur(8px);
        font-size:10px;
        text-transform:uppercase;
        letter-spacing:0.6px;
        color:rgba(233,233,233,0.72);
      }
      .ppC_table tbody td{ font-size:12px; color:rgba(233,233,233,0.92); }
      .ppC_table tbody tr:hover td{ background:rgba(202,166,75,0.06); }

      .ppC_mono{
        font-variant-numeric:tabular-nums;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
        letter-spacing:0.3px;
        font-weight:900;
      }
      .ppC_count b{ color:#caa64b; }
    `;
  }, []);

  return (
    <div className="ppC_wrap">
      <style>{css}</style>

      <div className="ppC_titleWrap">
        <h1 className="ppC_title">Centenas +</h1>
        <div className="ppC_subtitle">{subtitle}</div>
      </div>

      {/* Filtros Premium */}
      <div className="ppF_bar">
        <div className="ppF_item">
          <div className="ppF_label">Mês</div>
          <div className="ppF_selectWrap">
            <select
              className="ppF_select"
              value={fMes}
              onChange={(e) => setFMes(String(e.target.value || "Todos"))}
            >
              {mesOptions.map((o) => (
                <option key={o.v} value={o.v}>
                  {o.label}
                </option>
              ))}
            </select>
            <div className="ppF_chev" />
          </div>
        </div>

        <div className="ppF_item">
          <div className="ppF_label">Dia do Mês</div>
          <div className="ppF_selectWrap">
            <select
              className="ppF_select"
              value={fDiaMes}
              onChange={(e) => setFDiaMes(String(e.target.value || "Todos"))}
            >
              {diaMesOptions.map((o) => (
                <option key={o.v} value={o.v}>
                  {o.label}
                </option>
              ))}
            </select>
            <div className="ppF_chev" />
          </div>
        </div>

        <div className="ppF_item">
          <div className="ppF_label">Dia da Semana</div>
          <div className="ppF_selectWrap">
            <select
              className="ppF_select"
              value={fDiaSemana}
              onChange={(e) => setFDiaSemana(String(e.target.value || "Todos"))}
            >
              {diaSemanaOptions.map((o) => (
                <option key={o.v} value={o.v}>
                  {o.label}
                </option>
              ))}
            </select>
            <div className="ppF_chev" />
          </div>
        </div>

        <div className="ppF_item">
          <div className="ppF_label">Horário</div>
          <div className="ppF_selectWrap">
            <select
              className="ppF_select"
              value={fHorario}
              onChange={(e) => setFHorario(String(e.target.value || "Todos"))}
            >
              {horarioOptions.map((o) => (
                <option key={o.v} value={o.v}>
                  {o.label}
                </option>
              ))}
            </select>
            <div className="ppF_chev" />
          </div>
        </div>

        <div className="ppF_item">
          <div className="ppF_label">Animal</div>
          <div className="ppF_selectWrap">
            <select
              className="ppF_select"
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
            <div className="ppF_chev" />
          </div>
        </div>

        <div className="ppF_item">
          <div className="ppF_label">Posição</div>
          <div className="ppF_selectWrap">
            <select
              className="ppF_select"
              value={fPosicao}
              onChange={(e) => setFPosicao(String(e.target.value || "Todos"))}
            >
              {posicaoOptions.map((o) => (
                <option key={o.v} value={o.v}>
                  {o.label}
                </option>
              ))}
            </select>
            <div className="ppF_chev" />
          </div>
        </div>
      </div>

      {/* Controles (mantidos) */}
      <div className="ppC_controls">
        <div className="ppCtl">
          <label>Loterias</label>
          <select
            value={lotteryOptId}
            onChange={(e) => setLotteryOptId(String(e.target.value || "ALL"))}
          >
            {LOTTERY_OPTIONS.map((x) => (
              <option key={x.id} value={x.id}>
                {x.label}
              </option>
            ))}
          </select>
        </div>

        <button
          className="ppBtn"
          onClick={build}
          disabled={loading || loadingBounds || !boundsReady}
        >
          {loading ? "Carregando..." : "Atualizar"}
        </button>
      </div>

      {error ? <div className="ppErr">{error}</div> : null}

      <div className="ppC_panel">
        <div className="ppC_bodyGrid">
          {/* Banner */}
          <div className="ppB_banner">
            <div className="ppB_imgWrap">
              <div className="ppB_img">
                {bannerImg ? <img src={bannerImg} alt={bannerLabel || ""} /> : null}
              </div>
            </div>
            <div className="ppB_text">
              <div className="ppB_grp">GRUPO {pad2(bannerGrupo)}</div>
              <div className="ppB_an">{bannerLabel || "—"}</div>
              <div className="ppB_hint" />
            </div>
          </div>

          {/* Lista */}
          <div className="ppC_list">
            {!loading && (!groups || !groups.length) ? (
              <div
                style={{
                  padding: 14,
                  textAlign: "center",
                  color: "rgba(233,233,233,0.7)",
                }}
              >
                Sem dados para exibir.
              </div>
            ) : null}

            {(groups || []).map((g) => {
              const isOpen = Number(openGrupo) === Number(g.grupo);

              // ✅ showOnlyHits é visual (não mexe na query)
              const rows = showOnlyHits
                ? (g.list40 || []).filter((x) => (Number(x.count) || 0) > 0)
                : g.list40 || [];

              return (
                <div className="ppC_card" key={g.grupo}>
                  <div
                    className="ppC_cardHead"
                    role="button"
                    tabIndex={0}
                    onClick={() => setOpenGrupo(isOpen ? null : g.grupo)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        setOpenGrupo(isOpen ? null : g.grupo);
                      }
                    }}
                    title={`Grupo ${g.grupo2} · ${g.animal}`}
                  >
                    <div className="ppC_left">
                      <div className="ppC_img" aria-hidden="true">
                        {g.img ? <img src={g.img} alt={g.animal || ""} /> : null}
                      </div>

                      <div className="ppC_names">
                        <div className="ppC_grp">GRUPO {g.grupo2}</div>
                        <div className="ppC_an">{g.animal || "—"}</div>
                      </div>
                    </div>

                    <div className="ppC_right">
                      <div className="ppC_kpi">
                        <div className="k">Total (40 centenas)</div>
                        <div className="v">
                          <b>{g.totalHits}</b>
                        </div>
                      </div>
                    </div>
                  </div>

                  {isOpen ? (
                    <div className="ppC_cardBody">
                      <div className="ppC_smallToggle">
                        <div>
                          Mostrando <b>{rows.length}</b> de <b>40</b> centenas{" "}
                          {showOnlyHits ? "(somente ocorridas)" : "(inclui zeros)"}
                        </div>

                        <button
                          className="ppC_toggleBtn"
                          type="button"
                          onClick={() => setShowOnlyHits((v) => !v)}
                        >
                          {showOnlyHits ? "Mostrar todas (40)" : "Mostrar só ocorridas"}
                        </button>
                      </div>

                      <div className="ppC_tableWrap">
                        <table className="ppC_table">
                          <thead>
                            <tr>
                              <th style={{ width: 90 }}>Posição</th>
                              <th style={{ width: 120 }}>Centena</th>
                              <th style={{ width: 120 }}>Frequência</th>
                              <th style={{ width: 170 }}>Milhar Palpite</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(rows || []).map((it, idx) => {
                              const posTxt = `${idx + 1}º`;
                              const dig = dailyDigitForRow(
                                todayYmd,
                                g.grupo2,
                                it.centena
                              );
                              const milharPalpite = `${dig}${it.centena}`;
                              return (
                                <tr key={`${g.grupo}-${it.centena}`}>
                                  <td style={{ color: "rgba(233,233,233,0.70)" }}>
                                    {posTxt}
                                  </td>
                                  <td className="ppC_mono">{it.centena}</td>
                                  <td className="ppC_count">
                                    <b>{it.count}</b>
                                  </td>
                                  <td className="ppC_mono">{milharPalpite}</td>
                                </tr>
                              );
                            })}

                            {!rows || !rows.length ? (
                              <tr>
                                <td
                                  colSpan={4}
                                  style={{
                                    padding: 12,
                                    color: "rgba(233,233,233,0.70)",
                                  }}
                                >
                                  Nenhuma centena com ocorrência para os filtros atuais.
                                  Use “Mostrar todas (40)” para ver também as zeros.
                                </td>
                              </tr>
                            ) : null}
                          </tbody>
                        </table>
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
