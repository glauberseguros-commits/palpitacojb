"use strict";

const https =
  require("https");

const {
  DEVICE_CONFIRMATION_POLICY,
} = require("../access/accessConfig");


function makeEmailError(
  code
) {
  const error =
    new Error(code);

  error.code = code;

  return error;
}


function readRequiredEnv(name) {
  const value =
    String(
      process.env?.[name] || ""
    ).trim();

  if (!value) {
    return "";
  }

  return value;
}


function requestResend(payload) {
  return new Promise(
    (resolve, reject) => {
      const apiKey =
        readRequiredEnv(
          DEVICE_CONFIRMATION_POLICY
            .resendApiKeyEnv
        );

      if (!apiKey) {
        reject(
          makeEmailError(
            "EMAIL_DELIVERY_NOT_CONFIGURED"
          )
        );

        return;
      }

      const body =
        JSON.stringify(payload);

      const req =
        https.request(
          {
            protocol:
              "https:",

            hostname:
              "api.resend.com",

            port:
              443,

            path:
              "/emails",

            method:
              "POST",

            headers: {
              Authorization:
                `Bearer ${apiKey}`,

              "Content-Type":
                "application/json",

              "Content-Length":
                Buffer.byteLength(
                  body
                ),
            },
          },

          (res) => {
            let raw = "";

            res.setEncoding(
              "utf8"
            );

            res.on(
              "data",
              (chunk) => {
                raw += chunk;

                if (
                  raw.length >
                  1024 * 1024
                ) {
                  raw =
                    raw.slice(
                      0,
                      1024 * 1024
                    );
                }
              }
            );

            res.on(
              "end",
              () => {
                const status =
                  Number(
                    res.statusCode || 0
                  );

                if (
                  status >= 200 &&
                  status < 300
                ) {
                  let parsed =
                    null;

                  try {
                    parsed =
                      JSON.parse(
                        raw || "{}"
                      );
                  } catch {}

                  resolve({
                    ok: true,

                    provider:
                      "resend",

                    id:
                      String(
                        parsed?.id || ""
                      ),
                  });

                  return;
                }

                reject(
                  makeEmailError(
                    "EMAIL_DELIVERY_FAILED"
                  )
                );
              }
            );
          }
        );

      req.setTimeout(
        10000,
        () => {
          req.destroy(
            makeEmailError(
              "EMAIL_DELIVERY_TIMEOUT"
            )
          );
        }
      );

      req.on(
        "error",
        () => {
          reject(
            makeEmailError(
              "EMAIL_DELIVERY_FAILED"
            )
          );
        }
      );

      req.write(body);
      req.end();
    }
  );
}


async function sendDeviceConfirmationEmail({
  to,
  code,
}) {
  const recipient =
    String(to || "")
      .trim()
      .toLowerCase();

  const safeCode =
    String(code || "")
      .trim();

  if (!recipient) {
    throw makeEmailError(
      "CONFIRMATION_EMAIL_REQUIRED"
    );
  }

  if (
    !/^\d{6}$/.test(
      safeCode
    )
  ) {
    throw makeEmailError(
      "INVALID_CONFIRMATION_CODE"
    );
  }

  const from =
    readRequiredEnv(
      DEVICE_CONFIRMATION_POLICY
        .confirmationEmailFromEnv
    );

  if (!from) {
    throw makeEmailError(
      "EMAIL_DELIVERY_NOT_CONFIGURED"
    );
  }

  const minutes =
    DEVICE_CONFIRMATION_POLICY
      .ttlMinutes;

  return requestResend({
    from,
    to: [recipient],

    subject:
      "PalPitaco JB - Confirmação de dispositivo",

    text:
      [
        "PalPitaco JB",
        "",
        "Código de confirmação do dispositivo:",
        safeCode,
        "",
        `Este código expira em ${minutes} minutos.`,
        "",
        "Se você não solicitou este vínculo, ignore esta mensagem.",
      ].join("\n"),

    html:
      [
        "<div style=\"font-family:Arial,sans-serif;line-height:1.5\">",
        "<h2>PalPitaco JB</h2>",
        "<p>Código de confirmação do dispositivo:</p>",
        `<div style="font-size:32px;font-weight:800;letter-spacing:6px">${safeCode}</div>`,
        `<p>Este código expira em ${minutes} minutos.</p>`,
        "<p>Se você não solicitou este vínculo, ignore esta mensagem.</p>",
        "</div>",
      ].join(""),
  });
}


module.exports = {
  sendDeviceConfirmationEmail,
};
