require("dotenv").config({ path: "backend/.env.local" });
const fs = require("fs");
const admin = require("firebase-admin");

(async () => {
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!credPath) throw new Error("GOOGLE_APPLICATION_CREDENTIALS vazio.");

  const sa = JSON.parse(fs.readFileSync(credPath, "utf8"));
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(sa),
      projectId: sa.project_id,
    });
  }

  const db = admin.firestore();
  const date = process.argv[2]; // opcional: "2025-12-29"

  console.log("projectId=", sa.project_id);
  console.log("Filtro date=", date || "(nenhum)");

  let q = db.collection("draws");
  if (date) q = q.where("date", "==", date);

  const snap = await q.get();
  console.log("Docs encontrados=", snap.size);

  let batch = db.batch();
  let ops = 0;
  let updated = 0;

  for (const doc of snap.docs) {
    const data = doc.data() || {};
    if (data.uf) continue;

    const id = String(doc.id || "");
    let uf = "";
    if (id.includes("__")) uf = id.split("__")[0] || "";

    if (!uf && data.lottery_key) uf = String(data.lottery_key || "");

    if (!uf) continue;

    batch.set(doc.ref, { uf }, { merge: true });
    ops++;
    updated++;

    if (ops >= 450) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
    }
  }

  if (ops > 0) await batch.commit();

  console.log("Atualizados=", updated);
  console.log("OK");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
