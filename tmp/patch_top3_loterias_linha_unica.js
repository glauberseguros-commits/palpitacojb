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

if (source.includes("TOP3 LOTTERY TABS SINGLE ROW")) {
  throw new Error("Esta alteração já parece estar aplicada.");
}

/*
 * 1. Define o nome público correto da loteria do Rio.
 */
replaceOnce(
  `{ value: "PT_RIO", label: "PT_RIO (RJ)" },`,
  `{ value: "PT_RIO", label: "RJ" },`,
  "opção obrigatória do Rio"
);

/*
 * LOTTERY_OPTIONS pode fornecer outro nome.
 * Esta regra garante que PT_RIO seja sempre exibido como RJ.
 */
replaceOnce(
`        label: op?.label || rawVal,
      });`,
`        label:
          rawVal === "PT_RIO"
            ? "RJ"
            : op?.label || rawVal,
      });`,
  "normalização do nome público"
);

/*
 * 2. Mantém as loterias na mesma linha.
 * Em telas excepcionalmente estreitas, permite rolagem horizontal.
 */
replaceOnce(
`        .pp-tabs{
          display:flex;
          gap:8px;
          flex-wrap:wrap;
          margin-top: 2px;
        }`,
`        /* TOP3 LOTTERY TABS SINGLE ROW */
        .pp-tabs{
          display:flex;
          gap:8px;
          flex-wrap:nowrap;
          align-items:center;
          max-width:100%;
          margin-top:2px;
          overflow-x:auto;
          overflow-y:hidden;
          scrollbar-width:none;
          -webkit-overflow-scrolling:touch;
        }

        .pp-tabs::-webkit-scrollbar{
          display:none;
        }

        .pp-tabs > *{
          flex:0 0 auto;
        }`,
  "estilo das abas"
);

/*
 * 3. Compacta somente no celular, mantendo boa área de toque.
 */
const styleEnd = "      `}</style>";

if (occurrences(source, styleEnd) !== 1) {
  throw new Error(
    `Fechamento do CSS: esperada 1 ocorrência; encontradas ${occurrences(
      source,
      styleEnd
    )}.`
  );
}

const mobileCss = `
        @media (max-width: 640px){
          .pp-tabs{
            gap:6px;
          }

          .pp-tab{
            padding:8px 10px;
            font-size:13px;
          }
        }

`;

source = source.replace(styleEnd, mobileCss + styleEnd);

/*
 * Validações antes da gravação.
 */
const required = [
  ['{ value: "PT_RIO", label: "RJ" }', "nome RJ"],
  ['rawVal === "PT_RIO"', "normalização PT_RIO"],
  ["TOP3 LOTTERY TABS SINGLE ROW", "marcador do CSS"],
  ["flex-wrap:nowrap", "linha única"],
  ["overflow-x:auto", "rolagem de segurança"],
  ["scrollbar-width:none", "barra oculta"],
];

for (const [text, label] of required) {
  if (!source.includes(text)) {
    throw new Error(`Validação falhou: ${label}.`);
  }
}

if (source.includes('label: "PT_RIO (RJ)"')) {
  throw new Error('O texto antigo "PT_RIO (RJ)" ainda está presente.');
}

const output = usesCrlf
  ? source.replace(/\n/g, "\r\n")
  : source;

fs.writeFileSync(path, output, "utf8");

console.log("Alteração aplicada com sucesso.");
console.log("- PT_RIO agora aparece como RJ");
console.log("- loterias permanecem em uma linha");
console.log("- telas muito estreitas recebem rolagem horizontal");
