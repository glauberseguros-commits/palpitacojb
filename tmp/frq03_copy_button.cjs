const fs = require("fs");

const file = "src/pages/Statistics/Statistics.jsx";

let text = fs.readFileSync(file,"utf8").replace(/\r\n/g,"\n");

if (!text.includes("const mostFrequentLabel = useMemo")) {
    throw new Error("Ponto de inserção não encontrado.");
}

const insertAfter = `  const mostFrequentLabel = useMemo(() => {
    if (!mostFrequent) return "—";

    return itemLabel(mode, mostFrequent.key).main;
  }, [mode, mostFrequent]);`;

const newBlock = `${insertAfter}

  const copyRanking = useCallback(async () => {
    const title =
      mode === "dezena"
        ? "RANKING DE DEZENAS"
        : mode === "centena"
        ? "RANKING DE CENTENAS"
        : mode === "milhar"
        ? "RANKING DE MILHARES"
        : "RANKING DE ANIMAIS";

    const lines = [
      title,
      "",
      "Loteria: " + selectedLottery.label,
      "Período: " + ymdToBr(safeRange.from) + " até " + ymdToBr(safeRange.to),
      "",
    ];

    sortedRows.forEach((row,index)=>{
      const label=itemLabel(mode,row.key);

      lines.push(
        (index+1) + "º - " +
        label.main +
        " - " +
        formatInteger(row.count) +
        " ocorrência(s)"
      );
    });

    await navigator.clipboard.writeText(lines.join("\\n"));
    alert("Ranking copiado.");
  },[
    mode,
    selectedLottery,
    safeRange,
    sortedRows
  ]);`;

text = text.replace(insertAfter,newBlock);

const toolbar = `            <div className="ppStatsToolbarGroup">
              <label>Exibir</label>
              <select`;

const replacement = `            <div className="ppStatsToolbarGroup">

              <button
                type="button"
                className="ppStatsAnalyze"
                onClick={copyRanking}
              >
                Copiar
              </button>

              <label>Exibir</label>
              <select`;

if (!text.includes(toolbar)) {
    throw new Error("Toolbar não encontrada.");
}

text = text.replace(toolbar,replacement);

fs.writeFileSync(file,text,"utf8");

console.log("OK - Botão Copiar incluído.");
