const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const START = "2022-06-07";
const END = "2026-07-08";

const RJ_KEYS = ["PT_RIO", "RIO", "RJ"];

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (name.toLowerCase().endsWith(".json")) out.push(p);
  }
  return out;
}

function isYMD(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || "").trim());
}

function toYMD(d) {
  return d.toISOString().slice(0, 10);
}

function addDays(ymd, n) {
  const d = new Date(ymd + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return toYMD(d);
}

function normHour(v) {
  const s = String(v || "").trim().toLowerCase();
  const m = s.match(/(\d{1,2})(?::\d{2})?\s*h?/);
  if (!m) return "";
  return String(Number(m[1])).padStart(2, "0") + "h";
}

function pickYmd(o) {
  return String(o?.ymd || o?.date || o?.data || o?.drawDate || "").slice(0,10);
}

function pickHour(o) {
  return normHour(o?.hour || o?.hora || o?.drawHour || o?.slot || o?.horario);
}

function hasPrizes(o) {
  const p = o?.prizes || o?.premios || o?.results || o?.resultados;
  return Array.isArray(p) && p.length > 0;
}

const files = walk(path.join(ROOT, "backend"))
  .filter(p => RJ_KEYS.some(k => p.toUpperCase().includes(k)));

const rows = [];

for (const file of files) {
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    const arr = Array.isArray(data) ? data : Array.isArray(data?.draws) ? data.draws : Array.isArray(data?.results) ? data.results : [];

    for (const r of arr) {
      const ymd = pickYmd(r);
      const hour = pickHour(r);
      if (!isYMD(ymd) || !hour) continue;
      if (ymd < START || ymd > END) continue;

      rows.push({
        ymd,
        hour,
        file,
        ok: hasPrizes(r),
        raw: r
      });
    }
  } catch {}
}

const byKey = new Map();
for (const r of rows) {
  const k = `${r.ymd}|${r.hour}`;
  if (!byKey.has(k)) byKey.set(k, []);
  byKey.get(k).push(r);
}

const scheduleNormal = ["09h", "11h", "14h", "16h", "18h", "21h"];
const scheduleWedSat = ["09h", "11h", "14h", "16h", "18h", "21h"];

const missing = [];
const incomplete = [];

for (let d = START; d <= END; d = addDays(d, 1)) {
  const dow = new Date(d + "T00:00:00Z").getUTCDay();
  const schedule = (dow === 3 || dow === 6) ? scheduleWedSat : scheduleNormal;

  for (const h of schedule) {
    const k = `${d}|${h}`;
    const found = byKey.get(k) || [];

    if (!found.length) {
      missing.push({ ymd: d, hour: h });
    } else if (!found.some(x => x.ok)) {
      incomplete.push({ ymd: d, hour: h, files: found.map(x => path.relative(ROOT, x.file)) });
    }
  }
}

console.log("========== AUDITORIA RJ ==========");
console.log("Período:", START, "até", END);
console.log("Arquivos RJ encontrados:", files.length);
console.log("Registros RJ encontrados:", rows.length);
console.log("Sorteios únicos encontrados:", byKey.size);
console.log("Furos sem registro:", missing.length);
console.log("Registros sem prêmios:", incomplete.length);

console.log("\n--- ÚLTIMOS 20 REGISTROS ENCONTRADOS ---");
console.table(
  rows
    .slice()
    .sort((a,b) => `${b.ymd} ${b.hour}`.localeCompare(`${a.ymd} ${a.hour}`))
    .slice(0,20)
    .map(x => ({
      data: x.ymd,
      hora: x.hour,
      premios: x.ok ? "OK" : "VAZIO",
      arquivo: path.relative(ROOT, x.file)
    }))
);

console.log("\n--- PRIMEIROS 80 FUROS ---");
console.table(missing.slice(0,80));

console.log("\n--- PRIMEIROS 40 INCOMPLETOS ---");
console.table(incomplete.slice(0,40));

fs.writeFileSync(
  path.join(ROOT, "audit_rj_resultados.json"),
  JSON.stringify({ start: START, end: END, files, totalRows: rows.length, uniqueDraws: byKey.size, missing, incomplete }, null, 2),
  "utf8"
);

console.log("\nArquivo gerado: audit_rj_resultados.json");
