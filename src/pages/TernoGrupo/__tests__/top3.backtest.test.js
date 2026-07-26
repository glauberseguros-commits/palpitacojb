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

function drawKey(draw) {
  const y = pickDrawYMD(draw);
  const h = toHourBucket(pickDrawHour(draw));
  if (!y || !h) return "";
  return `${y}|${h}`;
}

function dedupeAndSort(draws) {
  const map = new Map();

  for (const d of Array.isArray(draws) ? draws : []) {
    const key = drawKey(d);
    if (!key) continue;
    if (!map.has(key)) map.set(key, d);
  }

  return Array.from(map.values()).sort((a, b) => drawTs(a) - drawTs(b));
}

function top5Groups(draw) {
  const out = [];

  for (const p of Array.isArray(draw?.prizes) ? draw.prizes : []) {
    const pos = Number(guessPrizePos(p));
    const g = Number(guessPrizeGrupo(p));

    if (!Number.isFinite(pos) || pos < 1 || pos > 5) continue;
    if (!Number.isFinite(g) || g < 1 || g > 25) continue;

    out.push({ pos, grupo: g });
  }

  return out.sort((a, b) => a.pos - b.pos);
}

function pct(n, d) {
  return d ? ((n / d) * 100).toFixed(2) : "0.00";
}

function ensureHourRow(map, hour) {
  const key = toHourBucket(hour || "") || "SEM_HORA";

  if (!map.has(key)) {
    map.set(key, { total: 0, hitTop5: 0, hitFirst: 0 });
  }

  return map.get(key);
}

function assertComputedSlotMatchesNextDraw({ computed, found, nextSlot, drawLast }) {
  const computedNextYmd = computed?.meta?.next?.ymd || "";
  const computedNextHour = toHourBucket(computed?.meta?.next?.hour || "");

  const expectedYmd = found?.ymd || found?.slot?.ymd || nextSlot?.ymd || "";
  const expectedHour = toHourBucket(
    found?.hour || found?.slot?.hour || nextSlot?.hour || ""
  );

  if (computedNextYmd !== expectedYmd || computedNextHour !== expectedHour) {
    throw new Error(
      [
        "TOP3 calculou slot diferente do próximo sorteio real.",
        `Último sorteio: ${pickDrawYMD(drawLast)} ${toHourBucket(
          pickDrawHour(drawLast)
        )}`,
        `Esperado: ${expectedYmd} ${expectedHour}`,
        `Calculado: ${computedNextYmd} ${computedNextHour}`,
        `Scenario: ${computed?.meta?.scenario || "NONE"}`,
      ].join("\n")
    );
  }
}

function assertPredictionIntegrity({ computed, drawLast, nextDraw }) {
  const top = Array.isArray(computed?.top) ? computed.top.slice(0, 3) : [];

  if (!top.length) {
    throw new Error(
      [
        "TOP3 vazio para caso com próximo sorteio real.",
        `Último sorteio: ${pickDrawYMD(drawLast)} ${toHourBucket(
          pickDrawHour(drawLast)
        )}`,
        `Próximo sorteio: ${pickDrawYMD(nextDraw)} ${toHourBucket(
          pickDrawHour(nextDraw)
        )}`,
        `Scenario: ${computed?.meta?.scenario || "NONE"}`,
      ].join("\n")
    );
  }

  const seen = new Set();

  for (const item of top) {
    const grupo = Number(item?.grupo);

    if (!Number.isFinite(grupo) || grupo < 1 || grupo > 25) {
      throw new Error(`Grupo inválido no TOP3: ${JSON.stringify(item)}`);
    }

    if (seen.has(grupo)) {
      throw new Error(`Grupo repetido no TOP3: ${JSON.stringify(top)}`);
    }

    seen.add(grupo);

    const confidence = Number(
      item?.displayConfidence ??
        item?.confidence ??
        item?.scoreProb ??
        item?.prob ??
        0
    );

    if (!Number.isFinite(confidence)) {
      throw new Error(`Confiança inválida no TOP3: ${JSON.stringify(item)}`);
    }

    if (confidence < 0) {
      throw new Error(`Confiança negativa no TOP3: ${JSON.stringify(item)}`);
    }
  }
}

test("backtest TOP3 PT_RIO - últimos 180 dias", async () => {
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

  const byTargetHour = new Map();

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

    if (drawKey(history[history.length - 1]) === drawKey(nextDraw)) {
      throw new Error(`Vazamento de futuro no histórico: ${drawKey(nextDraw)}`);
    }

    const computed = computeConditionalNextTop3({
      lotteryKey: "PT_RIO",
      drawsRange: history,
      drawLast,
      PT_RIO_SCHEDULE_NORMAL,
      PT_RIO_SCHEDULE_WED_SAT,
      FEDERAL_SCHEDULE,
      topN: 3,
    });

    assertComputedSlotMatchesNextDraw({
      computed,
      found,
      nextSlot,
      drawLast,
    });

    assertPredictionIntegrity({
      computed,
      drawLast,
      nextDraw,
    });

    const pred = Array.isArray(computed?.top)
      ? computed.top.slice(0, 3).map((x) => Number(x.grupo))
      : [];

    const actualTop5 = top5Groups(nextDraw);
    const actualGroups = actualTop5.map((x) => Number(x.grupo));
    const actualFirst = actualTop5.find((x) => x.pos === 1)?.grupo ?? null;

    if (!actualGroups.length || !Number.isFinite(Number(actualFirst))) {
      continue;
    }

    const hasTop5 = pred.some((g) => actualGroups.includes(g));
    const hasFirst = pred.includes(Number(actualFirst));

    totalCases += 1;
    if (hasTop5) hitTop5 += 1;
    if (hasFirst) hitFirst += 1;

    const targetHour =
      found?.hour || found?.slot?.hour || pickDrawHour(nextDraw) || "";

    const row = ensureHourRow(byTargetHour, targetHour);
    row.total += 1;
    if (hasTop5) row.hitTop5 += 1;
    if (hasFirst) row.hitFirst += 1;
  }

  console.log("\n================ BACKTEST TOP3 PT_RIO ================");
  console.log(`Janela: ${from} até ${maxDate}`);
  console.log(`Casos testados: ${totalCases}`);
  console.log(
    `Acerto TOP3 dentro do TOP5: ${hitTop5} / ${totalCases} = ${pct(
      hitTop5,
      totalCases
    )}%`
  );
  console.log(
    `Acerto TOP3 contendo o 1º prêmio: ${hitFirst} / ${totalCases} = ${pct(
      hitFirst,
      totalCases
    )}%`
  );
  console.log("------------------------------------------------------");

  for (const [hour, row] of Array.from(byTargetHour.entries()).sort()) {
    console.log(
      `${hour} | casos=${row.total} | top5=${row.hitTop5}/${row.total} (${pct(
        row.hitTop5,
        row.total
      )}%) | primeiro=${row.hitFirst}/${row.total} (${pct(
        row.hitFirst,
        row.total
      )}%)`
    );
  }

  console.log("======================================================\n");

  expect(totalCases).toBeGreaterThan(0);
});