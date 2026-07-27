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

// Extrai partes do doc.id no padrão:
// LOTTERY__YYYY-MM-DD__HH-MM__SUFFIX
function parseDocId(id) {
  const s = String(id || "");
  const m = s.match(/^([A-Z_]+)__(\d{4}-\d{2}-\d{2})__(\d{2}-\d{2})__(.+)$/);
  if (!m) return null;
  return { lottery: m[1], ymd: m[2], hhmmDash: m[3], suffix: m[4], prefix: `${m[1]}__${m[2]}__${m[3]}__` };
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

    // Busca por faixa de ymd (nos docs completos) para reduzir scan.
    // Ainda assim, RECEIVE pode não ter ymd preenchido -> então vamos também filtrar por ID após coletar.
    const snap = await col
      .where("lottery_key", "==", lottery)
      .where("ymd", ">=", from)
      .where("ymd", "<=", to)
      .get();

    // Monta set de ids para lookup rápido
    const idSet = new Set(snap.docs.map(d => d.id));

    // Além disso: pode haver RECEIVE sem ymd/lottery_key -> então precisamos varrer por ID?
    // Solução prática: também varrer TODOS os docs retornados e agir sobre RECEIVE que estejam dentro do range pelo ID.
    // (Se existir RECEIVE fora desse filtro, a gente faz um modo "scanAllReceive" depois.)

    const toDelete = [];
    const reasons = [];

    for (const doc of snap.docs) {
      const id = doc.id;
      if (!id.endsWith("__RECEIVE")) continue;

      const p = parseDocId(id);
      if (!p) continue;
      if (p.lottery !== lottery) continue;
      if (p.ymd < from || p.ymd > to) continue;

      // Procura qualquer "irmão" com mesmo prefixo e suffix != RECEIVE
      // Como não temos query por prefix no Firestore sem índice/estratégia,
      // fazemos lookup no conjunto local (idSet).
      let hasSibling = false;
      for (const otherId of idSet) {
        if (otherId === id) continue;
        if (otherId.startsWith(p.prefix) && !otherId.endsWith("__RECEIVE")) {
          hasSibling = true;
          break;
        }
      }

      if (hasSibling) {
        toDelete.push(id);
        reasons.push({ id, reason: "RECEIVE has sibling complete draw with same prefix", prefix: p.prefix });
      }
    }

    console.log("Receives candidatos:", toDelete.length);

    if (!dryRun && toDelete.length) {
      // batch em blocos de 450 por segurança
      let idx = 0;
      while (idx < toDelete.length) {
        const chunk = toDelete.slice(idx, idx + 450);
        const batch = db.batch();
        chunk.forEach(id => batch.delete(col.doc(id)));
        await batch.commit();
        idx += chunk.length;
      }
      console.log("Removidos com sucesso:", toDelete.length);
    }

    const logDir = path.join(process.cwd(), "logs");
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

    const logFile = path.join(
      logDir,
      `removed-receive-${safeFilePart(lottery)}-${safeFilePart(from)}_to_${safeFilePart(to)}-${Date.now()}.json`
    );

    fs.writeFileSync(logFile, JSON.stringify({ lottery, from, to, apply, count: toDelete.length, toDelete, reasons }, null, 2), "utf8");
    console.log("Log salvo em:", logFile);

    if (dryRun && toDelete.length) {
      console.log("\nExemplo (até 10):");
      toDelete.slice(0, 10).forEach(x => console.log(" -", x));
    }
  } catch (e) {
    console.error("ERRO:", e?.stack || e?.message || e);
    process.exit(1);
  }
})();
