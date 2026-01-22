"use strict";

/**
 * Backfill de ymd na coleção draws
 * - Preenche ymd (YYYY-MM-DD) a partir de date/data/dt/draw_date/close_date ou Timestamp
 * - Só escreve quando ymd estiver ausente ou inválido
 *
 * Uso:
 *  DRY RUN (não grava):
 *    node scripts/backfillYmdDraws.js --dry
 *
 *  Gravar de fato:
 *    node scripts/backfillYmdDraws.js
 *
 *  Opcional:
 *    --limit=2000         (limita quantos docs processar)
 *    --startAfter=<docId> (continua depois de um id, útil para retomar)
 *    --sampleInvalid=10   (mostra até N exemplos de docs sem candidato válido)
 */

const { getDb, admin } = require("../service/firebaseAdmin");

const TZ = "America/Sao_Paulo";

function pad2(n) {
  return String(n).padStart(2, "0");
}

function isYMD(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || "").trim());
}

/**
 * Converte Date -> YYYY-MM-DD considerando timezone fixo (SP).
 * Evita “virar o dia” quando roda em UTC (GitHub Actions).
 */
function dateToYMD_TZ(d, timeZone = TZ) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return null;

  // en-CA => yyyy-mm-dd
  try {
    const ymd = d.toLocaleDateString("en-CA", { timeZone });
    return isYMD(ymd) ? ymd : null;
  } catch {
    // fallback manual (pior caso)
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }
}

function normalizeToYMD(input) {
  if (!input) return null;

  // Firestore Timestamp (Admin SDK) ou objeto com toDate()
  if (typeof input === "object" && typeof input.toDate === "function") {
    const d = input.toDate();
    const ymd = dateToYMD_TZ(d);
    return ymd;
  }

  // Timestamp-like { seconds } / { _seconds }
  if (
    typeof input === "object" &&
    (Number.isFinite(Number(input.seconds)) ||
      Number.isFinite(Number(input._seconds)))
  ) {
    const sec = Number.isFinite(Number(input.seconds))
      ? Number(input.seconds)
      : Number(input._seconds);
    const d = new Date(sec * 1000);
    return dateToYMD_TZ(d);
  }

  // Date
  if (input instanceof Date && !Number.isNaN(input.getTime())) {
    return dateToYMD_TZ(input);
  }

  const s = String(input).trim();
  if (!s) return null;

  // ISO: YYYY-MM-DD...
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  // BR: DD/MM/YYYY
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;

  return null;
}

function pickDateCandidate(d) {
  return (
    d.ymd ??
    d.date ??
    d.data ??
    d.dt ??
    d.draw_date ??
    d.close_date ??
    null
  );
}

function parseArgs(argv) {
  const out = { dry: false, limit: null, startAfter: null, sampleInvalid: 0 };

  for (const a of argv.slice(2)) {
    if (a === "--dry" || a === "--dryrun" || a === "--dry-run") out.dry = true;
    else if (a.startsWith("--limit=")) {
      const n = Number(a.split("=")[1]);
      out.limit = Number.isFinite(n) && n > 0 ? n : null;
    } else if (a.startsWith("--startAfter=")) {
      const v = String(a.split("=")[1] || "").trim();
      out.startAfter = v || null;
    } else if (a.startsWith("--sampleInvalid=")) {
      const n = Number(a.split("=")[1]);
      out.sampleInvalid = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
    }
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv);
  const db = getDb();

  console.log("======================================");
  console.log("[BACKFILL] draws.ymd");
  console.log("tz:", TZ);
  console.log("dry:", args.dry);
  console.log("limit:", args.limit || "none");
  console.log("startAfter:", args.startAfter || "none");
  console.log("sampleInvalid:", args.sampleInvalid || 0);
  console.log("======================================");

  const col = db.collection("draws");

  // Paginação por __name__ (docId) para ser estável
  const PAGE = 500;
  const BATCH_MAX = 450; // margem (<500)

  let processed = 0;
  let skipped = 0;
  let wouldUpdate = 0;
  let updated = 0;
  let invalidNoCandidate = 0;

  const invalidSamples = [];

  let lastDoc = null;

  if (args.startAfter) {
    const startSnap = await col.doc(args.startAfter).get();
    if (startSnap.exists) lastDoc = startSnap;
    else console.log("[WARN] startAfter docId não existe. Ignorando:", args.startAfter);
  }

  while (true) {
    if (args.limit && processed >= args.limit) break;

    let q = col.orderBy(admin.firestore.FieldPath.documentId()).limit(PAGE);
    if (lastDoc) q = q.startAfter(lastDoc);

    const snap = await q.get();
    if (snap.empty) break;

    const writes = [];

    for (const doc of snap.docs) {
      if (args.limit && processed >= args.limit) break;

      processed += 1;

      const d = doc.data() || {};
      const currentYmd = String(d.ymd || "").trim();

      if (isYMD(currentYmd)) {
        skipped += 1;
        lastDoc = doc;
        continue;
      }

      const cand = pickDateCandidate(d);
      const ymd = normalizeToYMD(cand);

      if (!ymd || !isYMD(ymd)) {
        invalidNoCandidate += 1;
        if (args.sampleInvalid && invalidSamples.length < args.sampleInvalid) {
          invalidSamples.push({
            id: doc.id,
            ymd: d.ymd ?? null,
            date: d.date ?? null,
            close_date: d.close_date ?? null,
            draw_date: d.draw_date ?? null,
            cand: cand ?? null,
          });
        }
        lastDoc = doc;
        continue;
      }

      // Só escreve se diferente do que já tem (ou estava ausente/ruim)
      writes.push({ ref: doc.ref, ymd });
      lastDoc = doc;
    }

    if (!writes.length) {
      console.log(`[PAGE] docs=${snap.size} | processed=${processed} | writes=0`);
      continue;
    }

    console.log(
      `[PAGE] docs=${snap.size} | processed=${processed} | writes=${writes.length} | last=${lastDoc?.id}`
    );

    wouldUpdate += writes.length;

    if (args.dry) continue;

    for (let i = 0; i < writes.length; i += BATCH_MAX) {
      const chunk = writes.slice(i, i + BATCH_MAX);
      const batch = db.batch();

      for (const w of chunk) {
        // update é mais explícito que set merge
        batch.update(w.ref, { ymd: w.ymd });
      }

      await batch.commit();
      updated += chunk.length;
      console.log(`  [COMMIT] +${chunk.length} (total updated=${updated})`);
    }
  }

  console.log("======================================");
  console.log("[RESULT]");
  console.log("processed:", processed);
  console.log("skipped (already ok):", skipped);
  console.log("wouldUpdate:", wouldUpdate);
  console.log("updated:", args.dry ? 0 : updated);
  console.log("invalid/no-candidate:", invalidNoCandidate);
  if (invalidSamples.length) {
    console.log("---- invalid samples ----");
    for (const x of invalidSamples) console.log(x);
    console.log("-------------------------");
  }
  console.log("======================================");
}

main().catch((e) => {
  console.error("[FATAL]", e?.stack || e?.message || e);
  process.exit(1);
});
