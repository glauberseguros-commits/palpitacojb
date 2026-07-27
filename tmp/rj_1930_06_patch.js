"use strict";

const fs = require("fs");

const changes = [];

function read(file) {
  return fs.readFileSync(file, "utf8");
}

function write(file, content) {
  fs.writeFileSync(file, content, "utf8");
}

function replaceExact(file, before, after, description) {
  const original = read(file);
  const occurrences = original.split(before).length - 1;

  if (occurrences !== 1) {
    throw new Error(
      `${file}: esperado exatamente 1 bloco para "${description}", encontrado ${occurrences}.`
    );
  }

  const updated = original.replace(before, after);

  if (updated === original) {
    throw new Error(`${file}: nenhuma alteração aplicada em "${description}".`);
  }

  write(file, updated);

  changes.push({
    file,
    description,
  });
}

/*
 * Dashboard:
 * mantém value=19h para filtrar o bucket interno 19:00,
 * mas mostra ao usuário o horário oficial 19:30h.
 */
replaceExact(
  "src/pages/Dashboard/components/FiltersBar.jsx",
`      { label: "18h", value: "18h" },
      { label: "21h", value: "21h" },`,
`      { label: "18h", value: "18h" },
      { label: "19:30h", value: "19h" },
      { label: "21h", value: "21h" },`,
  "adicionar 19:30h ao filtro do Dashboard"
);

/*
 * Downloads:
 * o valor continua 19:00, apenas o label passa a ser 19:30.
 */
replaceExact(
  "src/pages/Downloads/Downloads.jsx",
`    return uniq.map((h) =>
      h === "ALL"
        ? { v: "ALL", label: "Todos" }
        : { v: h, label: h }
    );`,
`    return uniq.map((h) => {
      if (h === "ALL") {
        return { v: "ALL", label: "Todos" };
      }

      if (lotteryKey === "PT_RIO" && h === "19:00") {
        return { v: h, label: "19:30" };
      }

      return { v: h, label: h };
    });`,
  "exibir 19:30 no filtro de Downloads"
);

/*
 * Atrasados:
 * closeHour permanece 19:00.
 */
replaceExact(
  "src/pages/Late/Late.jsx",
`    { id: "18", label: "18h", closeHour: "18:00" },
    { id: "21", label: "21h", closeHour: "21:00" },`,
`    { id: "18", label: "18h", closeHour: "18:00" },
    { id: "19", label: "19:30h", closeHour: "19:00" },
    { id: "21", label: "21h", closeHour: "21:00" },`,
  "adicionar 19:30h ao filtro de Atrasados"
);

/*
 * Resultados:
 * alteração somente da camada visual.
 */
replaceExact(
  "src/pages/Results/Results.jsx",
`const RJ_SATURDAY_1920_START_YMD = "2026-07-18";`,
`const RJ_SATURDAY_1930_START_YMD = "2026-07-18";`,
  "renomear constante visual de sábado"
);

{
  const file = "src/pages/Results/Results.jsx";
  let content = read(file);

  const replacements = [
    [
      "RJ_SATURDAY_1920_START_YMD",
      "RJ_SATURDAY_1930_START_YMD",
      "referências da constante visual",
    ],
    [
      "19:20 substitui o antigo horário das 18h.",
      "19:30 substitui o antigo horário das 18h.",
      "comentário do calendário",
    ],
    [
      '"19:20",',
      '"19:30",',
      "slot público esperado",
    ],
    [
      "embora o horário oficial exibido seja 19:20.",
      "embora o horário oficial exibido seja 19:30.",
      "comentário da normalização",
    ],
    [
      'return "19:20";',
      'return "19:30";',
      "retorno visual do sábado",
    ],
  ];

  for (const [before, after, description] of replacements) {
    const count = content.split(before).length - 1;

    if (count < 1) {
      throw new Error(
        `${file}: referência não encontrada para "${description}": ${before}`
      );
    }

    content = content.split(before).join(after);
  }

  write(file, content);

  changes.push({
    file,
    description: "alterar exibição de 19:20 para 19:30 em Resultados",
  });
}

/*
 * Estatísticas:
 * a lista mostra 19:30; hourBucket continua convertendo-a para 19h
 * e a consulta permanece no close_hour 19:00.
 */
replaceExact(
  "src/pages/Statistics/Statistics.jsx",
`      "18:00",
      "19:20",
      "21:00",`,
`      "18:00",
      "19:30",
      "21:00",`,
  "alterar label das Estatísticas para 19:30"
);

/*
 * TOP3:
 * adiciona conversão exclusivamente visual para sábado,
 * desde 18/07/2026, preservando targetHour=19:00 no motor,
 * histórico, snapshots e Firestore.
 */
replaceExact(
  "src/pages/Top3/Top3View.jsx",
`function hourBucketToSortValue(hour) {`,
`function formatPtRioSaturdayDisplayHour(ymd, hour) {
  const y = String(ymd || "").trim();
  const h = String(hour || "").trim();

  if (
    y >= "2026-07-18" &&
    h === "19:00"
  ) {
    const parsed = new Date(\`\${y}T12:00:00\`);

    if (
      parsed instanceof Date &&
      !Number.isNaN(parsed.getTime()) &&
      parsed.getDay() === 6
    ) {
      return "19:30";
    }
  }

  return h;
}

function hourBucketToSortValue(hour) {`,
  "adicionar formatador visual do TOP3"
);

replaceExact(
  "src/pages/Top3/Top3View.jsx",
`  if (y && h) return \`\${ymdToBR(y)} \${h}\`;
  if (y) return ymdToBR(y);
  if (h) return h;`,
`  const displayHour = formatPtRioSaturdayDisplayHour(y, h);

  if (y && displayHour) {
    return \`\${ymdToBR(y)} \${displayHour}\`;
  }

  if (y) return ymdToBR(y);
  if (displayHour) return displayHour;`,
  "aplicar 19:30 nos títulos de horário do TOP3"
);

replaceExact(
  "src/pages/Top3/Top3View.jsx",
`  const targetHour = String(item?.meta?.next?.hour || "").trim();`,
`  const targetHour = formatPtRioSaturdayDisplayHour(
    item?.meta?.next?.ymd,
    String(item?.meta?.next?.hour || "").trim()
  );`,
  "aplicar 19:30 nos detalhes explicativos do TOP3"
);

console.log(
  JSON.stringify(
    {
      ok: true,
      changedFiles: [...new Set(changes.map((item) => item.file))],
      changes,
    },
    null,
    2
  )
);
