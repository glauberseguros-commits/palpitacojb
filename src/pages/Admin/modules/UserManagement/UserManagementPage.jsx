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

import "../../AdminSimple.css";

/*
 * Fonte de verdade: backend de acesso
 */

function clean(value) {
  return String(value ?? "").trim();
}

function digits(value) {
  return String(value ?? "")
    .replace(/\D+/g, "")
    .slice(0, 11);
}

function phoneMask(value) {
  const phone = digits(value);

  if (!phone) {
    return "";
  }

  if (phone.length <= 2) {
    return `(${phone}`;
  }

  if (phone.length <= 6) {
    return `(${phone.slice(0, 2)}) ${phone.slice(2)}`;
  }

  if (phone.length <= 10) {
    return (
      `(${phone.slice(0, 2)}) ` +
      `${phone.slice(2, 6)}-${phone.slice(6)}`
    );
  }

  return (
    `(${phone.slice(0, 2)}) ` +
    `${phone.slice(2, 7)}-${phone.slice(7)}`
  );
}

function toDate(value) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value;
  }

  if (typeof value?.toDate === "function") {
    try {
      return value.toDate();
    }
    catch {
      return null;
    }
  }

  if (
    typeof value === "object" &&
    Number.isFinite(Number(value?.seconds))
  ) {
    return new Date(Number(value.seconds) * 1000);
  }

  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime())
    ? null
    : parsed;
}

function dateLabel(value) {
  const date = toDate(value);

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

function friendlyError(error, fallback) {
  const raw = clean(
    error?.message ||
    error?.code
  );

  const code = raw.toUpperCase();

  const messages = {
    TARGET_USER_EMAIL_REQUIRED:
      "Este cadastro não possui e-mail.",

    UID_REQUIRED:
      "Usuário inválido.",

    ADMIN_NOT_AUTHORIZED:
      "Operação não autorizada.",

    ACCESS_ADMIN_REQUIRED:
      "Operação não autorizada.",

    UNAUTHORIZED:
      "Sua sessão expirou. Entre novamente.",

    FORBIDDEN:
      "Operação não autorizada.",

    USER_NOT_FOUND:
      "Usuário não encontrado.",

    TARGET_USER_NOT_FOUND:
      "Usuário não encontrado.",
  };

  return (
    messages[code] ||
    fallback ||
    "Não foi possível concluir a operação."
  );
}

function statusOf(user) {
  if (!clean(user?.email)) {
    return "PENDENTE";
  }

  const access =
    user?._access ||
    null;

  const subscription =
    access?.subscription ||
    null;

  const raw =
    clean(subscription?.status)
      .toUpperCase();

  if (
    access?.accessGranted === true ||
    subscription?.active === true ||
    raw === "ACTIVE"
  ) {
    return "ATIVO";
  }

  if (
    raw === "SUSPENDED" ||
    raw === "REVOKED"
  ) {
    return "SUSPENSO";
  }

  if (raw === "EXPIRED") {
    return "EXPIRADO";
  }

  return "PENDENTE";
}

function validityOf(user) {
  return (
    user?._access
      ?.subscription
      ?.endsAt ||
    null
  );
}

function displayName(user) {
  return (
    clean(user?.name) ||
    clean(user?.email) ||
    "Cadastro incompleto"
  );
}

export default function UserManagementPage() {
  const [users, setUsers] =
    useState([]);

  const [query, setQuery] =
    useState("");

  const [filter, setFilter] =
    useState("TODOS");

  const [loading, setLoading] =
    useState(true);

  const [busyUid, setBusyUid] =
    useState("");

  const [editingUid, setEditingUid] =
    useState("");

  const [editName, setEditName] =
    useState("");

  const [editPhone, setEditPhone] =
    useState("");

  const [error, setError] =
    useState("");

  const [success, setSuccess] =
    useState("");

  const enrichUsers =
    useCallback(
      async (rows) => {
        return Promise.all(
          rows.map(
            async (user) => {
              const email =
                clean(user.email);

              if (!email) {
                return {
                  ...user,
                  _access: null,
                };
              }

              try {
                const result =
                  await getUserAccess(
                    user.uid
                  );

                return {
                  ...user,
                  _access:
                    result?.access ||
                    null,
                };
              }
              catch {
                return {
                  ...user,
                  _access: null,
                };
              }
            }
          )
        );
      },
      []
    );

  const loadUsers =
    useCallback(
      async () => {
        setLoading(true);
        setError("");

        try {
          const rows =
            await listUsers();

          const enriched =
            await enrichUsers(
              rows
            );

          setUsers(enriched);
        }
        catch (err) {
          setError(
            friendlyError(
              err,
              "Não foi possível carregar os usuários."
            )
          );
        }
        finally {
          setLoading(false);
        }
      },
      [
        enrichUsers,
      ]
    );

  useEffect(
    () => {
      loadUsers();
    },
    [
      loadUsers,
    ]
  );

  const counts =
    useMemo(
      () => {
        const result = {
          TOTAL:
            users.length,

          ATIVO:
            0,

          PENDENTE:
            0,

          SUSPENSO:
            0,

          EXPIRADO:
            0,
        };

        users.forEach(
          (user) => {
            const status =
              statusOf(user);

            if (
              Object.prototype.hasOwnProperty.call(
                result,
                status
              )
            ) {
              result[status] += 1;
            }
          }
        );

        return result;
      },
      [
        users,
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

        return users.filter(
          (user) => {
            const status =
              statusOf(user);

            if (
              filter !== "TODOS" &&
              status !== filter
            ) {
              return false;
            }

            if (!needle) {
              return true;
            }

            return [
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
              .includes(needle);
          }
        );
      },
      [
        users,
        query,
        filter,
      ]
    );

  function beginEdit(user) {
    setEditingUid(
      user.uid
    );

    setEditName(
      clean(user.name)
    );

    setEditPhone(
      phoneMask(
        user.phone
      )
    );

    setError("");
    setSuccess("");
  }

  function cancelEdit() {
    setEditingUid("");
    setEditName("");
    setEditPhone("");
  }

  async function saveUser(user) {
    if (
      !user ||
      busyUid
    ) {
      return;
    }

    setBusyUid(user.uid);
    setError("");
    setSuccess("");

    try {
      const updated =
        await updateAdminUserProfile(
          user.uid,
          {
            name:
              editName,

            phone:
              editPhone,
          }
        );

      setUsers(
        (current) =>
          current.map(
            (item) =>
              item.uid ===
              user.uid
                ? {
                    ...item,
                    name:
                      updated.name,
                    phone:
                      updated.phone,
                  }
                : item
          )
      );

      cancelEdit();

      setSuccess(
        "Dados do usuário atualizados."
      );
    }
    catch (err) {
      setError(
        friendlyError(
          err,
          "Não foi possível salvar os dados."
        )
      );
    }
    finally {
      setBusyUid("");
    }
  }

  async function refreshAccess(user) {
    if (
      !user ||
      !clean(user.email)
    ) {
      return;
    }

    try {
      const result =
        await getUserAccess(
          user.uid
        );

      setUsers(
        (current) =>
          current.map(
            (item) =>
              item.uid ===
              user.uid
                ? {
                    ...item,
                    _access:
                      result?.access ||
                      null,
                  }
                : item
          )
      );
    }
    catch {
      // mantém o último estado conhecido
    }
  }

  async function activate(user) {
    if (
      !user ||
      busyUid
    ) {
      return;
    }

    if (!clean(user.email)) {
      setError(
        "Este cadastro não possui e-mail."
      );

      return;
    }

    setBusyUid(user.uid);
    setError("");
    setSuccess("");

    try {
      const operationId =
        createAdminOperationId(
          "grant",
          user.uid
        );

      await activateUserAccess(
        user.uid,
        {
          operationId,

          paymentReference:
            "admin-manual",
        }
      );

      await refreshAccess(
        user
      );

      setSuccess(
        "Acesso ativado/renovado por 30 dias."
      );
    }
    catch (err) {
      setError(
        friendlyError(
          err,
          "Não foi possível ativar o acesso."
        )
      );
    }
    finally {
      setBusyUid("");
    }
  }

  async function revoke(user) {
    if (
      !user ||
      busyUid
    ) {
      return;
    }

    if (!clean(user.email)) {
      setError(
        "Este cadastro não possui e-mail."
      );

      return;
    }

    if (
      typeof window !==
        "undefined" &&
      !window.confirm(
        `Revogar o acesso de ${displayName(user)}?`
      )
    ) {
      return;
    }

    setBusyUid(user.uid);
    setError("");
    setSuccess("");

    try {
      const operationId =
        createAdminOperationId(
          "revoke",
          user.uid
        );

      await revokeUserAccess(
        user.uid,
        {
          operationId,

          reason:
            "Revogação administrativa",
        }
      );

      await refreshAccess(
        user
      );

      setSuccess(
        "Acesso revogado."
      );
    }
    catch (err) {
      setError(
        friendlyError(
          err,
          "Não foi possível revogar o acesso."
        )
      );
    }
    finally {
      setBusyUid("");
    }
  }

  return (
    <div className="jb-admin-content">
      <div className="jb-admin-title-row">
        <div>
          <span className="jb-admin-kicker">
            ASSINATURAS
          </span>

          <h1>
            Usuários cadastrados
          </h1>

          <p>
            Consulte, edite e controle os acessos.
          </p>
        </div>

        <button
          type="button"
          className="jb-btn jb-btn--outline"
          onClick={loadUsers}
          disabled={loading}
        >
          {loading
            ? "ATUALIZANDO..."
            : "ATUALIZAR"}
        </button>
      </div>

      <div className="jb-admin-stats">
        <button
          type="button"
          onClick={() =>
            setFilter("TODOS")
          }
          className={
            filter === "TODOS"
              ? "is-selected"
              : ""
          }
        >
          <span>TOTAL</span>
          <strong>
            {counts.TOTAL}
          </strong>
        </button>

        <button
          type="button"
          onClick={() =>
            setFilter("ATIVO")
          }
          className={
            filter === "ATIVO"
              ? "is-selected"
              : ""
          }
        >
          <span>ATIVOS</span>
          <strong>
            {counts.ATIVO}
          </strong>
        </button>

        <button
          type="button"
          onClick={() =>
            setFilter("PENDENTE")
          }
          className={
            filter === "PENDENTE"
              ? "is-selected"
              : ""
          }
        >
          <span>PENDENTES</span>
          <strong>
            {counts.PENDENTE}
          </strong>
        </button>

        <button
          type="button"
          onClick={() =>
            setFilter("SUSPENSO")
          }
          className={
            filter === "SUSPENSO"
              ? "is-selected"
              : ""
          }
        >
          <span>SUSPENSOS</span>
          <strong>
            {counts.SUSPENSO}
          </strong>
        </button>

        <button
          type="button"
          onClick={() =>
            setFilter("EXPIRADO")
          }
          className={
            filter === "EXPIRADO"
              ? "is-selected"
              : ""
          }
        >
          <span>EXPIRADOS</span>
          <strong>
            {counts.EXPIRADO}
          </strong>
        </button>
      </div>

      <div className="jb-admin-filters">
        <label>
          <span>
            BUSCAR
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
          />
        </label>

        <label>
          <span>
            SITUAÇÃO
          </span>

          <select
            value={filter}
            onChange={(event) =>
              setFilter(
                event.target.value
              )
            }
          >
            <option value="TODOS">
              Todos
            </option>

            <option value="ATIVO">
              Ativos
            </option>

            <option value="PENDENTE">
              Pendentes
            </option>

            <option value="SUSPENSO">
              Suspensos
            </option>

            <option value="EXPIRADO">
              Expirados
            </option>
          </select>
        </label>
      </div>

      {error ? (
        <div className="jb-message jb-message--error">
          {error}
        </div>
      ) : null}

      {success ? (
        <div className="jb-message jb-message--success">
          {success}
        </div>
      ) : null}

      {loading ? (
        <div className="jb-admin-loading">
          Carregando usuários...
        </div>
      ) : filtered.length === 0 ? (
        <div className="jb-admin-loading">
          Nenhum usuário encontrado.
        </div>
      ) : (
        <div className="jb-admin-users">
          {filtered.map(
            (user) => {
              const status =
                statusOf(user);

              const active =
                status === "ATIVO";

              const editing =
                editingUid ===
                user.uid;

              const busy =
                busyUid ===
                user.uid;

              const hasEmail =
                Boolean(
                  clean(user.email)
                );

              return (
                <article
                  key={user.uid}
                  className="jb-user-card"
                >
                  <div className="jb-user-card__top">
                    <div>
                      <span
                        className={
                          `jb-status jb-status--${status.toLowerCase()}`
                        }
                      >
                        {status}
                      </span>

                      <h2>
                        {displayName(
                          user
                        )}
                      </h2>

                      <p>
                        {clean(
                          user.email
                        ) ||
                          "E-mail não informado"}
                      </p>

                      <small>
                        Cadastro:{" "}
                        {dateLabel(
                          user.createdAt
                        )}
                      </small>
                    </div>

                    <div className="jb-user-validity">
                      <span>
                        VALIDADE
                      </span>

                      <strong>
                        {dateLabel(
                          validityOf(
                            user
                          )
                        )}
                      </strong>
                    </div>
                  </div>

                  {editing ? (
                    <div className="jb-user-edit">
                      <label>
                        <span>
                          Nome
                        </span>

                        <input
                          value={editName}
                          onChange={(event) =>
                            setEditName(
                              event.target.value
                            )
                          }
                        />
                      </label>

                      <label>
                        <span>
                          Telefone
                        </span>

                        <input
                          value={editPhone}
                          inputMode="numeric"
                          onChange={(event) =>
                            setEditPhone(
                              phoneMask(
                                event.target.value
                              )
                            )
                          }
                        />
                      </label>

                      <label>
                        <span>
                          E-mail
                        </span>

                        <input
                          value={
                            user.email ||
                            ""
                          }
                          readOnly
                        />
                      </label>
                    </div>
                  ) : (
                    <div className="jb-user-data">
                      <div>
                        <span>
                          TELEFONE
                        </span>

                        <strong>
                          {clean(
                            user.phone
                          ) ||
                            "Não informado"}
                        </strong>
                      </div>

                      <div>
                        <span>
                          SITUAÇÃO
                        </span>

                        <strong>
                          {status}
                        </strong>
                      </div>

                      <div>
                        <span>
                          PLANO
                        </span>

                        <strong>
                          R$ 49,90 · 30 dias
                        </strong>
                      </div>
                    </div>
                  )}

                  <div className="jb-user-actions">
                    {editing ? (
                      <>
                        <button
                          type="button"
                          className="jb-btn jb-btn--gold"
                          onClick={() =>
                            saveUser(
                              user
                            )
                          }
                          disabled={busy}
                        >
                          SALVAR DADOS
                        </button>

                        <button
                          type="button"
                          className="jb-btn jb-btn--outline"
                          onClick={
                            cancelEdit
                          }
                          disabled={busy}
                        >
                          CANCELAR
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="jb-btn jb-btn--outline"
                        onClick={() =>
                          beginEdit(
                            user
                          )
                        }
                        disabled={busy}
                      >
                        EDITAR
                      </button>
                    )}

                    <button
                      type="button"
                      className="jb-btn jb-btn--gold"
                      onClick={() =>
                        activate(
                          user
                        )
                      }
                      disabled={
                        busy ||
                        !hasEmail
                      }
                    >
                      ATIVAR / RENOVAR +30 DIAS
                    </button>

                    <button
                      type="button"
                      className="jb-btn jb-btn--danger"
                      onClick={() =>
                        revoke(
                          user
                        )
                      }
                      disabled={
                        busy ||
                        !active ||
                        !hasEmail
                      }
                    >
                      REVOGAR ACESSO
                    </button>
                  </div>
                </article>
              );
            }
          )}
        </div>
      )}
    </div>
  );
}