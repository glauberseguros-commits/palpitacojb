"use strict";

const { spawnSync } = require("child_process");
const path = require("path");
const fs = require("fs");

function run(cmd, args, opts={}) {
  const r = spawnSync(cmd, args, { stdio: "inherit", shell: false, ...opts });
  if (r.status !== 0) process.exit(r.status || 1);
}

function safeReadJson(p, fallback=null) {
  try {
    if (!fs.existsSync(p)) return fallback;
    return JSON.parse(fs.readFileSync(p,"utf8"));
  } catch { return fallback; }
}

function ymdNowSP() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,"0");
  const dd = String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${dd}`;
}

function addDays(ymd, n) {
  const d = new Date(`${ymd}T12:00:00-03:00`);
  d.setDate(d.getDate()+n);
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,"0");
  const dd = String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${dd}`;
}

function parseArg(name, def=null) {
  const p = `--${name}=`;
  const a = process.argv.find(x => String(x||"").startsWith(p));
  return a ? String(a).slice(p.length) : def;
}

function hasFlag(name){ return process.argv.includes(`--${name}`); }

function lastFile(globPrefix) {
  const dir = path.join(__dirname, "..", "logs");
  const files = fs.readdirSync(dir).filter(f => f.startsWith(globPrefix));
  if (!files.length) return null;
  files.sort((a,b)=>{
    const pa = path.join(dir,a), pb = path.join(dir,b);
    return fs.statSync(pb).mtimeMs - fs.statSync(pa).mtimeMs;
  });
  return path.join(dir, files[0]);
}

async function main(){
  const lottery = String(parseArg("lottery","PT_RIO")).trim().toUpperCase();
  const days = Number(parseArg("days","30"));
  const details = hasFlag("details");
  const strictSchedule = hasFlag("strictSchedule");

  const today = parseArg("today", ymdNowSP());
  const start = addDays(today, -Math.max(1,days));

  const auditScript = path.join(__dirname, "auditDrawSlotsRange.js");
  const planScript  = path.join(__dirname, "planBackfillFromAudit.js");
  const runScript   = path.join(__dirname, "runBackfillFromPlan.js");

  console.log("==================================");
  console.log(`[MAINTAIN] lottery=${lottery} window=${start} -> ${today} days=${days}`);
  console.log("==================================");

  // 1) audit
  const auditArgs = [auditScript, lottery, start, today];
  if (details) auditArgs.push("--details");
  if (strictSchedule) auditArgs.push("--strictSchedule");
  run("node", auditArgs);

  const auditFile = lastFile(`auditSlots-${lottery}-${start}_to_${today}.json`.replace(/[:]/g,""));
  // fallback: pega o mais novo mesmo se prefix exato não bater
  const auditPicked = auditFile || lastFile(`auditSlots-${lottery}-`) || null;
  if (!auditPicked) {
    console.log("[MAINTAIN] Não achei audit log para gerar plan.");
    process.exit(2);
  }

  // 2) plan
  run("node", [planScript, auditPicked, "", lottery]);

  const planPicked = lastFile(`backfillPlan-${lottery}-`) || null;
  if (!planPicked) {
    console.log("[MAINTAIN] Não achei backfillPlan gerado.");
    process.exit(3);
  }

  const plan = safeReadJson(planPicked, null) || {};
  const rows = Array.isArray(plan.rows) ? plan.rows : [];
  const should = rows.filter(r => r && r.shouldBackfill);

  if (!should.length) {
    console.log("[MAINTAIN] Plan sem rows/shouldBackfill. Nada a fazer.");
    return;
  }

  // 3) run backfill (lotes)
  const limitDays = Number(parseArg("limitDays","14"));
  const baseMins = String(parseArg("baseMins","0,9"));
  const tolMin = Number(parseArg("tolMin","2"));

  console.log("==================================");
  console.log(`[MAINTAIN] Backfill necessário: days=${should.length} | executando limitDays=${limitDays}`);
  console.log("==================================");

  run("node", [runScript, planPicked, `--limitDays=${limitDays}`, `--baseMins=${baseMins}`, `--tolMin=${tolMin}`]);

  // 4) audit final (sem details)
  run("node", [auditScript, lottery, start, today]);
}

main().catch(e=>{
  console.error("ERR:", e?.stack || e?.message || e);
  process.exit(1);
});
