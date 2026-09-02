import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  activateUserAccess,
  createAdminOperationId,
  deleteUserAccount,
  getUserAccess,
  listUsers,
  revokeUserAccess,
} from "./userManagement.api";

import {
  updateAdminUserProfile,
} from "./userProfileAdmin.api";

/*
 * Fonte de verdade: backend de acesso.
 *
 * "revoke" permanece apenas como operação técnica interna.
 * Para o Admin, o conceito operacional é SUSPENDER.
 */

function clean(value) {
  return String(
    value ?? ""
  ).trim();
}

function onlyDigits(value) {
  return clean(value)
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
    }
    catch {
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
      dateStyle:
        "short",

      timeStyle:
        "short",
    }
  );
}

function statusFromAccess(
  response
) {
  const access =
    response?.access || null;

  const subscription =
    access?.subscription || null;

  if (
    access?.accessGranted === true ||
    subscription?.active === true
  ) {
    return "ATIVO";
  }

  const stored =
    clean(
      subscription?.status
    ).toUpperCase();

  if (stored === "REVOKED") {
    return "SUSPENSO";
  }

  if (stored === "EXPIRED") {
    return "EXPIRADO";
  }

  return "PENDENTE";
}

function statusColor(status) {
  if (status === "ATIVO") {
    return "#9be7b2";
  }

  if (status === "SUSPENSO") {
    return "#ffaaaa";
  }

  if (status === "EXPIRADO") {
    return "#ffbf8a";
  }

  return "#e5ca66";
}

function adminErrorMessage(
  error,
  fallback
) {
  const code =
    clean(
      error?.code ||
      error?.payload?.error
    ).toUpperCase();

  const messages = {
    TARGET_USER_EMAIL_REQUIRED:
      "Este cadastro não possui e-mail.",

    TARGET_USER_NOT_FOUND:
      "A conta de login deste cadastro não foi encontrada.",

    TARGET_USER_DISABLED:
      "A conta de login deste cadastro está desativada.",

    ADMIN_SELF_DELETE_FORBIDDEN:
      "A conta Admin que está em uso não pode ser excluída.",

    UID_REQUIRED:
      "Identificador do usuário ausente.",

    INVALID_SUBSCRIPTION_DAYS:
      "Informe uma quantidade de dias válida.",

    VALID_OPERATION_ID_REQUIRED:
      "Não foi possível identificar a operação. Tente novamente.",

    OPERATION_ID_CONFLICT:
      "Esta operação já foi processada. Atualize a página e tente novamente.",
  };

  return (
    messages[code] ||
    clean(error?.message) ||
    fallback
  );
}

export default function UserManagementPage() {
  const [users, setUsers] =
    useState([]);

  const [
    selectedUid,
    setSelectedUid,
  ] =
    useState("");

  const [
    accessResponse,
    setAccessResponse,
  ] =
    useState(null);

  const [search, setSearch] =
    useState("");

  const [name, setName] =
    useState("");

  const [phone, setPhone] =
    useState("");

  const [days, setDays] =
    useState("30");

  const [editing, setEditing] =
    useState(false);

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
    deleting,
    setDeleting,
  ] =
    useState(false);

  const [error, setError] =
    useState("");

  const [success, setSuccess] =
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

  const filteredUsers =
    useMemo(
      () => {
        const q =
          clean(search)
            .toLocaleLowerCase(
              "pt-BR"
            );

        if (!q) {
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
              .includes(q)
        );
      },
      [
        users,
        search,
      ]
    );

  const status =
    useMemo(
      () =>
        statusFromAccess(
          accessResponse
        ),
      [
        accessResponse,
      ]
    );

  const active =
    status === "ATIVO";

  const suspended =
    status === "SUSPENSO";

  const subscription =
    accessResponse
      ?.access
      ?.subscription ||
    null;

  const actionLabel =
    active
      ? "RENOVAR"
      : suspended
        ? "REATIVAR"
        : "LIBERAR";

  const loadAccess =
    useCallback(
      async (uid) => {
        const safeUid =
          clean(uid);

        if (!safeUid) {
          setAccessResponse(null);
          return;
        }

        setLoadingAccess(true);

        try {
          const response =
            await getUserAccess(
              safeUid
            );

          setAccessResponse(
            response || null
          );
        }
        catch (err) {
          setAccessResponse(null);

          setError(
            adminErrorMessage(
              err,
              "Não foi possível consultar o acesso."
            )
          );
        }
        finally {
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
        }
        catch (err) {
          setError(
            clean(
              err?.message
            ) ||
            "Não foi possível carregar os usuários."
          );
        }
        finally {
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
        setEditing(false);
        setAccessResponse(null);
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

      setEditing(false);
      setError("");
      setSuccess("");

      loadAccess(
        selectedUser.uid
      );
    },
    [
      selectedUid,
      selectedUser?.uid,
      loadAccess,
    ]
  );

  async function saveProfile() {
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

      setEditing(false);

      setSuccess(
        "Dados do usuário atualizados."
      );
    }
    catch (err) {
      setError(
            adminErrorMessage(
              err,
              "Não foi possível salvar os dados."
            )
          );
    }
    finally {
      setSavingProfile(false);
    }
  }

  async function grantOrRenew() {
    if (
      !selectedUser ||
      savingAccess
    ) {
      return;
    }

    const safeDays =
      Number(days);

    if (
      !Number.isSafeInteger(
        safeDays
      ) ||
      safeDays < 1 ||
      safeDays > 3650
    ) {
      setError(
        "Informe uma quantidade de dias entre 1 e 3650."
      );

      return;
    }

    if (!selectedUser.email) {
      setError(
        "Este cadastro não possui e-mail."
      );

      return;
    }

    const action =
      actionLabel;

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

          days:
            safeDays,
        }
      );

      await loadAccess(
        selectedUser.uid
      );

      if (action === "RENOVAR") {
        setSuccess(
          `Assinatura renovada por mais ${safeDays} dia(s).`
        );
      }
      else if (
        action === "REATIVAR"
      ) {
        setSuccess(
          `Acesso reativado por ${safeDays} dia(s).`
        );
      }
      else {
        setSuccess(
          `Acesso liberado por ${safeDays} dia(s).`
        );
      }
    }
    catch (err) {
      setError(
            adminErrorMessage(
              err,
              "Não foi possível alterar o acesso."
            )
          );
    }
    finally {
      setSavingAccess(false);
    }
  }

  async function suspend() {
    if (
      !selectedUser ||
      savingAccess ||
      !active
    ) {
      return;
    }

    if (
      typeof window !==
        "undefined" &&
      !window.confirm(
        "Suspender o acesso deste usuário?"
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
            "Suspensão administrativa",
        }
      );

      await loadAccess(
        selectedUser.uid
      );

      setSuccess(
        "Acesso suspenso."
      );
    }
    catch (err) {
      setError(
            adminErrorMessage(
              err,
              "Não foi possível suspender o acesso."
            )
          );
    }
    finally {
      setSavingAccess(false);
    }
  }

  async function removeUser() {
    if (
      !selectedUser ||
      deleting
    ) {
      return;
    }

    const identity =
      selectedUser.name ||
      selectedUser.email ||
      "este usuário";

    if (
      typeof window !==
        "undefined" &&
      !window.confirm(
        `Excluir definitivamente ${identity}? Esta ação remove login, cadastro e acesso e não pode ser desfeita.`
      )
    ) {
      return;
    }

    setDeleting(true);
    setError("");
    setSuccess("");

    try {
      const uid =
        selectedUser.uid;

      await deleteUserAccount(
        uid
      );

      const remaining =
        users.filter(
          (user) =>
            user.uid !== uid
        );

      setUsers(
        remaining
      );

      setSelectedUid(
        remaining[0]?.uid ||
        ""
      );

      setAccessResponse(null);

      setSuccess(
        "Usuário excluído definitivamente."
      );
    }
    catch (err) {
      const code =
        clean(
          err?.code
        );

      if (
        code ===
        "ADMIN_SELF_DELETE_FORBIDDEN"
      ) {
        setError(
          "A conta Admin que está em uso não pode ser excluída."
        );
      }
      else {
        setError(
            adminErrorMessage(
              err,
              "Não foi possível excluir o usuário."
            )
          );
      }
    }
    finally {
      setDeleting(false);
    }
  }

  const inputStyle = {
    width:
      "100%",

    minHeight:
      44,

    boxSizing:
      "border-box",

    padding:
      "0 12px",

    borderRadius:
      10,

    outline:
      "none",

    color:
      "#fff",

    background:
      "rgba(255,255,255,0.035)",

    border:
      "1px solid rgba(255,255,255,0.12)",
  };

  const buttonStyle = {
    minHeight:
      42,

    padding:
      "0 15px",

    borderRadius:
      10,

    cursor:
      "pointer",

    fontWeight:
      900,
  };

  return (
    <section>
      <div
        style={{
          display:
            "flex",

          alignItems:
            "end",

          justifyContent:
            "space-between",

          gap:
            12,

          flexWrap:
            "wrap",

          marginBottom:
            18,
        }}
      >
        <div>
          <div
            style={{
              color:
                "#d8b94e",

              fontSize:
                11,

              fontWeight:
                900,

              letterSpacing:
                1,
            }}
          >
            USUÁRIOS
          </div>

          <h1
            style={{
              margin:
                "5px 0 0",

              fontSize:
                27,
            }}
          >
            Usuários cadastrados
          </h1>
        </div>

        <button
          type="button"
          onClick={() =>
            loadUsers(
              selectedUid
            )
          }
          disabled={
            loadingUsers
          }
          style={{
            ...buttonStyle,

            color:
              "#fff",

            background:
              "rgba(202,166,75,0.10)",

            border:
              "1px solid rgba(202,166,75,0.34)",
          }}
        >
          ATUALIZAR
        </button>
      </div>

      <label
        style={{
          display:
            "grid",

          gap:
            6,

          marginBottom:
            14,
        }}
      >
        <span
          style={{
            color:
              "#d8b94e",

            fontSize:
              10,

            fontWeight:
              900,
          }}
        >
          BUSCAR
        </span>

        <input
          type="search"
          value={search}
          onChange={
            (event) =>
              setSearch(
                event.target.value
              )
          }
          placeholder="Nome, e-mail ou telefone"
          style={inputStyle}
        />
      </label>

      {error ? (
        <div
          role="alert"
          style={{
            marginBottom:
              12,

            padding:
              11,

            borderRadius:
              9,

            color:
              "#ffaaaa",

            border:
              "1px solid rgba(220,80,80,.28)",

            background:
              "rgba(120,30,30,.13)",
          }}
        >
          {error}
        </div>
      ) : null}

      {success ? (
        <div
          role="status"
          style={{
            marginBottom:
              12,

            padding:
              11,

            borderRadius:
              9,

            color:
              "#a7e8ba",

            border:
              "1px solid rgba(70,180,105,.28)",

            background:
              "rgba(25,95,48,.13)",
          }}
        >
          {success}
        </div>
      ) : null}

      <div
        className="jb-admin-users-grid"
        style={{
          display:
            "grid",

          gridTemplateColumns:
            "minmax(250px,330px) minmax(0,1fr)",

          gap:
            16,

          alignItems:
            "start",
        }}
      >
        <aside
          style={{
            borderRadius:
              13,

            overflow:
              "hidden",

            border:
              "1px solid rgba(202,166,75,0.20)",

            background:
              "rgba(255,255,255,0.018)",
          }}
        >
          <div
            style={{
              padding:
                "10px 13px",

              fontSize:
                12,

              opacity:
                0.58,

              borderBottom:
                "1px solid rgba(255,255,255,0.06)",
            }}
          >
            {filteredUsers.length}
            {" usuário(s)"}
          </div>

          <div
            style={{
              maxHeight:
                "65vh",

              overflowY:
                "auto",
            }}
          >
            {loadingUsers ? (
              <div
                style={{
                  padding:
                    17,

                  opacity:
                    0.6,
                }}
              >
                Carregando...
              </div>
            ) : filteredUsers.length === 0 ? (
              <div
                style={{
                  padding:
                    17,

                  opacity:
                    0.6,
                }}
              >
                Nenhum usuário encontrado.
              </div>
            ) : (
              filteredUsers.map(
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
                      width:
                        "100%",

                      display:
                        "grid",

                      gap:
                        3,

                      padding:
                        "12px 13px",

                      cursor:
                        "pointer",

                      textAlign:
                        "left",

                      color:
                        "#fff",

                      border:
                        0,

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
                        fontSize:
                          12,

                        opacity:
                          0.62,
                      }}
                    >
                      {user.email ||
                        "Sem e-mail"}
                    </span>

                    <span
                      style={{
                        color:
                          "#d8b94e",

                        fontSize:
                          11,
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

        <main>
          {!selectedUser ? (
            <div
              style={{
                padding:
                  28,

                textAlign:
                  "center",

                opacity:
                  0.58,
              }}
            >
              Selecione um usuário.
            </div>
          ) : (
            <div
              style={{
                display:
                  "grid",

                gap:
                  13,
              }}
            >
              <article
                style={{
                  padding:
                    18,

                  borderRadius:
                    13,

                  background:
                    "rgba(255,255,255,0.018)",

                  border:
                    "1px solid rgba(202,166,75,0.20)",
                }}
              >
                <div
                  style={{
                    display:
                      "flex",

                    justifyContent:
                      "space-between",

                    alignItems:
                      "center",

                    gap:
                      12,

                    flexWrap:
                      "wrap",
                  }}
                >
                  <div>
                    <div
                      style={{
                        color:
                          "#d8b94e",

                        fontSize:
                          10,

                        fontWeight:
                          900,
                      }}
                    >
                      DADOS DO USUÁRIO
                    </div>

                    <h2
                      style={{
                        margin:
                          "5px 0 0",
                      }}
                    >
                      {selectedUser.name ||
                        "Sem nome"}
                    </h2>
                  </div>

                  <strong
                    style={{
                      color:
                        statusColor(
                          status
                        ),
                    }}
                  >
                    {loadingAccess
                      ? "CONSULTANDO..."
                      : status}
                  </strong>
                </div>

                {editing ? (
                  <div
                    style={{
                      display:
                        "grid",

                      gridTemplateColumns:
                        "repeat(auto-fit,minmax(190px,1fr))",

                      gap:
                        11,

                      marginTop:
                        17,
                    }}
                  >
                    <label>
                      <span>Nome</span>

                      <input
                        value={name}
                        onChange={
                          (event) =>
                            setName(
                              event
                                .target
                                .value
                            )
                        }
                        style={{
                          ...inputStyle,
                          marginTop:
                            5,
                        }}
                      />
                    </label>

                    <label>
                      <span>
                        Telefone
                      </span>

                      <input
                        value={phone}
                        onChange={
                          (event) =>
                            setPhone(
                              phoneMask(
                                event
                                  .target
                                  .value
                              )
                            )
                        }
                        inputMode="numeric"
                        style={{
                          ...inputStyle,
                          marginTop:
                            5,
                        }}
                      />
                    </label>

                    <label>
                      <span>E-mail</span>

                      <input
                        value={
                          selectedUser.email ||
                          ""
                        }
                        readOnly
                        style={{
                          ...inputStyle,

                          marginTop:
                            5,

                          opacity:
                            0.6,

                          cursor:
                            "not-allowed",
                        }}
                      />
                    </label>
                  </div>
                ) : (
                  <div
                    style={{
                      display:
                        "grid",

                      gridTemplateColumns:
                        "repeat(auto-fit,minmax(180px,1fr))",

                      gap:
                        13,

                      marginTop:
                        17,

                      paddingTop:
                        14,

                      borderTop:
                        "1px solid rgba(255,255,255,0.06)",
                    }}
                  >
                    <div>
                      <small
                        style={{
                          opacity:
                            0.55,
                        }}
                      >
                        E-MAIL
                      </small>

                      <div>
                        {selectedUser.email ||
                          "—"}
                      </div>
                    </div>

                    <div>
                      <small
                        style={{
                          opacity:
                            0.55,
                        }}
                      >
                        TELEFONE
                      </small>

                      <div>
                        {selectedUser.phone ||
                          "—"}
                      </div>
                    </div>

                    <div>
                      <small
                        style={{
                          opacity:
                            0.55,
                        }}
                      >
                        CADASTRO
                      </small>

                      <div>
                        {dateLabel(
                          selectedUser
                            .createdAt
                        )}
                      </div>
                    </div>
                  </div>
                )}

                <div
                  style={{
                    display:
                      "flex",

                    gap:
                      8,

                    flexWrap:
                      "wrap",

                    marginTop:
                      14,
                  }}
                >
                  {!editing ? (
                    <button
                      type="button"
                      onClick={() =>
                        setEditing(
                          true
                        )
                      }
                      style={{
                        ...buttonStyle,

                        color:
                          "#fff",

                        background:
                          "rgba(255,255,255,0.04)",

                        border:
                          "1px solid rgba(216,185,78,.32)",
                      }}
                    >
                      EDITAR
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={
                          saveProfile
                        }
                        disabled={
                          savingProfile
                        }
                        style={{
                          ...buttonStyle,

                          color:
                            "#171107",

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

                      <button
                        type="button"
                        onClick={() => {
                          setName(
                            clean(
                              selectedUser
                                .name
                            )
                          );

                          setPhone(
                            phoneMask(
                              selectedUser
                                .phone
                            )
                          );

                          setEditing(
                            false
                          );
                        }}
                        style={{
                          ...buttonStyle,

                          color:
                            "#fff",

                          background:
                            "transparent",

                          border:
                            "1px solid rgba(255,255,255,.14)",
                        }}
                      >
                        CANCELAR
                      </button>
                    </>
                  )}
                </div>
              </article>

              <article
                style={{
                  padding:
                    18,

                  borderRadius:
                    13,

                  background:
                    "rgba(255,255,255,0.018)",

                  border:
                    "1px solid rgba(202,166,75,0.20)",
                }}
              >
                <div
                  style={{
                    display:
                      "flex",

                    alignItems:
                      "center",

                    justifyContent:
                      "space-between",

                    gap:
                      12,

                    flexWrap:
                      "wrap",
                  }}
                >
                  <div>
                    <div
                      style={{
                        color:
                          "#d8b94e",

                        fontSize:
                          10,

                        fontWeight:
                          900,
                      }}
                    >
                      ACESSO
                    </div>

                    <h3
                      style={{
                        margin:
                          "5px 0 0",
                      }}
                    >
                      Assinatura Palpitaco JB
                    </h3>
                  </div>

                  <strong
                    style={{
                      color:
                        statusColor(
                          status
                        ),
                    }}
                  >
                    {status}
                  </strong>
                </div>

                <div
                  style={{
                    display:
                      "grid",

                    gridTemplateColumns:
                      "repeat(auto-fit,minmax(150px,1fr))",

                    gap:
                      10,

                    marginTop:
                      17,
                  }}
                >
                  <div>
                    <small
                      style={{
                        opacity:
                          0.55,
                      }}
                    >
                      SITUAÇÃO
                    </small>

                    <div>
                      {status}
                    </div>
                  </div>

                  <div>
                    <small
                      style={{
                        opacity:
                          0.55,
                      }}
                    >
                      VALIDADE
                    </small>

                    <div>
                      {dateLabel(
                        subscription?.endsAt
                      )}
                    </div>
                  </div>

                  <label>
                    <small
                      style={{
                        display:
                          "block",

                        opacity:
                          0.55,

                        marginBottom:
                          5,
                      }}
                    >
                      DIAS
                    </small>

                    <input
                      type="number"
                      min="1"
                      max="3650"
                      step="1"
                      value={days}
                      onChange={
                        (event) =>
                          setDays(
                            event.target
                              .value
                          )
                      }
                      style={inputStyle}
                    />
                  </label>
                </div>

                <div
                  style={{
                    display:
                      "flex",

                    gap:
                      8,

                    flexWrap:
                      "wrap",

                    marginTop:
                      16,
                  }}
                >
                  <button
                    type="button"
                    onClick={
                      grantOrRenew
                    }
                    disabled={
                      savingAccess ||
                      deleting
                    }
                    style={{
                      ...buttonStyle,

                      color:
                        "#171107",

                      background:
                        "#d8b94e",

                      border:
                        "1px solid #d8b94e",
                    }}
                  >
                    {savingAccess
                      ? "PROCESSANDO..."
                      : actionLabel}
                  </button>

                  <button
                    type="button"
                    onClick={
                      suspend
                    }
                    disabled={
                      savingAccess ||
                      deleting ||
                      !active
                    }
                    style={{
                      ...buttonStyle,

                      color:
                        "#ffb0b0",

                      background:
                        "rgba(150,40,40,.10)",

                      border:
                        "1px solid rgba(220,80,80,.30)",
                    }}
                  >
                    SUSPENDER
                  </button>

                  <button
                    type="button"
                    onClick={
                      removeUser
                    }
                    disabled={
                      deleting ||
                      savingAccess
                    }
                    style={{
                      ...buttonStyle,

                      color:
                        "#ff8f8f",

                      background:
                        "rgba(150,20,20,.16)",

                      border:
                        "1px solid rgba(255,70,70,.36)",
                    }}
                  >
                    {deleting
                      ? "EXCLUINDO..."
                      : "EXCLUIR"}
                  </button>
                </div>
              </article>
            </div>
          )}
        </main>
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
    </section>
  );
}
