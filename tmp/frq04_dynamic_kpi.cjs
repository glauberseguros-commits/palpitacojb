const fs = require("fs");

const file = "src/pages/Statistics/Statistics.jsx";

let text = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");

if (text.includes("const distinctItemsLabel = useMemo")) {
  console.log("INFO - KPI dinâmico já estava implementado.");
  process.exit(0);
}

const anchor = `  const mostFrequentLabel = useMemo(() => {
    if (!mostFrequent) return "—";

    return itemLabel(mode, mostFrequent.key).main;
  }, [mode, mostFrequent]);`;

if (!text.includes(anchor)) {
  throw new Error(
    "Ponto de inserção do KPI dinâmico não foi encontrado."
  );
}

const dynamicLabelBlock = `${anchor}

  const distinctItemsLabel = useMemo(() => {
    if (mode === "dezena") return "Dezenas distintas";
    if (mode === "centena") return "Centenas distintas";
    if (mode === "milhar") return "Milhares distintas";

    return "Animais distintos";
  }, [mode]);`;

text = text.replace(anchor, dynamicLabelBlock);

const oldLabel = "Números distintos";
const occurrences = text.split(oldLabel).length - 1;

if (occurrences !== 1) {
  throw new Error(
    `O texto "${oldLabel}" foi encontrado ${occurrences} vez(es). Esperado: 1.`
  );
}

text = text.replace(oldLabel, "{distinctItemsLabel}");

fs.writeFileSync(file, text, "utf8");

console.log("OK - KPI dinâmico implementado.");
