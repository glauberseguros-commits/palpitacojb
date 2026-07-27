const admin = require("firebase-admin");

try {
    admin.app();
} catch {
    admin.initializeApp({
        credential: admin.credential.applicationDefault()
    });
}

const db = admin.firestore();

(async () => {

    const snap = await db.collection("results")
        .where("lottery_key","==","LOOK")
        .where("date","==","2026-07-23")
        .orderBy("drawTime")
        .get();

    console.log("TOTAL DOCUMENTOS:", snap.size);
    console.log("");

    snap.forEach(doc => {

        const d = doc.data();

        console.log("==================================================");
        console.log("DOC:", doc.id);
        console.log("drawTime:", d.drawTime);
        console.log("draw_time:", d.draw_time);
        console.log("time:", d.time);
        console.log("slot:", d.slot);
        console.log("rawTime:", d.rawTime);
        console.log("updatedAt:", d.updatedAt);

        if (Array.isArray(d.prizes)) {
            console.log("premios:", d.prizes.length);

            d.prizes.forEach((p,i)=>{
                console.log(
                    (i+1)+"º",
                    p.number || p.milhar || "",
                    p.group || p.grupo || "",
                    p.animal || ""
                );
            });
        }

        console.log("");
    });

})();
