import React from "react";
import "./PageHeader.css";

const HEADINGS = {
  dashboard: [
    "DASHBOARD",
    "Visão geral dos sorteios e indicadores."
  ],
  results: [
    "RESULTADOS",
    "Consulte os resultados por loteria, data e horário."
  ],
  top3: [
    "TOP3",
    "Previsões, calendário e histórico dos sorteios."
  ],
  "radar-dos-bichos": [
    "RADAR DOS BICHOS",
    "Combinações estatísticas por loteria, data e horário."
  ],
  late: [
    "ATRASADOS",
    "Acompanhe os grupos e os intervalos sem ocorrência."
  ],
  search: [
    "BUSCA",
    "Pesquise dezenas, centenas e milhares no histórico."
  ],
  centenas: [
    "CENTENAS+",
    "Análise das centenas e suas ocorrências históricas."
  ],
  downloads: [
    "DOWNLOADS",
    "Consulte e exporte resultados em PDF e Excel."
  ],
  account: [
    "MINHA CONTA",
    "Informações sobre o seu acesso ao PalPitaco JB."
  ]
};

export default function PageHeader({ screen }) {
  const content = HEADINGS[String(screen || "")];
  if (!content) return null;

  return (
    <header className="ppSharedPageHeader">
      <h1 className="ppSharedPageHeader__title">
        {content[0]}
      </h1>
      <p className="ppSharedPageHeader__subtitle">
        {content[1]}
      </p>
    </header>
  );
}