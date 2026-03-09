import { useCallback, useEffect, useMemo, useState, useRef } from "react";

import {
  safeStr,
  isYMD,
  ymdToBR,
  normalizeToYMD,
  todayYMDLocal,
  addDaysYMD,
  toHourBucket,
  getCentena3,
  getDowKey,
} from "./top3.formatters";

import {
  LOOKBACK_ALL,
  LOOKBACK_OPTIONS,
  LOTTERY_OPTIONS,
  PT_RIO_SCHEDULE_NORMAL,
  PT_RIO_SCHEDULE_WED_SAT,
  FEDERAL_SCHEDULE,
  TOP3_SMOOTH_ALPHA,
  TOP3_GROUPS_K,
} from "./top3.constants";

import {
  getScheduleForLottery,
  isFederalDrawDay,
  findLastDrawInList,
  pickDrawHour,
  pickDrawYMD,
  pickPrize1GrupoFromDraw,
  getPreviousDrawRobust,
  build16MilharesForGrupo,
  buildMilharesForGrupo,
  getNextSlotForLottery,
  computeConditionalNextTop3,
} from "./top3.engine";

import {
  lotteryLabel,
  makeImgVariantsFromGrupo,
  normalizeImgSrc,
} from "./top3.selectors";

import {
  getKingResultsByDate,
  getKingResultsByRange,
  getKingBoundsByUf,
} from "../../services/kingResultsService";

import { getAnimalLabel, getImgFromGrupo } from "../../constants/bichoMap";

function normalizeMilhar4(v) {
  const s = String(v || "").trim();
  if (!s) return "";

  const dig = s.replace(/\D+/g, "");
  if (!dig) return "";

  return dig.length >= 4 ? dig.slice(-4) : dig.padStart(4, "0");
}

function build4ColsFromEngineOut(out, expectedCols = 4, perCol = 5) {
  const dezenas = Array.isArray(out?.dezenas) ? out.dezenas : [];
  const slots = Array.isArray(out?.slots) ? out.slots : [];

  const cols = [];
  const dzList = dezenas.slice(0, expectedCols);

  for (const dz of dzList) {
    const items = slots
      .filter((s) => String(s?.dezena || "") === String(dz))
      .map((s) => normalizeMilhar4(s?.milhar))
      .map((m) => (m && /^\d{4}$/.test(m) ? m : ""))
      .slice(0, perCol);

    while (items.length < perCol) items.push("");

    cols.push({ dezena: dz, items });
  }

  while (cols.length < expectedCols) {
    cols.push({ dezena: "", items: Array(perCol).fill("") });
  }

  return cols.slice(0, expectedCols);
}

export function useTop3Controller() {

  const DEFAULT_LOTTERY = "PT_RIO";

  const requestIdRef = useRef(0);

  const boundsCacheRef = useRef(new Map());
  const analyticsCacheRef = useRef({ key: "", value: { top: [], meta: null } });

  const [lotteryKey, setLotteryKey] = useState(DEFAULT_LOTTERY);
  const [ymd, setYmd] = useState(() => todayYMDLocal());
  const [lookback, setLookback] = useState(LOOKBACK_ALL);

  const [loading, setLoading] = useState(false);
  const [loadingStage, setLoadingStage] = useState({ today:false, range:false });
  const [error, setError] = useState("");

  const [rangeDraws,setRangeDraws] = useState([]);
  const [bounds,setBounds] = useState({minDate:"",maxDate:""});
  const [rangeInfo,setRangeInfo] = useState({from:"",to:""});

  const [lastHourBucket,setLastHourBucket] = useState("");
  const [targetHourBucket,setTargetHourBucket] = useState("");
  const [targetYmd,setTargetYmd] = useState("");

  const [lastInfo,setLastInfo] = useState({
    lastYmd:"",
    lastHour:"",
    lastGrupo:null,
    lastAnimal:""
  });

  const [prevInfo,setPrevInfo] = useState({
    prevYmd:"",
    prevHour:"",
    prevGrupo:null,
    prevAnimal:"",
    source:"none"
  });

  const lotteryKeySafe = useMemo(
    () => safeStr(lotteryKey).toUpperCase() || DEFAULT_LOTTERY,
    [lotteryKey]
  );

  const ymdSafe = useMemo(()=>{
    const y = normalizeToYMD(ymd);
    return y && isYMD(y) ? y : todayYMDLocal();
  },[ymd]);

  const dateBR = useMemo(()=> ymdToBR(ymdSafe),[ymdSafe]);

  /* CORREÇÃO IMPORTANTE
     schedule agora depende do targetYmd */
  const schedule = useMemo(()=>{

    const y = safeStr(targetYmd) || ymdSafe;

    return getScheduleForLottery({
      lotteryKey: lotteryKeySafe,
      ymd: y,
      PT_RIO_SCHEDULE_NORMAL,
      PT_RIO_SCHEDULE_WED_SAT,
      FEDERAL_SCHEDULE
    });

  },[lotteryKeySafe,ymdSafe,targetYmd]);

  const isFederalNonDrawDay = useMemo(()=>{
    return lotteryKeySafe==="FEDERAL" && !schedule.length;
  },[lotteryKeySafe,schedule]);

  const analysisHourBucket = useMemo(()=> safeStr(targetHourBucket)||"",[targetHourBucket]);
  const analysisYmd = useMemo(()=> safeStr(targetYmd)||"",[targetYmd]);

  const lookbackLabel = useMemo(()=>{

    if(lookback===LOOKBACK_ALL) return "Toda a base";

    const n = Number(lookback||0);

    if(!Number.isFinite(n)||n<=0) return "—";

    return `${n} dias`;

  },[lookback]);

  const rangeLabel = useMemo(()=>{

    const f = safeStr(rangeInfo?.from);
    const t = safeStr(rangeInfo?.to);

    if(isYMD(f)&&isYMD(t)) return `${ymdToBR(f)} → ${ymdToBR(t)}`;

    return "—";

  },[rangeInfo]);

  const prevLabel = useMemo(()=>{

    if(!prevInfo?.prevGrupo) return "—";

    const g = Number(prevInfo.prevGrupo);

    const animal = safeStr(prevInfo.prevAnimal || getAnimalLabel?.(g)||"");

    const when =
      prevInfo?.prevYmd && prevInfo?.prevHour
        ? `${ymdToBR(prevInfo.prevYmd)} ${prevInfo.prevHour}`
        : "";

    return `G${String(g).padStart(2,"0")}${animal?" • "+animal.toUpperCase():""}${when?" • "+when:""}`;

  },[prevInfo]);

  const lastLabel = useMemo(()=>{

    if(!lastInfo?.lastGrupo) return "—";

    const g = Number(lastInfo.lastGrupo);

    const animal = safeStr(lastInfo.lastAnimal || getAnimalLabel?.(g)||"");

    const when =
      lastInfo?.lastYmd && lastInfo?.lastHour
        ? `${ymdToBR(lastInfo.lastYmd)} ${lastInfo.lastHour}`
        : "";

    return `G${String(g).padStart(2,"0")}${animal?" • "+animal.toUpperCase():""}${when?" • "+when:""}`;

  },[lastInfo]);

  /* =========================
     LOAD
  ========================= */

  const load = useCallback(async()=>{

    const lKey = safeStr(lotteryKeySafe);

    if(!lKey||!isYMD(ymdSafe)) return;

    setLoading(true);
    setLoadingStage({today:true,range:false});
    setError("");

    const currentRequestId = ++requestIdRef.current;

    if(lKey==="FEDERAL" && !isFederalDrawDay(ymdSafe)){

      if(requestIdRef.current===currentRequestId){

        setLastHourBucket("");
        setTargetHourBucket("");
        setTargetYmd("");

        setLastInfo({
          lastYmd:"",
          lastHour:"",
          lastGrupo:null,
          lastAnimal:""
        });

        setPrevInfo({
          prevYmd:"",
          prevHour:"",
          prevGrupo:null,
          prevAnimal:"",
          source:"none"
        });

        setRangeInfo({from:"",to:""});
        setLoading(false);

        setError(
          `Loteria Federal só tem resultado às 20h nas quartas e sábados. (${dateBR} não é dia de concurso)`
        );
      }

      return;
    }

    try{

      const ufResolved = lKey;

      let minDate = safeStr(bounds?.minDate);
      let maxDate = safeStr(bounds?.maxDate);

      const cached = boundsCacheRef.current.get(ufResolved);

      if(cached){

        minDate = cached.minDate;
        maxDate = cached.maxDate;

      } else {

        const b = await getKingBoundsByUf({uf:ufResolved});

        const bMin = safeStr(b?.minYmd || b?.minDate || "");
        const bMax = safeStr(b?.maxYmd || b?.maxDate || "");

        if(isYMD(bMin)) minDate=bMin;
        if(isYMD(bMax)) maxDate=bMax;

        boundsCacheRef.current.set(ufResolved,{minDate,maxDate});
      }

      const today = await getKingResultsByDate({
        uf:ufResolved,
        date:ymdSafe,
        readPolicy:"server"
      }) || [];

      const last = findLastDrawInList(today,schedule);

      const lastBucket = last ? toHourBucket(pickDrawHour(last)) : "";

      const lastY = last ? pickDrawYMD(last)||ymdSafe : "";

      const lastGrupo = last ? pickPrize1GrupoFromDraw(last) : null;

      const lastAnimal = lastGrupo ? safeStr(getAnimalLabel(lastGrupo)) : "";

      setLastHourBucket(lastBucket);

      setLastInfo({
        lastYmd:lastY,
        lastHour:lastBucket,
        lastGrupo,
        lastAnimal
      });

      const nextSlot = last
        ? getNextSlotForLottery({
            lotteryKey:lKey,
            ymd:lastY,
            hourBucket:lastBucket,
            PT_RIO_SCHEDULE_NORMAL,
            PT_RIO_SCHEDULE_WED_SAT,
            FEDERAL_SCHEDULE
          })
        : {ymd:"",hour:""};

      setTargetYmd(nextSlot.ymd||"");
      setTargetHourBucket(nextSlot.hour||"");

      /* FIX 09h — encontrar draw anterior robusto */
      const prev = await getPreviousDrawRobust({
        getKingResultsByDate,
        lotteryKey: lKey,
        ymdTarget: nextSlot.ymd,
        targetHourBucket: nextSlot.hour,
        todayDraws: today,
        schedule,
        PT_RIO_SCHEDULE_NORMAL,
        PT_RIO_SCHEDULE_WED_SAT,
        FEDERAL_SCHEDULE
      });

      if (prev?.draw) {
        const gPrev = pickPrize1GrupoFromDraw(prev.draw);

        setPrevInfo({
          prevYmd: prev.ymd,
          prevHour: prev.hour,
          prevGrupo: gPrev,
          prevAnimal: gPrev ? safeStr(getAnimalLabel(gPrev)) : "",
          source: prev.source
        });
      }


      let rangeTo = ymdSafe;

      if(nextSlot?.ymd && nextSlot.ymd>rangeTo) rangeTo = nextSlot.ymd;

      let rangeFrom;

      if(lookback===LOOKBACK_ALL){

        rangeFrom = minDate || addDaysYMD(ymdSafe,-180);

      } else {

        const days = Math.max(1,Number(lookback||30));

        rangeFrom = addDaysYMD(ymdSafe,-(days-1));
      }

      setRangeInfo({from:rangeFrom,to:rangeTo});

      const hist = await getKingResultsByRange({
        uf:ufResolved,
        dateFrom:rangeFrom,
        dateTo:addDaysYMD(rangeTo,1),
        mode:"detailed",
        readPolicy:"server"
      }) || [];

      setRangeDraws(hist);

    } catch(e){

      setError(String(e?.message||e||"Falha ao carregar dados do TOP3."));

    } finally{

      setLoadingStage({today:false,range:false});
      setLoading(false);

    }

  },[
    lotteryKeySafe,
    ymdSafe,
    schedule,
    lookback,
    bounds?.minDate,
    bounds?.maxDate,
    dateBR
  ]);

  useEffect(()=>{ load(); },[load]);

  /* =========================
     ANALYTICS
  ========================= */

  const analytics = useMemo(()=>{

    const list = Array.isArray(rangeDraws) ? rangeDraws : [];

    const lastG = lastInfo?.lastGrupo;
    const lastY = safeStr(lastInfo?.lastYmd);
    const lastH = safeStr(lastInfo?.lastHour);

    if(!list.length || !lastG || !isYMD(lastY) || !safeStr(lastH)){
      const empty = {top:[],meta:null};
      analyticsCacheRef.current={key:"",value:empty};
      return empty;
    }

    const cacheKey = [
      lotteryKeySafe,
      lookback,
      list.length,
      lastY,
      toHourBucket(lastH),
      Number(lastG)
    ].join("|");

    if(analyticsCacheRef.current.key===cacheKey)
      return analyticsCacheRef.current.value;

    const drawLast = list.find(d=>{
      const y = pickDrawYMD(d);
      const h = toHourBucket(pickDrawHour(d));
      return y===lastY && h===toHourBucket(lastH);
    });

    if(!drawLast){
      return {top:[],meta:null};
    }

    const computed = computeConditionalNextTop3({
      lotteryKey:lotteryKeySafe,
      drawsRange:list,
      drawLast,
      PT_RIO_SCHEDULE_NORMAL,
      PT_RIO_SCHEDULE_WED_SAT,
      FEDERAL_SCHEDULE,
      topN:3
    });

    analyticsCacheRef.current={key:cacheKey,value:computed};

    return computed;

  },[
    rangeDraws,
    lotteryKeySafe,
    lookback,
    lastInfo?.lastGrupo,
    lastInfo?.lastYmd,
    lastInfo?.lastHour
  ]);

  const build20 = useCallback((grupo2)=>{

    return buildMilharesForGrupo({
      rangeDraws,
      analysisHourBucket,
      schedule,
      grupo2,
      count:20
    });

  },[rangeDraws,analysisHourBucket,schedule]);

  const top3 = useMemo(()=>{

    const arr = Array.isArray(analytics?.top) ? analytics.top : [];

    const samplesMeta = Number(analytics?.meta?.samples||0);

    const alpha = Number(TOP3_SMOOTH_ALPHA)||1;
    const groupsK = Number(TOP3_GROUPS_K)||25;

    const denomRaw = Math.max(0,samplesMeta)*7;
    const denom = denomRaw + alpha*groupsK;

    const milharesCache = new Map();

    return arr.map(x=>{

      const g = Number(x.grupo);

      const animal = safeStr(getAnimalLabel(g)||"");

      let out = milharesCache.get(g);

      if(!out){
        out = build20(g);
        milharesCache.set(g,out);
      }

      let milharesCols = build4ColsFromEngineOut(out,4,5);

      const milhares20 = milharesCols.flatMap(c=>c.items).slice(0,20);

      const freq = Number(x.freq||0);

      const prob = denom>0 ? (freq+alpha)/denom : 0;

      const probPct = prob*100;

      const bgPrimary = normalizeImgSrc(
        safeStr(getImgFromGrupo?.(g,512)||getImgFromGrupo?.(g)||"")
      );

      const iconVariants = makeImgVariantsFromGrupo({
        grupo:g,
        size:96,
        getImgFromGrupo,
        getAnimalLabel
      });

      return{
        ...x,
        animal,
        imgBg:[bgPrimary],
        imgIcon:iconVariants,
        prob,
        probPct,
        milharesCols,
        milhares20
      };

    });

  },[analytics,build20]);

  return{

    LOOKBACK_ALL,
    LOOKBACK_OPTIONS,
    LOTTERY_OPTIONS,

    lotteryKeySafe,
    ymdSafe,
    lookback,
    loading,
    loadingStage,
    error,
    dateBR,
    schedule,
    isFederalNonDrawDay,
    rangeLabel,
    lastHourBucket,
    targetHourBucket,
    targetYmd,
    analysisHourBucket,
    analysisYmd,
    prevLabel,
    lastLabel,
    top3,

    setLotteryKey,
    setYmd,
    setLookback,
    load,

    safeStr,
    lotteryLabel,
    build16:(grupo2)=>build16MilharesForGrupo({
      rangeDraws,
      analysisHourBucket,
      schedule,
      grupo2
    }),

    build20,
    getCentena3,
    normalizeImgSrc

  };

}
