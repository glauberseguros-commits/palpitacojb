const fs = require("fs");
const path = require("path");

(async () => {
  const {
    fetchKingResults
  } = require("../backend/scripts/importKingApostas.js");

  if (typeof fetchKingResults !== "function") {
    throw new Error("fetchKingResults não está disponível.");
  }

  const date = "2026-07-18";

  const payload = await fetchKingResults({
    date,
    lotteryKey: "NACIONAL",
  });

  const draws = Array.isArray(payload?.data)
    ? payload.data
    : [];

  const rows = draws.map((draw, index) => ({
    index: index + 1,
    lottery_name: draw?.lottery_name ?? draw?.name ?? null,
    lottery_id: draw?.lottery_id ?? draw?.lotteryId ?? null,
    date: draw?.date ?? null,
    close_hour: draw?.close_hour ?? null,
    closeHour: draw?.closeHour ?? null,
    horario: draw?.horario ?? null,
    close: draw?.close ?? null,
    prize_1: draw?.prize_1 ?? null,
    prize_2: draw?.prize_2 ?? null,
    prize_3: draw?.prize_3 ?? null,
  }));

  const lines = [];

  lines.push("DATE=" + date);
  lines.push("LOTTERY_KEY=NACIONAL");
  lines.push("TOTAL_DRAWS=" + rows.length);
  lines.push("");

  for (const row of rows) {
    lines.push("=".repeat(90));
    lines.push("INDEX        : " + row.index);
    lines.push("lottery_name : " + (row.lottery_name ?? ""));
    lines.push("lottery_id   : " + (row.lottery_id ?? ""));
    lines.push("date         : " + (row.date ?? ""));
    lines.push("close_hour   : " + (row.close_hour ?? ""));
    lines.push("closeHour    : " + (row.closeHour ?? ""));
    lines.push("horario      : " + (row.horario ?? ""));
    lines.push("close        : " + (row.close ?? ""));
    lines.push("prize_1      : " + (row.prize_1 ?? ""));
    lines.push("prize_2      : " + (row.prize_2 ?? ""));
    lines.push("prize_3      : " + (row.prize_3 ?? ""));
    lines.push("");
  }

  const output = lines.join("\n");

  fs.writeFileSync(
    path.resolve("tmp/lkn84_raw_api_payload_nacional.txt"),
    output,
    "utf8"
  );

  console.log(output);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
