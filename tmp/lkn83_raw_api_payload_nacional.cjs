const fs = require("fs");
const path = require("path");

(async () => {

  const mod = require("./backend/scripts/importKingApostas.js");

  if (typeof mod.fetchKingResults !== "function") {
    throw new Error(
      "fetchKingResults não está exportada pelo módulo."
    );
  }

  const payload = await mod.fetchKingResults({
    date: "2026-07-18",
    lotteryKey: "NACIONAL"
  });

  const draws = Array.isArray(payload?.data)
    ? payload.data
    : [];

  const out = [];

  out.push("TOTAL_DRAWS=" + draws.length);
  out.push("");

  for (const d of draws) {

    out.push("----------------------------------------");
    out.push("lottery_name : " + (d.lottery_name ?? ""));
    out.push("lottery_id   : " + (d.lottery_id ?? d.lotteryId ?? ""));
    out.push("date         : " + (d.date ?? ""));
    out.push("close_hour   : " + (d.close_hour ?? ""));
    out.push("closeHour    : " + (d.closeHour ?? ""));
    out.push("horario      : " + (d.horario ?? ""));
    out.push("close        : " + (d.close ?? ""));
    out.push("prize_1      : " + (d.prize_1 ?? ""));
    out.push("prize_2      : " + (d.prize_2 ?? ""));
    out.push("prize_3      : " + (d.prize_3 ?? ""));
    out.push("");
  }

  fs.writeFileSync(
    path.resolve("tmp/lkn83_raw_api_payload_nacional.txt"),
    out.join("\n"),
    "utf8"
  );

  console.log(out.join("\n"));

})().catch(err => {
  console.error(err);
  process.exit(1);
});
