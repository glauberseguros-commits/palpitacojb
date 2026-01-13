// src/pages/Late/Late.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  getKingBoundsByUf,
  getKingResultsByRange,
} from "../../services/kingResultsService";
import {
  getAnimalLabel as getAnimalLabelFn,
  getImgFromGrupo as getImgFromGrupoFn,
} from "../../constants/bichoMap";

/**
 * Late (Atrasados) — Premium
 * ✅ Mais justo + mais centralizado
 * ✅ Colunas centralizadas (texto/valores)
 * ✅ Grupo sem duplicidade (remove parênteses)
 *
 * ✅ CRITÉRIO DE DESEMPATE:
 * - Atraso (dias) DESC
 * - Empate: horário da ÚLTIMA aparição ASC (09:00 antes de 21:00)
 * - Depois: animal (A-Z)
 * - Depois: grupo (crescente)
 */

function pad2(n) {
  return String(n).padStart(2, "0");
}

function todayYMDLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
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

function diffDaysUTC(aYmd, bYmd) {
  const a = ymdToUTCDate(aYmd);
  const b = ymdToUTCDate(bYmd);
  if (!a || !b) return NaN;
  return Math.floor((b.getTime() - a.getTime()) / 86400000);
}

function toGrupo2(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "";
  return pad2(v);
}

function isValidGrupo(n) {
  const v = Number(n);
  return Number.isFinite(v) && v >= 1 && v <= 25;
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

function hourToMinutes(hhmm) {
  const s = normalizeHourLike(hhmm);
  const m = String(s).match(/^(\d{2}):(\d{2})$/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  return hh * 60 + mm;
}

export default function Late() {
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

  // UI
  const [lotteryOptId, setLotteryOptId] = useState("ALL");
  const [kind, setKind] = useState("grupo");
  const [prizeMode, setPrizeMode] = useState("1");
  const [dateYmd, setDateYmd] = useState(todayYMDLocal());

  // Data
  const [bounds, setBounds] = useState({
    minYmd: null,
    maxYmd: null,
    source: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [rows, setRows] = useState([]);

  // meta continua existindo para a lógica (não exibimos mais na UI)
  const [meta, setMeta] = useState({
    scannedDays: 0,
    foundCount: 0,
    stopReason: "",
    lastWindowFrom: "",
    lastWindowTo: "",
    effectiveTargetYmd: "",
  });

  const abortedRef = useRef(false);

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

  const prizePositions = useMemo(() => {
    if (prizeMode === "1-5") return [1, 2, 3, 4, 5];
    const n = Number(prizeMode);
    if (Number.isFinite(n) && n >= 1 && n <= 5) return [n];
    return [1];
  }, [prizeMode]);

  const boundsReady = !!(bounds?.minYmd && bounds?.maxYmd);

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

        if (!minYmd || !maxYmd) {
          setError(
            `Bounds não encontrados para "${LOTTERY_KEY}".\n` +
              `Isso indica mismatch de chave ou base vazia.\n` +
              `Fonte: ${String(b?.source || "")}`
          );
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

  function getEffectiveTargetYmd(targetYmd) {
    if (!bounds?.minYmd || !bounds?.maxYmd || !isYMD(targetYmd)) {
      return { effective: targetYmd, note: "" };
    }

    const minYmd = bounds.minYmd;
    const maxYmd = bounds.maxYmd;

    if (targetYmd < minYmd)
      return {
        effective: minYmd,
        note: `Data fora do bounds. Usando ${ymdToBR(minYmd)}.`,
      };
    if (targetYmd > maxYmd)
      return {
        effective: maxYmd,
        note: `Data fora do bounds. Usando ${ymdToBR(maxYmd)}.`,
      };
    return { effective: targetYmd, note: "" };
  }

  async function buildLateList({ targetYmd }) {
    const BLOCK_DAYS = 14;
    const MAX_SCAN_DAYS = 500;

    const { effective: safeTarget, note } = getEffectiveTargetYmd(targetYmd);
    if (note) setError(note);

    // key: grupo -> { ymd, closeHour }
    const lastByGrupo = new Map();
    const totalGrupos = 25;

    let cursorTo = safeTarget;
    let scannedDays = 0;
    let stopReason = "";
    let lastWindowFrom = "";
    let lastWindowTo = "";

    while (true) {
      if (abortedRef.current) {
        stopReason = "abortado";
        break;
      }
      if (bounds?.minYmd && cursorTo < bounds.minYmd) {
        stopReason = "chegou_no_minDate";
        break;
      }
      if (scannedDays >= MAX_SCAN_DAYS) {
        stopReason = "limite_max_scan";
        break;
      }

      const windowTo = cursorTo;
      const candidateFrom = addDaysUTC(windowTo, -(BLOCK_DAYS - 1));
      const windowFrom = bounds?.minYmd
        ? candidateFrom < bounds.minYmd
          ? bounds.minYmd
          : candidateFrom
        : candidateFrom;

      lastWindowFrom = windowFrom;
      lastWindowTo = windowTo;

      const windowSize = Number.isFinite(diffDaysUTC(windowFrom, windowTo))
        ? diffDaysUTC(windowFrom, windowTo) + 1
        : BLOCK_DAYS;

      scannedDays += windowSize;

      const draws = await getKingResultsByRange({
        uf: LOTTERY_KEY,
        dateFrom: windowFrom,
        dateTo: windowTo,
        closeHour: selectedCloseHour || null,
        positions: prizePositions,
        mode: "detailed",
      });

      const ordered = [...(draws || [])]
        .filter((d) => d?.ymd && d.ymd <= safeTarget)
        .sort((a, b) => {
          const ya = String(a?.ymd || "");
          const yb = String(b?.ymd || "");
          if (ya !== yb) return yb.localeCompare(ya);

          const ha = String(a?.close_hour || "");
          const hb = String(b?.close_hour || "");
          if (ha !== hb) return hb.localeCompare(ha);

          const ia = String(a?.drawId || a?.id || "");
          const ib = String(b?.drawId || b?.id || "");
          return ib.localeCompare(ia);
        });

      for (const d of ordered) {
        if (abortedRef.current) break;

        const ymd = d?.ymd;
        const drawCloseHour = normalizeHourLike(
          d?.close_hour || d?.closeHour || ""
        );

        const prizes = Array.isArray(d?.prizes) ? d.prizes : [];
        for (const p of prizes) {
          const g = Number(p?.grupo);
          if (!isValidGrupo(g)) continue;

          if (!lastByGrupo.has(g)) {
            lastByGrupo.set(g, {
              ymd,
              closeHour: drawCloseHour || "",
            });
          }
        }

        if (lastByGrupo.size >= totalGrupos) break;
      }

      if (lastByGrupo.size >= totalGrupos) {
        stopReason = "todos_encontrados";
        break;
      }

      cursorTo = addDaysUTC(windowFrom, -1);
    }

    const out = [];
    for (let g = 1; g <= 25; g += 1) {
      const rec = lastByGrupo.get(g) || null;
      const lastYmd = rec?.ymd || null;
      const lastCloseHour = rec?.closeHour || "";
      const daysLate = lastYmd ? diffDaysUTC(lastYmd, safeTarget) : null;

      const grupo2 = toGrupo2(g);
      const animalLabel = (getAnimalLabel && getAnimalLabel(g)) || "";
      const img = (getImgFromGrupo && getImgFromGrupo(g)) || "";

      out.push({
        grupo: g,
        grupo2,
        animal: animalLabel,
        img,
        lastYmd,
        lastCloseHour,
        daysLate,
      });
    }

    out.sort((a, b) => {
      const aa = a.daysLate == null ? 999999 : a.daysLate;
      const bb = b.daysLate == null ? 999999 : b.daysLate;

      if (bb !== aa) return bb - aa;

      const ma = hourToMinutes(a.lastCloseHour);
      const mb = hourToMinutes(b.lastCloseHour);

      if (ma != null && mb != null && ma !== mb) return ma - mb;
      if (ma == null && mb != null) return 1;
      if (ma != null && mb == null) return -1;

      const an = sortPTBR(a.animal, b.animal);
      if (an !== 0) return an;

      return a.grupo - b.grupo;
    });

    return {
      rows: out,
      meta: {
        scannedDays,
        foundCount: lastByGrupo.size,
        stopReason,
        lastWindowFrom,
        lastWindowTo,
        effectiveTargetYmd: safeTarget,
      },
    };
  }

  async function refresh() {
    abortedRef.current = false;
    setLoading(true);
    setError("");

    try {
      if (kind !== "grupo") {
        setError(
          "Por enquanto, o modo ativo é apenas: Grupo (os demais entram na próxima etapa)."
        );
        setKind("grupo");
      }

      const result = await buildLateList({ targetYmd: dateYmd });
      if (abortedRef.current) return;

      setRows(result.rows);
      setMeta({
        scannedDays: result.meta.scannedDays,
        foundCount: result.meta.foundCount,
        stopReason: result.meta.stopReason,
        lastWindowFrom: result.meta.lastWindowFrom,
        lastWindowTo: result.meta.lastWindowTo,
        effectiveTargetYmd: result.meta.effectiveTargetYmd,
      });
    } catch (e) {
      if (abortedRef.current) return;
      setError(String(e?.message || e));
    } finally {
      if (!abortedRef.current) setLoading(false);
    }
  }

  useEffect(() => {
    if (!boundsReady) return;
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boundsReady, dateYmd, prizeMode, lotteryOptId]);

  useEffect(() => {
    return () => {
      abortedRef.current = true;
    };
  }, []);

  const titleDateBR = useMemo(() => ymdToBR(dateYmd), [dateYmd]);
  const effectiveDateBR = useMemo(
    () => ymdToBR(meta?.effectiveTargetYmd || ""),
    [meta?.effectiveTargetYmd]
  );

  return (
    <div className="ppLate">
      <style>{`
        .ppLate{
          width:100%;
          height:calc(100vh - 24px);
          padding:14px 14px 10px;
          color:#e9e9e9;
          display:flex;
          flex-direction:column;
          gap:10px;
          overflow:hidden;
          min-height:0;
        }

        .ppLateHeader{ display:grid; grid-template-columns:1fr; gap:8px; flex:0 0 auto; }

        .ppLateTitleWrap{ display:flex; flex-direction:column; align-items:center; justify-content:center; gap:4px; }
        .ppLateTitle{ font-size:20px; font-weight:800; letter-spacing:0.6px; text-transform:uppercase; text-align:center; margin:0; line-height:1.05; }
        .ppLateSubtitle{ font-size:11px; color:rgba(233,233,233,0.72); text-align:center; line-height:1.15; }
        .ppLateSubtitle b{ color:#caa64b; font-weight:800; }

        .ppLateControls{ display:flex; justify-content:center; align-items:center; gap:8px; flex-wrap:wrap; }
        .ppCtl{ display:inline-flex; align-items:center; gap:8px; padding:6px 9px; border-radius:999px; background:rgba(0,0,0,0.55); border:1px solid rgba(202,166,75,0.18); box-shadow:0 10px 30px rgba(0,0,0,0.35); }
        .ppCtl label{ font-size:10px; color:rgba(233,233,233,0.62); }
        .ppCtl select, .ppCtl input[type="date"]{ background:transparent; border:none; outline:none; color:#e9e9e9; font-weight:800; font-size:12px; }
        .ppCtl select option{ background:#0b0b0b; color:#e9e9e9; }

        .ppBtn{
          cursor:pointer; border-radius:999px; padding:7px 12px;
          font-weight:900; font-size:12px; letter-spacing:0.4px;
          background:rgba(0,0,0,0.6); color:#e9e9e9;
          border:1px solid rgba(202,166,75,0.30);
          box-shadow:0 12px 34px rgba(0,0,0,0.35);
          transition:transform 0.08s ease, border-color 0.12s ease, background 0.12s ease;
        }
        .ppBtn:hover{ transform:translateY(-1px); border-color:rgba(202,166,75,0.55); background:rgba(0,0,0,0.72); }
        .ppBtn:disabled{ opacity:0.55; cursor:not-allowed; transform:none; }

        .ppErr{
          padding:9px 11px; border-radius:12px;
          border:1px solid rgba(255,80,80,0.25);
          background:rgba(255,80,80,0.08);
          color:rgba(255,220,220,0.92);
          white-space:pre-wrap;
          font-size:12px;
          flex:0 0 auto;
        }

        .ppLatePanel{
          border-radius:18px;
          border:1px solid rgba(202,166,75,0.16);
          background:radial-gradient(1000px 500px at 20% 0%, rgba(202,166,75,0.08), transparent 55%),
                     radial-gradient(900px 500px at 85% 20%, rgba(255,255,255,0.05), transparent 50%),
                     rgba(0,0,0,0.45);
          box-shadow:0 20px 60px rgba(0,0,0,0.45);
          overflow:hidden;
          flex:1 1 auto;
          min-height:0;
          display:flex;
          flex-direction:column;
        }

        /* =========================================================
           ✅ Tabela centralizada
        ========================================================= */
        .ppLateTableWrap{
          width:100%;
          flex:1 1 auto;
          min-height:0;
          overflow:auto;
          display:flex;
          justify-content:center;
          padding:0 6px;
        }

        .ppLateTable{
          border-collapse:collapse;
          table-layout:fixed;
          width:min(860px, 100%);
          margin:0 auto;
        }

        .ppLateTable thead th,
        .ppLateTable tbody td{
          text-align:center;
        }

        .ppLateTable thead th{
          position:sticky;
          top:0;
          z-index:2;
          background:rgba(0,0,0,0.72);
          backdrop-filter:blur(8px);
          border-bottom:1px solid rgba(255,255,255,0.08);
          padding:9px 10px;
          font-size:10px;
          text-transform:uppercase;
          letter-spacing:0.6px;
          color:rgba(233,233,233,0.72);
          white-space:nowrap;
        }

        .ppLateTable tbody td{
          padding:8px 10px;
          border-bottom:1px solid rgba(255,255,255,0.06);
          font-size:12px;
          color:rgba(233,233,233,0.92);
          white-space:nowrap;
          overflow:hidden;
          text-overflow:ellipsis;
        }

        .ppLateTable tbody tr:hover td{ background:rgba(202,166,75,0.06); }

        .ppPos{ width:58px; color:rgba(233,233,233,0.75); font-weight:900; }

        .ppImgCell{ width:66px; }
        .ppImg{
          width:34px; height:34px;
          border-radius:12px;
          border:2px solid rgba(202,166,75,0.55);
          box-shadow:0 14px 34px rgba(0,0,0,0.45);
          background:rgba(0,0,0,0.55);
          display:inline-flex;
          align-items:center;
          justify-content:center;
          overflow:hidden;
        }
        .ppImg img{ width:100%; height:100%; object-fit:cover; display:block; }

        .ppGrupo{
          font-weight:900;
          letter-spacing:0.4px;
          color:#e9e9e9;
        }

        .ppAnimal{
          width:150px;
          max-width:150px;
          font-weight:800;
          color:rgba(233,233,233,0.92);
        }

        .ppLast{ width:130px; text-align:center; color:rgba(233,233,233,0.72); font-weight:700; }
        .ppDays{ width:118px; font-weight:900; text-align:center; letter-spacing:0.2px; }
        .ppDays b{ color:#caa64b; }

        @media (max-width:1100px){
          .ppLate{ padding:12px 12px 10px; }
          .ppLateTable{ width:100%; }
          .ppAnimal{ width:140px; max-width:140px; }
        }
      `}</style>

      <div className="ppLateHeader">
        <div className="ppLateTitleWrap">
          <h1 className="ppLateTitle">Atrasados</h1>
          <div className="ppLateSubtitle">
            Leitura de atraso por <b>Grupo</b> · Prêmio{" "}
            <b>{prizeMode === "1-5" ? "1º ao 5º" : `${prizeMode}º`}</b> · Data{" "}
            <b>{titleDateBR}</b>
            {" · "}
            <b>{selectedLottery?.label}</b>
            {" · "}
            Loteria <b>{LOTTERY_KEY}</b>
            {meta?.effectiveTargetYmd && meta.effectiveTargetYmd !== dateYmd ? (
              <>
                {" · "}
                Data efetiva <b>{effectiveDateBR}</b>
              </>
            ) : null}
          </div>
        </div>

        <div className="ppLateControls">
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

          <div className="ppCtl">
            <label>Tipo</label>
            <select
              value={kind}
              onChange={(e) => setKind(String(e.target.value || "grupo"))}
            >
              <option value="grupo">Grupo</option>
              <option value="milhar" disabled>
                Milhar
              </option>
              <option value="centena" disabled>
                Centena
              </option>
              <option value="dezena" disabled>
                Dezena
              </option>
              <option value="unidade" disabled>
                Unidade
              </option>
            </select>
          </div>

          <div className="ppCtl">
            <label>Prêmio</label>
            <select
              value={prizeMode}
              onChange={(e) => setPrizeMode(String(e.target.value || "1"))}
            >
              <option value="1">1º Prêmio</option>
              <option value="2">2º Prêmio</option>
              <option value="3">3º Prêmio</option>
              <option value="4">4º Prêmio</option>
              <option value="5">5º Prêmio</option>
              <option value="1-5">1º ao 5º Prêmio</option>
            </select>
          </div>

          <div className="ppCtl">
            <label>Data</label>
            <input
              type="date"
              value={dateYmd}
              onChange={(e) =>
                setDateYmd(String(e.target.value || todayYMDLocal()))
              }
            />
          </div>

          <button
            className="ppBtn"
            onClick={refresh}
            disabled={loading || !boundsReady}
          >
            {loading ? "Carregando..." : "Atualizar"}
          </button>
        </div>
      </div>

      {error ? <div className="ppErr">{error}</div> : null}

      <div className="ppLatePanel">
        <div className="ppLateTableWrap">
          <table className="ppLateTable">
            <thead>
              <tr>
                <th style={{ width: 58 }}>Posição</th>
                <th style={{ width: 66 }}>Imagem</th>
                <th style={{ width: 150 }}>Grupo</th>
                <th style={{ width: 150 }}>Bicho</th>
                <th style={{ width: 130 }}>Última Aparição</th>
                <th style={{ width: 118 }}>Atraso (DIAS)</th>
              </tr>
            </thead>

            <tbody>
              {(rows || []).map((r, idx) => {
                const lastBR = r.lastYmd ? ymdToBR(r.lastYmd) : "—";
                const days = r.daysLate == null ? "—" : String(r.daysLate);

                return (
                  <tr key={`${r.grupo}-${idx}`}>
                    <td className="ppPos">{idx + 1}º</td>

                    <td className="ppImgCell">
                      <span
                        className="ppImg"
                        title={`Grupo ${r.grupo2} · ${r.animal}`}
                      >
                        {r.img ? <img src={r.img} alt={r.animal} /> : null}
                      </span>
                    </td>

                    <td>
                      <span className="ppGrupo">GRUPO {r.grupo2}</span>
                    </td>

                    <td className="ppAnimal" title={r.animal || ""}>
                      {r.animal || "—"}
                    </td>

                    <td className="ppLast">{lastBR}</td>

                    <td className="ppDays">
                      {r.daysLate == null ? (
                        "—"
                      ) : (
                        <>
                          <b>{days}</b> dias
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}

              {!loading && (!rows || !rows.length) ? (
                <tr>
                  <td
                    colSpan={6}
                    style={{
                      padding: 14,
                      textAlign: "center",
                      color: "rgba(233,233,233,0.7)",
                      whiteSpace: "normal",
                    }}
                  >
                    Sem dados para exibir.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
