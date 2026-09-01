"use strict";

const express =
  require("express");

const {
  admin,
} = require("../service/firebaseAdmin");

const {
  ACCESS_PRODUCT,
} = require("../access/accessConfig");

const {
  getAccessSnapshot,
  activateSubscription,
  revokeSubscription,
  normalizeOperationId,
} = require("../access/accessService");

const {
  requireFirebaseUser,
  requireAdminUser,
} = require("../middleware/firebaseUserAuth");

const router =
  express.Router();

function bodyText(
  req,
  key
) {
  return String(
    req?.body?.[key] || ""
  ).trim();
}

async function resolveTargetUser(uid) {
  const safeUid =
    String(uid || "").trim();

  if (!safeUid) {
    const error =
      new Error(
        "UID_REQUIRED"
      );

    error.code =
      "UID_REQUIRED";

    throw error;
  }

  try {
    const user =
      await admin
        .auth()
        .getUser(safeUid);

    if (user.disabled === true) {
      const error =
        new Error(
          "TARGET_USER_DISABLED"
        );

      error.code =
        "TARGET_USER_DISABLED";

      throw error;
    }

    const email =
      String(
        user.email || ""
      )
        .trim()
        .toLowerCase();

    if (!email) {
      const error =
        new Error(
          "TARGET_USER_EMAIL_REQUIRED"
        );

      error.code =
        "TARGET_USER_EMAIL_REQUIRED";

      throw error;
    }

    return {
      uid:
        String(user.uid),

      email,
    };
  } catch (error) {
    if (
      error?.code ===
        "TARGET_USER_DISABLED" ||
      error?.code ===
        "TARGET_USER_EMAIL_REQUIRED"
    ) {
      throw error;
    }

    if (
      error?.code ===
      "auth/user-not-found"
    ) {
      const notFound =
        new Error(
          "TARGET_USER_NOT_FOUND"
        );

      notFound.code =
        "TARGET_USER_NOT_FOUND";

      throw notFound;
    }

    throw error;
  }
}

function requireOperationId(req) {
  const operationId =
    normalizeOperationId(
      bodyText(
        req,
        "operationId"
      )
    );

  if (!operationId) {
    const error =
      new Error(
        "VALID_OPERATION_ID_REQUIRED"
      );

    error.code =
      "VALID_OPERATION_ID_REQUIRED";

    throw error;
  }

  return operationId;
}

function sendAdminError(
  res,
  error
) {
  const code =
    String(
      error?.code || ""
    );

  if (
    code === "UID_REQUIRED" ||
    code ===
      "VALID_OPERATION_ID_REQUIRED"
  ) {
    return res.status(400).json({
      ok: false,
      error: code,
    });
  }

  if (
    code ===
      "TARGET_USER_NOT_FOUND" ||
    code ===
      "ACCESS_ACCOUNT_NOT_FOUND"
  ) {
    return res.status(404).json({
      ok: false,
      error: code,
    });
  }

  if (
    code ===
      "TARGET_USER_DISABLED" ||
    code ===
      "TARGET_USER_EMAIL_REQUIRED" ||
    code ===
      "OPERATION_ID_CONFLICT"
  ) {
    return res.status(409).json({
      ok: false,
      error: code,
    });
  }

  console.error(
    "[ACCESS_ROUTE]",
    error
  );

  return res.status(500).json({
    ok: false,
    error:
      "ACCESS_ADMIN_OPERATION_FAILED",
  });
}


/**
 * Contrato comercial.
 * Público e sem qualquer concessão de acesso.
 */
router.get(
  "/product",
  (req, res) => {
    return res.json({
      ok: true,

      product: {
        planCode:
          ACCESS_PRODUCT.planCode,

        priceCents:
          ACCESS_PRODUCT.priceCents,

        currency:
          ACCESS_PRODUCT.currency,

        durationDays:
          ACCESS_PRODUCT.durationDays,

        paymentMethod:
          ACCESS_PRODUCT.paymentMethod,
      },
    });
  }
);


/**
 * Estado autoritativo do próprio usuário.
 */
router.get(
  "/me",

  requireFirebaseUser,

  async (req, res) => {
    try {
      const access =
        await getAccessSnapshot(
          req.authUser.uid
        );

      return res.json({
        ok: true,

        user: {
          uid:
            req.authUser.uid,

          email:
            req.authUser.email,

          emailVerified:
            req.authUser
              .emailVerified === true,
        },

        access,
      });
    } catch (error) {
      console.error(
        "[ACCESS_ROUTE] /me:",
        error
      );

      return res.status(500).json({
        ok: false,
        error:
          "ACCESS_LOOKUP_FAILED",
      });
    }
  }
);


/**
 * Ativação / renovação.
 *
 * operationId é obrigatório para garantir
 * idempotência do grant.
 */
router.post(
  "/admin/activate",

  requireFirebaseUser,
  requireAdminUser,

  async (req, res) => {
    try {
      const target =
        await resolveTargetUser(
          bodyText(req, "uid")
        );

      const operationId =
        requireOperationId(req);

      const access =
        await activateSubscription({
          uid:
            target.uid,

          email:
            target.email,

          actorUid:
            req.adminUser.uid,

          operationId,

          paymentReference:
            bodyText(
              req,
              "paymentReference"
            ),
        });

      return res.json({
        ok: true,
        access,
      });
    } catch (error) {
      return sendAdminError(
        res,
        error
      );
    }
  }
);


/**
 * Revogação administrativa.
 */
router.post(
  "/admin/revoke",

  requireFirebaseUser,
  requireAdminUser,

  async (req, res) => {
    try {
      const target =
        await resolveTargetUser(
          bodyText(req, "uid")
        );

      const operationId =
        requireOperationId(req);

      const access =
        await revokeSubscription({
          uid:
            target.uid,

          actorUid:
            req.adminUser.uid,

          operationId,

          reason:
            bodyText(
              req,
              "reason"
            ),
        });

      return res.json({
        ok: true,
        access,
      });
    } catch (error) {
      return sendAdminError(
        res,
        error
      );
    }
  }
);

module.exports = router;
