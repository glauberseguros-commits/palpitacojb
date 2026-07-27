const { db } = require("../backend/service/firebaseAdmin");

(async () => {

  const snap = await db
    .collection("draws")
    .where("date","==","2025-03-27")
    .where("lottery_key","==","NACIONAL")
    .get();

  console.log("TOTAL:", snap.size);
  console.log("");

  const rows = [];

  snap.forEach(doc => {
    const d = doc.data();

    rows.push({
      id: doc.id,
      close_hour: d.close_hour,
      close_hour_raw: d.close_hour_raw,
      hour: d.hour,
      close: d.close,
      lottery_name: d.lottery_name,
      lottery_id: d.lottery_id
    });
  });

  rows
    .sort((a,b)=>(a.close_hour||"").localeCompare(b.close_hour||""))
    .forEach(r=>console.log(JSON.stringify(r,null,2)));

})().catch(err=>{
  console.error(err);
  process.exit(1);
});
