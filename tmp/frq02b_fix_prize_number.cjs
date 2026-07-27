const fs = require("fs");

const file = "src/pages/Statistics/Statistics.jsx";

let text = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");

const oldBlock = `  const number = lastDigits(
    prize?.centena3 ??
      prize?.milhar4 ??
      prize?.milhar ??
      prize?.numero ??
      prize?.number ??
      prize?.num ??
      prize?.valor ??
      prize?.n ??
      "",
    wantedLength
  );`;

const newBlock = `  const rawNumber =
    position === 7
      ? (
          prize?.centena3 ??
          prize?.centena ??
          prize?.numero ??
          prize?.number ??
          prize?.num ??
          prize?.valor ??
          prize?.n ??
          ""
        )
      : (
          prize?.milhar4 ??
          prize?.milhar ??
          prize?.numero ??
          prize?.number ??
          prize?.num ??
          prize?.valor ??
          prize?.n ??
          ""
        );

  const number = lastDigits(rawNumber, wantedLength);`;

const occurrences = text.split(oldBlock).length - 1;

if (occurrences !== 1) {
  throw new Error(
    `Bloco esperado encontrado ${occurrences} vez(es). Nenhuma alteração foi realizada.`
  );
}

text = text.replace(oldBlock, newBlock);

fs.writeFileSync(file, text, "utf8");

console.log("OK - Leitura dos prêmios corrigida.");
