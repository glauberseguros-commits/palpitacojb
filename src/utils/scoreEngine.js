export function applyScoreEngine(ranking = [], opts = {}) {
  const weights = {
    aparicoes: 1,
    ...opts.weights,
  };

  const scored = (Array.isArray(ranking) ? ranking : []).map((item) => {
    const aparicoes = Number(item.total ?? item.apar ?? 0) || 0;

    const score =
      aparicoes * Number(weights.aparicoes || 0);

    return {
      ...item,
      score,
      scoreDetails: {
        aparicoes,
        weights,
      },
    };
  });

  scored.sort((a, b) => {
    const ds = Number(b.score || 0) - Number(a.score || 0);
    if (ds !== 0) return ds;
    return Number(a.grupoNum || a.grupo || 0) - Number(b.grupoNum || b.grupo || 0);
  });

  return scored;
}
