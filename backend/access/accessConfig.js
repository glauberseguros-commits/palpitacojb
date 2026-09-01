"use strict";

/**
 * PALPITACO JB — ACCESS PRODUCT CONTRACT V2
 *
 * Contrato comercial + política de dispositivos.
 */

const ACCESS_PRODUCT = Object.freeze({
  schemaVersion: 2,

  planCode: "PALPITACO_PREMIUM_30D",

  priceCents: 4990,
  currency: "BRL",

  durationDays: 30,
  durationMs:
    30 * 24 * 60 * 60 * 1000,

  paymentMethod: "PIX",

  accountCollection:
    "access_accounts",

  eventSubcollection:
    "events",

  maxOperationIdLength: 128,
  maxPaymentReferenceLength: 200,
  maxReasonLength: 500,
});

const SUBSCRIPTION_STATUS =
  Object.freeze({
    PENDING: "pending",
    ACTIVE: "active",
    EXPIRED: "expired",
    REVOKED: "revoked",
  });

const ACCESS_EVENT_TYPE =
  Object.freeze({
    GRANT:
      "subscription_grant",

    REVOKE:
      "subscription_revoke",
  });

const DEVICE_SLOT =
  Object.freeze({
    MOBILE: "MOBILE",
    DESKTOP: "DESKTOP",
  });

const DEVICE_POLICY =
  Object.freeze({
    slots: Object.freeze([
      DEVICE_SLOT.MOBILE,
      DEVICE_SLOT.DESKTOP,
    ]),

    maxBoundDevices: 2,

    /**
     * Regra principal:
     * MOBILE + DESKTOP podem estar vinculados,
     * mas existe somente uma sessão ativa total.
     */
    maxActiveSessions: 1,

    deviceIdMinLength: 8,
    deviceIdMaxLength: 128,

    deviceSecretMinLength: 32,
    deviceSecretMaxLength: 256,

    sessionTokenBytes: 32,

    hashAlgorithm: "sha256",
  });

const ACCESS_HEADERS =
  Object.freeze({
    DEVICE_ID:
      "x-palpitaco-device-id",

    DEVICE_SECRET:
      "x-palpitaco-device-secret",

    SESSION_TOKEN:
      "x-palpitaco-session-token",
  });

module.exports = {
  ACCESS_PRODUCT,
  SUBSCRIPTION_STATUS,
  ACCESS_EVENT_TYPE,
  DEVICE_SLOT,
  DEVICE_POLICY,
  ACCESS_HEADERS,
};
