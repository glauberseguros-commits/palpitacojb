"use strict";

const assert =
  require("assert");

const {
  normalizeSubscriptionDays,
  computeRenewalWindow,
  normalizeValidityYmd,
  validityEndOfDayMs,
} = require("../access/accessService");

const DAY =
  24 * 60 * 60 * 1000;

const NOW =
  Date.parse(
    "2026-09-02T12:00:00-03:00"
  );

assert.strictEqual(
  normalizeSubscriptionDays(1),
  1
);

assert.strictEqual(
  normalizeSubscriptionDays("30"),
  30
);

assert.strictEqual(
  normalizeSubscriptionDays(3650),
  3650
);

assert.throws(
  () =>
    normalizeSubscriptionDays(0),
  /INVALID_SUBSCRIPTION_DAYS/
);

assert.throws(
  () =>
    normalizeSubscriptionDays(3651),
  /INVALID_SUBSCRIPTION_DAYS/
);

assert.throws(
  () =>
    normalizeSubscriptionDays(1.5),
  /INVALID_SUBSCRIPTION_DAYS/
);

const fresh =
  computeRenewalWindow(
    {
      active:
        false,
    },
    NOW,
    45
  );

assert.strictEqual(
  fresh.newEndsAtMs,
  NOW + 45 * DAY
);

const active =
  computeRenewalWindow(
    {
      active:
        true,

      startedAtMs:
        NOW - 10 * DAY,

      endsAtMs:
        NOW + 5 * DAY,
    },
    NOW,
    15
  );

assert.strictEqual(
  active.newEndsAtMs,
  NOW + 20 * DAY
);


assert.strictEqual(
  normalizeValidityYmd(
    "2026-10-04"
  ),
  "2026-10-04"
);

assert.throws(
  () =>
    normalizeValidityYmd(
      "2026-02-30"
    ),
  /INVALID_VALIDITY_DATE/
);

assert.throws(
  () =>
    normalizeValidityYmd(
      "04/10/2026"
    ),
  /INVALID_VALIDITY_DATE/
);

assert.strictEqual(
  validityEndOfDayMs(
    "2026-10-04"
  ),
  Date.parse(
    "2026-10-04T23:59:59.999-03:00"
  )
);


console.log(
  "ACCESS_ADMIN_CONTROLS=PASS"
);
