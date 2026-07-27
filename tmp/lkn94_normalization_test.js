function normalizeHHMM(value) {
  const s = String(value ?? "").trim();
  if (!s) return "";

  if (isHHMM(s)) return s;

  const m1 = s.match(/^(\d{1,2})h$/i);
  if (m1) return `${String(m1[1]).padStart(2, "0")}:00`;

  const m2 = s.match(/^(\d{1,2})$/);
  if (m2) return `${String(m2[1]).padStart(2, "0")}:00`;

  const m3 = s.match(/^(\d{1,2}):(\d{1,2})$/);
  if (m3) {
    const hh = String(m3[1]).padStart(2, "0");
    const mm = String(m3[2]).padStart(2, "0");
    return `${hh}:${mm}`;
  }

  return "";
}

function isHHMM(s) {
  return /^\d{2}:\d{2}$/.test(String(s || "").trim());
}

function normalizeCloseHourForLottery(value, lotteryKey) {
  const lk = String(lotteryKey || "").trim().toUpperCase();
  const raw0 = normalizeHHMM(value);
  if (!raw0 || !isHHMM(raw0)) return { raw: "", slot: "" };

  // ✅ FEDERAL: slot de negócio é sempre 20:00, mas preserva o raw
  if (lk === "FEDERAL") {
    return { raw: raw0, slot: "20:00" };
  }

  if (lk === "PT_RIO") {
    const hh = raw0.slice(0, 2);
    const mm = raw0.slice(3, 5);

    // ✅ se vier HH:09, é marcação (não minuto real) -> não grava close_hour_raw
    const raw = mm === "09" ? "" : raw0;
    return { raw, slot: `${hh}:00` };
  }

  return { raw: raw0, slot: raw0 };
}

function normalizeDrawCloseHour(draw, lotteryKey) {
  const base = normalizeCloseHourForLottery(
    draw?.close_hour || "",
    lotteryKey
  );

  const lk = String(lotteryKey || "").trim().toUpperCase();

  if (lk !== "NACIONAL") {
    return base;
  }

  const lotteryName = String(
    draw?.lottery_name ||
    draw?.name ||
    ""
  );

  const m = lotteryName.match(/(\d{1,2})\s*HS/i);

  if (!m) {
    return base;
  }

  return {
    raw: base.raw,
    slot: `${String(m[1]).padStart(2,"0")}:00`
  };
}


const tests = [
  {
    label: "NACIONAL 02HS",
    lotteryKey: "NACIONAL",
    draw: {
      close_hour: "01:49",
      lottery_name: "LT NACIONAL 02HS"
    },
    expected: { raw: "01:49", slot: "02:00" }
  },
  {
    label: "NACIONAL 08HS",
    lotteryKey: "NACIONAL",
    draw: {
      close_hour: "07:49",
      lottery_name: "LT NACIONAL 08HS"
    },
    expected: { raw: "07:49", slot: "08:00" }
  },
  {
    label: "NACIONAL 10HS",
    lotteryKey: "NACIONAL",
    draw: {
      close_hour: "09:49",
      lottery_name: "LT NACIONAL 10HS"
    },
    expected: { raw: "09:49", slot: "10:00" }
  },
  {
    label: "NACIONAL 12HS",
    lotteryKey: "NACIONAL",
    draw: {
      close_hour: "11:49",
      lottery_name: "LT NACIONAL 12HS"
    },
    expected: { raw: "11:49", slot: "12:00" }
  },
  {
    label: "NACIONAL 15HS",
    lotteryKey: "NACIONAL",
    draw: {
      close_hour: "14:49",
      lottery_name: "LT NACIONAL 15HS"
    },
    expected: { raw: "14:49", slot: "15:00" }
  },
  {
    label: "NACIONAL 17HS",
    lotteryKey: "NACIONAL",
    draw: {
      close_hour: "16:49",
      lottery_name: "LT NACIONAL 17HS"
    },
    expected: { raw: "16:49", slot: "17:00" }
  },
  {
    label: "NACIONAL 21HS",
    lotteryKey: "NACIONAL",
    draw: {
      close_hour: "20:49",
      lottery_name: "LT NACIONAL 21HS"
    },
    expected: { raw: "20:49", slot: "21:00" }
  },
  {
    label: "NACIONAL 23HS",
    lotteryKey: "NACIONAL",
    draw: {
      close_hour: "22:49",
      lottery_name: "LT NACIONAL 23HS"
    },
    expected: { raw: "22:49", slot: "23:00" }
  },

  {
    label: "PT_RIO preservado",
    lotteryKey: "PT_RIO",
    draw: {
      close_hour: "09:09",
      lottery_name: "PT RIO 09HS"
    },
    expected: { raw: "", slot: "09:00" }
  },
  {
    label: "FEDERAL preservado",
    lotteryKey: "FEDERAL",
    draw: {
      close_hour: "19:49",
      lottery_name: "FEDERAL"
    },
    expected: { raw: "19:49", slot: "20:00" }
  },
  {
    label: "LOOK preservado",
    lotteryKey: "LOOK",
    draw: {
      close_hour: "10:20",
      lottery_name: "LOOK 10HS"
    },
    expected: { raw: "10:20", slot: "10:20" }
  },
  {
    label: "NACIONAL sem HS usa fallback",
    lotteryKey: "NACIONAL",
    draw: {
      close_hour: "14:49",
      lottery_name: "LT NACIONAL"
    },
    expected: { raw: "14:49", slot: "14:49" }
  }
];

let failures = 0;

console.log("===== RESULTADOS =====");
console.log("");

for (const test of tests) {
  const actual = normalizeDrawCloseHour(
    test.draw,
    test.lotteryKey
  );

  const passed =
    actual.raw === test.expected.raw &&
    actual.slot === test.expected.slot;

  if (!passed) {
    failures++;
  }

  console.log(
    `${passed ? "APROVADO" : "REPROVADO"} | ` +
    `${test.label} | ` +
    `raw=${JSON.stringify(actual.raw)} | ` +
    `slot=${JSON.stringify(actual.slot)} | ` +
    `esperado_raw=${JSON.stringify(test.expected.raw)} | ` +
    `esperado_slot=${JSON.stringify(test.expected.slot)}`
  );
}

console.log("");
console.log(`TOTAL=${tests.length}`);
console.log(`APROVADOS=${tests.length - failures}`);
console.log(`REPROVADOS=${failures}`);
console.log(`STATUS=${failures === 0 ? "APROVADO" : "REPROVADO"}`);

if (failures > 0) {
  process.exit(2);
}
