"use strict";

const { spawnSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const http = require("http");
const https = require("https");

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: "inherit", shell: false, ...opts });
  if (r.error) {
    console.error("[RUN] spawn error:", r.error.message || r.error);
    process.exit(1);
  }
  if (r.status !== 0) process.exit(r.status || 1);
}

function safeReadJson(p, fallback = null) {
  try {
    if (!fs.existsSync(p)) return fallback;
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return fallback;
  }
}

function ymdNowSP() {
  // “hoje” no fuso de SP (BRT), sem depender de TZ do runner
  // en-CA => YYYY-MM-DD
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date());
}

function isYMD(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || "").trim());
}

function ymdToInt(ymd) {
  // YYYYMMDD como int (comparação lexicográfica segura)
  const s = String(ymd || "").trim();
  if (!isYMD(s)) return null;
  return Number(s.replace(/-/g, ""));
}

function clampEndToTodaySP(endYmd) {
  const today = ymdNowSP();
  const endInt = ymdToInt(endYmd);
  const todayInt = ymdToInt(today);
  if (!endInt || !todayInt)
    return { end: today, adjusted: true, reason: "invalid_end_or_today" };

  if (endInt > todayInt) {
    return { end: today, adjusted: true, reason: "end_in_future" };
  }
  return { end: String(endYmd || "").trim(), adjusted: false, reason: null };
}

function addDays(ymd, n) {
  // Mantém -03:00 “fixo”
  const d = new Date(`${ymd}T12:00:00-03:00`);
  d.setDate(d.getDate() + n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function parseArg(name, def = null) {
  const p = `--${name}=`;
  const a = process.argv.find((x) => String(x || "").startsWith(p));
  return a ? String(a).slice(p.length) : def;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function lastFile(globPrefix) {
  const dir = path.join(__dirname, "..", "logs");
  if (!fs.existsSync(dir)) return null;

  const files = fs.readdirSync(dir).filter((f) => f.startsWith(globPrefix));
  if (!files.length) return null;

  files.sort((a, b) => {
    const pa = path.join(dir, a),
      pb = path.join(dir, b);
    return fs.statSync(pb).mtimeMs - fs.statSync(pa).mtimeMs;
  });
  return path.join(dir, files[0]);
}

function checkHealth(baseUrl, timeoutMs = 2500) {
  return new Promise((resolve) => {
    try {
      const u = new URL(String(baseUrl).replace(/\/+$/, "") + "/health");
      const lib = u.protocol === "https:" ? https : http;

      const req = lib.request(
        {
          method: "GET",
          hostname: u.hostname,
          port: u.port || (u.protocol === "https:" ? 443 : 80),
          path: u.pathname + u.search,
          timeout: timeoutMs,
          headers: { accept: "application/json" },
        },
        (res) => {
          const ok = res.statusCode >= 200 && res.statusCode < 300;
          res.resume();
          resolve({ ok, status: res.statusCode });
        }
      );

      req.on("timeout", () => {
        req.destroy(new Error("timeout"));
      });
      req.on("error", (e) => {
        resolve({ ok: false, status: 0, error: e?.message || String(e) });
      });
      req.end();
    } catch (e) {
      resolve({ ok: false, status: 0, error: e?.message || String(e) });
    }
  });
}

async function main() {
  const lottery = String(parseArg("lottery", "PT_RIO")).trim().toUpperCase();

  // days robusto
  let days = Number(parseArg("days", "30"));
  if (!Number.isFinite(days) || days <= 0) days = 30;

  const details = hasFlag("details");
  const strictSchedule = hasFlag("strictSchedule");

  // baseUrl (API)
  const baseUrl = String(parseArg("baseUrl", "http://127.0.0.1:3333"))
    .trim()
    .replace(/\/+$/, "");

  // endDate (today) robusto + ANTI FUTURO
  const todayRaw = String(parseArg("today", ymdNowSP())).trim();
  const todayCandidate = isYMD(todayRaw) ? todayRaw : ymdNowSP();

  const clamp = clampEndToTodaySP(todayCandidate);
  const end = clamp.end;

  if (clamp.adjusted) {
    const realToday = ymdNowSP();
    console.warn(
      `[WARN] Janela inclui data futura/inválida. Ajustando endDate para hoje (SP): ${end} (input=${
        todayRaw || "—"
      }, hoje=${realToday})`
    );
  }

  // start recalculado SEMPRE com base no end final
  let start = addDays(end, -Math.max(1, days));

  // sanity: se algo estranho acontecer e start > end, corrige
  const startInt = ymdToInt(start);
  const endInt = ymdToInt(end);
  if (startInt && endInt && startInt > endInt) {
    console.warn(
      `[WARN] startDate > endDate. Ajustando startDate=endDate (${end}).`
    );
    start = end;
  }

  const auditScript = path.join(__dirname, "auditDrawSlotsRange.js");
  const planScript = path.join(__dirname, "planBackfillFromAudit.js");
  const runScript = path.join(__dirname, "runBackfillFromPlan.js");

  console.log("==================================");
  console.log(
    `[MAINTAIN] lottery=${lottery} window=${start} -> ${end} days=${days}`
  );
  console.log("==================================");

  // 0) health-check do backend (evita fetch failed)
  const health = await checkHealth(baseUrl, 2500);
  if (!health.ok) {
    console.error(
      `[MAINTAIN] Backend OFF/sem health em ${baseUrl}/health (status=${health.status}${
        health.error ? ` error=${health.error}` : ""
      }).`
    );
    console.error(`[MAINTAIN] Suba o backend e tente novamente: node backend/server.js`);
    process.exit(4);
  }

  // 1) audit
  const auditArgs = [auditScript, lottery, start, end];
  if (details) auditArgs.push("--details");
  if (strictSchedule) auditArgs.push("--strictSchedule");
  run("node", auditArgs);

  const auditFile = lastFile(
    `auditSlots-${lottery}-${start}_to_${end}.json`.replace(/[:]/g, "")
  );
  // fallback: pega o mais novo mesmo se prefix exato não bater
  const auditPicked = auditFile || lastFile(`auditSlots-${lottery}-`) || null;
  if (!auditPicked) {
    console.log("[MAINTAIN] Não achei audit log para gerar plan.");
    process.exit(2);
  }

  // 2) plan (PASSA baseUrl corretamente)
  run("node", [planScript, auditPicked, baseUrl, lottery]);

  // prioriza o arquivo EXATO do range atual
  const expectedPlanName = `backfillPlan-${lottery}-${start}_to_${end}.json`;
  const expectedPlanPath = path.join(__dirname, "..", "logs", expectedPlanName);

  const planPicked =
    (fs.existsSync(expectedPlanPath) ? expectedPlanPath : null) ||
    lastFile(`backfillPlan-${lottery}-${start}_to_${end}.json`) ||
    lastFile(`backfillPlan-${lottery}-`) ||
    null;

  if (!planPicked) {
    console.log("[MAINTAIN] Não achei backfillPlan gerado.");
    process.exit(3);
  }

  const plan = safeReadJson(planPicked, null) || {};
  const rows = Array.isArray(plan.rows) ? plan.rows : [];
  const should = rows.filter((r) => r && r.shouldBackfill);

  // mensagem correta para "nada a fazer"
  const totals = plan && typeof plan.totals === "object" ? plan.totals : null;
  const slotsToBackfill = totals && Number.isFinite(Number(totals.slotsToBackfill))
    ? Number(totals.slotsToBackfill)
    : null;

  // Se não há missing no audit, o planner gera rows=[] por definição.
  // Isso é SUCESSO (nada a fazer), não erro.
  if (!should.length || slotsToBackfill === 0) {
    console.log(
      `[MAINTAIN] Plan gerado com 0 slots para backfill (days=${rows.length}). Nada a fazer.`
    );
    return;
  }

  // 3) run backfill (lotes)
  const limitDays = Number(parseArg("limitDays", "14"));
  const baseMins = String(parseArg("baseMins", "0,9"));
  const tolMin = Number(parseArg("tolMin", "2"));

  console.log("==================================");
  console.log(
    `[MAINTAIN] Backfill necessário: days=${should.length} | executando limitDays=${limitDays}`
  );
  console.log("==================================");

  run("node", [
    runScript,
    planPicked,
    `--limitDays=${limitDays}`,
    `--baseMins=${baseMins}`,
    `--tolMin=${tolMin}`,
  ]);

  // 4) audit final (sem details)
  run("node", [auditScript, lottery, start, end]);
}

main().catch((e) => {
  console.error("ERR:", e?.stack || e?.message || e);
  process.exit(1);
});

