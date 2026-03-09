import {
  computeConditionalNextTop3,
  getNextSlotForLottery,
  findNextExistingDrawFromSlot,
  indexDrawsByYmdHour,
  pickDrawYMD,
  pickDrawHour,
  guessPrizePos,
  guessPrizeGrupo,
} from "../top3.engine";

import {
  PT_RIO_SCHEDULE_NORMAL,
  PT_RIO_SCHEDULE_WED_SAT,
  FEDERAL_SCHEDULE,
} from "../top3.constants";

import { toHourBucket, hourToInt, addDaysYMD } from "../top3.formatters";

import {
  getKingBoundsByUf,
  getKingResultsByRange,
} from "../../../services/kingResultsService";

jest.setTimeout(300000);

function drawTs(draw) {
  const y = pickDrawYMD(draw);
  const h = toHourBucket(pickDrawHour(draw));
  if (!y || !h) return Number.POSITIVE_INFINITY;

  const [Y, M, D] = y.split("-").map(Number);
  const base = Date.UTC(Y, M - 1, D);
  const mins = hourToInt(h);
  const add = mins >= 0 ? mins * 60 * 1000 : 0;
  return base + add;
}

function dedupeAndSort(draws) {
  const map = new Map();
  for (const d of Array.isArray(draws) ? draws : []) {
    const y = pickDrawYMD(d);
    const h = toHourBucket(pickDrawHour(d));
    if (!y || !h) continue;
    const key = `${y}|${h}`;
    if (!map.has(key)) map.set(key, d);
  }
  return Array.from(map.values()).sort((a, b) => drawTs(a) - drawTs(b));
}

function top5Groups(draw) {
  const out = [];
  for (const p of Array.isArray(draw?.prizes) ? draw.prizes : []) {
    const pos = guessPrizePos(p);
    const g = guessPrizeGrupo(p);
    if (!Number.isFinite(Number(pos)) || pos < 1 || pos > 5) continue;
    if (!Number.isFinite(Number(g)) || g < 1 || g > 25) continue;
    out.push({ pos: Number(pos), grupo: Number(g) });
  }
  return out.sort((a, b) => a.pos - b.pos);
}

function ensureRow(map, key) {
  if (!map.has(key)) {
    map.set(key, { total: 0, hitTop5: 0, hitFirst: 0 });
  }
  return map.get(key);
}

function pct(n, d) {
  return d ? ((n / d) * 100).toFixed(2) : "0.00";
}

test("backtest TOP3 PT_RIO - camadas e transições", async () => {
  const bounds = await getKingBoundsByUf({ uf: "PT_RIO" });
  const maxDate = bounds?.maxYmd || bounds?.maxDate;
  expect(maxDate).toBeTruthy();

  const from = addDaysYMD(maxDate, -179);
  const toExclusive = addDaysYMD(maxDate, 1);

  const raw = await getKingResultsByRange({
    uf: "PT_RIO",
    dateFrom: from,
    dateTo: toExclusive,
    mode: "detailed",
    readPolicy: "server",
  });

  const allDraws = dedupeAndSort(raw);
  const drawsIndex = indexDrawsByYmdHour(allDraws);

  expect(allDraws.length).toBeGreaterThan(30);

  let totalCases = 0;
  let hitTop5 = 0;
  let hitFirst = 0;

  const byScenario = new Map();
  const byEdge = new Map();
  const byPrevGrupo = new Map();

  for (let i = 0; i < allDraws.length - 1; i += 1) {
    const drawLast = allDraws[i];
    const history = allDraws.slice(0, i + 1);

    const lastY = pickDrawYMD(drawLast);
    const lastH = toHourBucket(pickDrawHour(drawLast));
    if (!lastY || !lastH) continue;

    const nextSlot = getNextSlotForLottery({
      lotteryKey: "PT_RIO",
      ymd: lastY,
      hourBucket: lastH,
      PT_RIO_SCHEDULE_NORMAL,
      PT_RIO_SCHEDULE_WED_SAT,
      FEDERAL_SCHEDULE,
    });

    if (!nextSlot?.ymd || !nextSlot?.hour) continue;

    const found = findNextExistingDrawFromSlot({
      lotteryKey: "PT_RIO",
      startSlot: { ymd: nextSlot.ymd, hour: nextSlot.hour },
      drawsIndex,
      PT_RIO_SCHEDULE_NORMAL,
      PT_RIO_SCHEDULE_WED_SAT,
      FEDERAL_SCHEDULE,
    });

    const nextDraw = found?.draw || null;
    if (!nextDraw) continue;

    const computed = computeConditionalNextTop3({
      lotteryKey: "PT_RIO",
      drawsRange: history,
      drawLast,
      PT_RIO_SCHEDULE_NORMAL,
      PT_RIO_SCHEDULE_WED_SAT,
      FEDERAL_SCHEDULE,
      topN: 3,
    });

    const pred = Array.isArray(computed?.top)
      ? computed.top.map((x) => Number(x.grupo))
      : [];

    if (!pred.length) continue;

    const actualTop5 = top5Groups(nextDraw);
    const actualGroups = actualTop5.map((x) => Number(x.grupo));
    const actualFirst = actualTop5.find((x) => x.pos === 1)?.grupo ?? null;

    const hasTop5 = pred.some((g) => actualGroups.includes(g));
    const hasFirst = pred.includes(Number(actualFirst));

    totalCases += 1;
    if (hasTop5) hitTop5 += 1;
    if (hasFirst) hitFirst += 1;

    const scenario = computed?.meta?.scenario || "NONE";
    const prevHour = computed?.meta?.trigger?.hour || "";
    const nextHour = computed?.meta?.next?.hour || "";
    const prevGrupo = Number(computed?.meta?.trigger?.grupo || 0);
    const edge = `${prevHour}->${nextHour}`;

    const rowScenario = ensureRow(byScenario, scenario);
    rowScenario.total += 1;
    if (hasTop5) rowScenario.hitTop5 += 1;
    if (hasFirst) rowScenario.hitFirst += 1;

    const rowEdge = ensureRow(byEdge, edge);
    rowEdge.total += 1;
    if (hasTop5) rowEdge.hitTop5 += 1;
    if (hasFirst) rowEdge.hitFirst += 1;

    const prevGrupoKey = String(prevGrupo).padStart(2, "0");
    const rowPrevGrupo = ensureRow(byPrevGrupo, prevGrupoKey);
    rowPrevGrupo.total += 1;
    if (hasTop5) rowPrevGrupo.hitTop5 += 1;
    if (hasFirst) rowPrevGrupo.hitFirst += 1;
  }

  console.log("\n================ BACKTEST TOP3 PT_RIO (CAMADAS) ================");
  console.log(`Janela: ${from} até ${maxDate}`);
  console.log(`Casos testados: ${totalCases}`);
  console.log(`TOP5 geral: ${hitTop5}/${totalCases} (${pct(hitTop5, totalCases)}%)`);
  console.log(`1º geral: ${hitFirst}/${totalCases} (${pct(hitFirst, totalCases)}%)`);
  console.log("----------------------------------------------------------------");
  console.log("POR CENÁRIO:");
  for (const [key, row] of Array.from(byScenario.entries()).sort((a, b) => b[1].total - a[1].total)) {
    console.log(`${key} | casos=${row.total} | top5=${row.hitTop5}/${row.total} (${pct(row.hitTop5, row.total)}%) | primeiro=${row.hitFirst}/${row.total} (${pct(row.hitFirst, row.total)}%)`);
  }
  console.log("----------------------------------------------------------------");
  console.log("POR TRANSIÇÃO:");
  for (const [key, row] of Array.from(byEdge.entries()).sort()) {
    console.log(`${key} | casos=${row.total} | top5=${row.hitTop5}/${row.total} (${pct(row.hitTop5, row.total)}%) | primeiro=${row.hitFirst}/${row.total} (${pct(row.hitFirst, row.total)}%)`);
  }
  console.log("----------------------------------------------------------------");
  console.log("TOP 15 GATILHOS ANTERIORES (por volume):");
  for (const [key, row] of Array.from(byPrevGrupo.entries()).sort((a, b) => b[1].total - a[1].total).slice(0, 15)) {
    console.log(`G${key} | casos=${row.total} | top5=${row.hitTop5}/${row.total} (${pct(row.hitTop5, row.total)}%) | primeiro=${row.hitFirst}/${row.total} (${pct(row.hitFirst, row.total)}%)`);
  }
  console.log("================================================================\n");

  expect(totalCases).toBeGreaterThan(0);
});
