"use strict";

const {
  admin,
  initAdmin,
  getDb,
} = require("../service/firebaseAdmin");

function readBearerToken(req) {
  const header = String(
    req?.headers?.authorization || ""
  ).trim();

  const match =
    header.match(/^Bearer\s+(.+)$/i);

  if (!match) {
    return "";
  }

  return String(match[1] || "").trim();
}

function isAnonymousFirebaseToken(decoded) {
  const provider = String(
    decoded?.firebase?.sign_in_provider || ""
  )
    .trim()
    .toLowerCase();

  return provider === "anonymous";
}

async function requireFirebaseUser(
  req,
  res,
  next
) {
  const token = readBearerToken(req);

  if (!token) {
    return res.status(401).json({
      ok: false,
      error: "AUTH_TOKEN_REQUIRED",
    });
  }

  try {
    initAdmin();

    const decoded =
      await admin
        .auth()
        .verifyIdToken(token, true);

    if (!decoded?.uid) {
      return res.status(401).json({
        ok: false,
        error: "AUTH_TOKEN_INVALID",
      });
    }

    if (
      isAnonymousFirebaseToken(decoded)
    ) {
      return res.status(403).json({
        ok: false,
        error: "ANONYMOUS_AUTH_FORBIDDEN",
      });
    }

    req.authUser = {
      uid: String(decoded.uid),
      email: String(
        decoded.email || ""
      )
        .trim()
        .toLowerCase(),

      emailVerified:
        decoded.email_verified === true,

      signInProvider: String(
        decoded?.firebase
          ?.sign_in_provider || ""
      ),
    };

    return next();
  } catch (error) {
    console.warn(
      "[ACCESS_AUTH] verifyIdToken failed:",
      error?.code ||
        error?.message ||
        error
    );

    return res.status(401).json({
      ok: false,
      error: "AUTH_TOKEN_INVALID",
    });
  }
}

async function requireAdminUser(
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
    const db = getDb();

    const snap =
      await db
        .collection("admins")
        .doc(uid)
        .get();

    if (!snap.exists) {
      return res.status(403).json({
        ok: false,
        error: "ADMIN_REQUIRED",
      });
    }

    const data = snap.data() || {};

    if (data.active !== true) {
      return res.status(403).json({
        ok: false,
        error: "ADMIN_REQUIRED",
      });
    }

    req.adminUser = {
      uid,
      email:
        req.authUser?.email || "",
    };

    return next();
  } catch (error) {
    console.error(
      "[ACCESS_AUTH] admin validation:",
      error
    );

    return res.status(500).json({
      ok: false,
      error:
        "ADMIN_VALIDATION_FAILED",
    });
  }
}

module.exports = {
  readBearerToken,
  isAnonymousFirebaseToken,
  requireFirebaseUser,
  requireAdminUser,
};
