"use strict";

const {
  assertActiveSubscription,
} = require("../access/accessService");

async function requireActiveSubscription(
  req,
  res,
  next
) {
  const uid = String(
    req?.authUser?.uid || ""
  ).trim();

  if (!uid) {
    return res.status(401).json({
      ok: false,
      error: "AUTH_REQUIRED",
    });
  }

  try {
    const access =
      await assertActiveSubscription(
        uid
      );

    req.accessAccount = access;

    return next();
  } catch (error) {
    if (
      error?.code ===
      "ACTIVE_SUBSCRIPTION_REQUIRED"
    ) {
      return res.status(403).json({
        ok: false,

        error:
          "ACTIVE_SUBSCRIPTION_REQUIRED",

        access:
          error.accessSnapshot || null,
      });
    }

    console.error(
      "[ACCESS] subscription check:",
      error
    );

    return res.status(500).json({
      ok: false,
      error:
        "ACCESS_VALIDATION_FAILED",
    });
  }
}

module.exports = {
  requireActiveSubscription,
};
