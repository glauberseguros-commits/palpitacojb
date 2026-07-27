"use strict";

const admin = require("firebase-admin");

try {
    admin.app();
} catch {
    admin.initializeApp();
}

const db = admin.firestore();

(async () => {

    const collections = [
        "top3History",
        "top3_history",
        "top3-history",
        "top3Predictions",
        "top3_predictions"
    ];

    for (const collectionName of collections) {

        try {

            const snap = await db
                .collection(collectionName)
                .orderBy("createdAt", "desc")
                .limit(3)
                .get();

            console.log("");
            console.log("============================================================");
            console.log("COLLECTION:", collectionName);
            console.log("DOCUMENTOS:", snap.size);
            console.log("============================================================");

            snap.forEach(doc => {

                const d = doc.data();

                console.log("");
                console.log("ID:", doc.id);

                console.log(JSON.stringify({
                    matchedGrupo: d.matchedGrupo,
                    matchedMilhar: d.matchedMilhar,
                    resultTop3Groups: d.resultTop3Groups,
                    resultTop3Milhares: d.resultTop3Milhares,
                    hitType: d.hitType,
                    predictionDate: d.predictionDate,
                    lottery: d.lottery,
                    drawTime: d.drawTime
                }, null, 2));

            });

        } catch (err) {

            console.log("");
            console.log("COLLECTION:", collectionName);
            console.log(err.message);

        }

    }

})().catch(err => {
    console.error(err);
    process.exit(1);
});
