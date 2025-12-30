import React from "react";
import "./Top3Ranking.css";
import { useKingRanking } from "../../hooks/useKingRanking";

const Top3Ranking = ({ uf = "PT_RIO", date = "2025-12-29" }) => {
  const { loading, error, data } = useKingRanking({ uf, date });

  // Mantém layout estável (sem flicker e sem scroll)
  if (loading) return null;
  if (error) return null;

  // Nosso buildRanking retorna top3 com { grupo, animal, total }
  // Seu componente espera { animal, qtde }
  const top3 = (data?.top3 || []).map((x) => ({
    ...x,
    qtde: x.total,
  }));

  return (
    <div className="top3-container">
      {top3.map((item, index) => (
        <div key={index} className="top3-card">
          <img
            src={`/img/${String(item.animal || "")
              .toLowerCase()
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "")}_128.png`}
            alt={item.animal}
            className="top3-image"
          />
          <div className="top3-animal">{item.animal}</div>
          <div className="top3-valor">{item.qtde}</div>
        </div>
      ))}
    </div>
  );
};

export default Top3Ranking;
