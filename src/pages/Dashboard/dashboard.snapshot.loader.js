import { ensureStatisticsSnapshot } from "../../services/statisticsEngine";

export async function loadDashboardStatistics({
  uf,
  dateFrom,
  dateTo,
}) {

  const result = await ensureStatisticsSnapshot({
    uf,
    dateFrom,
    dateTo,
    force: false,
  });

  return result.data;
}
