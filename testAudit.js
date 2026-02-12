import { auditDatasetSummary } from "./src/services/auditKingCounts.js";

const fakeDraws = [
  {
    id: "1",
    date: "2026-02-10",
    close_hour: "09h",
    prizes: [{ grupo: 1, animal: "Avestruz", position: 1 }],
  },
  {
    id: "1", // duplicado proposital
    date: "2026-02-10",
    close_hour: "09:00",
    prizes: [{ grupo: 1, animal: "Avestruz", position: 1 }],
  },
];

const result = auditDatasetSummary(fakeDraws);

console.log(JSON.stringify(result, null, 2));
