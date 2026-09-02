import React, {
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  getAccessProduct,
  getMyAccess,
} from "../../services/accessClient";


function money(
  cents,
  currency = "BRL"
) {
  const value =
    Number(cents);

  if (
    !Number.isFinite(
      value
    )
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


export default function Payments() {
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
    copied,
    setCopied,
  ] =
    useState(false);


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
          console.error(
            "[PAYMENTS] Falha:",
            err
          );

          setError(
            err?.message ||
            "Nao foi possivel carregar os dados da assinatura."
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


  async function copyPix() {
    const key =
      String(
        product?.pixKey || ""
      ).trim();

    if (!key) {
      return;
    }

    try {
      await navigator.clipboard
        .writeText(key);

      setCopied(true);

      window.setTimeout(
        () =>
          setCopied(false),
        1800
      );
    }
    catch {
      setError(
        "Nao foi possivel copiar a chave PIX."
      );
    }
  }


  const subscription =
    access?.subscription ||
    null;

  const active =
    access?.accessGranted ===
      true ||
    subscription?.active ===
      true;

  const pixKey =
    String(
      product?.pixKey || ""
    ).trim();

  const pixReceiver =
    String(
      product?.pixReceiver || ""
    ).trim();


  return (
    <div
      style={{
        padding:
          22,

        color:
          "rgba(255,255,255,0.94)",
      }}
    >
      <div
        style={{
          maxWidth:
            720,

          margin:
            "0 auto",

          borderRadius:
            20,

          border:
            "1px solid rgba(202,166,75,0.24)",

          background:
            "linear-gradient(180deg, rgba(20,16,7,0.96), rgba(3,3,3,0.98))",

          boxShadow:
            "0 22px 70px rgba(0,0,0,0.42)",

          padding:
            22,
        }}
      >
        <div
          style={{
            fontSize:
              21,

            fontWeight:
              950,
          }}
        >
          Assinatura PalPitaco JB
        </div>

        <div
          style={{
            marginTop:
              7,

            opacity:
              0.72,

            lineHeight:
              1.5,
          }}
        >
          Acesso premium por 30 dias.
        </div>

        {loading ? (
          <div
            style={{
              marginTop:
                22,
            }}
          >
            Carregando...
          </div>
        ) : null}

        {error ? (
          <div
            style={{
              marginTop:
                18,

              padding:
                12,

              borderRadius:
                10,

              color:
                "#ffb5b5",

              background:
                "rgba(255,80,80,0.08)",

              border:
                "1px solid rgba(255,100,100,0.22)",
            }}
          >
            {error}
          </div>
        ) : null}

        {!loading &&
        product ? (
          <>
            <div
              style={{
                display:
                  "grid",

                gridTemplateColumns:
                  "repeat(auto-fit,minmax(145px,1fr))",

                gap:
                  10,

                marginTop:
                  22,
              }}
            >
              <div
                style={{
                  padding:
                    14,

                  borderRadius:
                    13,

                  background:
                    "rgba(255,255,255,0.045)",
                }}
              >
                <div
                  style={{
                    fontSize:
                      11,

                    opacity:
                      0.6,
                  }}
                >
                  VALOR
                </div>

                <div
                  style={{
                    marginTop:
                      5,

                    fontSize:
                      24,

                    fontWeight:
                      950,
                  }}
                >
                  {money(
                    product.priceCents,
                    product.currency
                  )}
                </div>
              </div>

              <div
                style={{
                  padding:
                    14,

                  borderRadius:
                    13,

                  background:
                    "rgba(255,255,255,0.045)",
                }}
              >
                <div
                  style={{
                    fontSize:
                      11,

                    opacity:
                      0.6,
                  }}
                >
                  VALIDADE
                </div>

                <div
                  style={{
                    marginTop:
                      5,

                    fontSize:
                      20,

                    fontWeight:
                      900,
                  }}
                >
                  {product.durationDays} dias
                </div>
              </div>

              <div
                style={{
                  padding:
                    14,

                  borderRadius:
                    13,

                  background:
                    "rgba(255,255,255,0.045)",
                }}
              >
                <div
                  style={{
                    fontSize:
                      11,

                    opacity:
                      0.6,
                  }}
                >
                  PAGAMENTO
                </div>

                <div
                  style={{
                    marginTop:
                      5,

                    fontSize:
                      20,

                    fontWeight:
                      900,
                  }}
                >
                  {product.paymentMethod}
                </div>
              </div>
            </div>

            <div
              style={{
                marginTop:
                  20,

                padding:
                  16,

                borderRadius:
                  14,

                border:
                  "1px solid rgba(202,166,75,0.20)",

                background:
                  "rgba(202,166,75,0.06)",
              }}
            >
              <div
                style={{
                  fontWeight:
                    900,
                }}
              >
                Pagamento via PIX
              </div>

              {pixKey ? (
                <>
                  {pixReceiver ? (
                    <div
                      style={{
                        marginTop:
                          10,

                        fontSize:
                          13,

                        opacity:
                          0.72,
                      }}
                    >
                      Favorecido: {pixReceiver}
                    </div>
                  ) : null}

                  <div
                    style={{
                      marginTop:
                        8,

                      padding:
                        12,

                      borderRadius:
                        10,

                      wordBreak:
                        "break-all",

                      background:
                        "rgba(0,0,0,0.32)",

                      fontWeight:
                        850,
                    }}
                  >
                    {pixKey}
                  </div>

                  <button
                    type="button"
                    onClick={
                      copyPix
                    }
                    style={{
                      width:
                        "100%",

                      minHeight:
                        46,

                      marginTop:
                        12,

                      borderRadius:
                        11,

                      cursor:
                        "pointer",

                      fontWeight:
                        900,

                      color:
                        "#fff",

                      border:
                        "1px solid rgba(202,166,75,0.42)",

                      background:
                        "rgba(202,166,75,0.12)",
                    }}
                  >
                    {copied
                      ? "CHAVE COPIADA"
                      : "COPIAR CHAVE PIX"}
                  </button>

                  <div
                    style={{
                      marginTop:
                        12,

                      fontSize:
                        12.5,

                      lineHeight:
                        1.5,

                      opacity:
                        0.72,
                    }}
                  >
                    A ativacao ou renovacao ocorre apos a confirmacao administrativa do pagamento.
                  </div>
                </>
              ) : (
                <div
                  style={{
                    marginTop:
                      12,

                    lineHeight:
                      1.5,

                    color:
                      "#e4c979",
                  }}
                >
                  A chave PIX ainda nao esta configurada. Nao realize pagamento ate ela aparecer nesta tela.
                </div>
              )}
            </div>

            <div
              style={{
                marginTop:
                  20,

                padding:
                  16,

                borderRadius:
                  14,

                background:
                  active
                    ? "rgba(70,190,110,0.08)"
                    : "rgba(255,255,255,0.04)",

                border:
                  active
                    ? "1px solid rgba(70,190,110,0.22)"
                    : "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <div
                style={{
                  fontWeight:
                    900,
                }}
              >
                Status da assinatura
              </div>

              <div
                style={{
                  marginTop:
                    8,

                  fontSize:
                    18,

                  fontWeight:
                    950,
                }}
              >
                {active
                  ? "ATIVA"
                  : String(
                      subscription?.status ||
                      "SEM ACESSO"
                    ).toUpperCase()}
              </div>

              {subscription?.endsAt ? (
                <div
                  style={{
                    marginTop:
                      7,

                    fontSize:
                      13,

                    opacity:
                      0.72,
                  }}
                >
                  Valida ate:{" "}
                  {dateLabel(
                    subscription.endsAt
                  )}
                </div>
              ) : null}

              <button
                type="button"
                onClick={load}
                disabled={loading}
                style={{
                  minHeight:
                    42,

                  marginTop:
                    12,

                  padding:
                    "0 16px",

                  borderRadius:
                    10,

                  cursor:
                    "pointer",

                  color:
                    "#fff",

                  border:
                    "1px solid rgba(255,255,255,0.14)",

                  background:
                    "rgba(255,255,255,0.06)",
                }}
              >
                ATUALIZAR STATUS
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
