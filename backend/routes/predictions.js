"use strict";

const express = require("express");

const router = express.Router();

const {
    requireFirebaseUser,
    requireAdminUser,
} = require("../middleware/firebaseUserAuth");

const {
    createPredictionRun,
} = require("../engine/predictionService");

const {
    createTop3PredictionRun,
} = require("../engine/top3PredictionService");

/**
 * POST /api/predictions/run
 *
 * Executa uma previsão e grava o resultado.
 */

router.post(
    "/run",
    requireFirebaseUser,
    requireAdminUser,
    async (req, res) => {

    try {

        const result = await createPredictionRun(req.body || {});

        res.json({

            ok: true,

            run: result.run,

            predictions: result.predictions,

        });

    } catch (err) {

        console.error(err);

        res.status(500).json({

            ok: false,

            message: err.message,

        });

    }

});


/**
 * POST /api/predictions/top3/run
 *
 * Calcula o TOP3 no backend e persiste a execução.
 */
router.post(
    "/top3/run",
    requireFirebaseUser,
    requireAdminUser,
    async (req, res) => {
    try {
        const result = await createTop3PredictionRun(
            req.body || {}
        );

        res.json({
            ok: true,
            run: result.run,
            predictions: result.predictions,
            engine: result.engine,
        });
    } catch (err) {
        console.error(err);

        res.status(500).json({
            ok: false,
            message: err.message,
        });
    }
});


/*
 * WINBANNER_TOP3_READ_API_V1
 *
 * GET /api/predictions/top3/day
 *
 * Somente leitura.
 * Entrega somente a projeção pública necessária para conferência
 * externa. Não executa motor, não recalcula TOP3 e não grava
 * Firestore.
 */
router.get("/top3/day", async (req, res) => {
  try {
    /*
     * WINBANNER_SERVER_TO_SERVER_AUTH_V1
     *
     * Chave disponível somente no ambiente do backend.
     * Nunca deve ser enviada para bundle/browser.
     */
    const configuredKey = String(
      process.env.WINBANNER_READ_KEY || ""
    ).trim();

    const suppliedKey = String(
      req.get("x-winbanner-key") || ""
    ).trim();

    if (!configuredKey) {
      return res.status(503).json({
        ok: false,
        error: "WINBANNER_READ_NOT_CONFIGURED",
      });
    }

    const crypto =
      require("node:crypto");

    const expectedBuffer =
      Buffer.from(configuredKey, "utf8");

    const suppliedBuffer =
      Buffer.from(suppliedKey, "utf8");

    const authorized =
      expectedBuffer.length ===
        suppliedBuffer.length &&
      crypto.timingSafeEqual(
        expectedBuffer,
        suppliedBuffer
      );

    if (!authorized) {
      return res.status(401).json({
        ok: false,
        error: "WINBANNER_UNAUTHORIZED",
      });
    }

    res.set(
      "Cache-Control",
      "private, no-store, max-age=0"
    );

    const lottery = String(
      req.query.lottery ||
      req.query.lotteryKey ||
      ""
    )
      .trim()
      .toUpperCase();

    const date = String(
      req.query.date ||
      req.query.ymd ||
      ""
    ).trim();

    const allowedLotteries =
      new Set([
        "PT_RIO",
        "FEDERAL",
        "LOOK",
        "NACIONAL",
        "PT_SP",
      ]);

    if (!allowedLotteries.has(lottery)) {
      return res.status(400).json({
        ok: false,
        error: "INVALID_LOTTERY",
      });
    }

    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date)
    ) {
      return res.status(400).json({
        ok: false,
        error: "INVALID_DATE",
      });
    }

    const {
      admin,
      getDb,
    } =
      require("../service/firebaseAdmin");

    const database =
      getDb();

    const prefix =
      `${lottery}__${date}__`;

    const documentId =
      admin.firestore.FieldPath.documentId();

    const snap =
      await database
        .collection("top3_predictions")
        .orderBy(documentId)
        .startAt(prefix)
        .endAt(`${prefix}\uf8ff`)
        .get();

    function textArray(value) {
      return (
        Array.isArray(value)
          ? value
          : []
      )
        .map((item) =>
          String(item ?? "").trim()
        )
        .filter(Boolean);
    }

    function flattenMilharesCols(value) {
      if (!Array.isArray(value)) {
        return [];
      }

      return value.flatMap((column) =>
        Array.isArray(column)
          ? column
          : []
      );
    }

    function unique(values) {
      return [
        ...new Set(
          values.filter(Boolean)
        ),
      ];
    }

    function normalizeMilhar(value) {
      const digits =
        String(value ?? "")
          .replace(/\D/g, "");

      if (!digits) {
        return "";
      }

      return digits
        .slice(-4)
        .padStart(4, "0");
    }

    function normalizePick(
      item,
      index
    ) {
      const milhares =
        unique(
          [
            ...textArray(
              item?.milhares24
            ),

            ...textArray(
              item?.milhares20
            ),

            ...flattenMilharesCols(
              item?.milharesCols
            ),
          ]
            .map(normalizeMilhar)
            .filter(Boolean)
        );

      const centenas =
        unique([
          ...textArray(
            item?.centenas
          )
            .map((value) =>
              String(value)
                .replace(/\D/g, "")
                .slice(-3)
                .padStart(3, "0")
            )
            .filter(Boolean),

          ...milhares.map(
            (value) =>
              value.slice(-3)
          ),
        ]);

      const dezenas =
        unique([
          ...textArray(
            item?.dezenas
          )
            .map((value) =>
              String(value)
                .replace(/\D/g, "")
                .slice(-2)
                .padStart(2, "0")
            )
            .filter(Boolean),

          ...milhares.map(
            (value) =>
              value.slice(-2)
          ),
        ]);

      const grupoNumber =
        Number(item?.grupo);

      return {
        slot:
          index + 1,

        grupo:
          Number.isFinite(grupoNumber)
            ? grupoNumber
            : null,

        animal:
          String(
            item?.animal ||
            item?.animalLabel ||
            ""
          ).trim(),

        dezenas,
        centenas,
        milhares,
      };
    }

    const slots =
      snap.docs
        .map((doc) => {
          const data =
            doc.data() || {};

          const snapshot =
            Array.isArray(
              data.snapshot
            )
              ? data.snapshot.slice(
                  0,
                  3
                )
              : [];

          return {
            id:
              doc.id,

            lottery:
              String(
                data.lotteryKey ||
                lottery
              )
                .trim()
                .toUpperCase(),

            date:
              String(
                data.targetYmd ||
                date
              ).trim(),

            hour:
              String(
                data.targetHour ||
                doc.id
                  .split("__")
                  .at(-1) ||
                ""
              ).trim(),

            picks:
              snapshot.map(
                normalizePick
              ),
          };
        })
        .sort(
          (a, b) =>
            String(a.hour)
              .localeCompare(
                String(b.hour),
                "pt-BR",
                {
                  numeric: true,
                }
              )
        );

    return res.json({
      ok: true,
      mode: "top3-day-read-only",
      lottery,
      date,
      count: slots.length,
      slots,
    });
  }
  catch (error) {
    console.error(
      "[WINBANNER TOP3 READ API]",
      error
    );

    return res.status(500).json({
      ok: false,
      error:
        "TOP3_READ_FAILED",
    });
  }
});
module.exports = router;
