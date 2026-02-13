"use strict";

const fs = require("fs");
const path = require("path");

function isYmd(s){ return /^\d{4}-\d{2}-\d{2}$/.test(String(s||"").trim()); }

function pickYmd(item){
  if (!item) return null;

  // "2025-01-01"
  if (typeof item === "string") {
    const s = item.trim().slice(0,10);
    return isYmd(s) ? s : null;
  }

  // ["2025-01-01", ...]
  if (Array.isArray(item)) {
    const s = String(item[0] || "").trim().slice(0,10);
    return isYmd(s) ? s : null;
  }

  // { ymd: "..."} or { date: "..."} or { day: "..."} etc.
  if (typeof item === "object") {
    const cand =
      item.ymd ??
      item.date ??
      item.day ??
      item.d ??
      item.key ??
      item.YMD ??
      null;

    const s = String(cand || "").trim().slice(0,10);
    return isYmd(s) ? s : null;
  }

  return null;
}

(function main(){
  const logFile = path.join(__dirname, "..", "logs", "auditSlots-FEDERAL-2022-06-08_to_2026-02-13.json");
  const outFile = path.join(__dirname, "..", "data", "no_draw_days", "FEDERAL.json");

  const j = JSON.parse(fs.readFileSync(logFile, "utf8"));

  const out = new Set();

  // 1) principal: missingHardByDay
  if (Array.isArray(j.missingHardByDay)) {
    for (const it of j.missingHardByDay) {
      const y = pickYmd(it);
      if (y) out.add(y);
    }
  }

  // 2) fallback: alguns builds salvam "missingHardDays" como array de strings
  if (!out.size && Array.isArray(j.missingHardDays)) {
    for (const it of j.missingHardDays) {
      const y = pickYmd(it);
      if (y) out.add(y);
    }
  }

  // 3) fallback: busca por padrão no JSON (último recurso)
  if (!out.size) {
    const all = JSON.stringify(j);
    const re = /"(\d{4}-\d{2}-\d{2})"\s*:\s*\{\s*"missingHard"/g;
    let m;
    while ((m = re.exec(all))) out.add(m[1]);
  }

  const days = Array.from(out).sort();

  const payload = {
    lotteryKey: "FEDERAL",
    days,
    generatedFrom: path.basename(logFile),
    generatedAt: new Date().toISOString(),
  };

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(payload, null, 2) + "\n", "utf8");

  console.log("[OK] wrote", outFile);
  console.log("days:", days.length);
  if (days.length <= 120) console.log(days.join(", "));
})();
