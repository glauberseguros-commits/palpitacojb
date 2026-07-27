const { db } = require("../backend/service/firebaseAdmin");

async function dump(key){

    console.log("");
    console.log("====================================");
    console.log(key);
    console.log("====================================");

    const snap = await db
        .collection("draws")
        .where("lottery_key","==",key)
        .orderBy("importedAt","desc")
        .limit(10)
        .get();

    console.log("docs:",snap.size);

    snap.forEach(doc=>{

        const d = doc.data();

        console.log(JSON.stringify({
            id:doc.id,
            lottery_name:d.lottery_name,
            lottery_key:d.lottery_key,
            date:d.date,
            ymd:d.ymd,
            close_hour:d.close_hour,
            close_hour_raw:d.close_hour_raw,
            hour:d.hour,
            close:d.close,
            importedAt:d.importedAt?.toDate?.()?.toISOString?.() ?? null
        },null,2));

    });

}

(async()=>{

    await dump("LOOK");
    await dump("NACIONAL");

})();
