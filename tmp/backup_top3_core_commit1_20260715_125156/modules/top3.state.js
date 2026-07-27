import { useRef, useState } from "react";

export function useTop3State({ defaultLottery, defaultYmd, defaultLookback }) {
  const requestIdRef = useRef(0);
  const boundsCacheRef = useRef(new Map());
  const analyticsCacheRef = useRef({ key: "", value: { top: [], meta: null } });

  const [lotteryKey, setLotteryKey] = useState(
    String(defaultLottery || "").trim().toUpperCase()
  );
  const [ymd, setYmd] = useState(() => String(defaultYmd || "").trim());
  const [lookback, setLookback] = useState(Number(defaultLookback) || 120);

  const [loading, setLoading] = useState(false);
  const [loadingStage, setLoadingStage] = useState({
    today: false,
    range: false,
  });
  const [error, setError] = useState("");

  const [rangeDraws, setRangeDraws] = useState([]);
  const [todayDraws, setTodayDraws] = useState([]);
  const [rangeInfo, setRangeInfo] = useState({ from: "", to: "" });

  const [lastHourBucket, setLastHourBucket] = useState("");
  const [targetHourBucket, setTargetHourBucket] = useState("");
  const [targetYmd, setTargetYmd] = useState("");

  const [lastInfo, setLastInfo] = useState({
    lastYmd: "",
    lastHour: "",
    lastGrupo: null,
    lastAnimal: "",
  });

  const [prevInfo, setPrevInfo] = useState({
    prevYmd: "",
    prevHour: "",
    prevGrupo: null,
    prevAnimal: "",
    source: "none",
  });

  const [baseDrawState, setBaseDrawState] = useState(null);

  return {
    requestIdRef,
    boundsCacheRef,
    analyticsCacheRef,

    lotteryKey,
    setLotteryKey,
    ymd,
    setYmd,
    lookback,
    setLookback,

    loading,
    setLoading,
    loadingStage,
    setLoadingStage,
    error,
    setError,

    rangeDraws,
    setRangeDraws,
    todayDraws,
    setTodayDraws,
    rangeInfo,
    setRangeInfo,

    lastHourBucket,
    setLastHourBucket,
    targetHourBucket,
    setTargetHourBucket,
    targetYmd,
    setTargetYmd,

    lastInfo,
    setLastInfo,
    prevInfo,
    setPrevInfo,

    baseDrawState,
    setBaseDrawState,
  };
}