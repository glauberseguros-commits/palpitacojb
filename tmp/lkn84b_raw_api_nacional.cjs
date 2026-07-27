(async () => {
  const {
    fetchKingResults
  } = require("../backend/scripts/importKingApostas.js");

  const payload = await fetchKingResults({
    date: "2026-07-18",
    lotteryKey: "NACIONAL",
  });

  const draws = Array.isArray(payload?.data)
    ? payload.data
    : [];

  console.log("");
  console.log("TOTAL_DRAWS=" + draws.length);
  console.log("");

  draws.forEach((draw, index) => {
    console.log("=".repeat(90));
    console.log("INDEX        :", index + 1);
    console.log("lottery_name :", draw?.lottery_name ?? draw?.name ?? "");
    console.log("lottery_id   :", draw?.lottery_id ?? draw?.lotteryId ?? "");
    console.log("date         :", draw?.date ?? "");
    console.log("close_hour   :", draw?.close_hour ?? "");
    console.log("closeHour    :", draw?.closeHour ?? "");
    console.log("horario      :", draw?.horario ?? "");
    console.log("close        :", draw?.close ?? "");
    console.log("prize_1      :", draw?.prize_1 ?? "");
    console.log("prize_2      :", draw?.prize_2 ?? "");
    console.log("prize_3      :", draw?.prize_3 ?? "");
    console.log("");
  });
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
