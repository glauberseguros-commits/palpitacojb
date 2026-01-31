"use strict";

const fs = require("fs");
const path = require("path");

function isISODate(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || "").trim());
}

function pad2(n) {
  return String(n).padStart(2, "0");
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

async function getFetch() {
  // Node 18+ normalmente tem fetch global.
  if (typeof fetch === "function") return fetch;

  // fallback: node-fetch (se existir)
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
 * - FETCH_RETRIES (default 2) => total tentativas = 1 + retries
 * - FETCH_RETRY_DELAY_MS (default 600)
 */
async function fetchJson(url) {
  const _fetch = await getFetch();

  const TIMEOUT_MS = envInt("FETCH_TIMEOUT_MS", 15000);
  const RETRIES = envInt("FETCH_RETRIES", 2);
  const DELAY_MS = envInt("FETCH_RETRY_DELAY_MS", 600);

  const maxAttempts = 1 + Math.max(0, RETRIES);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
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

      return j;
    } catch (e) {
      const isLast = attempt === maxAttempts;
      const msg = e?.name === "AbortError"
        ? `timeout após ${TIMEOUT_MS}ms`
        : (e?.message || String(e));

      if (isLast) throw new Error(msg);

      // retry
      // eslint-disable-next-line no-console
      console.warn(`[WARN] fetch falhou (${attempt}/${maxAttempts}) => ${msg}`);
      if (DELAY_MS > 0) await new Promise((r) => setTimeout(r, DELAY_MS));
    } finally {
      if (t) clearTimeout(t);
    }
  }

  throw new Error("fetchJson: falha inesperada");
}

async function main() {
  const auditPathArg = process.argv[2];
  const baseUrl = String(process.argv[3] || "http://localhost:3333")
    .trim()
    .replace(/\/+$/, "");
  const lottery = String(process.argv[4] || "PT_RIO").trim().toUpperCase();

  if (!auditPathArg) {
    throw new Error(
      "Uso: node backend/scripts/planBackfillFromAudit.js <audit-json-path> [baseUrl] [lottery]"
    );
  }

  const auditPath = toAbs(auditPathArg);
  if (!fs.existsSync(auditPath)) {
    throw new Error(`Arquivo não encontrado: ${auditPath}`);
  }

  const audit = JSON.parse(fs.readFileSync(auditPath, "utf8"));

  const missingHardByDay = Array.isArray(audit?.missingHardByDay)
    ? audit.missingHardByDay
    : [];

  // index por dia (evita find() dentro do loop)
  const missingMap = new Map();
  for (const x of missingHardByDay) {
    const ymd = String(x?.ymd || "").trim();
    if (!isISODate(ymd)) continue;

    const rawMissing = Array.isArray(x?.missing) ? x.missing : [];
    const normalizedMissing = uniqSorted(
      rawMissing
        .map((hh) => {
          const m = String(hh ?? "").match(/\d{1,2}/);
          return m ? pad2(m[0]) : null;
        })
        .filter((hh) => /^\d{2}$/.test(String(hh || "")))
    );

    missingMap.set(ymd, normalizedMissing);
  }

  // ✅ dedup + sort por data (evita repetir dia, mantém plano estável)
  const dates = uniqSorted(Array.from(missingMap.keys()));

  const rows = [];
  for (const ymd of dates) {
    const url = `${baseUrl}/api/pitaco/results?date=${ymd}&lottery=${lottery}`;
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
        .filter((hh) => /^\d{2}$/.test(String(hh || "")))
    );

    const missing = missingMap.get(ymd) || [];

    // ✅ regra: só backfill se não estiver bloqueado e tiver missing hard
    const shouldBackfill = !blocked && missing.length > 0;

    rows.push({
      ymd,
      dayStatus,
      blocked,
      blockedReason,
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

  const out = path.join(
    process.cwd(),
    "backend",
    "logs",
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
