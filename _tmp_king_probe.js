const axios = require("axios");

const UUID_RE=/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/ig;

(async()=>{
  const base="https://app.kingapostas.com/";
  const {data:html}=await axios.get(base,{headers:{"User-Agent":"Mozilla/5.0"}});
  const srcs=[...html.matchAll(/<script[^>]+src="([^"]+)"/ig)].map(m=>m[1])
    .filter(s=>s.includes(".js"))
    .map(s=>s.startsWith("http")?s:(base.replace(/\/$/,"")+s));

  const picks=srcs.filter(s=>/main|index|app|chunk|bundle/i.test(s)).slice(0,12);

  const hits=[];
  for(const url of picks){
    try{
      const {data:js}=await axios.get(url,{headers:{"User-Agent":"Mozilla/5.0"}});
      const txt=String(js||"");
      const needles=["LT FEDERAL 19HS","LT FEDERAL 20HS","FEDERAL 19HS","FEDERAL 20HS","LT FEDERAL"];
      for(const n of needles){
        let idx=0;
        while((idx=txt.indexOf(n,idx))!==-1){
          const a=Math.max(0,idx-800);
          const b=Math.min(txt.length,idx+800);
          const win=txt.slice(a,b);
          const uu=(win.match(UUID_RE)||[]).map(x=>x.toLowerCase());
          for(const u of uu) hits.push({n,u,url});
          idx=idx+n.length;
        }
      }
    }catch(e){}
  }

  const map=new Map();
  for(const h of hits) if(!map.has(h.u)) map.set(h.u,h);

  const uniq=[...map.values()];
  console.log("CANDIDATOS_UUIDS=", uniq.length);
  uniq.slice(0,80).forEach(h=>console.log(h.n,"=>",h.u,"@",h.url));
})().catch(e=>{console.error("ERR", e?.message||e); process.exit(1);});
