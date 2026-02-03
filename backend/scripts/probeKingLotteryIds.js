"use strict";

const axios = require("axios");

const DATE = process.argv[2] || "2026-01-28";
const ids = (process.argv[3] || "").split(",").map(s => s.trim()).filter(Boolean);

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
      const { data } = await axios.get(url, {
        headers: {
          Accept: "application/json, text/plain, */*",
          Origin: "https://app.kingapostas.com",
          Referer: "https://app.kingapostas.com/",
        },
        timeout: 20000,
        validateStatus: (s) => s >= 200 && s < 300,
      });

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

main();
