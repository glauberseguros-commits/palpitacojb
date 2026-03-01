"use strict";

const fs = require("fs");
const path = require("path");
const { getDb } = require("../service/firebaseAdmin");

function arg(name, def = null) {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return def;
}

function safeFilePart(s) {
  return String(s ?? "").replace(/[^\w.\-]+/g, "_");
}

function pad2(n) { return String(n).padStart(2, "0"); }

// extrai de d_PT_RIO_2026-01-31_2100  => { ymd:"2026-01-31", hh:"21", mm:"00" }
function parseLegacyId(id) {
  const s = String(id || "");
  const m = s.match(/^d_([A-Z_]+)_(\d{4}-\d{2}-\d{2})_(\d{2})(\d{2})$/);
  if (!m) return null;
  return { lottery: m[1], ymd: m[2], hh: m[3], mm: m[4] };
}

(async () => {
  try {
    const lottery = String(arg("lottery", "")).trim().toUpperCase();
    const from = arg("from");
    const to = arg("to");
    const apply = arg("apply") === "1";
    const dryRun = !apply;

    if (!lottery) throw new Error("Informe --lottery (ex: PT_RIO)");
    if (!from || !to) throw new Error("Informe --from e --to (YYYY-MM-DD)");

    const db = getDb();
    const col = db.collection("draws");

    console.log("Mode:", dryRun ? "DRY-RUN (não apaga)" : "APPLY (apagando)");
    console.log("Filter:", { lottery, from, to });

    // pega docs do range (pela ymd preenchida); os legacy podem ter ymd null,
    // então vamos varrer por duplicatas específicas com query direta no dia suspeito.
    // Como você já tem o DUP apontando o ID, vamos trabalhar por "id startsWith d_".
    // Para não fazer scan global, vamos buscar por lottery_key + range e coletar ids.
    const snap = await col
      .where("lottery_key", "==", lottery)
      .where("ymd", ">=", from)
      .where("ymd", "<=", to)
      .get();

    const idSet = new Set(snap.docs.map(d => d.id));

    // inclui também docs legacy que possam estar no range mas com ymd faltando:
    // vamos usar o arquivo dups gerado pra achar, mas aqui faremos uma busca simples por ID conhecido:
    // (fallback: se não achar, você me passa a lista e eu faço um scanner por id prefix)
    const toDelete = [];
    const reasons = [];

    for (const id of idSet) {
      if (!id.startsWith("d_")) continue;

      const p = parseLegacyId(id);
      if (!p) continue;
      if (p.lottery !== lottery) continue;
      if (p.ymd < from || p.ymd > to) continue;

      // irmão canônico
      const suffix = `LT_${lottery}_${p.hh}HS`;
      const sibling = `${lottery}__${p.ymd}__${p.hh}-00__${suffix}`;

      if (idSet.has(sibling)) {
        toDelete.push(id);
        reasons.push({ id, rule: "legacy d_* duplicate", keep: sibling });
      }
    }

    console.log("Candidates to delete:", toDelete.length);

    const logDir = path.join(process.cwd(), "logs");
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

    const logFile = path.join(
      logDir,
      `removed-legacy-ids-${safeFilePart(lottery)}-${safeFilePart(from)}_to_${safeFilePart(to)}-${Date.now()}.json`
    );

    if (!dryRun && toDelete.length) {
      let idx = 0;
      while (idx < toDelete.length) {
        const chunk = toDelete.slice(idx, idx + 450);
        const batch = db.batch();
        chunk.forEach(x => batch.delete(col.doc(x)));
        await batch.commit();
        idx += chunk.length;
      }
      console.log("Deleted:", toDelete.length);
    }

    fs.writeFileSync(logFile, JSON.stringify({ lottery, from, to, apply, count: toDelete.length, toDelete, reasons }, null, 2), "utf8");
    console.log("Log saved:", logFile);

    if (dryRun && toDelete.length) {
      console.log("\nSample (up to 10):");
      toDelete.slice(0, 10).forEach(x => console.log(" -", x));
    }

  } catch (e) {
    console.error("ERRO:", e?.stack || e?.message || e);
    process.exit(1);
  }
})();
