"use strict";

const path = require("node:path");
const { spawnSync } = require("node:child_process");

const TIME_ZONE = "America/Sao_Paulo";
const LOTTERIES = [

  "PT_RIO",
  "FEDERAL",
  "LOOK",
  "NACIONAL",
  "PT_SP",
  "MALUCA_FEDERAL",
  "MALUQUINHA_RIO",
  "BOA_SORTE",
  "LOTEP",
  "LOTECE",
  "BAHIA",
  "BA_MALUCA",
  "MINAS",
  "SORTE",
  "POPULAR",
  "CAPITAL",
  "PT_PB",
  "AVAL_PE",
  "TRADICIONAL",
];

const EXTERNAL_FOUR_LOTTERIES = new Set([
  "CAPITAL",
  "PT_PB",
  "AVAL_PE",
  "TRADICIONAL",
]);

const EXTERNAL_DATE_ONLY_LOTTERIES = new Set([
  "LBR",
  "POPULAR",
  ...EXTERNAL_FOUR_LOTTERIES,
]);
// LBR mantém sua janela própria; as demais usam o heartbeat geral.
const SCOPED_LOTTERIES = new Set([...LOTTERIES, "LBR"]);

function saoPauloParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  return Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );
}

function ymdFromParts(parts) {
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function previousYmd(ymd) {
  const match = String(ymd).match(
    /^(\d{4})-(\d{2})-(\d{2})$/
  );

  if (!match) {
    throw new Error(`Data invalida: ${ymd}`);
  }

  const date = new Date(
    Date.UTC(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3])
    )
  );

  date.setUTCDate(date.getUTCDate() - 1);

  return date.toISOString().slice(0, 10);
}

function buildPlan() {
  const parts = saoPauloParts();
  const today = ymdFromParts(parts);
  const hour = Number(parts.hour);

  const forcedPeriod = String(
    process.env.HEARTBEAT_PERIOD || ""
  )
    .trim()
    .toUpperCase();

  const reconcileYesterday =
    forcedPeriod === "YESTERDAY" ||
    (
      forcedPeriod !== "TODAY" &&
      (hour === 0 || hour === 1)
    );

  if (reconcileYesterday) {
    return {
      period: "YESTERDAY",
      date: previousYmd(today),
      nowHm: "23:59",
      localTime: `${parts.hour}:${parts.minute}`,
    };
  }

  return {
    period: "TODAY",
    date: today,
    nowHm: null,
    localTime: `${parts.hour}:${parts.minute}`,
  };
}

function run() {
  const plan = buildPlan();
  const heartbeatRequestedLottery =
    String(process.env.LOTTERY || "").trim().toUpperCase();

  if (
    heartbeatRequestedLottery &&
    !SCOPED_LOTTERIES.has(heartbeatRequestedLottery)
  ) {
    throw new Error(`LOTTERY nao suportada no heartbeat: ${heartbeatRequestedLottery}`);
  }

  if (
    heartbeatRequestedLottery === "LBR" ||
    heartbeatRequestedLottery === "POPULAR"
  ) {
    const dateOverride = String(process.env.DATE || "").trim();
    if (dateOverride) {
      const parsed = new Date(`${dateOverride}T00:00:00.000Z`);
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(dateOverride) ||
        Number.isNaN(parsed.getTime()) ||
        parsed.toISOString().slice(0, 10) !== dateOverride
      ) {
        throw new Error(`DATE invalida para ${heartbeatRequestedLottery}: ${dateOverride}`);
      }
      plan.date = dateOverride;
      plan.period = "OVERRIDE";
      plan.nowHm = null;
    }
  }
  const dryRun =
    String(process.env.HEARTBEAT_DRY_RUN || "")
      .trim() === "1";

  console.log(
    `[HEARTBEAT] START local=${plan.localTime} ` +
      `date=${plan.date} period=${plan.period}`
  );

  let failed = false;

  const heartbeatLotteries =
    heartbeatRequestedLottery
      ? [heartbeatRequestedLottery]
      : LOTTERIES;

  console.log(
    "[HEARTBEAT] LOTTERY_SCOPE=" +
      (heartbeatLotteries.length === 1
        ? heartbeatLotteries[0]
        : "ALL")
  );

  for (const lottery of heartbeatLotteries) {
    console.log("");
    console.log(
      `LOTTERY=${lottery} | PERIOD=${plan.period} | ` +
        `DATE=${plan.date}`
    );

    if (dryRun) {
      console.log(
        `[HEARTBEAT] DRY_RUN LOTTERY=${lottery}`
      );
      continue;
    }

    const childEnv = {
      ...process.env,
      LOTTERY: lottery,
    };

    delete childEnv.HEARTBEAT_DRY_RUN;
    delete childEnv.HEARTBEAT_PERIOD;

    if (plan.period === "YESTERDAY") {
      childEnv.DATE = plan.date;
      childEnv.NOW_HM = plan.nowHm;
    }
    else {
      delete childEnv.DATE;
      delete childEnv.NOW_HM;
    }

    if (EXTERNAL_DATE_ONLY_LOTTERIES.has(lottery)) {
      const explicitDate =
        String(
          process.env.DATE ||
          ""
        ).trim();

      childEnv.DATE =
        explicitDate ||
        plan.date;

      delete childEnv.NOW_HM;
    }

    const childScript =
        lottery === "PT_SP"
          ? "autoImportPtSp.js"
          : lottery === "LBR"
            ? "autoImportLbrToday.js"
            : lottery === "POPULAR"
              ? "autoImportPopularToday.js"
              : EXTERNAL_FOUR_LOTTERIES.has(
                    lottery
                  )
                ? "autoImportExternalFourToday.js"
                : "autoImportToday.js";

    const child = spawnSync(
      process.execPath,
      [
        path.join(
          __dirname,
          childScript
        ),
      ],
      {
        cwd: path.resolve(__dirname, ".."),
        env: childEnv,
        stdio: "inherit",
      }
    );

    const exitCode =
      Number.isInteger(child.status)
        ? child.status
        : 1;

    if (child.error) {
      console.error(
        `[HEARTBEAT] ERROR LOTTERY=${lottery}: ` +
          `${child.error.message}`
      );
    }

    if (exitCode !== 0) {
      console.error(
        `[HEARTBEAT] FAILED LOTTERY=${lottery} ` +
          `EXIT=${exitCode}`
      );
      failed = true;
    }
    else {
      console.log(
        `[HEARTBEAT] OK LOTTERY=${lottery}`
      );
    }
  }

  if (failed) {
    console.error(
      "[HEARTBEAT] FINAL=FAILED"
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    "[HEARTBEAT] FINAL=SUCCESS"
  );
}

try {
  run();
}
catch (error) {
  console.error(
    "[HEARTBEAT] FATAL:",
    error?.stack ||
      error?.message ||
      error
  );

  process.exitCode = 1;
}
