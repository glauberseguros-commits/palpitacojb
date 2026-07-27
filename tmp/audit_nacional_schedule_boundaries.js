const { db } = require("../backend/service/firebaseAdmin");

const DATES = [
    "2023-08-31",
    "2023-09-01",
    "2023-09-02",

    "2025-02-05",
    "2025-02-06",
    "2025-02-07",

    "2025-11-06",
    "2025-11-07",
    "2025-11-08",

    "2026-07-18",
    "2026-07-19",
    "2026-07-20"
];

function summarizeValue(value) {
    if (Array.isArray(value)) {
        return {
            type: "array",
            length: value.length
        };
    }

    if (value && typeof value === "object") {
        return {
            type: "object",
            keys: Object.keys(value).sort()
        };
    }

    return {
        type: typeof value,
        value
    };
}

(async () => {
    for (const date of DATES) {
        const snap = await db
            .collection("draws")
            .where("lottery_key", "==", "NACIONAL")
            .where("date", "==", date)
            .get();

        console.log("");
        console.log("==================================================");
        console.log("DATA:", date);
        console.log("TOTAL:", snap.size);
        console.log("==================================================");

        const rows = snap.docs
            .map(doc => {
                const data = doc.data();

                const fields = {};

                for (const [key, value] of Object.entries(data)) {
                    fields[key] = summarizeValue(value);
                }

                return {
                    id: doc.id,
                    close_hour: data.close_hour,
                    close_hour_raw: data.close_hour_raw,
                    hour: data.hour,
                    close: data.close,
                    lottery_name: data.lottery_name,
                    lottery_id: data.lottery_id,
                    fields
                };
            })
            .sort((a, b) =>
                String(a.close_hour || "")
                    .localeCompare(String(b.close_hour || ""))
            );

        for (const row of rows) {
            console.log(JSON.stringify(row, null, 2));
        }
    }
})().catch(error => {
    console.error(error);
    process.exit(1);
});
