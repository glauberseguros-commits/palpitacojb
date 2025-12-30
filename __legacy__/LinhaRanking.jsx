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
      {/* Coluna da esquerda: filtros, tabela, gráfico */}
      <div className="ranking-left">
        <Filtros />
        <TabelaRanking rankingData={rankingData} />
        <GraficoRanking rankingData={rankingData} />
      </div>

      {/* Coluna da direita: TOP 3 */}
      <div className="ranking-right">
        <Top3Ranking rankingData={rankingData} />
      </div>
    </div>
  );
}

export default Ranking;
