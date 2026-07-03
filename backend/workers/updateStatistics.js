import { ensureStatisticsSnapshot } from "../../src/services/statisticsEngine.js";

async function main() {
  try {
    const uf = process.argv[2] || "PT_RIO";
    const from = process.argv[3] || "2022-06-07";
    const to = process.argv[4] || new Date().toISOString().slice(0, 10);

    console.log("");
    console.log("====================================");
    console.log(" PALPITACO JB - Statistics Worker");
    console.log("====================================");
    console.log("");

    console.log("UF........:", uf);
    console.log("Período..:", from, "->", to);
    console.log("");

    const result = await ensureStatisticsSnapshot({
      uf,
      dateFrom: from,
      dateTo: to,
      force: false,
    });

    console.log("");
    console.log("Origem....:", result.source);
    console.log("Draws.....:", result.data?.totalDraws);
    console.log("Top 3.....:");

    (result.data?.top3 || []).forEach((r, i) => {
      console.log(
        `${i + 1}. Grupo ${r.grupo ?? r.grupoNum} | Score ${Number(r.score || 0).toFixed(2)}`
      );
    });

    console.log("");
    console.log("Worker finalizado.");
    process.exit(0);

  } catch (e) {

    console.error("");
    console.error("ERRO:");
    console.error(e);

    process.exit(1);
  }
}

main();
