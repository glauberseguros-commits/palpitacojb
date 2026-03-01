"use strict";

const fs = require("fs");
const path = require("path");

function pad2(n) {
  return String(n).padStart(2, "0");
}

// ✅ ISO estrito (evita 2026-99-99 passar no regex)
function isISODateStrict(s) {
  const str = String(s || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;

  const [y, m, d] = str.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

function normalizeLotteryKey(v, fallback = "PT_RIO") {
  const s = String(v ?? "").trim().toUpperCase();

  if (s === "RJ" || s === "RIO" || s === "PT-RIO" || s === "PT_RIO")
    return "PT_RIO";
  if (s === "FED" || s === "FEDERAL") return "FEDERAL";

  return fallback;
}

/**
 * Hora robusta:
 * aceita "11:09", "11:09:00", "11h", "11hs", "11", "09-09", "09hs", etc.
 * retorna "HH" (2 dígitos) ou null
 */
function hourFromCloseHour(closeHour) {
  const s0 = String(closeHour ?? "").trim();
  if (!s0) return null;

  const m = s0.match(/(\d{1,2})/);
  if (!m) return null;

  const hh = Number(m[1]);
  if (!Number.isFinite(hh) || hh < 0 || hh > 23) return null;

  return pad2(hh);
}

function uniqSorted(arr) {
  return Array.from(new Set(arr)).sort();
}

function toAbs(p) {
  return path.isAbsolute(p) ? p : path.join(process.cwd(), p);
}

function envInt(name, def) {
  const v = Number(process.env[name]);
  return Number.isFinite(v) ? v : def;
}

function safeReadJson(fp) {
  try {
    const txt = fs.readFileSync(fp, "utf8");
    return JSON.parse(txt);
  } catch {
    return null;
  }
}

// ✅ audit “mínimo” = tem missingHardByDay (mesmo vazio)
function looksLikeAuditJson(j) {
  return !!(j && Array.isArray(j.missingHardByDay));
}

function hardCount(j) {
  return Array.isArray(j?.missingHardByDay) ? j.missingHardByDay.length : 0;
}

function inferLotteryFromJsonOrName(fp, j) {
  const byJson = String(j?.lottery || j?.loteria || j?.uf || "").trim();
  if (byJson) return normalizeLotteryKey(byJson, "");

  const name = path.basename(fp).toUpperCase();
  if (name.includes("PT_RIO") || name.includes("PT-RIO") || name.includes("RJ"))
    return "PT_RIO";
  if (name.includes("FEDERAL") || name.includes("FED")) return "FEDERAL";
  return "";
}

function walkFiles(dir, { maxFiles = 8000 } = {}) {
  const out = [];
  const stack = [dir];

  while (stack.length) {
    const cur = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(cur, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const ent of entries) {
      const fp = path.join(cur, ent.name);
      if (ent.isDirectory()) {
        if (ent.name === "node_modules" || ent.name === ".git") continue;
        stack.push(fp);
      } else if (ent.isFile()) {
        out.push(fp);
        if (out.length >= maxFiles) return out;
      }
    }
  }

  return out;
}

/**
 * Auto-descobre o audit “melhor” PARA UMA LOTERIA:
 * - filtra por lottery (nome ou json)
 * - ordena por (hardCount desc, mtime desc)
 */
function findBestAuditFileForLottery(lottery) {
  const L = normalizeLotteryKey(lottery, "PT_RIO");

  const candidatesDirs = [
    path.join(process.cwd(), "backend", "data"),
    path.join(process.cwd(), "backend", "logs"),
    path.join(process.cwd(), "backend"),
  ];

  const candidates = [];

  for (const d of candidatesDirs) {
    if (!fs.existsSync(d)) continue;

    const files = walkFiles(d, { maxFiles: 8000 }).filter((fp) => {
      const name = path.basename(fp).toLowerCase();
      return name.endsWith(".json") && name.includes("audit");
    });

    for (const fp of files) {
      let st;
      try {
        st = fs.statSync(fp);
      } catch {
        continue;
      }

      const j = safeReadJson(fp);
      if (!looksLikeAuditJson(j)) continue;

      const lot = inferLotteryFromJsonOrName(fp, j);
      if (lot !== L) continue;

      candidates.push({ fp, mtimeMs: st.mtimeMs, hard: hardCount(j) });
    }
  }

  candidates.sort((a, b) => (b.hard - a.hard) || (b.mtimeMs - a.mtimeMs));
  return candidates.length ? candidates[0].fp : null;
}

async function getFetch() {
  if (typeof fetch === "function") return fetch;

  try {
    // eslint-disable-next-line global-require
    const mod = require("node-fetch");
    return mod.default || mod;
  } catch (e) {
    throw new Error(
      "Este Node não possui fetch global e o pacote 'node-fetch' não está instalado. " +
        "Use Node 18+ ou instale: npm i node-fetch"
    );
  }
}

/**
 * fetch JSON com timeout + retry
 * ENV:
 * - FETCH_TIMEOUT_MS (default 15000)
 * - FETCH_RETRIES (default 2)
 * - FETCH_RETRY_DELAY_MS (default 600)
 */
async function fetchJson(url) {
  const _fetch = await getFetch();

  const TIMEOUT_MS = envInt("FETCH_TIMEOUT_MS", 15000);
  const RETRIES = envInt("FETCH_RETRIES", 2);
  const DELAY_MS = envInt("FETCH_RETRY_DELAY_MS", 600);

  const maxAttempts = 1 + Math.max(0, RETRIES);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const ctrl =
      typeof AbortController !== "undefined" ? new AbortController() : null;
    const t = ctrl ? setTimeout(() => ctrl.abort(), TIMEOUT_MS) : null;

    try {
      const r = await _fetch(url, {
        headers: { accept: "application/json" },
        signal: ctrl ? ctrl.signal : undefined,
      });

      const txt = await r.text();
      let j = null;
      try {
        j = JSON.parse(txt);
      } catch {}

      if (!r.ok) {
        const msg = j && j.error ? j.error : txt || `HTTP ${r.status}`;
        throw new Error(msg);
      }

      // ✅ IMPORTANT: API pode responder 200 com ok:false
      if (j && j.ok === false) {
        const msg = j.error || j.message || "Resposta ok:false";
        throw new Error(msg);
      }

      return j;
    } catch (e) {
      const isLast = attempt === maxAttempts;
      const msg =
        e?.name === "AbortError"
          ? `timeout após ${TIMEOUT_MS}ms`
          : e?.message || String(e);

      if (isLast) throw new Error(`${msg} (url=${url})`);

      // retry
      // eslint-disable-next-line no-console
      console.warn(
        `[WARN] fetch falhou (${attempt}/${maxAttempts}) url=${url} => ${msg}`
      );
      if (DELAY_MS > 0) await new Promise((r) => setTimeout(r, DELAY_MS));
    } finally {
      if (t) clearTimeout(t);
    }
  }

  throw new Error("fetchJson: falha inesperada");
}

function isDayNoDraw({ blocked, dayStatus, blockedReason }) {
  const ds = String(dayStatus || "").trim();
  const br = String(blockedReason || "").trim();

  if (ds === "holiday_no_draw") return true;
  if (blocked === true && ds === "holiday_no_draw") return true;
  if (blocked === true && (br === "holiday_no_draw" || br === "day_no_draw"))
    return true;

  return false;
}

async function main() {
  const baseUrl = String(process.argv[3] || "http://127.0.0.1:3333")
    .trim()
    .replace(/\/+$/, "");
  const lotteryRaw = process.argv[4] || "PT_RIO";
const lottery = normalizeLotteryKey(lotteryRaw, "");
if (!lottery) {
  throw new Error(`lottery inválida: ${lotteryRaw} (use PT_RIO ou FEDERAL)`);
}

  let auditPathArg = process.argv[2];

  // ✅ Se não passou arg (ou passou ""), tenta auto-descobrir PARA ESTA LOTERIA
  if (!auditPathArg) {
    const found = findBestAuditFileForLottery(lottery);
    if (!found) {
      throw new Error(
        "Uso: node backend/scripts/planBackfillFromAudit.js <audit-json-path> [baseUrl] [lottery]\n" +
          `E não encontrei nenhum audit automaticamente para ${lottery} (procurei em backend/data, backend/logs e backend).`
      );
    }
    auditPathArg = found;
    // eslint-disable-next-line no-console
    console.log(`[INFO] audit não informado. Usando o melhor para ${lottery}: ${found}`);
  }

  let auditPath = toAbs(auditPathArg);

  // ✅ Se caminho informado não existe, tenta auto-descobrir PARA ESTA LOTERIA
  if (!fs.existsSync(auditPath)) {
    const found = findBestAuditFileForLottery(lottery);
    if (!found) {
      throw new Error(
        `Arquivo não encontrado: ${auditPath}\n` +
          `Também não encontrei audit automaticamente para ${lottery} (procurei em backend/data, backend/logs e backend).`
      );
    }
    auditPath = found;
    // eslint-disable-next-line no-console
    console.log(
      `[INFO] arquivo informado não existe. Usando o melhor para ${lottery}: ${found}`
    );
  }

  const audit = safeReadJson(auditPath);
  if (!looksLikeAuditJson(audit)) {
    throw new Error(
      `O JSON não parece um audit válido (precisa ter missingHardByDay array): ${auditPath}`
    );
  }

  // ✅ segurança: garante que o audit é da mesma loteria
  const inferred = inferLotteryFromJsonOrName(auditPath, audit);
  if (inferred && inferred !== lottery) {
    throw new Error(
      `Audit encontrado parece ser de ${inferred}, mas você pediu ${lottery}. auditFile=${auditPath}`
    );
  }

  const missingHardByDay = Array.isArray(audit?.missingHardByDay)
    ? audit.missingHardByDay
    : [];

  if (missingHardByDay.length === 0) {
    // eslint-disable-next-line no-console
    console.warn(
      `[WARN] Audit carregado para ${lottery}, mas missingHardByDay está vazio. ` +
        `Plano de backfill ficará zerado. auditFile=${auditPath}`
    );
  }

  const missingMap = new Map();
  for (const x of missingHardByDay) {
    const ymd = String(x?.ymd || "").trim();
    if (!isISODateStrict(ymd)) continue;

    const rawMissing = Array.isArray(x?.missing) ? x.missing : [];
    const normalizedMissing = rawMissing
      .map((hh) => {
        const m = String(hh ?? "").match(/\d{1,2}/);
        return m ? pad2(m[0]) : null;
      })
      .filter(
        (hh) =>
          /^\d{2}$/.test(String(hh || "")) &&
          Number(hh) >= 0 &&
          Number(hh) <= 23
      );

    const prev = missingMap.get(ymd) || [];
    missingMap.set(ymd, uniqSorted(prev.concat(normalizedMissing)));
  }

  const dates = uniqSorted(Array.from(missingMap.keys()));

  const rows = [];
  for (const ymd of dates) {
    const url = `${baseUrl}/api/pitaco/results?date=${encodeURIComponent(
      ymd
    )}&lottery=${encodeURIComponent(lottery)}&includePrizes=0`;
    const res = await fetchJson(url);

    const blocked = !!res?.blocked;
    const blockedReason = String(res?.blockedReason || "").trim();
    const dayStatus = String(res?.dayStatus || "").trim();

    const draws = Array.isArray(res?.draws) ? res.draws : [];

    const presentHours = uniqSorted(
      draws
        .map((d) =>
          hourFromCloseHour(d?.close_hour ?? d?.closeHour ?? d?.hora ?? d?.hour)
        )
        .filter(
          (hh) =>
            /^\d{2}$/.test(String(hh || "")) &&
            Number(hh) >= 0 &&
            Number(hh) <= 23
        )
    );

    const missing = missingMap.get(ymd) || [];
    const dayNoDraw = isDayNoDraw({ blocked, dayStatus, blockedReason });

    const shouldBackfill = !dayNoDraw && missing.length > 0;

    rows.push({
      ymd,
      dayStatus,
      blocked,
      blockedReason,
      dayNoDraw,
      presentHours,
      missingHard: missing,
      shouldBackfill,
    });
  }

  const plan = {
    lottery,
    auditFile: auditPath,
    baseUrl,
    generatedAt: new Date().toISOString(),
    totals: {
      daysMissingHard: rows.length,
      daysBlocked: rows.filter((r) => r.blocked).length,
      daysNoDraw: rows.filter((r) => r.dayNoDraw).length,
      daysToBackfill: rows.filter((r) => r.shouldBackfill).length,
      slotsToBackfill: rows
        .filter((r) => r.shouldBackfill)
        .reduce((a, r) => a + (r.missingHard?.length || 0), 0),
    },
    rows,
    backfillDays: rows
      .filter((r) => r.shouldBackfill)
      .map((r) => ({
        ymd: r.ymd,
        missingHours: r.missingHard,
        dayStatus: r.dayStatus,
        presentHours: r.presentHours,
      })),
  };

  const logsDir = path.join(__dirname, "..", "logs");
  const out = path.join(
    logsDir,
    `backfillPlan-${lottery}-${String(audit?.startYmd || "start")}_to_${String(
      audit?.endYmd || "end"
    )}.json`
  );

  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(plan, null, 2));

  console.log("==================================");
  console.log("[PLAN] Backfill gerado:");
  console.log(out);
  console.log("[TOTALS]", plan.totals);
  console.log("==================================");
}

main().catch((e) => {
  console.error("ERRO:", e?.stack || e?.message || e);
  process.exit(1);
});
