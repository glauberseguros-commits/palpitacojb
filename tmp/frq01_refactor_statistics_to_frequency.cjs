const fs = require("fs");

const file = "src/pages/Statistics/Statistics.jsx";

let text = fs.readFileSync(file,"utf8");

const replacements = [
  [
    "Ranking histórico conforme a loteria, período, horário, animal e posição selecionados.",
    "Consulta histórica por frequência conforme os filtros selecionados."
  ],
  [
    "Falha ao calcular as estatísticas.",
    "Falha ao calcular as frequências."
  ],
  [
    "Estatísticas",
    "Frequências"
  ]
];

for (const [from,to] of replacements){
    text = text.split(from).join(to);
}

/*
Correção da leitura das milhares:
para 1º ao 6º prêmio priorizar milhar4/milhar;
centena3 somente no 7º prêmio.
*/

text = text.replace(
/const number = lastDigits\\([\\s\\S]*?wantedLength\\);/,
`const rawNumber =
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

  const number = lastDigits(rawNumber, wantedLength);`
);

fs.writeFileSync(file,text,"utf8");

console.log("OK - Conceito atualizado.");
