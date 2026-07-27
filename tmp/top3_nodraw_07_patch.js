"use strict";

const fs = require("fs");

const file = "src/pages/Top3/Top3View.jsx";
const marker = "TOP3_NODRAW_07_FILTER";

if (!fs.existsSync(file)) {
  throw new Error(`Arquivo não encontrado: ${file}`);
}

const original = fs.readFileSync(file, "utf8");
const newline = original.includes("\r\n") ? "\r\n" : "\n";
let source = original.replace(/\r\n/g, "\n");

const historyStart = source.indexOf(
  "const historyRows = useMemo(() => {"
);

if (historyStart < 0) {
  throw new Error(
    "Bloco historyRows não localizado. Alteração cancelada."
  );
}

const summaryStart = source.indexOf(
  "const historySummary = useMemo(() => {",
  historyStart
);

if (summaryStart < 0) {
  throw new Error(
    "Fim do bloco historyRows não localizado. Alteração cancelada."
  );
}

const historyBlock = source.slice(
  historyStart,
  summaryStart
);

if (historyBlock.includes(marker)) {
  console.log("PATCH_ALREADY_PRESENT");
  console.log(`Arquivo: ${file}`);
  process.exit(0);
}

const returnNeedle =
  "return Array.from(rowsByTarget.values())";

const relativeReturnIndex =
  historyBlock.lastIndexOf(returnNeedle);

if (relativeReturnIndex < 0) {
  throw new Error(
    "Retorno de rowsByTarget não localizado dentro de historyRows."
  );
}

const absoluteReturnIndex =
  historyStart + relativeReturnIndex;

const filterBlock = `return Array.from(rowsByTarget.values())
      // ${marker}
      .filter((row) => {
        const targetYmd = String(
          row?.target?.ymd || ""
        ).trim();

        const hasResult =
          row?.result != null;

        // Resultado oficial existente sempre permanece.
        if (hasResult) return true;

        // Registro sem data válida não pode gerar card pendente.
        if (!isYMD(targetYmd)) return false;

        const todayYmd = todayYMDLocalView();

        // Pendência só permanece para o dia atual ou data futura.
        // Datas anteriores sem resultado representam sorteio
        // inexistente, cancelado ou definitivamente não publicado.
        return targetYmd >= todayYmd;
      })`;

source =
  source.slice(0, absoluteReturnIndex) +
  filterBlock +
  source.slice(
    absoluteReturnIndex + returnNeedle.length
  );

const changedBlock = source.slice(
  historyStart,
  source.indexOf(
    "const historySummary = useMemo(() => {",
    historyStart
  )
);

const markerCount =
  changedBlock.split(marker).length - 1;

if (markerCount !== 1) {
  throw new Error(
    `Validação interna falhou. Marcador encontrado ${markerCount} vez(es).`
  );
}

fs.writeFileSync(
  file,
  source.replace(/\n/g, newline),
  "utf8"
);

console.log("PATCH_OK");
console.log(`Arquivo alterado: ${file}`);
console.log(
  "Regra aplicada: datas encerradas sem resultado não entram no histórico."
);
