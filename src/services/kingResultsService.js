// src/services/kingResultsService.js
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
} from "firebase/firestore";

import { db } from "./firebase";

/**
 * Lê draws e prizes (KingApostas) do Firestore
 *
 * Params:
 *  - uf (obrigatório) ex "PT_RIO"
 *  - date (obrigatório)  YYYY-MM-DD
 *  - closeHour (opcional) ex "14:00" ou "14:09"
 *  - positions (opcional) array de números ex [1,2,3]
 */
export async function getKingResultsByDate({
  uf,
  date,
  closeHour = null,
  positions = null,
}) {
  if (!uf || !date) throw new Error("Parâmetros obrigatórios: uf e date");

  // 1) Query de draws do dia (com filtro opcional por close_hour)
  const whereClauses = [where("uf", "==", uf), where("date", "==", date)];

  if (closeHour) whereClauses.push(where("close_hour", "==", closeHour));

  const qDraws = query(
    collection(db, "draws"),
    ...whereClauses,
    orderBy("close_hour", "asc")
  );

  const snapDraws = await getDocs(qDraws);

  const results = [];

  // 2) positions normalizado
  const positionsArr =
    Array.isArray(positions) && positions.length
      ? positions
          .map((n) => Number(n))
          .filter((n) => Number.isFinite(n))
      : null;

  for (const docSnap of snapDraws.docs) {
    const draw = docSnap.data();

    let prizesDocs = [];

    if (positionsArr && positionsArr.length && positionsArr.length <= 10) {
      const qPrizes = query(
        collection(db, "draws", docSnap.id, "prizes"),
        where("position", "in", positionsArr)
      );
      const snapPrizes = await getDocs(qPrizes);
      prizesDocs = snapPrizes.docs;
    } else {
      const snapPrizes = await getDocs(
        collection(db, "draws", docSnap.id, "prizes")
      );
      prizesDocs = snapPrizes.docs;
    }

    let prizes = prizesDocs.map((p) => p.data());

    // Se positions > 10 ou veio sujo, garante filtro aqui (client-side)
    if (positionsArr && positionsArr.length) {
      prizes = prizes.filter((p) => positionsArr.includes(Number(p.position)));
    }

    prizes.sort((a, b) => Number(a.position) - Number(b.position));

    results.push({
      drawId: docSnap.id,
      date: draw.date,
      close_hour: draw.close_hour,
      prizesCount: draw.prizesCount,
      prizes,
    });
  }

  return results;
}

/**
 * Lê draws e prizes por intervalo de datas (inclusive).
 *
 * Params:
 *  - uf (obrigatório) ex "PT_RIO"
 *  - dateFrom (obrigatório) YYYY-MM-DD
 *  - dateTo (obrigatório) YYYY-MM-DD
 *  - closeHour (opcional) ex "14:00" ou "14:09"
 *  - positions (opcional) array ex [1,2,3]
 *
 * Observação:
 * - date é string YYYY-MM-DD, então range funciona lexicograficamente.
 * - Pode exigir índice composto no Firestore (uf + date + orderBy date/close_hour).
 */
export async function getKingResultsByRange({
  uf,
  dateFrom,
  dateTo,
  closeHour = null,
  positions = null,
}) {
  if (!uf || !dateFrom || !dateTo) {
    throw new Error("Parâmetros obrigatórios: uf, dateFrom, dateTo");
  }
  if (dateFrom > dateTo) {
    throw new Error("dateFrom não pode ser maior que dateTo");
  }

  // 1) Query de draws no período
  const whereClauses = [
    where("uf", "==", uf),
    where("date", ">=", dateFrom),
    where("date", "<=", dateTo),
  ];

  if (closeHour) whereClauses.push(where("close_hour", "==", closeHour));

  const qDraws = query(
    collection(db, "draws"),
    ...whereClauses,
    orderBy("date", "asc"),
    orderBy("close_hour", "asc")
  );

  const snapDraws = await getDocs(qDraws);

  // 2) positions normalizado
  const positionsArr =
    Array.isArray(positions) && positions.length
      ? positions
          .map((n) => Number(n))
          .filter((n) => Number.isFinite(n))
      : null;

  const results = [];

  // 3) Para cada draw, buscar prizes
  for (const docSnap of snapDraws.docs) {
    const draw = docSnap.data();

    let prizesDocs = [];

    if (positionsArr && positionsArr.length && positionsArr.length <= 10) {
      const qPrizes = query(
        collection(db, "draws", docSnap.id, "prizes"),
        where("position", "in", positionsArr)
      );
      const snapPrizes = await getDocs(qPrizes);
      prizesDocs = snapPrizes.docs;
    } else {
      const snapPrizes = await getDocs(
        collection(db, "draws", docSnap.id, "prizes")
      );
      prizesDocs = snapPrizes.docs;
    }

    let prizes = prizesDocs.map((p) => p.data());

    if (positionsArr && positionsArr.length) {
      prizes = prizes.filter((p) => positionsArr.includes(Number(p.position)));
    }

    prizes.sort((a, b) => Number(a.position) - Number(b.position));

    results.push({
      drawId: docSnap.id,
      date: draw.date,
      close_hour: draw.close_hour,
      prizesCount: draw.prizesCount,
      prizes,
    });
  }

  return results;
}
