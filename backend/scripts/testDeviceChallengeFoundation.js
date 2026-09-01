"use strict";

const assert =
  require("assert");

const {
  DEVICE_CONFIRMATION_POLICY,
} = require("../access/accessConfig");

const {
  normalizeChallengeToken,
  normalizeConfirmationCode,

  hashChallengeToken,
  verifyVerificationCode,

  generateChallengeMaterial,
  getChallengeState,
  buildPublicChallengeResponse,
} = require("../access/deviceChallengeService");


assert.strictEqual(
  DEVICE_CONFIRMATION_POLICY.ttlMinutes,
  10
);

assert.strictEqual(
  DEVICE_CONFIRMATION_POLICY.maxAttempts,
  5
);

assert.strictEqual(
  DEVICE_CONFIRMATION_POLICY.maxStartsPerWindow,
  5
);

assert.strictEqual(
  DEVICE_CONFIRMATION_POLICY.cooldownSeconds,
  60
);

assert.strictEqual(
  DEVICE_CONFIRMATION_POLICY.codeDigits,
  6
);


const material =
  generateChallengeMaterial();


assert.ok(
  normalizeChallengeToken(
    material.challengeToken
  )
);

assert.ok(
  /^\d{6}$/.test(
    material.code
  )
);

assert.strictEqual(
  material.challengeHash,
  hashChallengeToken(
    material.challengeToken
  )
);

assert.notStrictEqual(
  material.challengeHash,
  material.challengeToken
);


assert.strictEqual(
  verifyVerificationCode(
    material.code,
    material.codeSalt,
    material.codeHash
  ),
  true
);

const incorrectCode =
  material.code === "000000"
    ? "999999"
    : "000000";

assert.strictEqual(
  verifyVerificationCode(
    incorrectCode,
    material.codeSalt,
    material.codeHash
  ),
  false
);


assert.strictEqual(
  normalizeConfirmationCode(
    "123456"
  ),
  "123456"
);

assert.strictEqual(
  normalizeConfirmationCode(
    "12345"
  ),
  ""
);

assert.strictEqual(
  normalizeConfirmationCode(
    "abcdef"
  ),
  ""
);


const publicResponse =
  buildPublicChallengeResponse({
    challengeToken:
      material.challengeToken,

    slot:
      "MOBILE",

    replacement:
      false,
  });


assert.strictEqual(
  publicResponse.challengeToken,
  material.challengeToken
);

assert.strictEqual(
  publicResponse.slot,
  "MOBILE"
);

assert.strictEqual(
  publicResponse.confirmationRequired,
  true
);

assert.strictEqual(
  publicResponse.replacement,
  false
);


const forbiddenPublicFields = [
  "code",
  "codeHash",
  "codeSalt",
  "deviceSecret",
  "deviceSecretHash",
  "challengeHash",
];

for (
  const field of forbiddenPublicFields
) {
  assert.strictEqual(
    Object.prototype
      .hasOwnProperty.call(
        publicResponse,
        field
      ),
    false,
    `Public response leaked ${field}`
  );
}


const NOW =
  Date.parse(
    "2026-09-01T12:00:00-03:00"
  );


const pending =
  getChallengeState(
    {
      status: "pending",

      attemptsRemaining: 5,

      expiresAt:
        new Date(
          NOW + 60000
        ).toISOString(),
    },
    NOW
  );

assert.strictEqual(
  pending.state,
  "pending"
);


const expired =
  getChallengeState(
    {
      status: "pending",

      attemptsRemaining: 5,

      expiresAt:
        new Date(
          NOW - 1
        ).toISOString(),
    },
    NOW
  );

assert.strictEqual(
  expired.state,
  "expired"
);


const locked =
  getChallengeState(
    {
      status: "pending",

      attemptsRemaining: 0,

      expiresAt:
        new Date(
          NOW + 60000
        ).toISOString(),
    },
    NOW
  );

assert.strictEqual(
  locked.state,
  "locked"
);


const consumed =
  getChallengeState(
    {
      status: "consumed",

      attemptsRemaining: 4,

      expiresAt:
        new Date(
          NOW + 60000
        ).toISOString(),
    },
    NOW
  );

assert.strictEqual(
  consumed.state,
  "consumed"
);


const cancelled =
  getChallengeState(
    {
      status: "cancelled",

      attemptsRemaining: 4,

      expiresAt:
        new Date(
          NOW + 60000
        ).toISOString(),
    },
    NOW
  );

assert.strictEqual(
  cancelled.state,
  "cancelled"
);


console.log(
  "DEVICE_CHALLENGE_FOUNDATION_TEST=PASS"
);

console.log(
  "CHALLENGE_TTL_MINUTES=10"
);

console.log(
  "MAX_CODE_ATTEMPTS=5"
);

console.log(
  "CODE_DIGITS=6"
);

console.log(
  "START_COOLDOWN_SECONDS=60"
);

console.log(
  "MAX_STARTS_PER_HOUR=5"
);

console.log(
  "CODE_HASH_PBKDF2=PASS"
);

console.log(
  "RAW_CODE_NOT_IN_PUBLIC_RESPONSE=PASS"
);

console.log(
  "RAW_SECRET_NOT_IN_PUBLIC_RESPONSE=PASS"
);

console.log(
  "CHALLENGE_TOKEN_HASH=PASS"
);
