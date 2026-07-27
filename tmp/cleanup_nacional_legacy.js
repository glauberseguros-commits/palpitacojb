const fs = require("fs");
const path = require("path");
const { db } = require("../backend/service/firebaseAdmin");

(async () => {

    const snap = await db
        .collection("draws")
        .where("lottery_key","==","NACIONAL")
        .get();

    const backup = [];
    const batch = db.batch();

    let removed = 0;

    snap.forEach(doc => {

        const d = doc.data();
        const ch = String(d.close_hour || "");

        if (/^\d{2}:49$/.test(ch)) {

            backup.push({
                id: doc.id,
                ...d
            });

            batch.delete(doc.ref);
            removed++;
        }

    });

    fs.mkdirSync("tmp", { recursive: true });

    fs.writeFileSync(
        path.join("tmp","nacional_legacy_backup.json"),
        JSON.stringify(backup,null,2),
        "utf8"
    );

    await batch.commit();

    console.log("LEGADOS REMOVIDOS:", removed);
    console.log("BACKUP:", "tmp/nacional_legacy_backup.json");

})().catch(err=>{
    console.error(err);
    process.exit(1);
});
