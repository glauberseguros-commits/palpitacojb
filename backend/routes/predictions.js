"use strict";

const express = require("express");

const router = express.Router();

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

router.post("/run", async (req, res) => {

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
router.post("/top3/run", async (req, res) => {
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

module.exports = router;
