import * as XLSX from 'xlsx';
import { useEffect, useState } from 'react';

function useBaseJogoDoBicho() {
  const [dados, setDados] = useState([]);

  useEffect(() => {
    const carregarBase = async () => {
      try {
        const response = await fetch('/data/BASE_DE_DADOS_JB.xlsx');
        const arrayBuffer = await response.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });

        const aba = 'RESULT_ORIGINAL_RJ_2023'; // Nome da aba principal
        const worksheet = workbook.Sheets[aba];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);

        setDados(jsonData);
      } catch (erro) {
        console.error('Erro ao carregar base XLSX:', erro);
      }
    };

    carregarBase();
  }, []);

  return dados;
}

export default useBaseJogoDoBicho;
