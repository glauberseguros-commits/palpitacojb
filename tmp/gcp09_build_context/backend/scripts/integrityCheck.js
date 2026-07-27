const { getDb } = require("../service/firebaseAdmin");
const { runImport } = require("./importKingApostas");

const LOTTERY = "PT_RIO";

function normalizeHour(v) {
  const m = String(v || "").match(/(\d{1,2})/);
  if (!m) return "";
  return String(Number(m[1])).padStart(2, "0") + ":00";
}

async function readDay(db, ymd) {

  const snap = await db
    .collection("draws")
    .where("lottery_key", "==", LOTTERY)
    .where("ymd", "==", ymd)
    .get();

  const rows = [];

  for (const doc of snap.docs) {

    const d = doc.data();

    const prizes = await doc.ref.collection("prizes").get();

    rows.push({
      id: doc.id,
      hour: normalizeHour(d.close_hour || d.hour),
      prizes: prizes.size
    });

  }

  return rows.sort((a,b)=>a.hour.localeCompare(b.hour));

}

async function integrityCheck(ymd){

    const db = getDb();

    console.log("");
    console.log("======================================");
    console.log("INTEGRITY CHECK");
    console.log("Data:",ymd);
    console.log("======================================");

    let before = await readDay(db,ymd);

    console.table(before);

    console.log("");
    console.log("Executando runImport...");
    console.log("");

    await runImport({
        date:ymd,
        lotteryKey:LOTTERY
    });

    const after = await readDay(db,ymd);

    console.log("");
    console.log("Resultado após nova importação:");
    console.table(after);

    const beforeHours = new Set(before.map(x=>x.hour));
    const afterHours = new Set(after.map(x=>x.hour));

    const recovered = [];

    for(const h of afterHours){

        if(!beforeHours.has(h))
            recovered.push(h);

    }

    console.log("");

    if(recovered.length){

        console.log("Horários recuperados:");
        console.table(recovered);

    }else{

        console.log("Nenhum horário novo recuperado.");

    }

}

const date = process.argv[2];

if(!date){

    console.log("");
    console.log("Uso:");
    console.log("node backend/scripts/integrityCheck.js 2026-07-07");
    process.exit(1);

}

integrityCheck(date)
.catch(err=>{
    console.error(err);
    process.exit(1);
});
