const admin = require("./backend/firebaseAdmin");

async function dumpLottery(key) {

    console.log("\n======================================================");
    console.log("LOTTERY:", key);
    console.log("======================================================");

    const snap = await admin
        .firestore()
        .collection("draws")
        .where("lottery_key", "==", key)
        .orderBy("importedAt", "desc")
        .limit(15)
        .get();

    console.log("docs:", snap.size);

    snap.forEach(doc => {

        const d = doc.data() || {};

        console.log(JSON.stringify({
            id: doc.id,
            lottery_key: d.lottery_key,
            lottery_name: d.lottery_name,
            date: d.date,
            close_hour: d.close_hour,
            close_hour_raw: d.close_hour_raw,
            hour: d.hour,
            close: d.close,
            importedAt: d.importedAt || null
        }, null, 2));

    });
}

(async () => {

    await dumpLottery("LOOK");
    await dumpLottery("NACIONAL");

    process.exit(0);

})().catch(err => {
    console.error(err);
    process.exit(1);
});
