// src/pages/Search/Search.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getKingBoundsByUf, getKingResultsByRange } from "../../services/kingResultsService";
import { getAnimalLabel as getAnimalLabelFn, getImgFromGrupo as getImgFromGrupoFn } from "../../constants/bichoMap";
import SearchResultsTable from "../Dashboard/components/SearchResultsTable";

/**
 * Search — Premium (SEM índice)
 * - 2 dígitos => dezena (últimos 2)  ✅ preserva zero à esquerda
 * - 3 dígitos => centena (últimos 3) ✅ preserva zero à esquerda
 * - 4 dígitos => milhar (4)         ✅ preserva zero à esquerda
 *
 * ✅ REGRA GLOBAL DO PROJETO:
 * - 7º prêmio = CENTENA (3 dígitos) e NÃO pode virar 4 dígitos.
 * - Nenhum zero à esquerda pode ser ignorado.
 *
 * ✅ UI:
 * - Mantém apenas 1 card, com 1 bloco: "OCORRÊNCIAS"
 *
 * ✅ PERF:
 * - Busca em chunks maiores (60 dias) + concorrência limitada
 * - Renderiza resultados de forma incremental
 */

function pad2(n) {
  return String(n).padStart(2, "0");
}

function safeStr(v) {
  return String(v ?? "").trim();
}

function isYMD(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || "").trim());
}

function normalizeDigitsOnly(v) {
  return String(v ?? "").replace(/\D+/g, "");
}

/**
 * ✅ Extrai os ÚLTIMOS N dígitos e preserva zero à esquerda.
 * - Não converte para Number em nenhum momento.
 */
function extractLastNDigits(v, n) {
  const digits = normalizeDigitsOnly(v);
  if (!digits) return null;
  const last = digits.slice(-n).padStart(n, "0");
  const re = new RegExp(`^\\d{${n}}$`);
  return re.test(last) ? last : null;
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

// Bucket "09h", "11h"…
function toHourBucket(value) {
  const s = String(value ?? "").trim();
  if (!s || s.toLowerCase() === "todos") return null;

  const mh = s.match(/^(\d{1,2})h$/i);
  if (mh) return `${pad2(mh[1])}h`;

  const m1 = s.match(/^(\d{1,2}):(\d{2})$/);
  if (m1) return `${pad2(m1[1])}h`;

  const m2 = s.match(/^(\d{1,2})$/);
  if (m2) return `${pad2(m2[1])}h`;

  const m3 = s.match(/^(\d{1,2}):(\d{2}):(\d{2})$/);
  if (m3) return `${pad2(m3[1])}h`;

  return null;
}

// Dia da semana por UTC
function dowFromYmdUTC(ymd) {
  if (!isYMD(ymd)) return "";
  const [y, m, d] = ymd.split("-").map((x) => Number(x));
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = dt.getUTCDay();
  const labels = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  return labels[dow] || "";
}

function monthLabelPTBR(ymd) {
  if (!isYMD(ymd)) return "";
  const mm = Number(ymd.slice(5, 7));
  const labels = ["", "Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  return labels[mm] || "";
}

function normalizeYmdAny(v) {
  const s = safeStr(v);
  if (!s) return "";
  if (isYMD(s)) return s;

  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m && isYMD(m[1])) return m[1];

  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;

  return "";
}

function buildQueryInfo(rawQuery) {
  const digits = normalizeDigitsOnly(rawQuery).slice(0, 4);
  const len0 = digits.length;

  if (len0 < 2) return { digits, len: len0, kind: "vazio" };
  if (len0 === 2) return { digits, len: 2, kind: "dezena" };
  if (len0 === 3) return { digits, len: 3, kind: "centena" };
  return { digits, len: 4, kind: "milhar" };
}

/* =========================
   Range helpers (chunk)
========================= */

function ymdToUtcDate(ymd) {
  if (!isYMD(ymd)) return null;
  const [y, m, d] = ymd.split("-").map((x) => Number(x));
  const dt = new Date(Date.UTC(y, m - 1, d));
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function utcDateToYmd(dt) {
  const y = dt.getUTCFullYear();
  const m = pad2(dt.getUTCMonth() + 1);
  const d = pad2(dt.getUTCDate());
  return `${y}-${m}-${d}`;
}

function addDaysUtc(ymd, days) {
  const dt = ymdToUtcDate(ymd);
  if (!dt) return null;
  dt.setUTCDate(dt.getUTCDate() + Number(days || 0));
  return utcDateToYmd(dt);
}

function splitRangeYmd(from, to, chunkDays = 60) {
  if (!isYMD(from) || !isYMD(to)) return [];
  if (from > to) return [];

  const out = [];
  let cur = from;

  while (cur <= to) {
    const endCandidate = addDaysUtc(cur, chunkDays - 1);
    const end = endCandidate && endCandidate < to ? endCandidate : to;
    out.push({ from: cur, to: end });
    const next = addDaysUtc(end, 1);
    if (!next) break;
    cur = next;
  }
  return out;
}

/* =========================
   prizes fallback (compat)
========================= */

function pickFromMany(obj, keys) {
  for (const k of keys) {
    const v = obj?.[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return v;
  }
  return null;
}

function pickFromArrayLike(arr, idx1based) {
  if (!Array.isArray(arr)) return null;
  const i = Number(idx1based) - 1;
  if (i < 0 || i >= arr.length) return null;
  return arr[i];
}

/**
 * ✅ Extrai número do prêmio por POSIÇÃO respeitando regra global:
 * - pos 7 => centena (3 dígitos)
 * - demais => milhar (4 dígitos)
 */
function pickPrizeDigits(draw, pos) {
  const i = Number(pos);
  const wantLen = i === 7 ? 3 : 4;

  const directKeys = [
    `p${i}`,
    `p_${i}`,
    `premio${i}`,
    `premio_${i}`,
    `milhar${i}`,
    `milhar_${i}`,
    `numero${i}`,
    `numero_${i}`,
    `resultado${i}`,
    `resultado_${i}`,
    `res${i}`,
    `res_${i}`,
    i === 7 ? `centena3` : `milhar4`,
  ];

  const vDirect = pickFromMany(draw, directKeys);
  const lDirect = extractLastNDigits(vDirect, wantLen);
  if (lDirect) return lDirect;

  const arrays = [draw?.p, draw?.ps, draw?.premios, draw?.resultados, draw?.numbers, draw?.numeros, draw?.milhares];

  for (const a of arrays) {
    const v = pickFromArrayLike(a, i);
    const l = extractLastNDigits(v, wantLen);
    if (l) return l;
  }

  const dicts = [draw?.premios, draw?.resultado, draw?.resultados, draw?.p];
  for (const d of dicts) {
    if (d && typeof d === "object" && !Array.isArray(d)) {
      const v = d?.[String(i)] ?? d?.[i];
      const l = extractLastNDigits(v, wantLen);
      if (l) return l;
    }
  }

  const payload = draw?.raw || draw?.data || draw?.payload || draw?.doc || draw?.original || null;

  if (payload && typeof payload === "object") {
    const v = pickFromMany(payload, directKeys);
    const l = extractLastNDigits(v, wantLen);
    if (l) return l;

    const payloadArrays = [payload?.p, payload?.premios, payload?.resultados, payload?.numbers];
    for (const a of payloadArrays) {
      const vv = pickFromArrayLike(a, i);
      const ll = extractLastNDigits(vv, wantLen);
      if (ll) return ll;
    }
  }

  return null;
}

function pickPrizeGrupo(draw, pos) {
  const i = Number(pos);

  const directKeys = [
    `grupo${i}`,
    `grupo_${i}`,
    `grupo2${i}`,
    `grupo2_${i}`,
    `bicho${i}`,
    `bicho_${i}`,
    `animal_grupo${i}`,
    `animal_grupo_${i}`,
  ];

  const vDirect = pickFromMany(draw, directKeys);
  const nDirect = Number(vDirect);
  if (Number.isFinite(nDirect)) return nDirect;

  const arrays = [draw?.grupos, draw?.grupo, draw?.grupo2, draw?.bichos, draw?.animais];
  for (const a of arrays) {
    const v = pickFromArrayLike(a, i);
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }

  const dicts = [draw?.grupos, draw?.grupo, draw?.grupo2, draw?.bichos];
  for (const d of dicts) {
    if (d && typeof d === "object" && !Array.isArray(d)) {
      const v = d?.[String(i)] ?? d?.[i];
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
  }

  const payload = draw?.raw || draw?.data || draw?.payload || draw?.doc || draw?.original || null;

  if (payload && typeof payload === "object") {
    const v = pickFromMany(payload, directKeys);
    const n = Number(v);
    if (Number.isFinite(n)) return n;

    const payloadArrays = [payload?.grupos, payload?.grupo, payload?.grupo2, payload?.bichos];
    for (const a of payloadArrays) {
      const vv = pickFromArrayLike(a, i);
      const nn = Number(vv);
      if (Number.isFinite(nn)) return nn;
    }
  }

  return null;
}

function pickPrizeFromDrawByPos(draw, pos) {
  const i = Number(pos);
  const digits = pickPrizeDigits(draw, i);
  const grupo = pickPrizeGrupo(draw, i);

  if (!digits && !Number.isFinite(Number(grupo))) return null;

  return {
    position: i,
    grupo: Number.isFinite(Number(grupo)) ? Number(grupo) : null,
    numero: digits,
    milhar4: digits && digits.length === 4 ? digits : null,
    centena3: digits && digits.length === 3 ? digits : null,
    milhar: digits && digits.length === 4 ? digits : null,
  };
}

function ensurePrizes(draw) {
  const arr = Array.isArray(draw?.prizes) ? draw.prizes : [];
  if (arr.length) return arr;

  const out = [];
  for (let pos = 1; pos <= 7; pos += 1) {
    const p = pickPrizeFromDrawByPos(draw, pos);
    if (p) out.push(p);
  }
  return out;
}

function normalizeDrawsResponse(res) {
  if (Array.isArray(res)) return res;
  const cand = res?.draws ?? res?.results ?? res?.data ?? res?.items ?? res?.docs ?? res?.rows ?? null;
  return Array.isArray(cand) ? cand : [];
}

/* =========================
   UI: input premium (overlay só nos slots)
========================= */

function buildSlots(digits) {
  const d = String(digits || "").slice(0, 4);
  const len = d.length;

  if (len < 2) return ["", "", "", ""];

  const slots = ["", "", "", ""];

  if (len === 2) {
    slots[0] = "*";
    slots[1] = "*";
    slots[2] = d[0];
    slots[3] = d[1];
    return slots;
  }

  if (len === 3) {
    slots[0] = "*";
    slots[1] = d[0];
    slots[2] = d[1];
    slots[3] = d[2];
    return slots;
  }

  slots[0] = d[0];
  slots[1] = d[1];
  slots[2] = d[2];
  slots[3] = d[3];
  return slots;
}

function SearchDigitsInput({ value, onChange, loading, onBuscar, onLimpar, canSearch, showLimpar }) {
  const digits = normalizeDigitsOnly(value).slice(0, 4);
  const slots = useMemo(() => buildSlots(digits), [digits]);
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div className="ppDigitsRoot" role="group" aria-label="Consulta de dezena/centena/milhar">
      <div className="ppDigitsTitle">Digite a dezena / centena / milhar</div>

      <div className="ppDigitsCapture" onMouseDown={() => inputRef.current?.focus()}>
        <input
          ref={inputRef}
          className="ppDigitsOverlayInput"
          inputMode="numeric"
          autoComplete="off"
          value={digits}
          onChange={(e) => onChange(normalizeDigitsOnly(e.target.value).slice(0, 4))}
          aria-label="Digite 2, 3 ou 4 dígitos"
        />

        <div className="ppDigitsSlots" aria-hidden="true">
          {slots.map((ch, idx) => (
            <div key={idx} className="ppDigitsSlot">
              {ch ? <span className="ppDigitsChar">{ch}</span> : <span className="ppDigitsDot">•</span>}
            </div>
          ))}
        </div>
      </div>

      <div className="ppDigitsHint">Digite 2, 3 ou 4 dígitos (ex: 00 / 000 / 0000)</div>

      <div className="ppDigitsActions">
        <button
          type="button"
          className="ppBtn ppBtnPrimary"
          onClick={onBuscar}
          disabled={!canSearch}
          title={canSearch ? "Buscar" : "Digite 2, 3 ou 4 dígitos"}
        >
          {loading ? "Buscando..." : "Buscar"}
        </button>

        <button type="button" className="ppBtn" onClick={onLimpar} disabled={!showLimpar || loading} title="Limpar busca">
          Limpar
        </button>
      </div>
    </div>
  );
}

/* =========================
   Pool (concorrência limitada)
========================= */

async function runPool(items, worker, concurrency = 3) {
  const queue = [...items];
  const runners = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (queue.length) {
      const it = queue.shift();
      // eslint-disable-next-line no-await-in-loop
      await worker(it);
    }
  });
  await Promise.all(runners);
}

export default function Search() {
  const LOTTERY_KEY = "PT_RIO";

  const getAnimalLabel = useMemo(() => getAnimalLabelFn, []);
  const getImgFromGrupo = useMemo(() => getImgFromGrupoFn, []);

  const [bounds, setBounds] = useState({ minYmd: null, maxYmd: null, source: "" });
  const boundsReady = !!(bounds?.minYmd && bounds?.maxYmd);

  const [range, setRange] = useState({ from: "", to: "" });

  const [mes, setMes] = useState("Todos");
  const [diaMes, setDiaMes] = useState("Todos");
  const [diaSemana, setDiaSemana] = useState("Todos");
  const [horario, setHorario] = useState("Todos");
  const [animal, setAnimal] = useState("Todos");
  const [posicao, setPosicao] = useState("Todos");

  const [queryDraft, setQueryDraft] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [matches, setMatches] = useState([]);

  const runIdRef = useRef(0);
  const abortedRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortedRef.current = true;
      runIdRef.current += 1;
    };
  }, []);

  // Bounds
  useEffect(() => {
    let alive = true;

    (async () => {
      setError("");
      setBounds({ minYmd: null, maxYmd: null, source: "" });

      try {
        const b = await getKingBoundsByUf({ uf: LOTTERY_KEY });
        if (!alive) return;

        const minYmd = b?.minYmd || null;
        const maxYmd = b?.maxYmd || null;

        setBounds({ minYmd, maxYmd, source: b?.source || "" });

        if (minYmd && maxYmd) {
          setRange({ from: minYmd, to: maxYmd });
        } else {
          setError(`Bounds não encontrados para "${LOTTERY_KEY}". Fonte: ${String(b?.source || "")}`);
        }
      } catch (e) {
        if (!alive) return;
        setError(String(e?.message || e));
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  const animalOptions = useMemo(() => {
    const out = ["Todos"];
    for (let g = 1; g <= 25; g += 1) out.push(getAnimalLabel(g) || `Grupo ${pad2(g)}`);
    return out;
  }, [getAnimalLabel]);

  const selectedCloseHourBucket = useMemo(() => {
    if (!horario || horario === "Todos") return null;
    return toHourBucket(horario);
  }, [horario]);

  const selectedPositions = useMemo(() => {
    if (!posicao || posicao === "Todos") return null;
    const n = Number(String(posicao).replace(/\D+/g, ""));
    if (Number.isFinite(n) && n >= 1 && n <= 7) return [n];
    return null;
  }, [posicao]);

  const selectedGrupoFromAnimal = useMemo(() => {
    if (!animal || animal === "Todos") return null;
    for (let g = 1; g <= 25; g += 1) {
      const lbl = getAnimalLabel(g) || "";
      if (String(lbl).toUpperCase() === String(animal).toUpperCase()) return g;
    }
    return null;
  }, [animal, getAnimalLabel]);

  const safeRange = useMemo(() => {
    const from = isYMD(range?.from) ? range.from : bounds?.minYmd || "";
    const to = isYMD(range?.to) ? range.to : bounds?.maxYmd || "";
    return { from, to };
  }, [range, bounds]);

  const runSearch = useCallback(async () => {
    const runId = (runIdRef.current += 1);
    abortedRef.current = false;

    const safeOk = () => mountedRef.current && runIdRef.current === runId && !abortedRef.current;

    const safeSet = (fn) => {
      if (!safeOk()) return false;
      fn();
      return true;
    };

    safeSet(() => {
      setLoading(true);
      setError("");
      setMatches([]);
    });

    try {
      if (!boundsReady) {
        safeSet(() => setError("Bounds ainda não carregaram."));
        return;
      }

      const { from, to } = safeRange;
      if (!isYMD(from) || !isYMD(to)) {
        safeSet(() => setError("Intervalo inválido."));
        return;
      }

      const qi = buildQueryInfo(queryDraft);
      if (qi.len < 2) {
        safeSet(() => setMatches([]));
        return;
      }

      // ✅ chunk maior = menos chamadas
      const chunks = splitRangeYmd(from, to, 60);
      if (!chunks.length) {
        safeSet(() => setError("Intervalo inválido (chunks vazios)."));
        return;
      }

      const qDigits = String(qi.digits || "");
      const qLen = qi.len;
      const q4 = qLen === 4 ? qDigits.slice(0, 4).padStart(4, "0") : null;

      let allHits = [];

      const pushHitsIncremental = (newHits) => {
        if (!newHits.length) return;
        allHits = allHits.concat(newHits);
        // atualiza incrementalmente sem travar a UI
        safeSet(() => setMatches([...allHits]));
      };

      const worker = async (ch) => {
        if (!safeOk()) return;

        const res = await getKingResultsByRange({
          uf: LOTTERY_KEY,
          dateFrom: ch.from,
          dateTo: ch.to,
          closeHourBucket: selectedCloseHourBucket || null,
          closeHour: selectedCloseHourBucket ? `${String(selectedCloseHourBucket).slice(0, 2)}:00` : null,
          positions: selectedPositions || null,
          mode: "detailed",
        });

        if (!safeOk()) return;

        const drawsArr = normalizeDrawsResponse(res);
        const chunkHits = [];

        for (const d of drawsArr) {
          const ymd = normalizeYmdAny(d?.ymd || d?.dateYmd || d?.date || d?.data || "");
          if (!isYMD(ymd)) continue;

          const closeRaw = normalizeHourLike(d?.close_hour || d?.closeHour || d?.hour || d?.hora || "");
          const closeBucket = toHourBucket(closeRaw) || toHourBucket(d?.close_hour_bucket) || null;

          // ✅ filtro por bucket (se selecionado)
          if (selectedCloseHourBucket) {
            const b = closeBucket || toHourBucket(closeRaw);
            if (b !== selectedCloseHourBucket) continue;
          }

          const prizes = ensurePrizes(d);

          for (const p of prizes) {
            const grupo = Number(p?.grupo);
            const position = Number(p?.position);

            const wantLen = position === 7 ? 3 : 4;

            const prizeDigits =
              (wantLen === 3
                ? extractLastNDigits(p?.centena3, 3) ||
                  extractLastNDigits(p?.numero, 3) ||
                  extractLastNDigits(p?.milhar, 3) ||
                  extractLastNDigits(p?.milhar4, 3)
                : extractLastNDigits(p?.milhar4, 4) ||
                  extractLastNDigits(p?.milhar, 4) ||
                  extractLastNDigits(p?.numero, 4) ||
                  extractLastNDigits(p?.number, 4) ||
                  extractLastNDigits(p?.num, 4) ||
                  extractLastNDigits(p?.valor, 4) ||
                  extractLastNDigits(p?.n, 4)) || null;

            // filtros locais
            if (mes && mes !== "Todos") {
              if (monthLabelPTBR(ymd) !== mes) continue;
            }
            if (diaMes && diaMes !== "Todos") {
              const dd = Number(ymd.slice(8, 10));
              if (String(dd) !== String(diaMes)) continue;
            }
            if (diaSemana && diaSemana !== "Todos") {
              if (dowFromYmdUTC(ymd) !== diaSemana) continue;
            }
            if (selectedGrupoFromAnimal != null) {
              if (Number(grupo) !== Number(selectedGrupoFromAnimal)) continue;
            }
            if (Array.isArray(selectedPositions) && selectedPositions.length) {
              if (!selectedPositions.includes(Number(position))) continue;
            }

            if (!prizeDigits) continue;

            if (qLen === 2) {
              if (prizeDigits.slice(-2) !== qDigits) continue;
            } else if (qLen === 3) {
              if (prizeDigits.length === 3) {
                if (prizeDigits !== qDigits) continue;
              } else {
                if (prizeDigits.slice(-3) !== qDigits) continue;
              }
            } else {
              if (prizeDigits.length !== 4) continue; // impede 7º
              if (prizeDigits !== q4) continue;
            }

            // ✅ Hora exibida = bucket padrão (09h/11h/14h…)
            const closeHourDisplay = closeBucket || toHourBucket(closeRaw) || closeRaw || "";

            chunkHits.push({
              ymd,
              close_hour: closeHourDisplay, // <<<<<< padrão bucket
              position: Number.isFinite(position) ? position : null,
              grupo: Number.isFinite(grupo) ? grupo : null,
              numero: prizeDigits,
              milhar4: prizeDigits.length === 4 ? prizeDigits : null,
              centena3: prizeDigits.length === 3 ? prizeDigits : null,
              raw: p,
              draw: d,
            });
          }
        }

        pushHitsIncremental(chunkHits);
      };

      // ✅ concorrência limitada (ajuste: 3 ou 4)
      await runPool(chunks, worker, 3);

      if (!safeOk()) return;

      // ordena no final
      allHits.sort((a, b) => {
        const ya = String(a.ymd || "");
        const yb = String(b.ymd || "");
        if (ya !== yb) return yb.localeCompare(ya);

        const ha = String(a.close_hour || "");
        const hb = String(b.close_hour || "");
        if (ha !== hb) return hb.localeCompare(ha);

        const pa = a.position ?? 99;
        const pb = b.position ?? 99;
        return pa - pb;
      });

      safeSet(() => setMatches([...allHits]));
    } catch (e) {
      safeSet(() => setError(String(e?.message || e)));
    } finally {
      if (!mountedRef.current) return;
      if (runIdRef.current !== runId) return;
      setLoading(false);
    }
  }, [
    LOTTERY_KEY,
    boundsReady,
    safeRange,
    selectedCloseHourBucket,
    selectedPositions,
    mes,
    diaMes,
    diaSemana,
    selectedGrupoFromAnimal,
    queryDraft,
  ]);

  const onClickLimpar = useCallback(() => {
    abortedRef.current = true;
    runIdRef.current += 1;

    setLoading(false);
    setError("");
    setQueryDraft("");
    setMatches([]);
  }, []);

  const canSearch = useMemo(() => boundsReady && !loading && buildQueryInfo(queryDraft).len >= 2, [
    boundsReady,
    loading,
    queryDraft,
  ]);

  const showLimpar = useMemo(() => normalizeDigitsOnly(queryDraft).length > 0 || matches.length > 0, [
    queryDraft,
    matches.length,
  ]);

  return (
    <div className="ppSearch">
      <style>{`
        .ppSearch{
          width:100%;
          height:calc(100vh - 24px);
          padding:14px 14px 10px;
          color:#e9e9e9;
          display:flex;
          flex-direction:column;
          gap:12px;
          overflow:hidden;
          min-height:0;
        }

        .ppSearchPanel{
          border-radius:18px;
          border:1px solid rgba(202,166,75,0.16);
          background:
            radial-gradient(1000px 500px at 20% 0%, rgba(202,166,75,0.08), transparent 55%),
            radial-gradient(900px 500px at 85% 20%, rgba(255,255,255,0.05), transparent 50%),
            rgba(0,0,0,0.45);
          box-shadow:0 20px 60px rgba(0,0,0,0.45);
          overflow:hidden;
          flex:1 1 auto;
          min-height:0;
          display:flex;
          flex-direction:column;
        }

        .ppSearchControls{
          display:flex;
          flex-wrap:wrap;
          align-items:center;
          justify-content:center;
          gap:10px;
          padding:12px;
          border-bottom:1px solid rgba(255,255,255,0.06);
        }

        .ppCtl{
          display:inline-flex; align-items:center; gap:8px;
          padding:6px 10px;
          border-radius:999px;
          background:rgba(0,0,0,0.55);
          border:1px solid rgba(202,166,75,0.18);
          box-shadow:0 10px 30px rgba(0,0,0,0.35);
        }
        .ppCtl label{ font-size:10px; color:rgba(233,233,233,0.62); }
        .ppCtl select, .ppCtl input[type="date"]{
          background:transparent; border:none; outline:none;
          color:#e9e9e9; font-weight:900; font-size:12px;
        }
        .ppCtl select option{ background:#0b0b0b; color:#e9e9e9; }

        .ppErr{
          margin:0 12px 12px;
          padding:9px 11px; border-radius:12px;
          border:1px solid rgba(255,80,80,0.25);
          background:rgba(255,80,80,0.08);
          color:rgba(255,220,220,0.92);
          white-space:pre-wrap;
          font-size:12px;
        }

        .ppSearchBody{
          padding:12px;
          display:flex;
          flex-direction:column;
          gap:12px;
          min-height:0;
          flex:1 1 auto;
          overflow:hidden;
        }

        .ppTopRow{
          display:flex;
          gap:12px;
          flex-wrap:wrap;
          align-items:stretch;
        }

        .ppLeftCard{
          flex:1 1 680px;
          min-width:360px;
          border-radius:18px;
          border:1px solid rgba(202,166,75,0.18);
          background:linear-gradient(180deg, rgba(0,0,0,0.62), rgba(0,0,0,0.44));
          box-shadow:0 18px 50px rgba(0,0,0,0.38);
          overflow:hidden;
        }

        .ppLeftCardBody{
          padding:14px;
        }

        .ppDigitsRoot{
          display:flex;
          flex-direction:column;
          align-items:center;
          gap:10px;
          padding:10px 8px 6px;
          border-radius:14px;
          border:1px solid rgba(202,166,75,0.14);
          background:rgba(0,0,0,0.35);
          box-shadow:0 16px 40px rgba(0,0,0,0.35);
          position:relative;
        }

        .ppDigitsTitle{
          font-size:12px;
          font-weight:950;
          letter-spacing:0.8px;
          text-transform:uppercase;
          color:rgba(233,233,233,0.9);
        }

        .ppDigitsCapture{
          position:relative;
          display:flex;
          align-items:center;
          justify-content:center;
        }

        .ppDigitsOverlayInput{
          position:absolute;
          inset:0;
          width:100%;
          height:100%;
          opacity:0;
          border:none;
          outline:none;
          background:transparent;
          color:transparent;
          caret-color:transparent;
          pointer-events:auto;
        }

        .ppDigitsSlots{
          display:flex;
          gap:10px;
          align-items:center;
          justify-content:center;
          padding:2px 0;
        }

        .ppDigitsSlot{
          width:46px;
          height:46px;
          border-radius:12px;
          border:1px solid rgba(202,166,75,0.22);
          background:rgba(0,0,0,0.55);
          box-shadow:0 14px 34px rgba(0,0,0,0.32);
          display:flex;
          align-items:center;
          justify-content:center;
          user-select:none;
        }

        .ppDigitsDot{
          opacity:0.35;
          font-size:18px;
          transform:translateY(-1px);
        }

        .ppDigitsChar{
          font-size:18px;
          font-weight:950;
          letter-spacing:0.6px;
        }

        .ppDigitsHint{
          font-size:12px;
          opacity:0.65;
        }

        .ppDigitsActions{
          position:relative;
          z-index:5;
          display:flex;
          gap:10px;
          justify-content:center;
          padding-top:6px;
        }

        .ppOccRow{
          margin-top:12px;
          padding-top:12px;
          border-top:1px solid rgba(255,255,255,0.06);
          display:flex;
          align-items:center;
          justify-content:flex-start;
          gap:10px;
        }
        .ppOccLabel{
          font-size:10px;
          letter-spacing:0.7px;
          text-transform:uppercase;
          color:rgba(233,233,233,0.62);
          font-weight:900;
        }
        .ppOccValue{
          font-size:18px;
          font-weight:950;
          color:#caa64b;
          letter-spacing:0.2px;
        }

        .ppBtn{
          cursor:pointer; border-radius:999px; padding:10px 14px;
          font-weight:900; font-size:12px; letter-spacing:0.4px;
          background:rgba(0,0,0,0.60); color:#e9e9e9;
          border:1px solid rgba(202,166,75,0.30);
          box-shadow:0 12px 34px rgba(0,0,0,0.35);
          transition:transform 0.08s ease, border-color 0.12s ease, background 0.12s ease;
          line-height:1;
          white-space:nowrap;
        }
        .ppBtn:hover{ transform:translateY(-1px); border-color:rgba(202,166,75,0.55); background:rgba(0,0,0,0.72); }
        .ppBtn:disabled{ opacity:0.55; cursor:not-allowed; transform:none; }

        .ppBtnPrimary{
          background:rgba(202,166,75,0.14);
          border:1px solid rgba(202,166,75,0.50);
        }
        .ppBtnPrimary:hover{
          background:rgba(202,166,75,0.20);
          border-color:rgba(202,166,75,0.70);
        }
      `}</style>

      <div className="ppSearchPanel">
        <div className="ppSearchControls">
          <div className="ppCtl">
            <label>De</label>
            <input
              type="date"
              value={safeRange.from}
              min={bounds?.minYmd || undefined}
              max={bounds?.maxYmd || undefined}
              onChange={(e) => setRange((r) => ({ ...r, from: String(e.target.value || "") }))}
            />
          </div>

          <div className="ppCtl">
            <label>Até</label>
            <input
              type="date"
              value={safeRange.to}
              min={bounds?.minYmd || undefined}
              max={bounds?.maxYmd || undefined}
              onChange={(e) => setRange((r) => ({ ...r, to: String(e.target.value || "") }))}
            />
          </div>

          <div className="ppCtl">
            <label>Mês</label>
            <select value={mes} onChange={(e) => setMes(String(e.target.value || "Todos"))}>
              {["Todos", "Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"].map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </div>

          <div className="ppCtl">
            <label>Dia</label>
            <select value={diaMes} onChange={(e) => setDiaMes(String(e.target.value || "Todos"))}>
              {["Todos", ...Array.from({ length: 31 }, (_, i) => String(i + 1))].map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </div>

          <div className="ppCtl">
            <label>Semana</label>
            <select value={diaSemana} onChange={(e) => setDiaSemana(String(e.target.value || "Todos"))}>
              {["Todos", "Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </div>

          <div className="ppCtl">
            <label>Horário</label>
            <select value={horario} onChange={(e) => setHorario(String(e.target.value || "Todos"))}>
              {["Todos", "09:00", "11:00", "14:00", "16:00", "18:00", "21:00"].map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </div>

          <div className="ppCtl">
            <label>Animal</label>
            <select value={animal} onChange={(e) => setAnimal(String(e.target.value || "Todos"))}>
              {animalOptions.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </div>

          <div className="ppCtl">
            <label>Posição</label>
            <select value={posicao} onChange={(e) => setPosicao(String(e.target.value || "Todos"))}>
              {["Todos", "1º", "2º", "3º", "4º", "5º", "6º", "7º"].map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </div>
        </div>

        {error ? <div className="ppErr">{error}</div> : null}

        <div className="ppSearchBody">
          <div className="ppTopRow">
            <div className="ppLeftCard">
              <div className="ppLeftCardBody">
                <SearchDigitsInput
                  value={queryDraft}
                  onChange={setQueryDraft}
                  loading={loading}
                  canSearch={canSearch}
                  showLimpar={showLimpar}
                  onBuscar={runSearch}
                  onLimpar={onClickLimpar}
                />

                <div className="ppOccRow">
                  <div className="ppOccLabel">Ocorrências</div>
                  <div className="ppOccValue">{String(matches.length)}</div>
                </div>
              </div>
            </div>
          </div>

          <SearchResultsTable rows={matches} getAnimalLabel={getAnimalLabel} getImgFromGrupo={getImgFromGrupo} />
        </div>
      </div>
    </div>
  );
}
