import React, { useMemo, useState } from "react";

import Top3Ranking from "./TOP3/Top3Ranking";
import TabelaRanking from "./TabelaRanking";
import FiltersBar from "../pages/Dashboard/components/FiltersBar";
import { useKingRanking } from "../hooks/useKingRanking";

function pad2(n) {
  return String(n).padStart(2, "0");
}

function getMonthNamePT(m) {
  const meses = [
    "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
    "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"
  ];
  return meses[m - 1] || "Todos";
}

function getWeekdayPT(dateStr) {
  // dateStr = YYYY-MM-DD
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const w = dt.getUTCDay(); // 0=Dom ... 6=Sáb
  const map = ["Domingo","Segunda","Terça","Quarta","Quinta","Sexta","Sábado"];
  return map[w] || "Todos";
}

function parseDateParts(dateStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  const [y, m, d] = dateStr.split("-").map(Number);
  return { y, m, d };
}

/**
 * Ranking KingApostas usando o FiltersBar atual do Dashboard
 * - Mapeia date/closeHour/positions para mes/diaMes/diaSemana/horario/posicao
 */
export default function RankingKingPage() {
  // filtros "reais" (King)
  const [uf, setUf] = useState("PT_RIO");
  const [date, setDate] = useState("2025-12-29");
  const [closeHour, setCloseHour] = useState(""); // ex: "09:09"
  const [positions, setPositions] = useState([]); // ex: [1,2,3]

  // hooks / dados
  const { loading, error, data } = useKingRanking({
    uf,
    date,
    closeHour: closeHour || null,
    positions: Array.isArray(positions) && positions.length ? positions : null,
  });

  // Adapter para componentes __legacy__
  const rankingData = useMemo(() => {
    const arr = data?.ranking || [];
    return arr.map((x) => ({
      grupo: x.grupo,
      animal: x.animal,
      qtd: x.total,
      qtde: x.total,
      palpite: "",
    }));
  }, [data]);

  // ====== MAPEAMENTO para o FiltersBar atual ======
  const filtersUI = useMemo(() => {
    const parts = parseDateParts(date);
    const mes = parts ? getMonthNamePT(parts.m) : "Todos";
    const diaMes = parts ? String(parts.d) : "Todos";
    const diaSemana = parts ? getWeekdayPT(date) : "Todos";

    return {
      mes,
      diaMes,
      diaSemana,
      // o FiltersBar chama de "horario" — aqui será closeHour
      horario: closeHour ? closeHour : "Todos",
      // por enquanto não vamos filtrar por animal no Firestore; deixamos "Todos"
      animal: "Todos",
      // o FiltersBar chama de "posicao" — aqui será posição do prêmio
      posicao: positions?.length ? `${positions[0]}º` : "Todos",
    };
  }, [date, closeHour, positions]);

  const optionsUI = useMemo(() => {
    // horários reais do PT_RIO (conforme close_hour da King)
    const horarios = ["09:09", "11:09", "14:09", "16:09", "18:09", "21:09"];

    // posições: se você quiser liberar 1..15
    const posicoes = Array.from({ length: 15 }, (_, i) => `${i + 1}º`);

    // animais: opcional para futuro filtro no ranking (hoje fica “Todos”)
    // Se quiser preencher com ranking atual:
    const animais = (data?.ranking || []).map((x) => x.animal);

    return {
      horarios,
      posicoes,
      animais,
      // meses/diasSemana/diasMes você já tem defaults no próprio FiltersBar
    };
  }, [data]);

  function handleChange(name, value) {
    // Aqui traduzimos o "name" do FiltersBar atual para os estados reais
    if (name === "horario") {
      setCloseHour(value === "Todos" ? "" : value);
      return;
    }

    if (name === "posicao") {
      // ex: "3º" => 3
      if (value === "Todos") {
        setPositions([]);
      } else {
        const n = Number(String(value).replace("º", ""));
        setPositions(Number.isFinite(n) ? [n] : []);
      }
      return;
    }

    if (name === "diaMes" || name === "mes") {
      // Reconstroi date (YYYY-MM-DD) quando mudar mês/dia
      // Estratégia simples:
      // - Se mudar mês: mantém dia atual se possível, senão ajusta para 1
      // - Se mudar dia: troca somente o dia
      const parts = parseDateParts(date) || { y: 2025, m: 12, d: 29 };

      let y = parts.y;
      let m = parts.m;
      let d = parts.d;

      if (name === "mes") {
        // value vem em PT ("Janeiro"...)
        const map = {
          Janeiro: 1, Fevereiro: 2, Março: 3, Abril: 4, Maio: 5, Junho: 6,
          Julho: 7, Agosto: 8, Setembro: 9, Outubro: 10, Novembro: 11, Dezembro: 12
        };
        if (value === "Todos") return; // não vamos suportar “Todos” para date
        m = map[value] || m;
      }

      if (name === "diaMes") {
        if (value === "Todos") return; // idem
        d = Number(value);
      }

      const newDate = `${y}-${pad2(m)}-${pad2(d)}`;
      setDate(newDate);
      // ao trocar dia/mês, por padrão limpa closeHour/positions (evita estado incoerente)
      setCloseHour("");
      setPositions([]);
      return;
    }

    if (name === "diaSemana") {
      // por enquanto não vamos alterar date por diaSemana (isso exigiria calendário)
      return;
    }

    if (name === "animal") {
      // filtro por animal podemos implementar na Tabela/Top3 sem bater no Firestore
      // por ora, ignoramos (mantém Todos)
      return;
    }
  }

  return (
    <div className="ranking-king-page">
      <FiltersBar
        filters={filtersUI}
        onChange={handleChange}
        options={optionsUI}
      />

      {loading && <div style={{ padding: 12, opacity: 0.85 }}>Carregando...</div>}
      {error && (
        <div style={{ padding: 12, color: "#ff8a8a" }}>
          Erro: {String(error?.message || error)}
        </div>
      )}

      {!loading && !error && (
        <>
          <Top3Ranking rankingData={rankingData} />
          <TabelaRanking rankingData={rankingData} />
        </>
      )}
    </div>
  );
}
