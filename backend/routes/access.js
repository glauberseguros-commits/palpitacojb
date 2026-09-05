"use strict";

const express =
  require("express");

const {
  admin,
  getDb,
} = require("../service/firebaseAdmin");

const {
  ACCESS_PRODUCT,
  ACCESS_HEADERS,
} = require("../access/accessConfig");

const {
  getAccessSnapshot,
  activateSubscription,
  adjustSubscriptionValidity,
  revokeSubscription,
  normalizeOperationId,
} = require("../access/accessService");

const {
  openAccessSession,
  closeAccessSession,
} = require("../access/deviceSessionService");

const {
  startDeviceChallenge,
  confirmDeviceChallenge,
} = require("../access/deviceChallengeService");

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

    const email =
      String(
        user.email || ""
      )
        .trim()
        .toLowerCase();


    return {
      uid:
        String(user.uid),

      email,

      disabled:
        user.disabled === true,
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


function requireTargetCanActivate(
  target
) {
  if (target?.disabled === true) {
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
      target?.email || ""
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
    ...target,
    email,
  };
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
  const validityErrorCode =
    String(
      error?.code ||
      error?.message ||
      ""
    ).trim();

  if (
    validityErrorCode ===
      "INVALID_VALIDITY_DATE" ||
    validityErrorCode ===
      "VALIDITY_DATE_IN_PAST"
  ) {
    return res
      .status(400)
      .json({
        ok: false,
        error:
          validityErrorCode,
      });
  }

  const code =
    String(
      error?.code || ""
    );

  if (
    code === "UID_REQUIRED" ||
    code ===
      "INVALID_SUBSCRIPTION_DAYS" ||
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
      "OPERATION_ID_CONFLICT" ||
    code ===
      "ADMIN_SELF_DELETE_FORBIDDEN"
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


function sendChallengeError(
  res,
  error
) {
  const code =
    String(
      error?.code || ""
    );

  const attemptsRemaining =
    error?.details
      ?.attemptsRemaining;

  const badRequest =
    new Set([
      "INVALID_DEVICE_SLOT",
      "INVALID_DEVICE_ID",
      "INVALID_DEVICE_SECRET",
      "INVALID_DEVICE_CHALLENGE",
      "INVALID_CONFIRMATION_CODE",
      "DEVICE_CONFIRMATION_CODE_INVALID",
    ]);

  const forbidden =
    new Set([
      "ACTIVE_SUBSCRIPTION_REQUIRED",
      "DEVICE_CHALLENGE_OWNER_MISMATCH",
      "DEVICE_CHALLENGE_EMAIL_MISMATCH",
      "DEVICE_CHALLENGE_DEVICE_MISMATCH",
    ]);

  const conflict =
    new Set([
      "DEVICE_ALREADY_AUTHORIZED",
      "DEVICE_CHALLENGE_SUPERSEDED",
      "DEVICE_CHALLENGE_CONSUMED",
      "DEVICE_CHALLENGE_CANCELLED",
      "DEVICE_CHALLENGE_LOCKED",
    ]);

  const unavailable =
    new Set([
      "EMAIL_DELIVERY_NOT_CONFIGURED",
      "EMAIL_DELIVERY_FAILED",
      "EMAIL_DELIVERY_TIMEOUT",
    ]);

  if (
    code ===
      "DEVICE_CHALLENGE_COOLDOWN" ||
    code ===
      "DEVICE_CHALLENGE_RATE_LIMIT"
  ) {
    return res.status(429).json({
      ok: false,
      error: code,
    });
  }

  if (
    code ===
      "DEVICE_CHALLENGE_EXPIRED"
  ) {
    return res.status(410).json({
      ok: false,
      error: code,
    });
  }

  if (
    code ===
      "DEVICE_CHALLENGE_NOT_FOUND" ||
    code ===
      "ACCESS_ACCOUNT_NOT_FOUND"
  ) {
    return res.status(404).json({
      ok: false,
      error: code,
    });
  }

  if (badRequest.has(code)) {
    return res.status(400).json({
      ok: false,
      error: code,

      ...(Number.isFinite(
        Number(attemptsRemaining)
      )
        ? {
            attemptsRemaining:
              Number(
                attemptsRemaining
              ),
          }
        : {}),
    });
  }

  if (forbidden.has(code)) {
    return res.status(403).json({
      ok: false,
      error: code,
    });
  }

  if (conflict.has(code)) {
    return res.status(409).json({
      ok: false,
      error: code,
    });
  }

  if (unavailable.has(code)) {
    return res.status(503).json({
      ok: false,
      error: code,
    });
  }

  if (
    code ===
      "AUTH_EMAIL_REQUIRED"
  ) {
    return res.status(409).json({
      ok: false,
      error: code,
    });
  }

  console.error(
    "[DEVICE_CHALLENGE_ROUTE]",
    error
  );

  return res.status(500).json({
    ok: false,
    error:
      "DEVICE_CONFIRMATION_OPERATION_FAILED",
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

        pixKey:
          String(
            process.env.PALPITACO_PIX_KEY ||
            "+5561999878710"
          )
            .trim()
            .slice(0, 200),

        pixReceiver:
          String(
            process.env.PALPITACO_PIX_RECEIVER ||
            ""
          )
            .trim()
            .slice(0, 200),

        supportPhone:
          "+5561999878710",

        supportEmail:
          "contato@palpitacojb.com.br",
      },
    });
  }
);


/**
 * Estado de assinatura.
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
 * Inicia confirmação de vínculo/substituição.
 *
 * O slot aqui é apenas destino do vínculo.
 * Nunca é usado como autoridade no /check.
 */
router.post(
  "/device/start",

  requireFirebaseUser,

  async (req, res) => {
    try {
      const challenge =
        await startDeviceChallenge({
          uid:
            req.authUser.uid,

          email:
            req.authUser.email,

          slot:
            bodyText(
              req,
              "slot"
            ),

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
        challenge,
      });
    } catch (error) {
      return sendChallengeError(
        res,
        error
      );
    }
  }
);


/**
 * Confirma o código recebido por e-mail.
 *
 * É o único endpoint público que efetivamente
 * vincula/substitui um dispositivo.
 */
router.post(
  "/device/confirm",

  requireFirebaseUser,

  async (req, res) => {
    try {
      const result =
        await confirmDeviceChallenge({
          uid:
            req.authUser.uid,

          email:
            req.authUser.email,

          challengeToken:
            bodyText(
              req,
              "challengeToken"
            ),

          code:
            bodyText(
              req,
              "code"
            ),

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
        result,
      });
    } catch (error) {
      return sendChallengeError(
        res,
        error
      );
    }
  }
);


/**
 * Abre/rotaciona a única sessão ativa.
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
 * Check completo.
 */
router.get(
  "/check",

  requireFirebaseUser,
  requireAuthorizedAccess,

  (req, res) => {
    return res.json({
      ok: true,

      accessGranted:
        true,

      access:
        req.authorizedAccess,
    });
  }
);


/**
 * Consulta administrativa do acesso autoritativo.
 */
router.get(
  "/admin/user/:uid",

  requireFirebaseUser,
  requireAdminUser,

  async (req, res) => {
    try {
      const target =
        await resolveTargetUser(
          String(
            req?.params?.uid || ""
          ).trim()
        );

      const access =
        await getAccessSnapshot(
          target.uid
        );

      return res.json({
        ok: true,

        user: {
          uid:
            target.uid,

          email:
            target.email,
        },

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
          bodyText(
            req,
            "uid"
          )
        );

      requireTargetCanActivate(
        target
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

          days:
            bodyText(
              req,
              "days"
            ) ||
            ACCESS_PRODUCT
              .durationDays,
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

/**
 * Ajuste administrativo da validade absoluta.
 *
 * Nao soma dias.
 * Substitui exclusivamente subscription.endsAt.
 */
router.post(
  "/admin/validity",

  requireFirebaseUser,
  requireAdminUser,

  async (req, res) => {
    try {
      const target =
        await resolveTargetUser(
          bodyText(
            req,
            "uid"
          )
        );

      requireTargetCanActivate(
        target
      );

      const operationId =
        requireOperationId(
          req
        );

      const access =
        await adjustSubscriptionValidity({
          uid:
            target.uid,

          email:
            target.email,

          actorUid:
            req.adminUser.uid,

          operationId,

          validUntilYmd:
            bodyText(
              req,
              "validUntilYmd"
            ),
        });

      return res.json({
        ok: true,
        access,
      });
    }
    catch (error) {
      return sendAdminError(
        res,
        error
      );
    }
  }
);


router.post(
  "/admin/revoke",

  requireFirebaseUser,
  requireAdminUser,

  async (req, res) => {
    try {
      const target =
        await resolveTargetUser(
          bodyText(
            req,
            "uid"
          )
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



async function deleteDocumentTree(
  ref
) {
  const childCollections =
    await ref.listCollections();

  for (
    const collectionRef of
    childCollections
  ) {
    while (true) {
      const snapshot =
        await collectionRef
          .limit(200)
          .get();

      if (snapshot.empty) {
        break;
      }

      for (
        const document of
        snapshot.docs
      ) {
        await deleteDocumentTree(
          document.ref
        );
      }
    }
  }

  await ref.delete();
}


/**
 * Exclusão definitiva de usuário.
 *
 * Remove exclusivamente:
 * - Firebase Auth do usuário-alvo
 * - perfil users/{uid}
 * - autoridade access_accounts/{uid}
 * - eventual autorização admins/{uid}
 *
 * Um Admin não pode excluir a própria conta.
 */
router.post(
  "/admin/delete",

  requireFirebaseUser,
  requireAdminUser,

  async (req, res) => {
    try {
      const uid =
        bodyText(
          req,
          "uid"
        );

      if (!uid) {
        const error =
          new Error(
            "UID_REQUIRED"
          );

        error.code =
          "UID_REQUIRED";

        throw error;
      }

      if (
        uid ===
        String(
          req.adminUser?.uid || ""
        )
      ) {
        const error =
          new Error(
            "ADMIN_SELF_DELETE_FORBIDDEN"
          );

        error.code =
          "ADMIN_SELF_DELETE_FORBIDDEN";

        throw error;
      }

      let authUserExists =
        true;

      try {
        await admin
          .auth()
          .updateUser(
            uid,
            {
              disabled: true,
            }
          );
      }
      catch (error) {
        if (
          error?.code ===
          "auth/user-not-found"
        ) {
          authUserExists =
            false;
        }
        else {
          throw error;
        }
      }

      const db =
        getDb();

      const refs = [
        db
          .collection(
            ACCESS_PRODUCT
              .accountCollection
          )
          .doc(uid),

        db
          .collection("users")
          .doc(uid),

        db
          .collection("admins")
          .doc(uid),
      ];

      for (
        const ref of refs
      ) {
        await deleteDocumentTree(
          ref
        );
      }

      if (authUserExists) {
        try {
          await admin
            .auth()
            .deleteUser(uid);
        }
        catch (error) {
          if (
            error?.code !==
            "auth/user-not-found"
          ) {
            throw error;
          }
        }
      }

      return res.json({
        ok: true,

        deleted: {
          uid,
        },
      });
    }
    catch (error) {
      return sendAdminError(
        res,
        error
      );
    }
  }
);


module.exports = router;
