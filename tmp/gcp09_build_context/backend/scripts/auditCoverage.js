const fs = require("fs");
const path = require("path");
const { getDb } = require("../service/firebaseAdmin");

const LOTTERY = "PT_RIO";
const START = "2022-06-07";
const END = "2026-07-08";

function addDays(ymd, n) {
  const d = new Date(ymd + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0,10);
}

function weekday(ymd){
  return new Date(ymd+"T00:00:00Z").getUTCDay();
}

function expectedHours(ymd){

  const dow = weekday(ymd);

  // domingo
  if(dow===0)
    return ["09:00","11:00","14:00","16:00"];

  // quarta
  if(dow===3)
    return ["09:00","11:00","14:00","16:00","21:00"];

  // sábado
  if(dow===6)
    return ["09:00","11:00","14:00","16:00","21:00"];

  return ["09:00","11:00","14:00","16:00","18:00","21:00"];
}

function normHour(v){
  const m=String(v||"").match(/(\d{1,2})/);
  if(!m) return "";
  return String(Number(m[1])).padStart(2,"0")+":00";
}

(async()=>{

  const db=getDb();

  const snap=await db.collection("draws")
    .where("lottery_key","==",LOTTERY)
    .get();

  const map=new Map();

  for(const doc of snap.docs){

      const d=doc.data();

      const key=d.ymd+"|"+normHour(d.close_hour||d.hour);

      const prizes=await doc.ref.collection("prizes").get();

      map.set(key,{
          id:doc.id,
          prizes:prizes.size
      });

  }

  let expected=0;
  let found=0;
  let complete=0;
  let incomplete=0;

  const missing=[];

  for(let day=START; day<=END; day=addDays(day,1)){

      for(const hour of expectedHours(day)){

          expected++;

          const row=map.get(day+"|"+hour);

          if(!row){

              missing.push({
                  ymd:day,
                  hour
              });

              continue;
          }

          found++;

          if(row.prizes>=7){

             complete++;

          }else{

             incomplete++;

          }

      }

  }

  const coverage=((complete/expected)*100).toFixed(2);

  const report={
      lottery:LOTTERY,
      start:START,
      end:END,
      expectedSlots:expected,
      foundSlots:found,
      completeSlots:complete,
      incompleteSlots:incomplete,
      missingSlots:missing.length,
      coveragePercent:coverage,
      missing
  };

  const out=path.join(
      process.cwd(),
      "backend",
      "logs",
      `auditCoverage-${LOTTERY}.json`
  );

  fs.writeFileSync(out,JSON.stringify(report,null,2));

  console.log("");
  console.log("==================================");
  console.log(" COBERTURA HISTÓRICA ");
  console.log("==================================");
  console.log("Esperados........:",expected);
  console.log("Encontrados......:",found);
  console.log("Completos........:",complete);
  console.log("Incompletos......:",incomplete);
  console.log("Ausentes.........:",missing.length);
  console.log("Cobertura........:",coverage+"%");
  console.log("Arquivo..........:",out);

  console.log("");
  console.log("Primeiros 30 furos:");
  console.table(missing.slice(0,30));

  process.exit(0);

})();
