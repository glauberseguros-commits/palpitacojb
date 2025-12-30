import React from "react";
import "./Ranking.css";
import Filtros from "./Filtros";
import TabelaRanking from "./TabelaRanking";
import GraficoRanking from "./GraficoRanking";
import Top3Ranking from "./TOP3/Top3Ranking";
import rankingData from "../data/rankingData";

function Ranking() {
  return (
    <div className="ranking-container">
      {/* Coluna principal: Tabela + Gráfico */}
      <div className="ranking-main">
        <TabelaRanking rankingData={rankingData} />
        <GraficoRanking rankingData={rankingData} />
      </div>

      {/* Coluna lateral: Filtros acima e TOP 3 abaixo */}
      <div className="ranking-lateral">
        <div className="ranking-filtros">
          <Filtros />
        </div>
        <div className="ranking-top3">
          <Top3Ranking rankingData={rankingData} />
        </div>
      </div>
    </div>
  );
}

export default Ranking;
