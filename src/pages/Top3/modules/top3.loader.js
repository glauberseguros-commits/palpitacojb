export async function fallbackBaseSearch({
  getKingResultsByRange,
  findLatestHistoricalBaseDraw,
  addDaysYMD,
  minDate,
  lotteryKey,
  targetYmd,
  targetHourBucket,
  uf,
}) {
  const key = String(lotteryKey || "").trim().toUpperCase();
  const safeUf = String(uf || "").trim().toUpperCase();
  const safeTargetYmd = String(targetYmd || "").trim();
  const safeTargetHour = String(targetHourBucket || "").trim();

  if (!safeTargetYmd || !safeTargetHour || !safeUf) {
    return { draw: null, ymd: "", hour: "", source: "none" };
  }

  const searchFrom =
    String(minDate || "").trim() ||
    (key === "FEDERAL"
      ? addDaysYMD(safeTargetYmd, -240)
      : addDaysYMD(safeTargetYmd, -90));

  const hist =
    (await getKingResultsByRange({
      uf: safeUf,
      dateFrom: searchFrom,
      dateTo: safeTargetYmd,
      mode: "detailed",
      readPolicy: "cache",
    })) || [];

  return findLatestHistoricalBaseDraw({
    draws: hist,
    lotteryKey: key,
    targetYmd: safeTargetYmd,
    targetHourBucket: safeTargetHour,
  });
}

export async function loadHistoryRange({
  getKingResultsByRange,
  uf,
  dateFrom,
  dateTo,
  readPolicy = "cache",
}) {
  const safeUf = String(uf || "").trim().toUpperCase();
  const safeDateFrom = String(dateFrom || "").trim();
  const safeDateTo = String(dateTo || "").trim();

  if (!safeUf || !safeDateFrom || !safeDateTo) return [];

  return (
    (await getKingResultsByRange({
      uf: safeUf,
      dateFrom: safeDateFrom,
      dateTo: safeDateTo,
      mode: "detailed",
      readPolicy,
    })) || []
  );
}