// src/hooks/useKingRanking.js
import { useEffect, useMemo, useState } from "react";
import {
  getKingResultsByDate,
  getKingResultsByRange,
} from "../services/kingResultsService";
import { buildRanking } from "../utils/buildRanking";

/**
 * Hook central do Palpitaco (King)
 *
 * Modos suportados (sem quebrar compatibilidade):
 * - Dia único:   { uf, date: "YYYY-MM-DD" }
 * - Intervalo:  { uf, dateFrom: "YYYY-MM-DD", dateTo: "YYYY-MM-DD" }
 *
 * Filtros:
 * - closeHour (opcional) ex "14:00"
 * - positions (opcional) array ex [1,2,3]
 */
export function useKingRanking({
  uf,
  date,
  dateFrom,
  dateTo,
  closeHour = null,
  positions = null,
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // ranking (array)
  const [data, setData] = useState([]);

  // meta (top3 + total + info útil para auditoria/KPIs)
  const [meta, setMeta] = useState({
    top3: [],
    totalOcorrencias: 0,
    totalDraws: 0,
    mode: "none",
    date: null,
    dateFrom: null,
    dateTo: null,
  });

  // ✅ draws brutos para auditoria/validação
  const [drawsRaw, setDrawsRaw] = useState([]);

  // evita render loop quando positions é array (dep estável)
  const positionsKey = useMemo(() => {
    return Array.isArray(positions) && positions.length ? positions.join(",") : "";
  }, [positions]);

  // array estável derivado do positionsKey (não depende do array original)
  const positionsArr = useMemo(() => {
    if (!positionsKey) return null;
    return positionsKey
      .split(",")
      .map((n) => Number(n))
      .filter(Number.isFinite);
  }, [positionsKey]);

  // modo: range tem prioridade se vier completo
  const mode = useMemo(() => {
    if (uf && dateFrom && dateTo) return "range";
    if (uf && date) return "day";
    return "none";
  }, [uf, date, dateFrom, dateTo]);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        setError(null);
        setLoading(true);

        let draws = [];

        if (mode === "range") {
          draws = await getKingResultsByRange({
            uf,
            dateFrom,
            dateTo,
            closeHour: closeHour || null,
            positions: positionsArr,
          });
        } else if (mode === "day") {
          draws = await getKingResultsByDate({
            uf,
            date,
            closeHour: closeHour || null,
            positions: positionsArr,
          });
        } else {
          draws = [];
        }

        const built = buildRanking(draws);

        if (!mounted) return;

        setDrawsRaw(Array.isArray(draws) ? draws : []);
        setData(built.ranking || []);

        setMeta({
          top3: built.top3 || [],
          totalOcorrencias: Number(built.totalOcorrencias || 0),
          totalDraws: Array.isArray(draws) ? draws.length : 0,
          mode,
          date: mode === "day" ? date : null,
          dateFrom: mode === "range" ? dateFrom : null,
          dateTo: mode === "range" ? dateTo : null,
        });
      } catch (e) {
        if (mounted) setError(e);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    if (mode === "none") {
      setDrawsRaw([]);
      setData([]);
      setMeta({
        top3: [],
        totalOcorrencias: 0,
        totalDraws: 0,
        mode: "none",
        date: null,
        dateFrom: null,
        dateTo: null,
      });
      setLoading(false);
      return;
    }

    load();

    return () => {
      mounted = false;
    };
  }, [mode, uf, date, dateFrom, dateTo, closeHour, positionsKey, positionsArr]);

  return { loading, error, data, meta, drawsRaw };
}
