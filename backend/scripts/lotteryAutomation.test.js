"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const heartbeatFile = path.join(__dirname, "runAutoImportHeartbeat.js");
const popularFile = path.join(__dirname, "autoImportPopularToday.js");

function heartbeat(env) {
  const calls = [];
  const fakeProcess = { env, execPath: process.execPath, exitCode: 0 };
  const requireStub = (name) => {
    if (name === "node:path") return path;
    if (name === "node:child_process") return {
      spawnSync(_command, args, options) {
        calls.push({ script: path.basename(args[0]), lottery: options.env.LOTTERY,
          date: options.env.DATE, nowHm: options.env.NOW_HM });
        return { status: 0 };
      },
    };
    throw new Error(`Unexpected module: ${name}`);
  };
  vm.runInNewContext(fs.readFileSync(heartbeatFile, "utf8"), {
    require: requireStub, process: fakeProcess, __dirname,
    Date, Intl, console: { log() {}, error() {} },
  }, { filename: heartbeatFile });
  return { calls, exitCode: fakeProcess.exitCode };
}

test("heartbeat dispatches original five, King9, Popular and external four", () => {
  const result = heartbeat({});
  assert.equal(result.exitCode, 0);
  assert.deepEqual(result.calls.map((call) => call.lottery), [
    "PT_RIO", "FEDERAL", "LOOK", "NACIONAL", "PT_SP",
    "MALUCA_FEDERAL", "MALUQUINHA_RIO", "BOA_SORTE", "LOTEP",
    "LOTECE", "BAHIA", "BA_MALUCA", "MINAS", "SORTE", "POPULAR",
    "CAPITAL", "PT_PB", "AVAL_PE", "TRADICIONAL",
  ]);
  assert.equal(
    result.calls.find(
      (call) => call.lottery === "POPULAR"
    ).script,
    "autoImportPopularToday.js"
  );

  assert.equal(
    result.calls.at(-1).script,
    "autoImportExternalFourToday.js"
  );
  assert.equal(result.calls[4].script, "autoImportPtSp.js");
  assert.equal(result.calls[5].script, "autoImportToday.js");
});

test("scoped LBR and Popular keep their dates and never inherit NOW_HM", () => {
  const lbr = heartbeat({ LOTTERY: "LBR", DATE: "2026-09-23", NOW_HM: "12:00" });
  const popular = heartbeat({ LOTTERY: "POPULAR", DATE: "2026-09-23", NOW_HM: "12:00" });
  assert.deepEqual(lbr.calls, [{ script: "autoImportLbrToday.js", lottery: "LBR",
    date: "2026-09-23", nowHm: undefined }]);
  assert.deepEqual(popular.calls, [{ script: "autoImportPopularToday.js", lottery: "POPULAR",
    date: "2026-09-23", nowHm: undefined }]);
  for (
      const key of [
        "CAPITAL",
        "PT_PB",
        "AVAL_PE",
        "TRADICIONAL",
      ]
    ) {
      const scoped =
        heartbeat({
          LOTTERY:
            key,
          DATE:
            "2026-09-23",
          NOW_HM:
            "12:00",
        });

      assert.equal(
        scoped.exitCode,
        0
      );

      assert.deepEqual(
        scoped.calls,
        [{
          script:
            "autoImportExternalFourToday.js",
          lottery:
            key,
          date:
            "2026-09-23",
          nowHm:
            undefined,
        }]
      );
    }
});

function popular({ draws, existing = [], commit = true }) {
  const docs = existing.map((data, index) => ({ id: `existing-${index}`,
    data: () => ({ date: "2026-09-23", ...data }) }));
  const logs = [];
  const writes = [];
  const db = {
    collection(name) {
      assert.equal(name, "draws");
      function query(filters = []) {
        return {
          where(field, op, value) {
            assert.equal(op, "==");
            return query([...filters, [field, value]]);
          },
          async get() {
            return { docs: docs.filter((doc) =>
              filters.every(([field, value]) => doc.data()[field] === value)) };
          },
        };
      }
      return query();
    },
  };
  const modules = {
    "../service/firebaseAdmin": { getDb: () => db },
    "../services/externalResultsProviders": {
      fetchExternalResults: async () => ({ draws }),
    },
    "./importExternalResults": require("./importExternalResults"),
    "./importKingApostas": {
      async importFromPayload(options) {
        writes.push(options);
        if (commit) {
          for (const row of options.payload.data) {
            docs.push({ id: `new-${row.close_hour}`, data: () => ({
              date: "2026-09-23", lottery_key: "POPULAR", close_hour: row.close_hour,
              prizesCount: 5,
              prizes: [1, 2, 3, 4, 5].map((position) => ({
                position, displayValue: row[`prize_${position}`],
              })),
            }) });
          }
        }
        return { totalDrawsUpserted: options.payload.data.length };
      },
    },
  };
  const moduleStub = { exports: {} };
  const requireStub = (name) => {
    assert.ok(Object.hasOwn(modules, name), `Unexpected module: ${name}`);
    return modules[name];
  };
  vm.runInNewContext(fs.readFileSync(popularFile, "utf8"), {
    require: requireStub, module: moduleStub,
    process: { env: { DATE: "2026-09-23" }, exitCode: 0 },
    Date, Intl, console: { log: (...args) => logs.push(args.join(" ")),
      error: (...args) => logs.push(args.join(" ")) },
  }, { filename: popularFile });
  return { main: moduleStub.exports.main, writes, logs };
}

const confirmed = {
  lotteryKey: "POPULAR", lotteryName: "LOTERIA POPULAR", date: "2026-09-23",
  closeHour: "09:30", prizes: ["0001", "0002", "0003", "0004", "0005"],
  confirmed: true, consensusCount: 2,
  sourcePrimary: "fonte_a", sourceConfirmation: "fonte_b",
};

test("Popular writes only confirmed operational slots and checks the result", async () => {
  const run = popular({ draws: [confirmed,
    { ...confirmed, closeHour: "11:00", confirmed: false },
    { ...confirmed, closeHour: "18:30" }] });
  await run.main();
  assert.equal(run.writes.length, 1);
  assert.equal(run.writes[0].payload.data.length, 1);
  assert.equal(run.writes[0].payload.data[0].prize_1, "0001");
  assert.equal(run.writes[0].payload.data[0].external_confirmed, true);
  assert.ok(run.logs.includes("[POPULAR_AUTO] COMPLETE_SOURCE_NOW=1/1"));
});

test("Popular skips matching results and blocks conflicting data", async () => {
  const complete = { lottery_key: "POPULAR", close_hour: "09:30", prizesCount: 5,
    prizes: confirmed.prizes.map((displayValue, index) =>
      ({ position: index + 1, displayValue })) };
  const same = popular({ draws: [confirmed], existing: [complete] });
  await same.main();
  assert.equal(same.writes.length, 0);

  const conflict = popular({ draws: [confirmed], existing: [{ ...complete,
    prizes: [{ position: 1, displayValue: "9999" }, ...complete.prizes.slice(1)] }] });
  await assert.rejects(conflict.main(), /POPULAR_DB_CONFLICT/);
  assert.equal(conflict.writes.length, 0);
});

test("Popular rejects a false quorum and a failed postwrite", async () => {
  const invalid = popular({ draws: [{ ...confirmed, consensusCount: 1 }] });
  await assert.rejects(invalid.main(), /POPULAR_SOURCE_CONTRACT_INVALID/);
  const noWrite = popular({ draws: [confirmed], commit: false });
  await assert.rejects(noWrite.main(), /POPULAR_POSTWRITE_FAILED/);
});
