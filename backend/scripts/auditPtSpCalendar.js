"use strict";

const {
  fetchKingResults,
} =
  require(
    "./importKingApostas"
  );

const {
  getPtSpSourceRegistry,
  getPtSpCalendarByDate,
  getPtSpExpectedRawMinute,
  resolvePtSpSourceDraw,
} =
  require(
    "./ptSpCalendar"
  );

function rows(payload) {
  return Array.isArray(
    payload?.data
  )
    ? payload.data
    : [];
}

function addDays(
  ymd,
  amount
) {
  const dt =
    new Date(
      `${ymd}T00:00:00.000Z`
    );

  dt.setUTCDate(
    dt.getUTCDate() +
    amount
  );

  return dt
    .toISOString()
    .slice(0, 10);
}

function sameArray(
  left,
  right
) {
  return (
    JSON.stringify(left) ===
    JSON.stringify(right)
  );
}

function resolvePayload(
  payload,
  date
) {
  const result = [];

  for (
    const draw
    of rows(payload)
  ) {
    const resolved =
      resolvePtSpSourceDraw(
        draw
      );

    if (resolved.conflict) {
      throw new Error(
        `${date}: conflito UUID x source_name: ` +
        JSON.stringify({
          incomingLotteryId:
            resolved
              .incomingLotteryId,
          incomingSourceName:
            resolved
              .incomingSourceName,
          uuidSource:
            resolved
              .uuidSource,
          nameSource:
            resolved
              .nameSource,
        })
      );
    }

    if (!resolved.matched) {
      throw new Error(
        `${date}: draw nao pertence a nenhuma fonte PT_SP registrada: ` +
        JSON.stringify({
          lottery_id:
            draw?.lottery_id ||
            draw?.lotteryId ||
            "",
          lottery_name:
            draw?.lottery_name ||
            draw?.name ||
            "",
          close_hour:
            draw?.close_hour ||
            "",
        })
      );
    }

    result.push(
      resolved
    );
  }

  return result;
}

function canonicalSlots(
  resolvedRows
) {
  return Array.from(
    new Set(
      resolvedRows
        .map(
          (row) =>
            row.canonicalSlot
        )
        .filter(Boolean)
    )
  ).sort();
}

function assertExpectedRawMinute(
  date,
  resolvedRows
) {
  const expectedMinute =
    getPtSpExpectedRawMinute(
      date
    );

  const wrong =
    resolvedRows.filter(
      (row) =>
        !String(
          row.rawCloseHour ||
          ""
        ).endsWith(
          `:${expectedMinute}`
        )
    );

  if (wrong.length) {
    throw new Error(
      `${date}: raw minute esperado=:${expectedMinute}, divergencias=` +
      JSON.stringify(
        wrong.map(
          (row) => ({
            slot:
              row.canonicalSlot,
            raw:
              row.rawCloseHour,
            source:
              row
                .source
                ?.sourceName,
          })
        )
      )
    );
  }
}

async function fetchResolved(
  date
) {
  const payload =
    await fetchKingResults({
      date,
      lotteryKey:
        "PT_SP",
    });

  return resolvePayload(
    payload,
    date
  );
}

async function auditHistoricalMilestones() {
  const milestones = [
    {
      date:
        "2022-07-06",
      required: [
        "13:00",
        "15:00",
        "20:00",
      ],
    },
    {
      date:
        "2022-07-07",
      required: [
        "10:00",
      ],
    },
    {
      date:
        "2023-06-03",
      required: [
        "17:00",
      ],
    },
    {
      date:
        "2024-04-11",
      required: [
        "08:00",
      ],
    },
    {
      date:
        "2024-06-11",
      required: [
        "12:00",
      ],
    },
    {
      date:
        "2024-06-14",
      required: [
        "19:00",
      ],
    },
  ];

  for (
    const milestone
    of milestones
  ) {
    const resolved =
      await fetchResolved(
        milestone.date
      );

    const actual =
      canonicalSlots(
        resolved
      );

    for (
      const required
      of milestone.required
    ) {
      if (
        !actual.includes(
          required
        )
      ) {
        throw new Error(
          `${milestone.date}: slot ${required} ausente; actual=[${actual.join(",")}]`
        );
      }
    }

    const calendar =
      getPtSpCalendarByDate(
        milestone.date
      );

    if (
      calendar
        .enforceOperationalSchedule
    ) {
      throw new Error(
        `${milestone.date}: historico tratado indevidamente como grade atual`
      );
    }

    assertExpectedRawMinute(
      milestone.date,
      resolved
    );

    console.log(
      `PTSP_SOURCE_MILESTONE_${milestone.date}=PASS slots=[${actual.join(",")}]`
    );
  }

  console.log(
    "PTSP_HISTORICAL_SOURCE_MILESTONES=PASS"
  );
}

async function auditFullCurrentRegime() {
  const start =
    "2026-08-01";

  const end =
    "2026-08-30";

  let date =
    start;

  let checkedDays =
    0;

  let checkedDraws =
    0;

  while (date <= end) {
    const calendar =
      getPtSpCalendarByDate(
        date
      );

    if (
      calendar.mode !==
      "CURRENT_OBSERVED_REGIME"
    ) {
      throw new Error(
        `${date}: nao esta em CURRENT_OBSERVED_REGIME`
      );
    }

    let lastError =
      null;

    let resolved =
      null;

    /*
     * Ate 3 leituras somente se houver divergencia.
     * Evita reprovar por falha HTTP transitoria sem
     * mascarar divergencia persistente.
     */
    for (
      let attempt = 1;
      attempt <= 3;
      attempt++
    ) {
      try {
        resolved =
          await fetchResolved(
            date
          );

        const actual =
          canonicalSlots(
            resolved
          );

        if (
          sameArray(
            actual,
            calendar
              .operationalSlots
          )
        ) {
          lastError =
            null;

          break;
        }

        lastError =
          new Error(
            `${date}: expected=[${calendar.operationalSlots.join(",")}] actual=[${actual.join(",")}]`
          );
      } catch (error) {
        lastError =
          error;
      }

      if (attempt < 3) {
        await new Promise(
          (resolve) =>
            setTimeout(
              resolve,
              300
            )
        );
      }
    }

    if (lastError) {
      throw lastError;
    }

    const actual =
      canonicalSlots(
        resolved
      );

    assertExpectedRawMinute(
      date,
      resolved
    );

    checkedDays += 1;
    checkedDraws +=
      resolved.length;

    console.log(
      `PTSP_CURRENT_GRADE_${date}=PASS slots=[${actual.join(",")}]`
    );

    date =
      addDays(
        date,
        1
      );
  }

  if (checkedDays !== 30) {
    throw new Error(
      `Current regime esperado=30 dias auditados=${checkedDays}`
    );
  }

  console.log(
    `PTSP_CURRENT_REGIME_FULL_WINDOW=PASS days=${checkedDays} draws=${checkedDraws}`
  );
}

function auditRegistry() {
  const registry =
    getPtSpSourceRegistry();

  if (
    registry.sources.length !==
    8
  ) {
    throw new Error(
      "Registry nao possui 8 fontes."
    );
  }

  const uuids =
    new Set(
      registry.sources.map(
        (source) =>
          source.uuid
      )
    );

  if (uuids.size !== 8) {
    throw new Error(
      "Registry possui UUID duplicado."
    );
  }

  const band =
    registry.sources.find(
      (source) =>
        source.slot ===
        "15:00"
    );

  if (
    band?.sourceName !==
    "LT BAND 15HS"
  ) {
    throw new Error(
      "Identidade LT BAND 15HS perdida."
    );
  }

  if (
    registry
      .currentOperationalRegime
      .formalTransitionDateClaimed !==
    false
  ) {
    throw new Error(
      "Calendar esta afirmando data formal de transicao."
    );
  }

  console.log(
    "PTSP_REGISTRY_IDENTITY=PASS"
  );

  console.log(
    "PTSP_NO_FALSE_TRANSITION_CLAIM=PASS"
  );
}

(async () => {
  console.log("");
  console.log(
    "=== PT_SP CALENDAR / SOURCE TRUTH AUDIT R2 ==="
  );

  auditRegistry();

  await auditHistoricalMilestones();

  await auditFullCurrentRegime();

  console.log("");
  console.log(
    "PT_SP_CALENDAR_SOURCE_TRUTH_AUDIT_R2=PASS"
  );
})().catch((error) => {

  console.error("");
  console.error(
    "PT_SP_CALENDAR_SOURCE_TRUTH_AUDIT_R2=FAIL"
  );

  console.error(
    error?.stack ||
    error
  );

  process.exit(1);
});
