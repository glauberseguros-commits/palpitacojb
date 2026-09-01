"use strict";

const assert =
  require("assert");

const {
  ACCESS_PRODUCT,
  SUBSCRIPTION_STATUS,
} = require("../access/accessConfig");

const {
  computeSubscriptionState,
  computeRenewalWindow,
  normalizeOperationId,
} = require("../access/accessService");

const DAY =
  24 * 60 * 60 * 1000;

const NOW =
  Date.parse(
    "2026-09-01T12:00:00-03:00"
  );

assert.strictEqual(
  ACCESS_PRODUCT.priceCents,
  4990
);

assert.strictEqual(
  ACCESS_PRODUCT.currency,
  "BRL"
);

assert.strictEqual(
  ACCESS_PRODUCT.durationDays,
  30
);

assert.strictEqual(
  ACCESS_PRODUCT.paymentMethod,
  "PIX"
);

assert.strictEqual(
  normalizeOperationId(
    "grant_20260901_ABC123"
  ),
  "grant_20260901_ABC123"
);

assert.strictEqual(
  normalizeOperationId(
    "abc"
  ),
  ""
);

assert.strictEqual(
  normalizeOperationId(
    "invalid/path"
  ),
  ""
);

const missing =
  computeSubscriptionState(
    null,
    NOW
  );

assert.strictEqual(
  missing.active,
  false
);

assert.strictEqual(
  missing.status,
  SUBSCRIPTION_STATUS.PENDING
);

const ACTIVE_START =
  NOW - 5 * DAY;

const ACTIVE_END =
  NOW + 10 * DAY;

const active =
  computeSubscriptionState(
    {
      subscription: {
        status: "active",

        startedAt:
          new Date(
            ACTIVE_START
          ).toISOString(),

        firstActivatedAt:
          new Date(
            ACTIVE_START
          ).toISOString(),

        endsAt:
          new Date(
            ACTIVE_END
          ).toISOString(),

        grantCount: 1,
      },
    },
    NOW
  );

assert.strictEqual(
  active.active,
  true
);

const activeRenewal =
  computeRenewalWindow(
    active,
    NOW
  );

assert.strictEqual(
  activeRenewal.renewal,
  true
);

assert.strictEqual(
  activeRenewal.startedAtMs,
  ACTIVE_START
);

assert.strictEqual(
  activeRenewal.newEndsAtMs,
  ACTIVE_END +
    30 * DAY
);

const expired =
  computeSubscriptionState(
    {
      subscription: {
        status: "active",

        startedAt:
          new Date(
            NOW - 40 * DAY
          ).toISOString(),

        endsAt:
          new Date(
            NOW - DAY
          ).toISOString(),
      },
    },
    NOW
  );

assert.strictEqual(
  expired.status,
  SUBSCRIPTION_STATUS.EXPIRED
);

assert.strictEqual(
  expired.active,
  false
);

const expiredRenewal =
  computeRenewalWindow(
    expired,
    NOW
  );

assert.strictEqual(
  expiredRenewal.renewal,
  false
);

assert.strictEqual(
  expiredRenewal.startedAtMs,
  NOW
);

assert.strictEqual(
  expiredRenewal.newEndsAtMs,
  NOW + 30 * DAY
);

const revoked =
  computeSubscriptionState(
    {
      subscription: {
        status: "revoked",

        endsAt:
          new Date(
            NOW + DAY
          ).toISOString(),
      },
    },
    NOW
  );

assert.strictEqual(
  revoked.active,
  false
);

assert.strictEqual(
  revoked.status,
  SUBSCRIPTION_STATUS.REVOKED
);

console.log(
  "ACCESS_FOUNDATION_TEST=PASS"
);

console.log(
  "PRICE_CENTS=" +
    ACCESS_PRODUCT.priceCents
);

console.log(
  "DURATION_DAYS=" +
    ACCESS_PRODUCT.durationDays
);

console.log(
  "PAYMENT_METHOD=" +
    ACCESS_PRODUCT.paymentMethod
);

console.log(
  "ACTIVE_RENEWAL_FROM_EXPIRY=PASS"
);

console.log(
  "EXPIRED_RENEWAL_FROM_NOW=PASS"
);

console.log(
  "OPERATION_ID_VALIDATION=PASS"
);
