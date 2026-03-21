const fs = require("fs");
const path = require("path");

const LOG_PATH = path.join(__dirname, "../data/top3_log.json");

// horários padrão
const HOURS = ["09", "11", "14", "16", "18"];

async function run() {
  const res = await fetch("http://localhost:3333/api/king/draws?lottery=PT_RIO&date=2026-03-20");
  const json = await res.json();

  if (!json.ok) {
    console.error("Erro API:", json.error);
    return;
  }

  const draws = json.draws;

  // ordenar por hora
  draws.sort((a, b) => a.hour.localeCompare(b.hour));

  let log = [];
  if (fs.existsSync(LOG_PATH)) {
    log = JSON.parse(fs.readFileSync(LOG_PATH, "utf-8"));
  }

  for (const hour of HOURS) {
    const current = draws.find(d => d.hour === hour);
    if (!current) continue;

    const prevDraws = draws.filter(d => d.hour < hour);
    const last = prevDraws[prevDraws.length - 1];

    if (!last) continue;

    // SIMULA MOTOR (mesma lógica do Top3 atual)
    const picks = [
      last.prizes?.[0]?.grupo,
      (last.prizes?.[0]?.grupo + 1) % 25,
      (last.prizes?.[0]?.grupo + 2) % 25
    ].map(g => g === 0 ? 25 : g);

    const resultGrupo = current.prizes?.[0]?.grupo;

    const hit = picks.includes(resultGrupo);

    log.push({
      date: "2026-03-20",
      hour,
      base: last.prizes?.[0]?.grupo,
      picks,
      result: resultGrupo,
      hit
    });

    console.log(`OK ${hour}h → picks: ${picks.join("-")} result: ${resultGrupo}`);
  }

  fs.writeFileSync(LOG_PATH, JSON.stringify(log, null, 2));
  console.log("REPROCESSAMENTO CONCLUÍDO");
}

run();
