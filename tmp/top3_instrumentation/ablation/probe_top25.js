const fs = require("fs");
const path = require("path");

const {
  computeStatisticalTop3V3
} = require("./src/pages/Top3/top3.engine");

const {
  loadDrawHistory
} = require("./backend/scripts/backtestTop3Official");

(async () => {

  const history = await loadDrawHistory({
    lotteryKey: "PT_RIO"
  });

  if (!history || history.length < 120) {
    throw new Error(
      "Histórico insuficiente."
    );
  }

  const draws = history.slice(0, -1);
  const last = history.at(-1);

  const result =
    computeStatisticalTop3V3({

      lotteryKey: "PT_RIO",

      drawsRange: draws,

      drawLast: last,

      PT_RIO_SCHEDULE_NORMAL: [
        "09:00","11:00","14:00",
        "16:00","18:00","21:00"
      ],

      PT_RIO_SCHEDULE_WED_SAT: [
        "09:00","11:00","14:00",
        "16:00","18:00","21:00"
      ],

      FEDERAL_SCHEDULE: [
        "14:00","16:00","19:00"
      ],

      topN: 25

    });

  const top = Array.isArray(result?.top)
      ? result.top
      : [];

  const report = [];

  report.push("TOP_SIZE=" + top.length);
  report.push("");

  top.forEach((item, idx) => {

    report.push(
      String(idx + 1).padStart(2,"0") +
      " | G" +
      String(item.grupo).padStart(2,"0") +
      " | score=" +
      Number(item.scoreProb || 0)
        .toFixed(6)
    );

  });

  fs.writeFileSync(
      path.resolve(
          "tmp/top3_instrumentation/ablation/top25_official_probe.txt"
      ),
      report.join("\n"),
      "utf8"
  );

  console.log("TOP_SIZE=" + top.length);

})();
