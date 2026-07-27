const fs = require("fs");
const { db } = require("../backend/service/firebaseAdmin");

const BACKUP_PATH =
    "tmp/nacional_legacy_backup_2026-07-20T23-25-04-832Z.json";

const BATCH_SIZE = 250;

(async () => {
    if (!fs.existsSync(BACKUP_PATH)) {
        throw new Error(`Backup não encontrado: ${BACKUP_PATH}`);
    }

    const backup = JSON.parse(
        fs.readFileSync(BACKUP_PATH, "utf8")
    );

    console.log("DOCUMENTOS NO BACKUP:", backup.length);

    if (!Array.isArray(backup) || backup.length === 0) {
        throw new Error("Backup vazio ou inválido.");
    }

    let restored = 0;

    for (
        let offset = 0;
        offset < backup.length;
        offset += BATCH_SIZE
    ) {
        const chunk = backup.slice(
            offset,
            offset + BATCH_SIZE
        );

        const batch = db.batch();

        for (const row of chunk) {
            const { id, ...data } = row;

            if (!id) {
                throw new Error(
                    `Documento sem ID no índice ${offset}`
                );
            }

            const ref = db.collection("draws").doc(id);

            batch.set(ref, data, { merge: false });
        }

        await batch.commit();

        restored += chunk.length;

        console.log(
            `LOTE ${Math.floor(offset / BATCH_SIZE) + 1}: ` +
            `${chunk.length} restaurados | ` +
            `TOTAL: ${restored}/${backup.length}`
        );
    }

    console.log("");
    console.log("===== RESTAURAÇÃO CONCLUÍDA =====");
    console.log("DOCUMENTOS RESTAURADOS:", restored);
})().catch(error => {
    console.error("");
    console.error("ERRO NA RESTAURAÇÃO:");
    console.error(error);
    process.exit(1);
});
