"use strict";

const path = require("path");

const ROOT = process.cwd();

const { db } = require(path.join(ROOT, "backend", "service", "firebaseAdmin"));

const DOC_ID = "PT_RIO__2026-07-25__0900";

function milhar(v) {
  const d = String(v ?? "").replace(/\D/g, "");
  return d ? d.slice(-4).padStart(4, "0") : "";
}

(async () => {

  console.log("====================================================================================================");
  console.log("TOP3-HIT-04 — LEITURA REAL USANDO FIREBASEADMIN DO PROJETO");
  console.log("====================================================================================================");
  console.log("");

  const snap = await db.collection("top3_predictions").doc(DOC_ID).get();

  if (!snap.exists) {
    console.log("DOCUMENTO NÃO ENCONTRADO");
    process.exit(0);
  }

  const d = snap.data();

  console.log("Documento:");
  console.log(snap.ref.path);
  console.log("");

  console.log("======================================");
  console.log("CAMPOS PRINCIPAIS");
  console.log("======================================");

  console.log("hitType               :", d.hitType);
  console.log("matchedGrupo          :", d.matchedGrupo);
  console.log("matchedMilhar         :", d.matchedMilhar);
  console.log("resultGrupo           :", d.resultGrupo);
  console.log("resultMilhar          :", d.resultMilhar);
  console.log("resultPosition        :", d.resultPosition);
  console.log("predictionPosition    :", d.predictionPosition);
  console.log("");

  console.log("resultTop3Groups");
  console.log(JSON.stringify(d.resultTop3Groups, null, 2));
  console.log("");

  console.log("resultTop3Milhares");
  console.log(JSON.stringify(d.resultTop3Milhares, null, 2));
  console.log("");

  console.log("======================================");
  console.log("PRÊMIOS");
  console.log("======================================");

  const prizes = Array.isArray(d.prizes) ? d.prizes : [];

  prizes.forEach((p,i)=>{

      console.log({
          index:i,
          position:p.position,
          grupo:p.grupo,
          milhar:milhar(
              p.milhar ??
              p.numero ??
              p.number ??
              p.valor
          )
      });

  });

  console.log("");
  console.log("======================================");
  console.log("JSON COMPLETO");
  console.log("======================================");
  console.log(JSON.stringify(d,null,2));

})().catch(err=>{
    console.error(err.stack || err);
    process.exit(1);
});
