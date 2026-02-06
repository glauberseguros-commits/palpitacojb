const axios = require("axios");

(async()=>{
  const page = "https://app.kingapostas.com/results/details?lottery=FEDERAL&date=2026-02-04";
  const { data: html } = await axios.get(page, { headers: { "User-Agent": "Mozilla/5.0" } });

  const s = String(html || "");

  // procura URLs do app_services dentro do HTML (às vezes vem no JS inline/config)
  const reUrl = /https:\/\/app_services\.apionline\.cloud\/api\/results\?[^"'\\\s<]+/ig;
  const found = s.match(reUrl) || [];

  console.log("FOUND_URLS=", found.length);
  found.slice(0,5).forEach((u,i)=>console.log("URL", i+1, "=", u));

  // extrai UUIDs de lotteries[] das URLs achadas
  const uuidRe = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/ig;

  const allUuids = [];
  for(const u of found){
    const uu = u.match(uuidRe) || [];
    for(const x of uu) allUuids.push(x.toLowerCase());
  }
  const uniq = [...new Set(allUuids)];

  console.log("LOTTERY_UUIDS_IN_URLS=", uniq.length);
  if(uniq.length) console.log(uniq.join(","));
})().catch(e=>{ console.error("ERR", e?.response?.status, e?.message); process.exit(1); });
