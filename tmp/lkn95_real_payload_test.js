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


const https = require("https");

const date = "2026-07-18";

const lotteryIds = [
  "6c2b52ec-d613-4383-9c07-ff5ac7e04611",
  "76a3feee-faa6-4b6c-aae5-656fd6af7b6b",
  "4dda728b-bbd9-43eb-a17b-acf968b1eca0",
  "8efc7c5a-8883-48a3-ab7f-cf3d0f7eebd4",
  "3bafbe99-632b-4445-9b73-12e78ee45283",
  "87db8fb6-8718-49c3-b739-96eec085e09d",
  "1eebc22a-890e-4598-86b5-6fda7e04ca4b",
  "2a424135-9b6a-4415-8a57-15e0d3abd736"
];

const expectedSlots = new Set([
  "02:00",
  "08:00",
  "10:00",
  "12:00",
  "15:00",
  "17:00",
  "21:00",
  "23:00"
]);

const query = new URLSearchParams();

query.append("dates[]", date);

for (const id of lotteryIds) {
  query.append("lotteries[]", id);
}

const url =
  "https://app_services.apionline.cloud/api/results?" +
  query.toString();

function requestJson(targetUrl) {
  return new Promise((resolve, reject) => {
    https.get(
      targetUrl,
      {
        headers: {
          Accept: "application/json",
          "User-Agent": "Palpitaco-LKN-95"
        }
      },
      (response) => {
        let body = "";

        response.setEncoding("utf8");

        response.on("data", (chunk) => {
          body += chunk;
        });

        response.on("end", () => {
          if (
            response.statusCode < 200 ||
            response.statusCode >= 300
          ) {
            reject(
              new Error(
                `HTTP ${response.statusCode}: ${body.slice(0, 500)}`
              )
            );
            return;
          }

          try {
            resolve(JSON.parse(body));
          } catch (error) {
            reject(
              new Error(
                `Resposta não é JSON válido: ${error.message}`
              )
            );
          }
        });
      }
    ).on("error", reject);
  });
}

function collectDrawObjects(value, output = []) {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectDrawObjects(item, output);
    }

    return output;
  }

  if (!value || typeof value !== "object") {
    return output;
  }

  const lotteryName = String(
    value.lottery_name ||
    value.name ||
    ""
  );

  if (
    lotteryName.toUpperCase().includes("NACIONAL") &&
    (
      Object.prototype.hasOwnProperty.call(
        value,
        "close_hour"
      ) ||
      /\d{1,2}\s*HS/i.test(lotteryName)
    )
  ) {
    output.push(value);
  }

  for (const child of Object.values(value)) {
    collectDrawObjects(child, output);
  }

  return output;
}

(async () => {
  console.log(`DATA=${date}`);
  console.log("MODO=SOMENTE_LEITURA");
  console.log("");

  const payload = await requestJson(url);
  const draws = collectDrawObjects(payload);

  if (draws.length === 0) {
    throw new Error(
      "Nenhum resultado NACIONAL foi localizado no payload."
    );
  }

  const unique = new Map();

  for (const draw of draws) {
    const lotteryName = String(
      draw.lottery_name ||
      draw.name ||
      ""
    ).trim();

    const closeHour = String(
      draw.close_hour ||
      ""
    ).trim();

    const normalized = normalizeDrawCloseHour(
      draw,
      "NACIONAL"
    );

    const key = [
      lotteryName,
      closeHour,
      normalized.slot
    ].join("|");

    if (!unique.has(key)) {
      unique.set(key, {
        lotteryName,
        closeHour,
        raw: normalized.raw,
        slot: normalized.slot
      });
    }
  }

  const rows = [...unique.values()].sort(
    (a, b) => a.slot.localeCompare(b.slot)
  );

  let failures = 0;
  const foundSlots = new Set();

  console.log("===== RESULTADOS REAIS =====");
  console.log("");

  for (const row of rows) {
    const validSlot = expectedSlots.has(row.slot);

    if (!validSlot) {
      failures++;
    } else {
      foundSlots.add(row.slot);
    }

    console.log(
      `${validSlot ? "APROVADO" : "REPROVADO"} | ` +
      `nome=${JSON.stringify(row.lotteryName)} | ` +
      `close_hour=${JSON.stringify(row.closeHour)} | ` +
      `raw=${JSON.stringify(row.raw)} | ` +
      `slot=${JSON.stringify(row.slot)}`
    );
  }

  const missingSlots = [...expectedSlots]
    .filter((slot) => !foundSlots.has(slot))
    .sort();

  console.log("");
  console.log(`REGISTROS_UNICOS=${rows.length}`);
  console.log(`SLOTS_ENCONTRADOS=${[...foundSlots].sort().join(",")}`);
  console.log(
    `SLOTS_AUSENTES=${missingSlots.length ? missingSlots.join(",") : "NENHUM"}`
  );
  console.log(`REGISTROS_INVALIDOS=${failures}`);

  const approved =
    failures === 0 &&
    missingSlots.length === 0;

  console.log(
    `STATUS=${approved ? "APROVADO" : "REPROVADO"}`
  );

  if (!approved) {
    process.exitCode = 2;
  }
})().catch((error) => {
  console.error("");
  console.error(`ERRO=${error.message}`);
  process.exitCode = 1;
});
