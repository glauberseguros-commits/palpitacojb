"use strict";

const { getDb } = require("../service/firebaseAdmin");

function normalizeWeekday(value) {
  if (value == null) return null;

  const map = {
    domingo:0,
    segunda:1,
    terca:2,
    terça:2,
    quarta:3,
    quinta:4,
    sexta:5,
    sabado:6,
    sábado:6,
  };

  const s = String(value).trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(map, s) ? map[s] : null;
}

function getWeekday(ymd) {
  const d = new Date(`${ymd}T12:00:00-03:00`);
  return d.getDay();
}

/**
 * Query Engine
 *
 * Futuras otimizações:
 * - cache por consulta
 * - paginação
 * - consultas paralelas
 * - filtros compostos
 */
async function queryOccurrences({
  lotteryKey,
  entityType,
  entityValue,
  filters = {},
  limitSamples = 20,
} = {}) {

  if (!lotteryKey) throw new Error("lotteryKey obrigatório");
  if (!entityType) throw new Error("entityType obrigatório");

  const db = getDb();

  let q = db.collection("draws")
    .where("lottery_key","==",lotteryKey);

  if (filters.closeHour) {
    q = q.where("close_hour","==",filters.closeHour);
  }

  const draws = await q.get();

  const cache = {
    draws: draws.size,
    analyzed: 0,
    matched: 0,
  };


  const wantedWeekday = normalizeWeekday(filters.weekday);

  let drawsAnalyzed = 0;
  let occurrences = 0;
  const matches = [];

  for (const draw of draws.docs) {

    const data = draw.data();

    if (wantedWeekday !== null) {
      if (getWeekday(data.ymd) !== wantedWeekday) {
        continue;
      }
    }

    drawsAnalyzed++;
    cache.analyzed++;


    let prizesQuery = draw.ref.collection("prizes");

    if (filters.position != null) {
      prizesQuery = prizesQuery.where("position","==",Number(filters.position));
    }

    const prizes = await prizesQuery.get();

    for (const p of prizes.docs) {

      const prize = p.data();

      const ok =
        String(prize[entityType] ?? "")
          .toLowerCase()
          ==
        String(entityValue)
          .toLowerCase();

      if (!ok) continue;

      occurrences++;
      cache.matched++;


      if (matches.length < limitSamples) {

        matches.push({

          drawId: draw.id,

          ymd: data.ymd,

          closeHour: data.close_hour,

          lotteryKey: data.lottery_key,

          position: prize.position,

          animal: prize.animal,

          grupo: prize.grupo,

          dezena: prize.dezena,

          centena: prize.centena,

          milhar: prize.milhar,

        });

      }

    }

  }

  return {

    cache,

    statistics: {

      drawsAnalyzed,

      occurrences,

      percentage:
        drawsAnalyzed
          ? Number((occurrences*100/drawsAnalyzed).toFixed(2))
          : 0

    },

    matches

  };

}

module.exports = {

  queryOccurrences,

};
