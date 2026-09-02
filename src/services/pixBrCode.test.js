import {
  buildStaticPixPayload,
} from "./pixBrCode";

test("gera BR Code PIX para Palpitaco JB", () => {
  const payload =
    buildStaticPixPayload({
      pixKey:
        "+5561999878710",

      amountCents:
        4990,
    });

  expect(
    payload.startsWith(
      "000201"
    )
  ).toBe(true);

  expect(
    payload
  ).toContain(
    "br.gov.bcb.pix"
  );

  expect(
    payload
  ).toContain(
    "+5561999878710"
  );

  expect(
    payload
  ).toContain(
    "49.90"
  );

  expect(
    payload
  ).toContain(
    "PALPITACO JB"
  );

  expect(
    payload
  ).toContain(
    "BRASILIA"
  );

  expect(
    payload
  ).toMatch(
    /6304[0-9A-F]{4}$/
  );
});

test("PIX para mesmo contrato e deterministico", () => {
  const first =
    buildStaticPixPayload({
      pixKey:
        "+5561999878710",

      amountCents:
        4990,
    });

  const second =
    buildStaticPixPayload({
      pixKey:
        "+5561999878710",

      amountCents:
        4990,
    });

  expect(
    second
  ).toBe(
    first
  );
});