"use strict";

const axios = require("axios");

function isISODate(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || "").trim());
}

function uniq(arr) {
  return Array.from(new Set(arr));
}
const DATE = String(process.argv[2] || "2026-01-28").trim();
const ids = uniq(
  String(process.argv[3] || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
);

if (!isISODate(DATE)) {
  console.log("ERRO: data inválida. Use YYYY-MM-DD.");
  process.exit(1);
}
if (!ids.length) {
  console.log("Uso: node scripts/probeKingLotteryIds.js YYYY-MM-DD uuid1,uuid2,uuid3");
  process.exit(1);
}

async function main() {
  const base = "https://app_services.apionline.cloud/api/results";
  for (const id of ids) {
    const params = new URLSearchParams();
    params.append("dates[]", DATE);
    params.append("lotteries[]", id);
    const url = `${base}?${params.toString()}`;

    try {
      const resp = await axios.get(url, {
        headers: {
          Accept: "application/json, text/plain, */*",
          Origin: "https://app.kingapostas.com",
          Referer: "https://app.kingapostas.com/",
        },
        timeout: 20000,
        validateStatus: () => true,
      });

      const status = Number(resp?.status);
      const data = resp?.data;

      if (!(status >= 200 && status < 300)) {
        const hint =
          data && typeof data === "object"
            ? JSON.stringify(data).slice(0, 250)
            : String(data || "");
        console.log(`[PROBE] id=${id} ERROR=HTTP_${status} body=${hint}`);
        continue;
      }
const ok = !!data?.success && Array.isArray(data?.data);
      const n = ok ? data.data.length : -1;

      const closes = ok
        ? Array.from(new Set(data.data.map(d => String(d?.close_hour || "").trim()).filter(Boolean))).sort()
        : [];

      console.log(`[PROBE] id=${id} ok=${ok} draws=${n} close_hours=[${closes.join(", ")}]`);
    } catch (e) {
      const msg = e?.response?.status ? `HTTP_${e.response.status}` : (e?.code || e?.message || "ERR");
      console.log(`[PROBE] id=${id} ERROR=${msg}`);
    }
  }
}

main().catch((e) => {
  console.log("[PROBE] FATAL:", e?.stack || e?.message || e);
  process.exit(1);
});
