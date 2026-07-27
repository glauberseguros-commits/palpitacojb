const { db } = require("../backend/service/firebaseAdmin");

(async () => {

    const snap = await db
        .collection("draws")
        .where("lottery_key", "==", "NACIONAL")
        .where("date", "==", "2026-05-06")
        .get();

    const docs = snap.docs
        .map(doc => ({
            id: doc.id,
            ...doc.data()
        }))
        .sort((a, b) =>
            String(a.close_hour || "")
                .localeCompare(String(b.close_hour || ""))
        );

    console.log("TOTAL:", docs.length);
    console.log("");

    for (const d of docs) {

        console.log("--------------------------------");

        console.log("id             :", d.id);
        console.log("lottery_name   :", d.lottery_name);
        console.log("close_hour     :", d.close_hour);
        console.log("close_hour_raw :", d.close_hour_raw);
        console.log("close          :", d.close);
        console.log("hour           :", d.hour);
        console.log("drawId         :", d.drawId);
    }

})().catch(error => {
    console.error(error);
    process.exit(1);
});
