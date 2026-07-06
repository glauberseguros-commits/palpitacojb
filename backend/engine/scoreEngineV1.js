"use strict";

const ANIMALS = {
  "01": "Avestruz",
  "02": "Águia",
  "03": "Burro",
  "04": "Borboleta",
  "05": "Cachorro",
  "06": "Cabra",
  "07": "Carneiro",
  "08": "Camelo",
  "09": "Cobra",
  "10": "Coelho",
  "11": "Cavalo",
  "12": "Elefante",
  "13": "Galo",
  "14": "Gato",
  "15": "Jacaré",
  "16": "Leão",
  "17": "Macaco",
  "18": "Porco",
  "19": "Pavão",
  "20": "Peru",
  "21": "Touro",
  "22": "Tigre",
  "23": "Urso",
  "24": "Veado",
  "25": "Vaca",
};

function pad2(n) {
  return String(n).padStart(2, "0");
}

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function rankingToPredictions(ranking = [], opts = {}) {
  const limit = Math.max(1, Number(opts.limit || 10));

  const rows = (Array.isArray(ranking) ? ranking : [])
    .map((item) => {
      const grupo = pad2(item.grupo || item.grupoNum || item.group || item.id);
      const aparicoes = toNum(item.total ?? item.apar ?? item.count ?? 0);

      return {
        grupo,
        animal: item.animal || item.nome || ANIMALS[grupo] || null,
        aparicoes,
        raw: item,
      };
    })
    .filter((x) => /^\d{2}$/.test(x.grupo))
    .sort((a, b) => b.aparicoes - a.aparicoes || Number(a.grupo) - Number(b.grupo))
    .slice(0, limit);

  const max = rows.reduce((m, x) => Math.max(m, x.aparicoes), 0) || 1;

  return rows.map((x, idx) => {
    const score = Math.round((x.aparicoes / max) * 100);
    const confidence = Math.max(1, Math.round(score - idx * 2));

    return {
      type: "grupo",
      grupo: x.grupo,
      animal: x.animal,
      score,
      confidence,
      reasons: [
        `Ranking V1: ${x.aparicoes} aparições no recorte analisado`,
        `Posição ${idx + 1} entre os grupos avaliados`,
      ],
      signals: {
        aparicoes: x.aparicoes,
        rankPosition: idx + 1,
        engine: "score_engine_v1",
      },
    };
  });
}

module.exports = {
  rankingToPredictions,
};
