import { useEffect, useMemo, useState } from "react";
import { getKingResultsByDate } from "../services/kingResultsService";
import { buildRanking } from "../utils/buildRanking";

/**
 * Hook central do Palpitaco (King)
 * Retorna ranking agregado a partir dos prizes (grupo+animal).
 */
export function useKingRanking({ uf, date, closeHour = null, positions = null }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // ✅ data agora é ARRAY (ranking)
  const [data, setData] = useState([]);

  // ✅ meta com top3 e total
  const [meta, setMeta] = useState({ top3: [], totalOcorrencias: 0 });

  // evita render loop quando positions é array (dep estável)
  const positionsKey = useMemo(() => {
    return Array.isArray(positions) && positions.length ? positions.join(",") : "";
  }, [positions]);

  // ✅ array estável derivado do positionsKey (não depende do array original)
  const positionsArr = useMemo(() => {
    if (!positionsKey) return null;
    return positionsKey
      .split(",")
      .map((n) => Number(n))
      .filter(Number.isFinite);
  }, [positionsKey]);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        setError(null);
        setLoading(true);

        const draws = await getKingResultsByDate({
          uf,
          date,
          closeHour: closeHour || null,
          positions: positionsArr, // ✅ usa a versão estável
        });

        const built = buildRanking(draws);

        if (!mounted) return;

        // ✅ data (array) para tabelas/KPIs
        setData(built.ranking || []);

        // ✅ meta para Top3/KPIs avançados
        setMeta({
          top3: built.top3 || [],
          totalOcorrencias: Number(built.totalOcorrencias || 0),
        });
      } catch (e) {
        if (mounted) setError(e);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    // só carrega se tiver uf+date
    if (uf && date) load();
    else {
      setData([]);
      setMeta({ top3: [], totalOcorrencias: 0 });
      setLoading(false);
    }

    return () => {
      mounted = false;
    };
  }, [uf, date, closeHour, positionsKey, positionsArr]);

  return { loading, error, data, meta };
}
