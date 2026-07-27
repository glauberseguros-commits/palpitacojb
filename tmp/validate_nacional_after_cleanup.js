const { db } = require("../backend/service/firebaseAdmin");

(async () => {
    const snap = await db
        .collection("draws")
        .where("lottery_key", "==", "NACIONAL")
        .get();

    let legacy = 0;
    let normalized = 0;
    let other = 0;

    const sampleDate = [];

    snap.forEach(doc => {
        const d = doc.data();
        const closeHour = String(d.close_hour || "").trim();

        if (/^\d{2}:49$/.test(closeHour)) {
            legacy++;
        } else if (/^\d{2}:00$/.test(closeHour)) {
            normalized++;
        } else {
            other++;
        }

        if (d.date === "2025-03-27") {
            sampleDate.push({
                id: doc.id,
                close_hour: d.close_hour,
                close_hour_raw: d.close_hour_raw,
                hour: d.hour,
                close: d.close,
                lottery_name: d.lottery_name
            });
        }
    });

    console.log("TOTAL NACIONAL:", snap.size);
    console.log("LEGADOS :49:", legacy);
    console.log("NORMALIZADOS :00:", normalized);
    console.log("OUTROS FORMATOS:", other);

    console.log("");
    console.log("===== AMOSTRA 2025-03-27 =====");

    sampleDate
        .sort((a, b) =>
            String(a.close_hour || "").localeCompare(String(b.close_hour || ""))
        )
        .forEach(row => console.log(JSON.stringify(row, null, 2)));

})().catch(error => {
    console.error(error);
    process.exit(1);
});
