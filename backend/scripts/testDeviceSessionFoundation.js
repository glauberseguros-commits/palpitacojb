"use strict";

const assert =
  require("assert");

const {
  DEVICE_SLOT,
  DEVICE_POLICY,
} = require("../access/accessConfig");

const {
  normalizeDeviceSlot,
  normalizeDeviceCredentials,
  hashCredential,
  discoverDeviceSlotFromData,
  sessionMatches,
} = require("../access/deviceSessionService");


assert.deepStrictEqual(
  DEVICE_POLICY.slots,
  [
    DEVICE_SLOT.MOBILE,
    DEVICE_SLOT.DESKTOP,
  ]
);

assert.strictEqual(
  DEVICE_POLICY.maxBoundDevices,
  2
);

assert.strictEqual(
  DEVICE_POLICY.maxActiveSessions,
  1
);

assert.strictEqual(
  normalizeDeviceSlot("mobile"),
  DEVICE_SLOT.MOBILE
);

assert.strictEqual(
  normalizeDeviceSlot("DESKTOP"),
  DEVICE_SLOT.DESKTOP
);

assert.strictEqual(
  normalizeDeviceSlot("tablet"),
  ""
);


const MOBILE_ID =
  "mobile-device-001";

const MOBILE_SECRET =
  "mobile-secret-abcdefghijklmnopqrstuvwxyz-001";

const DESKTOP_ID =
  "desktop-device-001";

const DESKTOP_SECRET =
  "desktop-secret-abcdefghijklmnopqrstuvwxyz-001";

const SESSION_TOKEN =
  "session-token-abcdefghijklmnopqrstuvwxyz-001";


const mobile =
  normalizeDeviceCredentials({
    deviceId:
      MOBILE_ID,

    deviceSecret:
      MOBILE_SECRET,
  });

const desktop =
  normalizeDeviceCredentials({
    deviceId:
      DESKTOP_ID,

    deviceSecret:
      DESKTOP_SECRET,
  });


const account = {
  devices: {
    MOBILE: {
      active: true,

      slot: "MOBILE",

      deviceIdHash:
        mobile.deviceIdHash,

      deviceSecretHash:
        mobile.deviceSecretHash,
    },

    DESKTOP: {
      active: true,

      slot: "DESKTOP",

      deviceIdHash:
        desktop.deviceIdHash,

      deviceSecretHash:
        desktop.deviceSecretHash,
    },
  },

  activeSession: {
    status: "active",

    slot: "MOBILE",

    deviceIdHash:
      mobile.deviceIdHash,

    tokenHash:
      hashCredential(
        "session-token",
        SESSION_TOKEN
      ),
  },
};


const mobileMatch =
  discoverDeviceSlotFromData(
    account,
    mobile
  );

assert.ok(
  mobileMatch
);

assert.strictEqual(
  mobileMatch.slot,
  "MOBILE"
);


const desktopMatch =
  discoverDeviceSlotFromData(
    account,
    desktop
  );

assert.ok(
  desktopMatch
);

assert.strictEqual(
  desktopMatch.slot,
  "DESKTOP"
);


const wrongSecret =
  normalizeDeviceCredentials({
    deviceId:
      MOBILE_ID,

    deviceSecret:
      "WRONG-secret-abcdefghijklmnopqrstuvwxyz-999",
  });

assert.strictEqual(
  discoverDeviceSlotFromData(
    account,
    wrongSecret
  ),
  null
);


assert.strictEqual(
  sessionMatches(
    account,
    mobileMatch,
    SESSION_TOKEN
  ),
  true
);


assert.strictEqual(
  sessionMatches(
    account,
    desktopMatch,
    SESSION_TOKEN
  ),
  false
);


assert.strictEqual(
  sessionMatches(
    account,
    mobileMatch,
    "wrong-session-token"
  ),
  false
);


/**
 * Rotação simulada:
 * novo activeSession substitui o anterior.
 */
const rotatedAccount = {
  ...account,

  activeSession: {
    status: "active",

    slot: "DESKTOP",

    deviceIdHash:
      desktop.deviceIdHash,

    tokenHash:
      hashCredential(
        "session-token",
        "new-session-token-abcdefghijklmnopqrstuvwxyz-002"
      ),
  },
};


assert.strictEqual(
  sessionMatches(
    rotatedAccount,
    mobileMatch,
    SESSION_TOKEN
  ),
  false
);


assert.strictEqual(
  sessionMatches(
    rotatedAccount,
    desktopMatch,
    "new-session-token-abcdefghijklmnopqrstuvwxyz-002"
  ),
  true
);


console.log(
  "DEVICE_SESSION_FOUNDATION_TEST=PASS"
);

console.log(
  "DEVICE_SLOTS=MOBILE,DESKTOP"
);

console.log(
  "MAX_BOUND_DEVICES=2"
);

console.log(
  "MAX_ACTIVE_SESSIONS=1"
);

console.log(
  "SLOT_DISCOVERY_BY_CREDENTIALS=PASS"
);

console.log(
  "WRONG_DEVICE_SECRET=DENIED"
);

console.log(
  "SINGLE_SESSION_ROTATION=PASS"
);
