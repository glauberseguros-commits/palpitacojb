function text(value) {
  return String(value ?? "").trim();
}

function asciiUpper(
  value,
  maxLength
) {
  return text(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9 .-]+/g, "")
    .toUpperCase()
    .slice(0, maxLength);
}

function field(
  id,
  value
) {
  const payload =
    String(value ?? "");

  const length =
    String(
      payload.length
    ).padStart(2, "0");

  return (
    String(id) +
    length +
    payload
  );
}

function crc16Ccitt(
  value
) {
  let crc =
    0xffff;

  for (
    let index = 0;
    index < value.length;
    index += 1
  ) {
    crc ^=
      value.charCodeAt(index)
      << 8;

    for (
      let bit = 0;
      bit < 8;
      bit += 1
    ) {
      crc =
        (crc & 0x8000) !== 0
          ? (
              (crc << 1) ^
              0x1021
            ) &
            0xffff
          : (crc << 1) &
            0xffff;
    }
  }

  return crc
    .toString(16)
    .toUpperCase()
    .padStart(4, "0");
}

function normalizePixKey(
  value
) {
  const key =
    text(value);

  if (!key) {
    throw new Error(
      "Chave PIX ausente."
    );
  }

  return key;
}

function normalizeAmount(
  cents
) {
  const value =
    Number(cents);

  if (
    !Number.isInteger(value) ||
    value <= 0
  ) {
    throw new Error(
      "Valor PIX invalido."
    );
  }

  return (
    value / 100
  ).toFixed(2);
}

/**
 * BR Code PIX estático.
 *
 * A identificação efetiva do favorecido é resolvida
 * pela instituição financeira a partir da chave PIX.
 *
 * Merchant Name / Merchant City abaixo são metadados
 * técnicos do BR Code e não substituem os dados
 * bancários apresentados ao pagador pelo banco.
 */
export function buildStaticPixPayload({
  pixKey,
  amountCents = 4990,

  merchantName =
    "PALPITACO JB",

  merchantCity =
    "BRASILIA",

  txid =
    "***",
} = {}) {
  const key =
    normalizePixKey(
      pixKey
    );

  const amount =
    normalizeAmount(
      amountCents
    );

  const name =
    asciiUpper(
      merchantName,
      25
    ) ||
    "PALPITACO JB";

  const city =
    asciiUpper(
      merchantCity,
      15
    ) ||
    "BRASILIA";

  const transactionId =
    asciiUpper(
      txid,
      25
    ) ||
    "***";

  const merchantAccount =
    field(
      "00",
      "br.gov.bcb.pix"
    ) +
    field(
      "01",
      key
    );

  const additional =
    field(
      "05",
      transactionId
    );

  const payloadWithoutCrc =
    field(
      "00",
      "01"
    ) +
    field(
      "26",
      merchantAccount
    ) +
    field(
      "52",
      "0000"
    ) +
    field(
      "53",
      "986"
    ) +
    field(
      "54",
      amount
    ) +
    field(
      "58",
      "BR"
    ) +
    field(
      "59",
      name
    ) +
    field(
      "60",
      city
    ) +
    field(
      "62",
      additional
    ) +
    "6304";

  return (
    payloadWithoutCrc +
    crc16Ccitt(
      payloadWithoutCrc
    )
  );
}

export default {
  buildStaticPixPayload,
};