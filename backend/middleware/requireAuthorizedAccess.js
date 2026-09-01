"use strict";

const {
  ACCESS_HEADERS,
} = require("../access/accessConfig");

const {
  validateAuthorizedAccess,
} = require("../access/deviceSessionService");


function readHeader(
  req,
  headerName
) {
  return String(
    req?.headers?.[
      headerName
    ] || ""
  ).trim();
}


function mapAuthorizationError(
  res,
  error
) {
  const code =
    String(
      error?.code || ""
    );

  const badRequestCodes =
    new Set([
      "INVALID_DEVICE_ID",
      "INVALID_DEVICE_SECRET",
      "SESSION_TOKEN_REQUIRED",
    ]);

  const forbiddenCodes =
    new Set([
      "ACTIVE_SUBSCRIPTION_REQUIRED",
      "ACCESS_ACCOUNT_NOT_FOUND",
      "DEVICE_NOT_AUTHORIZED",
      "ACTIVE_SESSION_REQUIRED",
    ]);

  if (
    badRequestCodes.has(code)
  ) {
    return res
      .status(400)
      .json({
        ok: false,
        error: code,
      });
  }

  if (
    forbiddenCodes.has(code)
  ) {
    return res
      .status(403)
      .json({
        ok: false,
        error: code,
      });
  }

  console.error(
    "[AUTHORIZED_ACCESS]",
    error
  );

  return res
    .status(500)
    .json({
      ok: false,
      error:
        "AUTHORIZED_ACCESS_VALIDATION_FAILED",
    });
}


async function requireAuthorizedAccess(
  req,
  res,
  next
) {
  const uid =
    String(
      req?.authUser?.uid || ""
    ).trim();

  if (!uid) {
    return res
      .status(401)
      .json({
        ok: false,
        error:
          "AUTH_REQUIRED",
      });
  }

  try {
    const access =
      await validateAuthorizedAccess({
        uid,

        deviceId:
          readHeader(
            req,
            ACCESS_HEADERS.DEVICE_ID
          ),

        deviceSecret:
          readHeader(
            req,
            ACCESS_HEADERS.DEVICE_SECRET
          ),

        sessionToken:
          readHeader(
            req,
            ACCESS_HEADERS.SESSION_TOKEN
          ),
      });

    req.authorizedAccess =
      access;

    return next();
  } catch (error) {
    return mapAuthorizationError(
      res,
      error
    );
  }
}


module.exports = {
  readHeader,
  mapAuthorizationError,
  requireAuthorizedAccess,
};
