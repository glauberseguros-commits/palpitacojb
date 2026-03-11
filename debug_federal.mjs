import { db } from "./src/services/firebase.js";
import { collection, query, where, getDocs } from "firebase/firestore";

function pad2(n) {
  return String(n).padStart(2, "0");
}

function addDays(ymd, days) {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

function todayUtcYmd() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

const daysBack = 20;
const base = todayUtcYmd();
const out = [];

for (let i = 0; i <= daysBack; i += 1) {
  const day = addDays(base, -i);
  const qRef = query(collection(db, "draws"), where("ymd", "==", day));
  const snap = await getDocs(qRef);

  for (const docSnap of snap.docs) {
    const d = docSnap.data() || {};
    const lotteryKey = String(d.lottery_key || d.lotteryKey || "").trim();
    const uf = String(d.uf || "").trim();
    const closeHour = String(d.close_hour || d.closeHour || d.hour || d.hora || "").trim();

    const isFederal =
      /federal/i.test(lotteryKey) ||
      /^fed$/i.test(lotteryKey) ||
      /federal/i.test(uf) ||
      /^fed$/i.test(uf);

    if (isFederal) {
      out.push({
        id: docSnap.id,
        ymd: d.ymd || day,
        uf,
        lottery_key: lotteryKey,
        close_hour: closeHour,
        prizesCount:
          Array.isArray(d.prizes) ? d.prizes.length : (d.prizesCount ?? null),
      });
    }
  }
}

out.sort((a, b) =>
  String(a.ymd).localeCompare(String(b.ymd)) ||
  String(a.close_hour).localeCompare(String(b.close_hour)) ||
  String(a.lottery_key).localeCompare(String(b.lottery_key))
);

console.log(JSON.stringify(out, null, 2));
