const { getDb } = require("../service/firebaseAdmin");

function pad2(n) {
  return String(n).padStart(2, "0");
}

function ymd(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

(async () => {
  const db = getDb();

  const start = "2022-06-08";
  const end = new Date().toISOString().slice(0, 10);

  const noDraw = require("../data/no_draw_days/FEDERAL.json");
  const noDrawSet = new Set(Array.isArray(noDraw.days) ? noDraw.days : []);

  const snap = await db
    .collection("draws")
    .where("lottery_key", "==", "FEDERAL")
    .orderBy("ymd", "asc")
    .get();

  const byDay = new Map();
  const prizeIssues = [];

  for (const doc of snap.docs) {
    const data = doc.data() || {};
    const day = data.ymd || data.date;

    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push(doc.id);

    const prizes = await doc.ref.collection("prizes").get();
    if (prizes.size !== Number(data.prizesCount || 7)) {
      prizeIssues.push({
        drawId: doc.id,
        ymd: day,
        declared: data.prizesCount,
        actualPrizes: prizes.size,
      });
    }
  }

  const expected = [];
  let d = new Date(start + "T00:00:00");

  while (ymd(d) <= end) {
    const day = ymd(d);
    const dow = d.getDay();

    // Federal: quarta(3) e sábado(6), exceto dias cadastrados sem sorteio
    if ((dow === 3 || dow === 6) && !noDrawSet.has(day)) {
      expected.push(day);
    }

    d = addDays(d, 1);
  }

  const actualDays = Array.from(byDay.keys()).sort();
  const missingDays = expected.filter((day) => !byDay.has(day));
  const extraDays = actualDays.filter((day) => !expected.includes(day));
  const duplicateDays = actualDays
    .filter((day) => byDay.get(day).length > 1)
    .map((day) => ({ day, drawIds: byDay.get(day) }));

  console.log("");
  console.log("=======================================");
  console.log(" AUDITORIA FEDERAL");
  console.log("=======================================");
  console.log("Período esperado:", start, "->", end);
  console.log("Draws no Firestore:", snap.size);
  console.log("Dias únicos no Firestore:", actualDays.length);
  console.log("Primeiro dia:", actualDays[0] || null);
  console.log("Último dia:", actualDays[actualDays.length - 1] || null);
  console.log("Dias esperados:", expected.length);
  console.log("Dias faltando:", missingDays.length);
  console.log("Dias extras:", extraDays.length);
  console.log("Dias duplicados:", duplicateDays.length);
  console.log("Problemas em prêmios:", prizeIssues.length);

  console.log("");
  console.log("Últimos 20 dias reais:");
  console.log(actualDays.slice(-20));

  console.log("");
  console.log("Primeiros 80 dias faltando:");
  console.log(missingDays.slice(0, 80));

  if (duplicateDays.length) {
    console.log("");
    console.log("Duplicados:");
    console.log(JSON.stringify(duplicateDays, null, 2));
  }

  if (prizeIssues.length) {
    console.log("");
    console.log("Problemas de prêmios:");
    console.log(JSON.stringify(prizeIssues.slice(0, 50), null, 2));
  }

  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
