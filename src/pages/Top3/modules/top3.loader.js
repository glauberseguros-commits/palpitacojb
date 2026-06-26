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

  const searchFrom =
    minDate ||
    (lotteryKey === "FEDERAL"
      ? addDaysYMD(targetYmd, -180)
      : addDaysYMD(targetYmd, -60));

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
    lotteryKey,
    targetYmd,
    targetHourBucket,
  });
}
