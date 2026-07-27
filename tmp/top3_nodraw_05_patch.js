"use strict";

const fs = require("fs");

const file = "src/pages/Top3/Top3View.jsx";

if (!fs.existsSync(file)) {
  throw new Error(`Arquivo não encontrado: ${file}`);
}

const original = fs.readFileSync(file, "utf8");
const newline = original.includes("\r\n") ? "\r\n" : "\n";
const normalized = original.replace(/\r\n/g, "\n");

const oldBlock = `    return Array.from(rowsByTarget.values())
      .sort((a, b) => {
        const ah = hourBucketToSortValue(
          a?.target?.hour
        );
        const bh = hourBucketToSortValue(
          b?.target?.hour
        );

        return ah - bh;
      });`;

const newBlock = `    const todayYmd = todayYMDLocalView();

    return Array.from(rowsByTarget.values())
      .filter((row) => {
        const targetYmd = String(
          row?.target?.ymd || ""
        ).trim();

        const hasResult = row?.result != null;

        // Resultado existente sempre permanece no histórico.
        if (hasResult) return true;

        // Linha inválida não deve gerar card pendente.
        if (!isYMD(targetYmd)) return false;

        // Pendência só é legítima no dia atual ou em data futura.
        // Datas anteriores sem resultado representam sorteio inexistente,
        // cancelado ou definitivamente não publicado.
        return targetYmd >= todayYmd;
      })
      .sort((a, b) => {
        const ah = hourBucketToSortValue(
          a?.target?.hour
        );
        const bh = hourBucketToSortValue(
          b?.target?.hour
        );

        return ah - bh;
      });`;

const occurrences = normalized.split(oldBlock).length - 1;

if (occurrences !== 1) {
  throw new Error(
    `Bloco esperado encontrado ${occurrences} vez(es). Alteração cancelada.`
  );
}

const updated = normalized.replace(oldBlock, newBlock);

if (updated === normalized) {
  throw new Error("Nenhuma alteração foi aplicada.");
}

fs.writeFileSync(
  file,
  updated.replace(/\n/g, newline),
  "utf8"
);

console.log("PATCH_OK");
console.log(`Arquivo alterado: ${file}`);
console.log(
  "Regra: remover linhas sem resultado apenas quando targetYmd for anterior ao dia atual."
);
