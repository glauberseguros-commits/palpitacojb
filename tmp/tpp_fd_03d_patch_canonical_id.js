"use strict";

const fs = require("fs");

const path =
  "backend/scripts/importKingApostas.js";

let source =
  fs.readFileSync(path, "utf8")
    .replace(/\r\n/g, "\n");

const startMarker =
  "  // A fonte manteve o identificador 20h no domingo.";

const drawMarker =
  "\n\n  const drawId =";

const start =
  source.indexOf(startMarker);

if (start < 0) {
  throw new Error(
    "Bloco de ID Federal atual nao encontrado."
  );
}

if (
  source.indexOf(startMarker, start + 1) >= 0
) {
  throw new Error(
    "Mais de um bloco de ID Federal encontrado."
  );
}

const end =
  source.indexOf(drawMarker, start);

if (end < 0) {
  throw new Error(
    "Final do bloco de ID Federal nao encontrado."
  );
}

const replacement = `  // O ID deve usar sempre o slot oficial.
  // O horario bruto da fonte pode variar, por exemplo 19:53,
  // e permanece preservado apenas em close_hour_raw.
  const drawIdSlot = closeSlot;`;

source =
  source.slice(0, start) +
  replacement +
  source.slice(end);

fs.writeFileSync(
  path,
  source,
  "utf8"
);

console.log(
  "ID Federal alterado para o slot oficial."
);
