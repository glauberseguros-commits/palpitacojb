"use strict";

const fs = require("fs");

const path = "src/pages/Top3/Top3View.jsx";
const original = fs.readFileSync(path, "utf8");
const usesCrlf = original.includes("\r\n");

let source = original.replace(/\r\n/g, "\n");

function occurrences(text, search) {
  return text.split(search).length - 1;
}

function replaceOnce(before, after, label) {
  const found = occurrences(source, before);

  if (found !== 1) {
    throw new Error(
      `${label}: esperado exatamente 1 trecho; encontrados ${found}.`
    );
  }

  source = source.replace(before, after);
}

if (source.includes("TOP3 EQUAL CARD LAYOUT")) {
  throw new Error("A correção visual já parece estar aplicada.");
}

/*
 * Os três palpites agora ocupam cards equivalentes.
 *
 * A posição continua sendo definida por idx, mantendo:
 * 1º MAIS FORTE, 2º MAIS FORTE e 3º MAIS FORTE.
 *
 * Apenas o tratamento estrutural antigo de hero é desativado.
 */
replaceOnce(
  `  const isHero = idx === 0;`,
  `  // TOP3 EQUAL CARD LAYOUT
  // A hierarquia permanece no ranking, mas os três cards usam a mesma estrutura.
  const isHero = false;`,
  "definição visual do primeiro card"
);

/*
 * Valida antes de gravar.
 */
const required = [
  ["TOP3 EQUAL CARD LAYOUT", "marcador da correção"],
  ["const isHero = false;", "estrutura equivalente"],
  ['idx === 0 ? "1º MAIS FORTE"', "ranking preservado"],
  ["visibleTop3.map", "renderização dos três palpites"],
  ["top3-stage--predictions", "grade responsiva"],
];

for (const [text, label] of required) {
  if (!source.includes(text)) {
    throw new Error(`Validação falhou: ${label}.`);
  }
}

if (source.includes("const isHero = idx === 0;")) {
  throw new Error("A definição hero antiga ainda está ativa.");
}

const output = usesCrlf
  ? source.replace(/\n/g, "\r\n")
  : source;

fs.writeFileSync(path, output, "utf8");

console.log("Correção aplicada.");
console.log("- primeiro card não recebe mais a estrutura hero");
console.log("- os três cards usam o mesmo layout");
console.log("- ranking 1º, 2º e 3º permanece preservado");
