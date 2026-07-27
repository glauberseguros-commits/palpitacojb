"use strict";

const path = require("node:path");
const { spawnSync } = require("node:child_process");

const TIME_ZONE = "America/Sao_Paulo";
const LOTTERIES = [
  "PT_RIO",
  "FEDERAL",
  "LOOK",
  "NACIONAL",
];

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
  const dryRun =
    String(process.env.HEARTBEAT_DRY_RUN || "")
      .trim() === "1";

  console.log(
    `[HEARTBEAT] START local=${plan.localTime} ` +
      `date=${plan.date} period=${plan.period}`
  );

  let failed = false;

  for (const lottery of LOTTERIES) {
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

    const child = spawnSync(
      process.execPath,
      [
        path.join(
          __dirname,
          "autoImportToday.js"
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