import React from "react";
import "./TabelaRanking.css";
import { useKingRanking } from "../hooks/useKingRanking";

function normalizeAnimalFile(name) {
  return String(name || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function TabelaRanking({ uf = "PT_RIO", date = "2025-12-29" }) {
  const { loading, error, data } = useKingRanking({ uf, date });

  if (loading) return null;
  if (error) return null;

  // ranking completo (Top 25)
  const rankingData = (data?.ranking || []).map((item) => ({
    ...item,
    qtd: item.total, // compatibilidade com layout antigo
  }));

  return (
    <div className="tabela-container">
      <div className="tabela-cabecalho">
        <div>Grupo</div>
        <div>Animal</div>
        <div>Qtde</div>
        <div>Palpite</div>
      </div>

      {rankingData.map((item, index) => (
        <div key={index} className="linha-ranking">
          <div>
            <img
              src={`/img/${normalizeAnimalFile(item.animal)}.png`}
              alt={item.animal}
              className="ranking-img"
            />
            {item.grupo}
          </div>

          <div>{item.animal}</div>
          <div>{item.qtd}</div>
          <div>{item.palpite || "-"}</div>
        </div>
      ))}
    </div>
  );
}

export default TabelaRanking;
