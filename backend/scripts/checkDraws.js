require("dotenv").config({ path: "backend/.env.local" });
const fs = require("fs");
const admin = require("firebase-admin");

const uf = process.argv[2] || "PT_RIO";
const date = process.argv[3] || "2025-12-29";

(async () => {
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!credPath) throw new Error("GOOGLE_APPLICATION_CREDENTIALS está vazio no backend/.env.local");

  const sa = JSON.parse(fs.readFileSync(credPath, "utf8"));
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(sa),
      projectId: sa.project_id,
    });
  }

  const db = admin.firestore();

  console.log("projectId=", sa.project_id);
  console.log("uf=", uf, "date=", date);

  const snap = await db.collection("draws")
    .where("uf", "==", uf)
    .where("date", "==", date)
    .get();

  console.log("count=", snap.size);
  snap.forEach((d) => console.log(d.id));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
