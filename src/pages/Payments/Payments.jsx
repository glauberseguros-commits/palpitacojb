import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import QRCode from "qrcode";

import {
  getAccessProduct,
  getMyAccess,
} from "../../services/accessClient";

import {
  buildStaticPixPayload,
} from "../../services/pixBrCode";

const LOGO_SRC =
  "/logo/palpitaco-jb.png";

const PIX_KEY_FALLBACK =
  "+5561999878710";

const SUPPORT_PHONE =
  "+5561999878710";

const SUPPORT_DISPLAY =
  "+55 (61) 9 9987-8710";

const SUPPORT_EMAIL =
  "contato@palpitacojb.com.br";

function money(
  cents,
  currency = "BRL"
) {
  const value =
    Number(cents);

  if (
    !Number.isFinite(value)
  ) {
    return "—";
  }

  return new Intl.NumberFormat(
    "pt-BR",
    {
      style:
        "currency",

      currency:
        String(
          currency || "BRL"
        ),
    }
  ).format(
    value / 100
  );
}

function dateLabel(value) {
  if (!value) {
    return "—";
  }

  const date =
    new Date(value);

  if (
    !Number.isFinite(
      date.getTime()
    )
  ) {
    return "—";
  }

  return date.toLocaleString(
    "pt-BR"
  );
}

function openWhatsApp(
  email
) {
  const text =
    [
      "Olá, suporte PalPitaco JB.",
      "",
      "Estou enviando meu comprovante de pagamento PIX para liberação da assinatura.",
      "",
      `Conta: ${String(email || "").trim() || "não informada"}`,
      "Plano: PalPitaco JB - 30 dias - R$ 49,90",
      "",
      "Vou anexar o comprovante nesta conversa.",
    ].join("\n");

  const url =
    "https://wa.me/" +
    SUPPORT_PHONE.replace(
      /\D/g,
      ""
    ) +
    "?text=" +
    encodeURIComponent(
      text
    );

  window.open(
    url,
    "_blank",
    "noopener,noreferrer"
  );
}

async function copyText(
  value
) {
  const text =
    String(
      value || ""
    );

  if (!text) {
    throw new Error(
      "Nada para copiar."
    );
  }

  if (
    navigator.clipboard &&
    window.isSecureContext
  ) {
    await navigator.clipboard
      .writeText(text);

    return;
  }

  const textarea =
    document.createElement(
      "textarea"
    );

  textarea.value =
    text;

  textarea.setAttribute(
    "readonly",
    ""
  );

  textarea.style.position =
    "fixed";

  textarea.style.opacity =
    "0";

  document.body.appendChild(
    textarea
  );

  textarea.select();

  const copied =
    document.execCommand(
      "copy"
    );

  document.body.removeChild(
    textarea
  );

  if (!copied) {
    throw new Error(
      "Falha ao copiar."
    );
  }
}

export default function Payments({
  email = "",
  busy:
    externalBusy = false,
  onRetry = null,
  onLogout = null,
}) {
  const [
    product,
    setProduct,
  ] =
    useState(null);

  const [
    access,
    setAccess,
  ] =
    useState(null);

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    error,
    setError,
  ] =
    useState("");

  const [
    copiedKey,
    setCopiedKey,
  ] =
    useState(false);

  const [
    copiedPayload,
    setCopiedPayload,
  ] =
    useState(false);

  const [
    qrDataUrl,
    setQrDataUrl,
  ] =
    useState("");

  const load =
    useCallback(
      async () => {
        setLoading(true);
        setError("");

        try {
          const [
            productResponse,
            meResponse,
          ] =
            await Promise.all([
              getAccessProduct(),
              getMyAccess(),
            ]);

          setProduct(
            productResponse?.product ||
            null
          );

          setAccess(
            meResponse?.access ||
            null
          );
        }
        catch (err) {
          setError(
            err?.message ||
            "Não foi possível carregar os dados da assinatura."
          );
        }
        finally {
          setLoading(false);
        }
      },
      []
    );

  useEffect(() => {
    load();
  }, [load]);

  const subscription =
    access?.subscription ||
    null;

  const active =
    access?.accessGranted === true ||
    subscription?.active === true;

  const pixKey =
    String(
      product?.pixKey ||
      PIX_KEY_FALLBACK
    ).trim();

  const priceCents =
    Number(
      product?.priceCents ||
      4990
    );

  const pixPayload =
    useMemo(
      () => {
        try {
          return buildStaticPixPayload({
            pixKey,
            amountCents:
              priceCents,
            merchantName:
              "PALPITACO JB",
            merchantCity:
              "BRASILIA",
          });
        }
        catch {
          return "";
        }
      },
      [
        pixKey,
        priceCents,
      ]
    );

  useEffect(
    () => {
      let alive =
        true;

      setQrDataUrl("");

      if (!pixPayload) {
        return () => {
          alive =
            false;
        };
      }

      QRCode.toDataURL(
        pixPayload,
        {
          width: 340,
          margin: 2,
          errorCorrectionLevel:
            "M",
        }
      )
        .then(
          (value) => {
            if (alive) {
              setQrDataUrl(
                value
              );
            }
          }
        )
        .catch(
          () => {
            if (alive) {
              setError(
                "Não foi possível gerar o QR Code PIX."
              );
            }
          }
        );

      return () => {
        alive =
          false;
      };
    },
    [
      pixPayload,
    ]
  );

  async function copyPixKey() {
    try {
      await copyText(
        pixKey
      );

      setCopiedKey(
        true
      );

      window.setTimeout(
        () =>
          setCopiedKey(
            false
          ),
        1800
      );
    }
    catch {
      setError(
        "Não foi possível copiar a chave PIX."
      );
    }
  }

  async function copyPayload() {
    try {
      await copyText(
        pixPayload
      );

      setCopiedPayload(
        true
      );

      window.setTimeout(
        () =>
          setCopiedPayload(
            false
          ),
        1800
      );
    }
    catch {
      setError(
        "Não foi possível copiar o PIX Copia e Cola."
      );
    }
  }

  async function verifyAccess() {
    setError("");

    try {
      await load();

      if (
        typeof onRetry ===
        "function"
      ) {
        await onRetry();
      }
    }
    catch (err) {
      setError(
        err?.message ||
        "Não foi possível verificar o acesso."
      );
    }
  }

  const primaryButton = {
    width: "100%",
    minHeight: 48,
    borderRadius: 12,
    cursor: "pointer",
    fontWeight: 950,
    color: "#fff",
    border:
      "1px solid rgba(202,166,75,0.46)",
    background:
      "linear-gradient(180deg, rgba(94,71,17,0.88), rgba(40,31,10,0.94))",
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        boxSizing: "border-box",
        display: "grid",
        placeItems: "center",
        padding: 18,
        background: "#030303",
        color:
          "rgba(255,255,255,0.94)",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 980,
          borderRadius: 22,
          border:
            "1px solid rgba(202,166,75,0.30)",
          background:
            "linear-gradient(180deg, rgba(17,14,7,0.98), rgba(3,3,3,0.99))",
          boxShadow:
            "0 28px 90px rgba(0,0,0,0.58)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit,minmax(280px,1fr))",
          }}
        >
          <section
            style={{
              padding: 28,
              borderRight:
                "1px solid rgba(202,166,75,0.14)",
              textAlign: "center",
            }}
          >
            <img
              src={LOGO_SRC}
              alt="PalPitaco JB"
              style={{
                width: 150,
                height: 150,
                objectFit:
                  "contain",
              }}
            />

            <div
              style={{
                marginTop: 8,
                color: "#d7b84c",
                fontSize: 11,
                fontWeight: 950,
                letterSpacing: 1.6,
              }}
            >
              ASSINATURA PALPITACO JB
            </div>

            <h1
              style={{
                margin:
                  "10px 0 0",
                fontSize: 29,
              }}
            >
              Pagamento via PIX
            </h1>

            <p
              style={{
                margin:
                  "10px auto 0",
                maxWidth: 330,
                lineHeight: 1.55,
                opacity: 0.72,
              }}
            >
              R$ 49,90 por 30 dias de acesso.
            </p>

            <div
              style={{
                marginTop: 20,
                padding: 17,
                borderRadius: 15,
                border:
                  "1px solid rgba(202,166,75,0.30)",
                background:
                  "rgba(202,166,75,0.06)",
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  letterSpacing: 1.3,
                  color: "#d7b84c",
                  fontWeight: 900,
                }}
              >
                PLANO
              </div>

              <div
                style={{
                  marginTop: 8,
                  fontSize: 31,
                  fontWeight: 1000,
                }}
              >
                {money(
                  priceCents,
                  product?.currency ||
                  "BRL"
                )}
              </div>

              <div
                style={{
                  marginTop: 4,
                  opacity: 0.72,
                }}
              >
                {Number(
                  product?.durationDays ||
                  30
                )}
                {" dias de acesso"}
              </div>
            </div>

            <div
              style={{
                marginTop: 18,
                fontSize: 12.5,
                lineHeight: 1.55,
                opacity: 0.72,
              }}
            >
              Conta:{" "}
              <strong>
                {email || "—"}
              </strong>
            </div>
          </section>

          <section
            style={{
              padding: 28,
            }}
          >
            <div
              style={{
                color: "#d7b84c",
                fontWeight: 950,
                fontSize: 12,
                letterSpacing: 1.2,
              }}
            >
              PAGUE PELO QR CODE
            </div>

            {loading ? (
              <div
                style={{
                  marginTop: 18,
                }}
              >
                Carregando...
              </div>
            ) : null}

            {error ? (
              <div
                role="alert"
                style={{
                  marginTop: 15,
                  padding: 12,
                  borderRadius: 10,
                  color: "#ffb5b5",
                  background:
                    "rgba(255,80,80,0.08)",
                  border:
                    "1px solid rgba(255,100,100,0.22)",
                }}
              >
                {error}
              </div>
            ) : null}

            <div
              style={{
                display: "grid",
                placeItems: "center",
                marginTop: 16,
              }}
            >
              {qrDataUrl ? (
                <div
                  style={{
                    padding: 12,
                    borderRadius: 16,
                    background: "#fff",
                  }}
                >
                  <img
                    src={qrDataUrl}
                    alt="QR Code PIX PalPitaco JB"
                    style={{
                      display: "block",
                      width: "min(280px, 70vw)",
                      height: "auto",
                    }}
                  />
                </div>
              ) : (
                <div
                  style={{
                    padding: 20,
                    opacity: 0.65,
                  }}
                >
                  Gerando QR Code...
                </div>
              )}
            </div>

            <div
              style={{
                marginTop: 18,
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 900,
                  color: "#d7b84c",
                  letterSpacing: 1.1,
                }}
              >
                CHAVE PIX
              </div>

              <div
                style={{
                  marginTop: 7,
                  padding: 13,
                  borderRadius: 11,
                  wordBreak:
                    "break-all",
                  textAlign:
                    "center",
                  background:
                    "rgba(255,255,255,0.045)",
                  border:
                    "1px solid rgba(255,255,255,0.11)",
                  fontWeight: 900,
                }}
              >
                {pixKey}
              </div>

              <button
                type="button"
                onClick={
                  copyPixKey
                }
                style={{
                  ...primaryButton,
                  marginTop: 9,
                }}
              >
                {copiedKey
                  ? "CHAVE COPIADA"
                  : "COPIAR CHAVE PIX"}
              </button>
            </div>

            <div
              style={{
                marginTop: 20,
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 900,
                  color: "#d7b84c",
                  letterSpacing: 1.1,
                }}
              >
                PIX COPIA E COLA
              </div>

              <div
                style={{
                  marginTop: 7,
                  maxHeight: 92,
                  overflow: "auto",
                  padding: 12,
                  borderRadius: 11,
                  wordBreak:
                    "break-all",
                  background:
                    "rgba(255,255,255,0.045)",
                  border:
                    "1px solid rgba(255,255,255,0.11)",
                  fontFamily:
                    "monospace",
                  fontSize: 11,
                  lineHeight: 1.45,
                }}
              >
                {pixPayload ||
                  "Gerando PIX..."}
              </div>

              <button
                type="button"
                onClick={
                  copyPayload
                }
                disabled={
                  !pixPayload
                }
                style={{
                  ...primaryButton,
                  marginTop: 9,
                }}
              >
                {copiedPayload
                  ? "PIX COPIADO"
                  : "COPIAR PIX COPIA E COLA"}
              </button>
            </div>

            <div
              style={{
                marginTop: 20,
                padding: 15,
                borderRadius: 13,
                background:
                  "rgba(255,255,255,0.035)",
                border:
                  "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <strong>
                Envie o comprovante
              </strong>

              <p
                style={{
                  margin:
                    "8px 0 12px",
                  fontSize: 12.5,
                  lineHeight: 1.55,
                  opacity: 0.70,
                }}
              >
                Após o pagamento, envie o comprovante para liberação do acesso.
              </p>

              <button
                type="button"
                onClick={() =>
                  openWhatsApp(
                    email
                  )
                }
                style={
                  primaryButton
                }
              >
                ENVIAR COMPROVANTE PELO WHATSAPP
              </button>

              <div
                style={{
                  marginTop: 11,
                  display: "grid",
                  gap: 4,
                  textAlign: "center",
                  fontSize: 12,
                }}
              >
                <a
                  href="https://wa.me/5561999878710"
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    color: "#d7b84c",
                  }}
                >
                  {SUPPORT_DISPLAY}
                </a>

                <a
                  href={
                    "mailto:" +
                    SUPPORT_EMAIL
                  }
                  style={{
                    color: "#d7b84c",
                  }}
                >
                  {SUPPORT_EMAIL}
                </a>
              </div>
            </div>

            <div
              style={{
                marginTop: 18,
                padding: 15,
                borderRadius: 13,
                border:
                  active
                    ? "1px solid rgba(70,190,110,0.25)"
                    : "1px solid rgba(202,166,75,0.18)",
                background:
                  active
                    ? "rgba(70,190,110,0.08)"
                    : "rgba(202,166,75,0.05)",
              }}
            >
              <strong>
                {active
                  ? "Assinatura ativa"
                  : "Aguardando liberação"}
              </strong>

              <p
                style={{
                  margin:
                    "8px 0 0",
                  fontSize: 12.5,
                  lineHeight: 1.55,
                  opacity: 0.72,
                }}
              >
                {active
                  ? "Seu pagamento foi confirmado e o acesso está ativo."
                  : "O acesso será liberado após a confirmação administrativa do pagamento."}
              </p>

              {subscription?.endsAt ? (
                <div
                  style={{
                    marginTop: 8,
                    fontSize: 12.5,
                    opacity: 0.75,
                  }}
                >
                  Válida até:{" "}
                  {dateLabel(
                    subscription.endsAt
                  )}
                </div>
              ) : null}
            </div>

            <button
              type="button"
              onClick={
                verifyAccess
              }
              disabled={
                loading ||
                externalBusy
              }
              style={{
                ...primaryButton,
                marginTop: 18,
              }}
            >
              {externalBusy
                ? "VERIFICANDO..."
                : "VERIFICAR ACESSO"}
            </button>

            {typeof onLogout ===
            "function" ? (
              <button
                type="button"
                onClick={
                  onLogout
                }
                disabled={
                  externalBusy
                }
                style={{
                  width: "100%",
                  minHeight: 46,
                  marginTop: 9,
                  borderRadius: 12,
                  cursor: "pointer",
                  color: "#fff",
                  background:
                    "rgba(255,255,255,0.035)",
                  border:
                    "1px solid rgba(255,255,255,0.11)",
                  fontWeight: 900,
                }}
              >
                SAIR
              </button>
            ) : null}

            <div
              style={{
                marginTop: 18,
                textAlign: "center",
                fontSize: 11.5,
              }}
            >
              <a
                href="/termos"
                target="_blank"
                rel="noreferrer"
                style={{
                  color: "#d7b84c",
                }}
              >
                Termos de Uso
              </a>

              {" · "}

              <a
                href="/privacidade"
                target="_blank"
                rel="noreferrer"
                style={{
                  color: "#d7b84c",
                }}
              >
                Política de Privacidade
              </a>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}