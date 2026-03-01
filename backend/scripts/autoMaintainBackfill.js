"use strict";

const { spawnSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const http = require("http");
const https = require("https");

/**
 * RUN com fallback para process.execPath
 * Evita ENOENT em ambientes Windows/CI
 */
function run(cmd, args, opts = {}) {
  const tryCmds = [cmd];

  if (cmd === "node" && process.execPath) {
    tryCmds.push(process.execPath);
  }

  for (const c of tryCmds) {
    const r = spawnSync(c, args, {
      stdio: "inherit",
      shell: false,
      ...opts,
    });

    if (!r.error) {
      if (r.status !== 0) process.exit(r.status || 1);
      return;
    }

    if (r.error && String(r.error.code) === "ENOENT") continue;

    console.error("[RUN] spawn error:", r.error.message || r.error);
    process.exit(1);
  }

  console.error("[RUN] spawn error: node not found (ENOENT)");
  process.exit(1);
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
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date());
}

function hmNowSP() {
  // HH:mm em America/Sao_Paulo
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return fmt.format(new Date());
}

function isYMD(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || "").trim());
}

function ymdToInt(ymd) {
  const s = String(ymd || "").trim();
  if (!isYMD(s)) return null;
  return Number(s.replace(/-/g, ""));
}

function clampEndToTodaySP(endYmd) {
  const today = ymdNowSP();
  const endInt = ymdToInt(endYmd);
  const todayInt = ymdToInt(today);

  if (!endInt || !todayInt) return { end: today, adjusted: true };
  if (endInt > todayInt) return { end: today, adjusted: true };

  return { end: String(endYmd || "").trim(), adjusted: false };
}

function addDays(ymd, n) {
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

function checkHealth(baseUrl, timeoutMs = 2500) {
  return new Promise((resolve) => {
    try {
      const u = new URL(baseUrl.replace(/\/+$/, "") + "/health");
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

      req.on("timeout", () => req.destroy(new Error("timeout")));

      req.on("error", (e) =>
        resolve({
          ok: false,
          status: 0,
          error: e?.message || String(e),
        })
      );

      req.end();
    } catch (e) {
      resolve({
        ok: false,
        status: 0,
        error: e?.message || String(e),
      });
    }
  });
}

/**
 * ✅ NOVO: resolve logs (audit/plan) de forma robusta
 * - prioriza match exato start->end
 * - fallback: arquivo mais recente do lottery
 */
const LOG_DIR = path.join(__dirname, "..", "logs");

function listFilesSafe(dir) {
  try {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
}

function statMtimeMsSafe(p) {
  try {
    return Number(fs.statSync(p).mtimeMs || 0);
  } catch {
    return 0;
  }
}

function pickLogFile({ kind, lottery, start, end }) {
  const lot = String(lottery || "").trim().toUpperCase();
  const s = String(start || "").trim();
  const e = String(end || "").trim();

  const dir = LOG_DIR;
  const files = listFilesSafe(dir);
  if (!files.length) return null;

  // e.g. auditSlots-PT_RIO-2022-06-07_to_2026-02-28.json
  const baseRe = new RegExp(
    `^${kind}-${lot}-\\d{4}-\\d{2}-\\d{2}_to_\\d{4}-\\d{2}-\\d{2}\\.json$`,
    "i"
  );

  const candidates = files
    .filter((f) => baseRe.test(f))
    .map((f) => {
      const m = f.match(
        new RegExp(`^${kind}-${lot}-(\\d{4}-\\d{2}-\\d{2})_to_(\\d{4}-\\d{2}-\\d{2})\\.json$`, "i")
      );
      const fStart = m?.[1] || "";
      const fEnd = m?.[2] || "";
      const full = path.join(dir, f);
      return { f, full, fStart, fEnd, mtimeMs: statMtimeMsSafe(full) };
    });

  if (!candidates.length) return null;

  // 1) match exato
  const exact = candidates.filter((c) => c.fStart === s && c.fEnd === e);
  if (exact.length) {
    exact.sort((a, b) => b.mtimeMs - a.mtimeMs);
    return exact[0].full;
  }

  // 2) fallback: mais recente (do lottery)
  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return candidates[0].full;
}

function pickAuditFile(lottery, start, end) {
  return pickLogFile({ kind: "auditSlots", lottery, start, end });
}

function pickPlanFile(lottery, start, end) {
  return pickLogFile({ kind: "backfillPlan", lottery, start, end });
}

async function main() {
  const lottery = String(parseArg("lottery", "PT_RIO"))
    .trim()
    .toUpperCase();

  let days = Number(parseArg("days", "30"));
  if (!Number.isFinite(days) || days <= 0) days = 30;

  const baseUrl = String(parseArg("baseUrl", "http://127.0.0.1:3333"))
    .trim()
    .replace(/\/+$/, "");

  const todayRaw = String(parseArg("today", ymdNowSP())).trim();
  const todayCandidate = isYMD(todayRaw) ? todayRaw : ymdNowSP();

  const clamp = clampEndToTodaySP(todayCandidate);
  const end = clamp.end;

  const span = Math.max(1, days) - 1;
  const start = addDays(end, -span);

  const auditScript = path.join(__dirname, "auditDrawSlotsRange.js");
  const planScript = path.join(__dirname, "planBackfillFromAudit.js");
  const runScript = path.join(__dirname, "runBackfillFromPlan.js");

  // ✅ cap “saudável” pro dia atual (evita cobrar slot que a fonte ainda não publicou)
  // default 75 (pode ajustar via --slotGraceMin=90, etc.)
  let slotGraceMin = Number(parseArg("slotGraceMin", "75"));
  if (!Number.isFinite(slotGraceMin) || slotGraceMin < 0) slotGraceMin = 75;

  // ✅ por padrão, NUNCA rodar backfill para o dia atual (só se forçar)
  const allowTodayBackfill = hasFlag("allowTodayBackfill");
  const todaySP = ymdNowSP();
  const nowHM = String(parseArg("nowHM", hmNowSP())).trim() || hmNowSP();
  const todayForAudit = end; // audit usa "today" = end do window (para cap do dia)

  console.log("==================================");
  console.log(`[MAINTAIN] lottery=${lottery} window=${start} -> ${end} days=${days}`);
  console.log(`todaySP=${todaySP} nowHM=${nowHM} slotGraceMin=${slotGraceMin}`);
  console.log(`allowTodayBackfill=${allowTodayBackfill ? "YES" : "NO"}`);
  console.log("==================================");

  const health = await checkHealth(baseUrl, 2500);
  if (!health.ok) {
    console.error(`[MAINTAIN] Backend OFF/sem health em ${baseUrl}/health`);
    process.exit(4);
  }

  // ✅ AUDIT com parâmetros explícitos (SP) para o cap do "today"
  run("node", [
    auditScript,
    lottery,
    start,
    end,
    `--today=${todayForAudit}`,
    `--nowHM=${nowHM}`,
    `--slotGraceMin=${slotGraceMin}`,
  ]);

  // ✅ NOVO: resolve o audit certo (match exato > mais recente do lottery)
  const auditPicked = pickAuditFile(lottery, start, end);

  if (!auditPicked) {
    console.log("[MAINTAIN] Não achei audit log para gerar plan.");
    process.exit(2);
  }

  const auditObj = safeReadJson(auditPicked);
  if (!auditObj) {
    console.error(`[MAINTAIN] Audit inválido: ${auditPicked}`);
    process.exit(2);
  }

  run("node", [planScript, auditPicked, baseUrl, lottery]);

  // ✅ NOVO: resolve o plan certo (match exato > mais recente do lottery)
  const planPicked = pickPlanFile(lottery, start, end);

  if (!planPicked) {
    console.log("[MAINTAIN] Não achei backfillPlan gerado.");
    process.exit(3);
  }

  const plan = safeReadJson(planPicked);
  if (!plan) {
    console.error(`[MAINTAIN] Plan inválido: ${planPicked}`);
    process.exit(3);
  }

  const rows = Array.isArray(plan.rows) ? plan.rows : [];
  const todayYmd = todaySP;

  // ✅ FILTRO CRÍTICO:
  // Por padrão, NÃO fazemos backfill para o dia atual.
  // Isso evita:
  // - “API_NO_SLOT” falso (fonte ainda publicando)
  // - escrita indevida em source_gaps para HOJE
  const should = rows.filter((r) => {
    if (!r || !r.shouldBackfill) return false;
    const ymd = String(r.ymd || "").trim();
    if (!allowTodayBackfill && ymd === todayYmd) return false;
    return true;
  });

  if (!should.length) {
    const rawShould = rows.filter((r) => r && r.shouldBackfill);
    const hadOnlyToday = rawShould.length > 0 && should.length === 0;

    if (hadOnlyToday) {
      console.log(
        `[MAINTAIN] Plan tinha slots marcados para HOJE (${todayYmd}), mas backfill do dia atual está desativado (por padrão).`
      );
      console.log(`[MAINTAIN] Se quiser forçar: acrescente --allowTodayBackfill`);
    } else {
      console.log(`[MAINTAIN] Plan com 0 slots para backfill. Nada a fazer.`);
    }
    return;
  }

  console.log(`[MAINTAIN] Backfill necessário (excluindo hoje): days=${should.length}`);

  run("node", [runScript, planPicked]);

  // ✅ re-audit após backfill (com os mesmos parâmetros)
  run("node", [
    auditScript,
    lottery,
    start,
    end,
    `--today=${todayForAudit}`,
    `--nowHM=${nowHM}`,
    `--slotGraceMin=${slotGraceMin}`,
  ]);
}

main().catch((e) => {
  console.error("ERR:", e?.stack || e?.message || e);
  process.exit(1);
});