import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  activateUserAccess,
  createAdminOperationId,
  getUserAccess,
  listUsers,
  revokeUserAccess,
} from "./userManagement.api";

import {
  updateAdminUserProfile,
} from "./userProfileAdmin.api";

/*
 * Fonte de verdade: backend de acesso
 *
 * Esta observação é interna e não aparece na interface.
 * Assinatura não é escrita diretamente pelo frontend.
 */

function clean(value) {
  return String(value ?? "").trim();
}

function onlyDigits(value) {
  return String(value ?? "")
    .replace(/\D+/g, "")
    .slice(0, 11);
}

function phoneMask(value) {
  const digits =
    onlyDigits(value);

  if (!digits) {
    return "";
  }

  if (digits.length <= 2) {
    return `(${digits}`;
  }

  if (digits.length <= 6) {
    return (
      `(${digits.slice(0, 2)}) ` +
      digits.slice(2)
    );
  }

  if (digits.length <= 10) {
    return (
      `(${digits.slice(0, 2)}) ` +
      `${digits.slice(2, 6)}-` +
      digits.slice(6)
    );
  }

  return (
    `(${digits.slice(0, 2)}) ` +
    `${digits.slice(2, 7)}-` +
    digits.slice(7)
  );
}

function asDate(value) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value;
  }

  if (
    typeof value?.toDate ===
    "function"
  ) {
    try {
      return value.toDate();
    } catch {
      return null;
    }
  }

  if (
    typeof value === "object" &&
    Number.isFinite(
      Number(value?.seconds)
    )
  ) {
    return new Date(
      Number(value.seconds) *
        1000
    );
  }

  const parsed =
    new Date(value);

  return Number.isNaN(
    parsed.getTime()
  )
    ? null
    : parsed;
}

function dateLabel(value) {
  const date =
    asDate(value);

  if (!date) {
    return "—";
  }

  return date.toLocaleString(
    "pt-BR",
    {
      dateStyle: "short",
      timeStyle: "short",
    }
  );
}

export default function UserManagementPage() {
  const [
    users,
    setUsers,
  ] =
    useState([]);

  const [
    selectedUid,
    setSelectedUid,
  ] =
    useState("");

  const [
    accessData,
    setAccessData,
  ] =
    useState(null);

  const [
    query,
    setQuery,
  ] =
    useState("");

  const [
    name,
    setName,
  ] =
    useState("");

  const [
    phone,
    setPhone,
  ] =
    useState("");

  const [
    loadingUsers,
    setLoadingUsers,
  ] =
    useState(true);

  const [
    loadingAccess,
    setLoadingAccess,
  ] =
    useState(false);

  const [
    savingProfile,
    setSavingProfile,
  ] =
    useState(false);

  const [
    savingAccess,
    setSavingAccess,
  ] =
    useState(false);

  const [
    error,
    setError,
  ] =
    useState("");

  const [
    success,
    setSuccess,
  ] =
    useState("");

  const selectedUser =
    useMemo(
      () =>
        users.find(
          (user) =>
            user.uid ===
            selectedUid
        ) || null,
      [
        users,
        selectedUid,
      ]
    );

  const filtered =
    useMemo(
      () => {
        const needle =
          clean(query)
            .toLocaleLowerCase(
              "pt-BR"
            );

        if (!needle) {
          return users;
        }

        return users.filter(
          (user) =>
            [
              user.name,
              user.email,
              user.phone,
            ]
              .map(
                (value) =>
                  clean(value)
                    .toLocaleLowerCase(
                      "pt-BR"
                    )
              )
              .join(" ")
              .includes(needle)
        );
      },
      [
        users,
        query,
      ]
    );

  const access =
    accessData?.access ||
    null;

  const subscription =
    access?.subscription ||
    null;

  const active =
    access?.accessGranted === true ||
    subscription?.active === true;

  const status =
    clean(
      subscription?.status
    ).toUpperCase() ||
    (
      active
        ? "ATIVO"
        : "INATIVO"
    );

  const loadAccess =
    useCallback(
      async (uid) => {
        const safeUid =
          clean(uid);

        if (!safeUid) {
          setAccessData(null);
          return;
        }

        setLoadingAccess(true);

        try {
          const result =
            await getUserAccess(
              safeUid
            );

          setAccessData(
            result || null
          );
        } catch (err) {
          setAccessData(null);

          setError(
            clean(
              err?.message
            ) ||
            "Não foi possível consultar o acesso."
          );
        } finally {
          setLoadingAccess(false);
        }
      },
      []
    );

  const loadUsers =
    useCallback(
      async (
        preserveUid = ""
      ) => {
        setLoadingUsers(true);
        setError("");

        try {
          const rows =
            await listUsers();

          setUsers(rows);

          setSelectedUid(
            (current) => {
              const wanted =
                preserveUid ||
                current;

              if (
                wanted &&
                rows.some(
                  (user) =>
                    user.uid ===
                    wanted
                )
              ) {
                return wanted;
              }

              return (
                rows[0]?.uid ||
                ""
              );
            }
          );
        } catch (err) {
          setError(
            clean(
              err?.message
            ) ||
            "Não foi possível carregar os usuários."
          );
        } finally {
          setLoadingUsers(false);
        }
      },
      []
    );

  useEffect(
    () => {
      loadUsers();
    },
    [
      loadUsers,
    ]
  );

  useEffect(
    () => {
      if (!selectedUser) {
        setName("");
        setPhone("");
        setAccessData(null);
        return;
      }

      setName(
        clean(
          selectedUser.name
        )
      );

      setPhone(
        phoneMask(
          selectedUser.phone
        )
      );

      setError("");
      setSuccess("");

      loadAccess(
        selectedUser.uid
      );
    },
    [
      selectedUser,
      loadAccess,
    ]
  );

  async function saveUser() {
    if (
      !selectedUser ||
      savingProfile
    ) {
      return;
    }

    setSavingProfile(true);
    setError("");
    setSuccess("");

    try {
      const updated =
        await updateAdminUserProfile(
          selectedUser.uid,
          {
            name,
            phone,
          }
        );

      setUsers(
        (current) =>
          current.map(
            (user) =>
              user.uid ===
              selectedUser.uid
                ? {
                    ...user,
                    name:
                      updated.name,
                    phone:
                      updated.phone,
                  }
                : user
          )
      );

      setName(
        updated.name
      );

      setPhone(
        updated.phone
      );

      setSuccess(
        "Dados do usuário atualizados."
      );
    } catch (err) {
      setError(
        clean(
          err?.message
        ) ||
        "Não foi possível salvar os dados."
      );
    } finally {
      setSavingProfile(false);
    }
  }

  async function activate() {
    if (
      !selectedUser ||
      savingAccess
    ) {
      return;
    }

    setSavingAccess(true);
    setError("");
    setSuccess("");

    try {
      const operationId =
        createAdminOperationId(
          "grant",
          selectedUser.uid
        );

      await activateUserAccess(
        selectedUser.uid,
        {
          operationId,

          paymentReference:
            "admin-manual",
        }
      );

      await loadAccess(
        selectedUser.uid
      );

      setSuccess(
        "Acesso ativado/renovado por 30 dias."
      );
    } catch (err) {
      setError(
        clean(
          err?.message
        ) ||
        "Não foi possível ativar o acesso."
      );
    } finally {
      setSavingAccess(false);
    }
  }

  async function revoke() {
    if (
      !selectedUser ||
      savingAccess
    ) {
      return;
    }

    if (
      typeof window !==
        "undefined" &&
      !window.confirm(
        "Revogar o acesso deste usuário?"
      )
    ) {
      return;
    }

    setSavingAccess(true);
    setError("");
    setSuccess("");

    try {
      const operationId =
        createAdminOperationId(
          "revoke",
          selectedUser.uid
        );

      await revokeUserAccess(
        selectedUser.uid,
        {
          operationId,

          reason:
            "Revogação administrativa",
        }
      );

      await loadAccess(
        selectedUser.uid
      );

      setSuccess(
        "Acesso revogado."
      );
    } catch (err) {
      setError(
        clean(
          err?.message
        ) ||
        "Não foi possível revogar o acesso."
      );
    } finally {
      setSavingAccess(false);
    }
  }

  const field = {
    width: "100%",
    minHeight: 44,
    boxSizing: "border-box",
    padding: "0 12px",
    borderRadius: 10,
    outline: "none",
    color: "#fff",
    background:
      "rgba(255,255,255,0.035)",
    border:
      "1px solid rgba(255,255,255,0.12)",
  };

  const button = {
    minHeight: 42,
    padding: "0 15px",
    borderRadius: 10,
    cursor: "pointer",
    fontWeight: 900,
  };

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent:
            "space-between",
          alignItems: "end",
          gap: 12,
          flexWrap: "wrap",
          marginBottom: 18,
        }}
      >
        <label
          style={{
            display: "grid",
            gap: 6,
            width:
              "min(100%,520px)",
          }}
        >
          <span
            style={{
              color: "#d8b94e",
              fontSize: 11,
              fontWeight: 900,
            }}
          >
            BUSCAR USUÁRIO
          </span>

          <input
            type="search"
            value={query}
            onChange={(event) =>
              setQuery(
                event.target.value
              )
            }
            placeholder="Nome, e-mail ou telefone"
            style={field}
          />
        </label>

        <button
          type="button"
          disabled={loadingUsers}
          onClick={() =>
            loadUsers(
              selectedUid
            )
          }
          style={{
            ...button,
            color: "#fff",
            background:
              "rgba(202,166,75,0.10)",
            border:
              "1px solid rgba(202,166,75,0.34)",
          }}
        >
          ATUALIZAR
        </button>
      </div>

      {error ? (
        <div
          role="alert"
          style={{
            marginBottom: 12,
            padding: 11,
            borderRadius: 9,
            color: "#ffb0b0",
            background:
              "rgba(200,50,50,0.07)",
            border:
              "1px solid rgba(255,90,90,0.22)",
          }}
        >
          {error}
        </div>
      ) : null}

      {success ? (
        <div
          role="status"
          style={{
            marginBottom: 12,
            padding: 11,
            borderRadius: 9,
            color: "#b6edc7",
            background:
              "rgba(60,180,100,0.07)",
            border:
              "1px solid rgba(70,190,110,0.23)",
          }}
        >
          {success}
        </div>
      ) : null}

      <div
        className="jb-admin-users-grid"
        style={{
          display: "grid",
          gridTemplateColumns:
            "minmax(250px,330px) minmax(0,1fr)",
          gap: 16,
          alignItems: "start",
        }}
      >
        <aside
          style={{
            overflow: "hidden",
            borderRadius: 13,
            border:
              "1px solid rgba(202,166,75,0.20)",
            background:
              "rgba(255,255,255,0.018)",
          }}
        >
          <div
            style={{
              padding: "10px 13px",
              fontSize: 12,
              opacity: 0.58,
              borderBottom:
                "1px solid rgba(255,255,255,0.06)",
            }}
          >
            {filtered.length}
            {" usuário(s)"}
          </div>

          <div
            style={{
              maxHeight: "67vh",
              overflowY: "auto",
            }}
          >
            {loadingUsers ? (
              <div
                style={{
                  padding: 18,
                  opacity: 0.6,
                }}
              >
                Carregando...
              </div>
            ) : filtered.length === 0 ? (
              <div
                style={{
                  padding: 18,
                  opacity: 0.6,
                }}
              >
                Nenhum usuário encontrado.
              </div>
            ) : (
              filtered.map(
                (user) => (
                  <button
                    key={user.uid}
                    type="button"
                    onClick={() =>
                      setSelectedUid(
                        user.uid
                      )
                    }
                    style={{
                      width: "100%",
                      display: "grid",
                      gap: 3,
                      padding:
                        "12px 13px",
                      cursor: "pointer",
                      textAlign: "left",
                      border: 0,
                      color: "#fff",
                      borderBottom:
                        "1px solid rgba(255,255,255,0.055)",
                      background:
                        user.uid ===
                        selectedUid
                          ? "rgba(202,166,75,0.12)"
                          : "transparent",
                    }}
                  >
                    <strong>
                      {user.name ||
                        "Sem nome"}
                    </strong>

                    <span
                      style={{
                        fontSize: 12,
                        opacity: 0.62,
                      }}
                    >
                      {user.email ||
                        "Sem e-mail"}
                    </span>

                    <span
                      style={{
                        color: "#d8b94e",
                        fontSize: 11,
                      }}
                    >
                      {user.phone ||
                        "Sem telefone"}
                    </span>
                  </button>
                )
              )
            )}
          </div>
        </aside>

        <section>
          {!selectedUser ? (
            <div
              style={{
                padding: 28,
                textAlign: "center",
                opacity: 0.58,
              }}
            >
              Selecione um usuário.
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gap: 13,
              }}
            >
              <article
                style={{
                  padding: 18,
                  borderRadius: 13,
                  background:
                    "rgba(255,255,255,0.018)",
                  border:
                    "1px solid rgba(202,166,75,0.20)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent:
                      "space-between",
                    alignItems: "center",
                    gap: 12,
                    flexWrap: "wrap",
                  }}
                >
                  <div>
                    <div
                      style={{
                        color: "#d8b94e",
                        fontSize: 11,
                        fontWeight: 900,
                      }}
                    >
                      DADOS DO USUÁRIO
                    </div>

                    <h2
                      style={{
                        margin: "4px 0 0",
                      }}
                    >
                      {selectedUser.name ||
                        "Sem nome"}
                    </h2>
                  </div>

                  <strong
                    style={{
                      color:
                        active
                          ? "#9be7b2"
                          : "#e3c663",
                    }}
                  >
                    {loadingAccess
                      ? "CONSULTANDO..."
                      : status}
                  </strong>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      "repeat(auto-fit,minmax(200px,1fr))",
                    gap: 11,
                    marginTop: 17,
                  }}
                >
                  <label
                    style={{
                      display: "grid",
                      gap: 5,
                    }}
                  >
                    <span>Nome</span>

                    <input
                      value={name}
                      onChange={(event) =>
                        setName(
                          event.target.value
                        )
                      }
                      style={field}
                    />
                  </label>

                  <label
                    style={{
                      display: "grid",
                      gap: 5,
                    }}
                  >
                    <span>Telefone</span>

                    <input
                      value={phone}
                      inputMode="numeric"
                      onChange={(event) =>
                        setPhone(
                          phoneMask(
                            event.target.value
                          )
                        )
                      }
                      style={field}
                    />
                  </label>

                  <label
                    style={{
                      display: "grid",
                      gap: 5,
                    }}
                  >
                    <span>E-mail</span>

                    <input
                      value={
                        selectedUser.email ||
                        ""
                      }
                      readOnly
                      style={{
                        ...field,
                        opacity: 0.6,
                        cursor:
                          "not-allowed",
                      }}
                    />
                  </label>
                </div>

                <div
                  style={{
                    marginTop: 14,
                    display: "flex",
                    justifyContent:
                      "space-between",
                    alignItems: "center",
                    gap: 10,
                    flexWrap: "wrap",
                  }}
                >
                  <span
                    style={{
                      fontSize: 11,
                      opacity: 0.55,
                    }}
                  >
                    Cadastro:{" "}
                    {dateLabel(
                      selectedUser.createdAt
                    )}
                  </span>

                  <button
                    type="button"
                    onClick={saveUser}
                    disabled={savingProfile}
                    style={{
                      ...button,
                      color: "#171109",
                      background:
                        "#d8b94e",
                      border:
                        "1px solid #d8b94e",
                    }}
                  >
                    {savingProfile
                      ? "SALVANDO..."
                      : "SALVAR DADOS"}
                  </button>
                </div>
              </article>

              <article
                style={{
                  padding: 18,
                  borderRadius: 13,
                  background:
                    "rgba(255,255,255,0.018)",
                  border:
                    "1px solid rgba(202,166,75,0.20)",
                }}
              >
                <div
                  style={{
                    color: "#d8b94e",
                    fontSize: 11,
                    fontWeight: 900,
                  }}
                >
                  ACESSO
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: 28,
                    flexWrap: "wrap",
                    marginTop: 11,
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: 11,
                        opacity: 0.55,
                      }}
                    >
                      Situação
                    </div>

                    <strong>
                      {status}
                    </strong>
                  </div>

                  <div>
                    <div
                      style={{
                        fontSize: 11,
                        opacity: 0.55,
                      }}
                    >
                      Validade
                    </div>

                    <strong>
                      {dateLabel(
                        subscription?.endsAt
                      )}
                    </strong>
                  </div>

                  <div>
                    <div
                      style={{
                        fontSize: 11,
                        opacity: 0.55,
                      }}
                    >
                      Plano
                    </div>

                    <strong>
                      R$ 49,90 · 30 dias
                    </strong>
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: 9,
                    flexWrap: "wrap",
                    marginTop: 16,
                  }}
                >
                  <button
                    type="button"
                    onClick={activate}
                    disabled={savingAccess}
                    style={{
                      ...button,
                      color: "#171109",
                      background:
                        "#d8b94e",
                      border:
                        "1px solid #d8b94e",
                    }}
                  >
                    ATIVAR / RENOVAR +30 DIAS
                  </button>

                  <button
                    type="button"
                    onClick={revoke}
                    disabled={
                      savingAccess ||
                      !active
                    }
                    style={{
                      ...button,
                      color: "#ffabab",
                      background:
                        "rgba(180,40,40,0.07)",
                      border:
                        "1px solid rgba(255,100,100,0.22)",
                    }}
                  >
                    REVOGAR ACESSO
                  </button>
                </div>
              </article>
            </div>
          )}
        </section>
      </div>

      <style>
        {`
          @media (max-width: 760px) {
            .jb-admin-users-grid {
              grid-template-columns: 1fr !important;
            }
          }
        `}
      </style>
    </div>
  );
}