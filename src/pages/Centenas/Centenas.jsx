// src/pages/Centenas/Centenas.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./centenas.css";
import { getKingBoundsByUf, getKingResultsByRange } from "../../services/kingResultsService";
import { getAnimalLabel as getAnimalLabelFn, getImgFromGrupo as getImgFromGrupoFn } from "../../constants/bichoMap";

import {
  pad2,
  ymdToBR,
  todayYMDLocal,
  sortPTBR,
  isTodos,
  normalizeHourLike,
  toHourBucketHH00,
  pickDrawYmd,
  pickDrawHour,
  getWeekdayPTBRFromYMD,
  monthNamePTBR,
  centenas40DoGrupo,
  pickCentena3,
  inferGrupoFromPrize,
  pickPrizePositionNumber,
  splitRangeIntoChunks,
  normalizeDrawsResult,
  normalizePrizesArray,
  pickPrizeYmd,
  pickPrizeHour,
  dailyDigitForRow,
  mapWithConcurrency,
  upgradeImg,
  tryGetImg,
} from "./centenas.utils";

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
 *
 * ✅ SAFE STATE:
 * - evita setState após unmount (warnings e race conditions)
 */

const LOTTERY_KEY = "PT_RIO";
const FILTERS_LS_KEY = "pp_centenas_filters_v1";

// tuning
const CHUNK_DAYS = 45; // manter < 60 para não cair no aggregated
const CHUNKS_CONCURRENCY = 3;

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

  // ✅ safe state (evita setState após unmount)
  const mountedRef = useRef(false);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const setSafeLoading = useCallback((v) => { if (mountedRef.current) setLoading(v); }, []);
  const setSafeError = useCallback((v) => { if (mountedRef.current) setError(v); }, []);
  const setSafeProgress = useCallback((v) => { if (mountedRef.current) setProgress(v); }, []);
  const setSafeGroups = useCallback((v) => { if (mountedRef.current) setGroups(v); }, []);
  const setSafeOpenGrupo = useCallback((v) => { if (mountedRef.current) setOpenGrupo(v); }, []);
  const setSafeLoadingBounds = useCallback((v) => { if (mountedRef.current) setLoadingBounds(v); }, []);
  const setSafeBounds = useCallback((v) => { if (mountedRef.current) setBounds(v); }, []);


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
          if (Number.isFinite(Number(saved.openGrupo))) setSafeOpenGrupo(Number(saved.openGrupo));
        }
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    [
      "Domingo",
      "Segunda-Feira",
      "Terça-Feira",
      "Quarta-Feira",
      "Quinta-Feira",
      "Sexta-Feira",
      "Sábado",
    ].forEach((x) => out.push({ v: x, label: x }));
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
      setSafeLoadingBounds(true);
      setSafeError("");
      try {
        const b = await getKingBoundsByUf({ uf: LOTTERY_KEY });
        if (!alive) return;
        setSafeBounds({
          minYmd: b?.minYmd || null,
          maxYmd: b?.maxYmd || null,
          source: b?.source || "",
        });
      } catch (e) {
        if (!alive) return;
        setSafeError(String(e?.message || e));
      } finally {
        if (alive) setSafeLoadingBounds(false);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

    setSafeLoading(true);
    setSafeError("");
    setSafeProgress({ done: 0, total: 0, label: "" });

    try {
      if (!boundsReady) {
        setSafeError("Bounds ainda não carregaram.");
        return;
      }

      const cachedBase = baseCacheRef.current.get(buildBaseKey);
      let entriesBase = cachedBase?.entries || null;

      if (!entriesBase) {
        const chunks = splitRangeIntoChunks(bounds.minYmd, bounds.maxYmd, CHUNK_DAYS);
        setSafeProgress({ done: 0, total: chunks.length, label: "Carregando histórico..." });

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

          // (A) caminho 1: draws vêm hidratados com prizes (quando existir)
          const coveredKeys = new Set(); // ymd#bucket
          for (const d of drawsChunk || []) {
            const ymd = pickDrawYmd(d);
            if (!ymd) continue;

            const hrRaw = pickDrawHour(d);
            const hourNorm = normalizeHourLike(hrRaw);
            const hourBucket = toHourBucketHH00(hourNorm);

            const prizes = Array.isArray(d?.prizes) ? d.prizes : null;
            if (prizes && prizes.length) {
              const key = `${ymd}#${hourBucket || "??"}`;
              coveredKeys.add(key);
              entries.push({ ymd, hourNorm, hourBucket, prizes });
            }
          }

          // (B) caminho 2: COMPLEMENTA usando prizesFlat agrupadas por (ymd + hourBucket)
          if (Array.isArray(prizesFlat) && prizesFlat.length) {
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

            // adiciona SOMENTE as chaves não cobertas por draws hidratados
            for (const [key, val] of map.entries()) {
              if (coveredKeys.has(key)) continue;
              if (val?.prizes?.length) entries.push(val);
            }
          }

          setSafeProgress((p) => ({
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

      setSafeGroups(out);

      // ✅ NÃO usa openGrupo (state) como dep: usa ref
      const openWanted = !isTodos(fAnimal) ? Number(fAnimal) : Number(openGrupoRef.current);

      if (Number.isFinite(openWanted) && out.find((x) => x.grupo === openWanted)) {
        setSafeOpenGrupo(openWanted);
      } else if (out[0]?.grupo) {
        setSafeOpenGrupo(out[0].grupo);
      }
    } catch (e) {
      setSafeError(String(e?.message || e));
    } finally {
      if (!abortedRef.current) setSafeLoading(false);
      setSafeProgress((p) => ({ ...p, label: "" }));
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
    setSafeLoading,
    setSafeError,
    setSafeProgress,
    setSafeGroups,
    setSafeOpenGrupo
  ]);

  useEffect(() => {
    if (!boundsReady) return;
    build();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boundsReady]);

  useEffect(() => {
    if (!boundsReady) return;
    if (autoTimerRef.current) clearTimeout(autoTimerRef.current);
    autoTimerRef.current = setTimeout(() => {
      if (!mountedRef.current) return;
      build();
    }, 220);
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
const progressPct = useMemo(() => {
    const total = Number(progress?.total || 0);
    const done = Number(progress?.done || 0);
    if (!total) return 0;
    return Math.max(0, Math.min(100, Math.round((done / total) * 100)));
  }, [progress]);

  return (
    <div className="cx0_wrap">
      

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
            <select className="cx0_sel" value={fDiaSemana} onChange={(e) => setFDiaSemana(String(e.target.value || "Todos"))}>
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







