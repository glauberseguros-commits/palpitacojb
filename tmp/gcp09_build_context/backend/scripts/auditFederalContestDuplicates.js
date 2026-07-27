const fs = require("fs");
const path = require("path");

(function ensureGoogleCredentials() {
  try {
    const current = String(process.env.GOOGLE_APPLICATION_CREDENTIALS || "").trim();

    if (current && fs.existsSync(current)) return;

    if (current) {
      try {
        delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
      } catch {
        process.env.GOOGLE_APPLICATION_CREDENTIALS = "";
      }
    }

    const tryPickFromDir = (dir) => {
      try {
        const entries = fs.readdirSync(dir);
        const hits = entries
          .filter((f) => /^palpitacojb-app-firebase-adminsdk-.*\.json$/i.test(f))
          .map((f) => path.join(dir, f))
          .filter((x) => fs.existsSync(x) && fs.lstatSync(x).isFile())
          .sort();

        return hits[0] || "";
      } catch {
        return "";
      }
    };

    const dirs = [
      process.cwd(),
      path.join(process.cwd(), "secrets"),
      __dirname,
      path.join(__dirname, ".."),
      path.join(__dirname, "..", ".."),
      path.join(__dirname, "..", "..", "secrets"),
    ];

    for (const dir of dirs) {
      const hit = tryPickFromDir(dir);
      if (hit) {
        process.env.GOOGLE_APPLICATION_CREDENTIALS = hit;
        return;
      }
    }
  } catch {}
})();

const admin = require("firebase-admin");
const START = process.argv[2] || "2022-06-08";
const END = process.argv[3] || "2026-07-08";

function safeStr(v) {
  return String(v ?? "").trim();
}

function pickDate(d) {
  return safeStr(d.date || d.drawDate || d.ymd || d.data);
}

function pickHour(d) {
  return safeStr(d.closeHour || d.hour || d.time || d.hora);
}

function pickResultHash(d) {
  const prizes = d.prizes || d.result || d.results || d.dezenas || d.numbers || [];
  return JSON.stringify(prizes);
}


function keyFor(row) {
  const prizes = Array.isArray(row.prizes)
    ? row.prizes
    : Object.values(row.prizes || {});

  const normalized = prizes
    .map((p) => String(p || "").padStart(4, "0"))
    .join("|");

  return `${row.date}::${normalized}`;
}


function scoreDoc(d) {
  let score = 0;
  if (pickDate(d)) score += 10;
  if (pickHour(d)) score += 5;
  if (Array.isArray(d.prizes) && d.prizes.length) score += 50;
  if (Array.isArray(d.results) && d.results.length) score += 30;
  if (d.lotteryKey === "FEDERAL") score += 20;
  if (d.source) score += 5;
  if (d.createdAt) score += 2;
  if (d.updatedAt) score += 3;
  return score;
}



async function main() {
  if (!admin.apps.length) {
    admin.initializeApp();
  }

  const db = admin.firestore();

  const snap = await db.collection("draws").get();

  const docs = [];

  snap.forEach((doc) => {
    const data = doc.data() || {};
    const lotteryKey = safeStr(data.lottery_key || data.lotteryKey).toUpperCase();
    if (lotteryKey !== "FEDERAL") return;

    const date = pickDate(data);

    if (date >= START && date <= END) {
      docs.push({
        id: doc.id,
        refPath: doc.ref.path,
        data,
        date,
        hour: pickHour(data),
        key: keyFor({
          date,
          prizes:
            data.prizes ||
            data.results ||
            data.result ||
            [],
        }),
        score: scoreDoc(data),
      });
    }
  });

  const groups = new Map();

  for (const d of docs) {
    if (!groups.has(d.key)) groups.set(d.key, []);
    groups.get(d.key).push(d);
  }

  const duplicated = [];
  const keep = [];
  const remove = [];

  for (const [key, arr] of groups.entries()) {
    arr.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return String(a.id).localeCompare(String(b.id));
    });

    keep.push(arr[0]);

    if (arr.length > 1) {
      duplicated.push({ key, count: arr.length, keep: arr[0], remove: arr.slice(1) });
      remove.push(...arr.slice(1));
    }
  }

  const report = {
    start: START,
    end: END,
    totalDocs: docs.length,
    uniqueKeys: groups.size,
    duplicatedKeys: duplicated.length,
    docsToKeep: keep.length,
    docsToRemove: remove.length,
    duplicated: duplicated.map((g) => ({
      key: g.key,
      count: g.count,
      keep: {
        id: g.keep.id,
        path: g.keep.refPath,
        date: g.keep.date,
        hour: g.keep.hour,
        score: g.keep.score,
      },
      remove: g.remove.map((r) => ({
        id: r.id,
        path: r.refPath,
        date: r.date,
        hour: r.hour,
        score: r.score,
      })),
    })),
  };

  const outDir = path.join(__dirname, "..", "logs");
  fs.mkdirSync(outDir, { recursive: true });

  const outFile = path.join(
    outDir,
    `federal-duplicates-dry-run-${START}_to_${END}.json`
  );

  fs.writeFileSync(outFile, JSON.stringify(report, null, 2), "utf8");

  console.log("");
  console.log("========== FEDERAL DUPLICIDADES — DRY RUN ==========");
  console.log(`Documentos FEDERAL no período: ${report.totalDocs}`);
  console.log(`Chaves únicas: ${report.uniqueKeys}`);
  console.log(`Chaves duplicadas: ${report.duplicatedKeys}`);
  console.log(`Manter: ${report.docsToKeep}`);
  console.log(`Remover se aplicar: ${report.docsToRemove}`);
  console.log(`Arquivo: ${outFile}`);
  console.log("");
  console.log("Primeiras duplicidades:");
  report.duplicated.slice(0, 20).forEach((g) => {
    console.log(
      `dup | ${g.key} | count=${g.count} | keep=${g.keep.id} ${g.keep.date} ${g.keep.hour} | remove=${g.remove.map((x) => x.id).join(",")}`
    );
  });
}

main().catch((e) => {
  console.error("ERRO:", e);
  process.exit(1);
});
