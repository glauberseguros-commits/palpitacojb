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

  if (!targetYmd || !targetHourBucket || !uf) {
    return { draw: null, ymd: "", hour: "", source: "none" };
  }

  const searchFrom =
    minDate ||
    (key === "FEDERAL"
      ? addDaysYMD(targetYmd, -240)
      : addDaysYMD(targetYmd, -90));

  const hist =
    (await getKingResultsByRange({
      uf,
      dateFrom: searchFrom,
      dateTo: targetYmd,
      mode: "detailed",
      readPolicy: "server",
    })) || [];

  return findLatestHistoricalBaseDraw({
    draws: hist,
    lotteryKey: key,
    targetYmd,
    targetHourBucket,
  });
}

export async function loadHistoryRange({
  getKingResultsByRange,
  uf,
  dateFrom,
  dateTo,
  readPolicy = "server",
}) {
  if (!uf || !dateFrom || !dateTo) return [];

  return (
    (await getKingResultsByRange({
      uf,
      dateFrom,
      dateTo,
      mode: "detailed",
      readPolicy,
    })) || []
  );
}