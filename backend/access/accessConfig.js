"use strict";

/**
 * PALPITACO JB — ACCESS PRODUCT CONTRACT V1
 *
 * Contrato comercial único.
 *
 * Nenhum valor comercial deve ser inferido
 * pelo frontend ou por documentos de usuário.
 */
const ACCESS_PRODUCT = Object.freeze({
  schemaVersion: 1,

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

module.exports = {
  ACCESS_PRODUCT,
  SUBSCRIPTION_STATUS,
  ACCESS_EVENT_TYPE,
};
