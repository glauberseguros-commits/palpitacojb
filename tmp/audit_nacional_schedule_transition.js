const { db } = require("../backend/service/firebaseAdmin");

(async () => {

    const snap = await db
        .collection("draws")
        .where("lottery_key","==","NACIONAL")
        .get();

    const perDate = new Map();

    snap.forEach(doc => {

        const d = doc.data();

        const date = d.date;
        const hour = String(d.close_hour || "");

        if (!/^\d{2}:\d{2}$/.test(hour)) {
            return;
        }

        if (!perDate.has(date)) {
            perDate.set(date, new Set());
        }

        perDate.get(date).add(hour);

    });

    const dates = [...perDate.keys()].sort();

    console.log("TOTAL DE DATAS:", dates.length);
    console.log("");

    let previousSignature = null;

    for (const date of dates) {

        const hours =
            [...perDate.get(date)]
                .sort()
                .join(",");

        if (hours !== previousSignature) {

            console.log("================================================");
            console.log(date);
            console.log(hours);
            console.log("");

            previousSignature = hours;
        }

    }

})().catch(err=>{
    console.error(err);
    process.exit(1);
});
