const admin = require("firebase-admin");

try {
    admin.initializeApp({
        credential: admin.credential.applicationDefault()
    });
} catch {}

const db = admin.firestore();

const KEYS = [
    "PT_RIO",
    "LOOK",
    "FEDERAL",
    "NACIONAL"
];

(async () => {

    for (const key of KEYS) {

        console.log("");
        console.log("========================================================");
        console.log(key);
        console.log("========================================================");

        const snap = await db.collection("draws")
            .where("lottery_key","==",key)
            .orderBy("date","desc")
            .limit(1)
            .get();

        if (snap.empty) {
            console.log("SEM DOCUMENTOS");
            continue;
        }

        const d = snap.docs[0];

        console.log({
            id: d.id,
            ymd: d.get("ymd"),
            date: d.get("date"),
            close_hour: d.get("close_hour"),
            hour: d.get("hour"),
            close_hour_raw: d.get("close_hour_raw"),
            lottery_key: d.get("lottery_key"),
            lottery_code: d.get("lottery_code"),
            uf: d.get("uf")
        });
    }

})().catch(console.error);
