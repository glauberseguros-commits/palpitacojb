"use strict";

const express =
  require("express");

const {
  admin,
} = require("../service/firebaseAdmin");

const {
  ACCESS_PRODUCT,
  ACCESS_HEADERS,
} = require("../access/accessConfig");

const {
  getAccessSnapshot,
  activateSubscription,
  revokeSubscription,
  normalizeOperationId,
} = require("../access/accessService");

const {
  openAccessSession,
  closeAccessSession,
} = require("../access/deviceSessionService");

const {
  requireFirebaseUser,
  requireAdminUser,
} = require("../middleware/firebaseUserAuth");

const {
  requireAuthorizedAccess,
} = require("../middleware/requireAuthorizedAccess");


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


function headerText(
  req,
  name
) {
  return String(
    req?.headers?.[name] || ""
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


function sendSessionError(
  res,
  error
) {
  const code =
    String(
      error?.code || ""
    );

  if (
    code ===
      "INVALID_DEVICE_ID" ||
    code ===
      "INVALID_DEVICE_SECRET" ||
    code ===
      "SESSION_TOKEN_REQUIRED"
  ) {
    return res.status(400).json({
      ok: false,
      error: code,
    });
  }

  if (
    code ===
      "ACTIVE_SUBSCRIPTION_REQUIRED" ||
    code ===
      "DEVICE_NOT_AUTHORIZED" ||
    code ===
      "ACTIVE_SESSION_REQUIRED" ||
    code ===
      "ACCESS_ACCOUNT_NOT_FOUND"
  ) {
    return res.status(403).json({
      ok: false,
      error: code,
    });
  }

  console.error(
    "[ACCESS_SESSION_ROUTE]",
    error
  );

  return res.status(500).json({
    ok: false,
    error:
      "ACCESS_SESSION_OPERATION_FAILED",
  });
}


/**
 * Contrato comercial público.
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
 * Estado da assinatura.
 *
 * Não exige ainda dispositivo/sessão
 * porque será usado durante bootstrap,
 * pagamento e vinculação.
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
 * Abre/rotaciona a única sessão ativa.
 *
 * Só funciona se o dispositivo já estiver
 * previamente vinculado.
 */
router.post(
  "/session/open",

  requireFirebaseUser,

  async (req, res) => {
    try {
      const session =
        await openAccessSession({
          uid:
            req.authUser.uid,

          deviceId:
            headerText(
              req,
              ACCESS_HEADERS.DEVICE_ID
            ),

          deviceSecret:
            headerText(
              req,
              ACCESS_HEADERS.DEVICE_SECRET
            ),
        });

      return res.json({
        ok: true,
        session,
      });
    } catch (error) {
      return sendSessionError(
        res,
        error
      );
    }
  }
);


/**
 * Fecha a sessão ativa.
 */
router.post(
  "/session/close",

  requireFirebaseUser,

  async (req, res) => {
    try {
      const result =
        await closeAccessSession({
          uid:
            req.authUser.uid,

          deviceId:
            headerText(
              req,
              ACCESS_HEADERS.DEVICE_ID
            ),

          deviceSecret:
            headerText(
              req,
              ACCESS_HEADERS.DEVICE_SECRET
            ),

          sessionToken:
            headerText(
              req,
              ACCESS_HEADERS.SESSION_TOKEN
            ),
        });

      return res.json({
        ok: true,
        result,
      });
    } catch (error) {
      return sendSessionError(
        res,
        error
      );
    }
  }
);


/**
 * Check autoritativo completo:
 *
 * Firebase user
 * + assinatura
 * + dispositivo
 * + sessão.
 */
router.get(
  "/check",

  requireFirebaseUser,
  requireAuthorizedAccess,

  (req, res) => {
    return res.json({
      ok: true,

      accessGranted: true,

      access:
        req.authorizedAccess,
    });
  }
);


/**
 * Grant administrativo.
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
