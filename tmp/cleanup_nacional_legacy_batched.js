const fs = require("fs");
const path = require("path");
const { db } = require("../backend/service/firebaseAdmin");

const BATCH_SIZE = 300;

async function commitDeletesInChunks(docs) {
    let totalRemoved = 0;

    for (let offset = 0; offset < docs.length; offset += BATCH_SIZE) {
        const chunk = docs.slice(offset, offset + BATCH_SIZE);
        const batch = db.batch();

        for (const doc of chunk) {
            batch.delete(doc.ref);
        }

        await batch.commit();

        totalRemoved += chunk.length;

        console.log(
            `LOTE ${Math.floor(offset / BATCH_SIZE) + 1}: ` +
            `${chunk.length} removidos | TOTAL: ${totalRemoved}/${docs.length}`
        );
    }

    return totalRemoved;
}

(async () => {
    console.log("Buscando documentos da NACIONAL...");

    const snap = await db
        .collection("draws")
        .where("lottery_key", "==", "NACIONAL")
        .get();

    console.log("TOTAL NACIONAL ENCONTRADO:", snap.size);

    const legacyDocs = [];
    const backup = [];

    snap.forEach(doc => {
        const data = doc.data();
        const closeHour = String(data.close_hour || "").trim();

        if (/^\d{2}:49$/.test(closeHour)) {
            legacyDocs.push(doc);

            backup.push({
                id: doc.id,
                ...data
            });
        }
    });

    console.log("LEGADOS :49 ENCONTRADOS:", legacyDocs.length);

    const backupPath = path.join(
        "tmp",
        `nacional_legacy_backup_${new Date()
            .toISOString()
            .replace(/[:.]/g, "-")}.json`
    );

    fs.writeFileSync(
        backupPath,
        JSON.stringify(backup, null, 2),
        "utf8"
    );

    console.log("BACKUP CRIADO:", backupPath);

    if (legacyDocs.length === 0) {
        console.log("Nenhum documento legado precisa ser removido.");
        return;
    }

    const removed = await commitDeletesInChunks(legacyDocs);

    console.log("");
    console.log("===== RESULTADO =====");
    console.log("LEGADOS REMOVIDOS:", removed);
    console.log("BACKUP:", backupPath);
})().catch(error => {
    console.error("");
    console.error("ERRO NA LIMPEZA:");
    console.error(error);
    process.exit(1);
});
