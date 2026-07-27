const fs = require("fs");

const file = "src/App.jsx";

let text = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");

const duplicated =
`  STATISTICS: "statistics",
STATISTICS: "statistics",`;

const corrected =
`  STATISTICS: "statistics",`;

if (!text.includes(duplicated)) {
    throw new Error("O padrão esperado não foi encontrado ou o arquivo já foi corrigido.");
}

text = text.replace(duplicated, corrected);

fs.writeFileSync(file, text, "utf8");

console.log("OK - App.jsx corrigido.");
