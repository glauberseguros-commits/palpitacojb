import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  activateUserAccess,
  createAdminOperationId,
  getAccessProductContract,
  getUserAccess,
  listUsers,
  revokeUserAccess,
} from "./userManagement.api";

import "./UserManagementPage.css";


function clean(value) {
  return String(value ?? "").trim();
}


function formatDate(value) {
  if (!value) {
    return "—";
  }

  let candidate =
    value;

  if (
    typeof value === "object" &&
    typeof value.toDate ===
      "function"
  ) {
    candidate =
      value.toDate();
  }

  if (
    typeof value === "object" &&
    typeof value.seconds ===
      "number"
  ) {
    candidate =
      new Date(
        value.seconds * 1000
      );
  }

  const date =
    candidate instanceof Date
      ? candidate
      : new Date(candidate);

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


function formatMoney(
  cents,
  currency = "BRL"
) {
  const amount =
    Number(cents);

  if (
    !Number.isFinite(
      amount
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
        clean(currency) ||
        "BRL",
    }
  ).format(
    amount / 100
  );
}


function statusLabel(
  subscription,
  accessGranted
) {
  if (
    accessGranted === true ||
    subscription?.active === true
  ) {
    return "ATIVO";
  }

  const status =
    clean(
      subscription?.status
    ).toUpperCase();

  return status || "SEM ACESSO";
}


export default function UserManagementPage() {
  const [
    users,
    setUsers,
  ] =
    useState([]);

  const [
    queryText,
    setQueryText,
  ] =
    useState("");

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
    product,
    setProduct,
  ] =
    useState(null);

  const [
    paymentReference,
    setPaymentReference,
  ] =
    useState("");

  const [
    revokeReason,
    setRevokeReason,
  ] =
    useState("");

  const [
    pendingOperation,
    setPendingOperation,
  ] =
    useState(null);

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    accessLoading,
    setAccessLoading,
  ] =
    useState(false);

  const [
    saving,
    setSaving,
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


  const loadUsers =
    useCallback(
      async () => {
        setLoading(true);
        setError("");

        try {
          const rows =
            await listUsers();

          setUsers(rows);

          setSelectedUid(
            (current) => {
              if (
                current &&
                rows.some(
                  (user) =>
                    user.uid ===
                    current
                )
              ) {
                return current;
              }

              return (
                rows[0]?.uid ||
                ""
              );
            }
          );
        }
        catch (err) {
          console.error(
            "[ADMIN-USERS] Falha ao listar usuarios:",
            err
          );

          setError(
            err?.message ||
            "Nao foi possivel carregar os usuarios."
          );
        }
        finally {
          setLoading(false);
        }
      },
      []
    );


  const loadSelectedAccess =
    useCallback(
      async (
        uid = selectedUid
      ) => {
        const safeUid =
          clean(uid);

        if (!safeUid) {
          setAccessData(null);
          return;
        }

        setAccessLoading(true);

        try {
          const result =
            await getUserAccess(
              safeUid
            );

          setAccessData(
            result
          );
        }
        catch (err) {
          console.error(
            "[ADMIN-USERS] Falha ao consultar acesso:",
            err
          );

          setError(
            err?.message ||
            "Nao foi possivel consultar o acesso."
          );
        }
        finally {
          setAccessLoading(
            false
          );
        }
      },
      [selectedUid]
    );


  useEffect(() => {
    loadUsers();
  }, [loadUsers]);


  useEffect(() => {
    let alive =
      true;

    getAccessProductContract()
      .then((value) => {
        if (alive) {
          setProduct(value);
        }
      })
      .catch((err) => {
        console.error(
          "[ADMIN-USERS] Produto:",
          err
        );
      });

    return () => {
      alive =
        false;
    };
  }, []);


  useEffect(() => {
    setSuccess("");
    setError("");
    setPaymentReference("");
    setRevokeReason("");
    setPendingOperation(null);

    if (selectedUid) {
      loadSelectedAccess(
        selectedUid
      );
    }
    else {
      setAccessData(null);
    }
  }, [
    selectedUid,
    loadSelectedAccess,
  ]);


  const selectedUser =
    useMemo(
      () =>
        users.find(
          (user) =>
            user.uid ===
            selectedUid
        ) ||
        null,
      [
        users,
        selectedUid,
      ]
    );


  const filteredUsers =
    useMemo(
      () => {
        const needle =
          clean(queryText)
            .toLocaleLowerCase(
              "pt-BR"
            );

        if (!needle) {
          return users;
        }

        return users.filter(
          (user) => {
            const haystack =
              [
                user.name,
                user.email,
                user.uid,
                user.phone,
              ]
                .map(
                  (value) =>
                    clean(value)
                      .toLocaleLowerCase(
                        "pt-BR"
                      )
                )
                .join(" ");

            return haystack.includes(
              needle
            );
          }
        );
      },
      [
        users,
        queryText,
      ]
    );


  const access =
    accessData?.access ||
    null;

  const subscription =
    access?.subscription ||
    null;


  async function handleActivate(
    event
  ) {
    event.preventDefault();

    if (
      !selectedUser ||
      saving
    ) {
      return;
    }

    const reference =
      clean(
        paymentReference
      );

    if (!reference) {
      setError(
        "Informe a referencia do pagamento PIX antes de ativar."
      );

      return;
    }

    const reusable =
      pendingOperation &&
      pendingOperation.kind ===
        "activate" &&
      pendingOperation.uid ===
        selectedUser.uid;

    const operationId =
      reusable
        ? pendingOperation.id
        : createAdminOperationId(
            "grant",
            selectedUser.uid
          );

    if (!reusable) {
      setPendingOperation({
        kind:
          "activate",

        uid:
          selectedUser.uid,

        id:
          operationId,
      });
    }

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const response =
        await activateUserAccess(
          selectedUser.uid,
          {
            operationId,
            paymentReference:
              reference,
          }
        );

      setPendingOperation(
        null
      );

      setPaymentReference(
        ""
      );

      setSuccess(
        "Assinatura ativada/renovada por mais 30 dias."
      );

      if (
        response?.access
      ) {
        setAccessData(
          (current) => ({
            ...current,
            access:
              response.access,
          })
        );
      }

      await loadSelectedAccess(
        selectedUser.uid
      );
    }
    catch (err) {
      console.error(
        "[ADMIN-USERS] Falha ao ativar acesso:",
        err
      );

      setError(
        err?.message ||
        "Nao foi possivel ativar o acesso."
      );
    }
    finally {
      setSaving(false);
    }
  }


  async function handleRevoke() {
    if (
      !selectedUser ||
      saving
    ) {
      return;
    }

    const reason =
      clean(
        revokeReason
      );

    if (!reason) {
      setError(
        "Informe o motivo da revogacao."
      );

      return;
    }

    if (
      typeof window !==
        "undefined" &&
      !window.confirm(
        "Confirma a revogacao do acesso deste usuario?"
      )
    ) {
      return;
    }

    const reusable =
      pendingOperation &&
      pendingOperation.kind ===
        "revoke" &&
      pendingOperation.uid ===
        selectedUser.uid;

    const operationId =
      reusable
        ? pendingOperation.id
        : createAdminOperationId(
            "revoke",
            selectedUser.uid
          );

    if (!reusable) {
      setPendingOperation({
        kind:
          "revoke",

        uid:
          selectedUser.uid,

        id:
          operationId,
      });
    }

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const response =
        await revokeUserAccess(
          selectedUser.uid,
          {
            operationId,
            reason,
          }
        );

      setPendingOperation(
        null
      );

      setRevokeReason(
        ""
      );

      setSuccess(
        "Acesso revogado com sucesso."
      );

      if (
        response?.access
      ) {
        setAccessData(
          (current) => ({
            ...current,
            access:
              response.access,
          })
        );
      }

      await loadSelectedAccess(
        selectedUser.uid
      );
    }
    catch (err) {
      console.error(
        "[ADMIN-USERS] Falha ao revogar acesso:",
        err
      );

      setError(
        err?.message ||
        "Nao foi possivel revogar o acesso."
      );
    }
    finally {
      setSaving(false);
    }
  }


  return (
    <div className="admin-users">
      <div className="admin-users__header">
        <div>
          <h2>Usuarios</h2>

          <p>
            Gerencie a assinatura comercial autoritativa do PalPitaco JB.
          </p>
        </div>

        <button
          type="button"
          className="admin-users__refresh"
          onClick={loadUsers}
          disabled={
            loading ||
            saving
          }
        >
          {loading
            ? "Carregando..."
            : "Atualizar lista"}
        </button>
      </div>

      {error ? (
        <div
          className="admin-users__message admin-users__message--error"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      {success ? (
        <div
          className="admin-users__message admin-users__message--success"
          role="status"
        >
          {success}
        </div>
      ) : null}

      <div className="admin-users__layout">
        <aside className="admin-users__list-panel">
          <label className="admin-users__search">
            <span>Buscar usuario</span>

            <input
              type="search"
              value={queryText}
              onChange={(event) =>
                setQueryText(
                  event.target.value
                )
              }
              placeholder="Nome, e-mail, UID ou telefone"
            />
          </label>

          <div className="admin-users__counter">
            {filteredUsers.length} de {users.length} usuario(s)
          </div>

          <div className="admin-users__list">
            {loading ? (
              <div className="admin-users__empty">
                Carregando usuarios...
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="admin-users__empty">
                Nenhum usuario encontrado.
              </div>
            ) : (
              filteredUsers.map(
                (user) => {
                  const active =
                    user.uid ===
                    selectedUid;

                  return (
                    <button
                      key={user.uid}
                      type="button"
                      className={
                        active
                          ? "admin-users__user admin-users__user--active"
                          : "admin-users__user"
                      }
                      onClick={() =>
                        setSelectedUid(
                          user.uid
                        )
                      }
                    >
                      <strong>
                        {clean(user.name) ||
                          clean(user.email) ||
                          "Usuario sem nome"}
                      </strong>

                      <span>
                        {clean(user.email) ||
                          "Sem e-mail"}
                      </span>

                      <small>
                        {user.uid}
                      </small>
                    </button>
                  );
                }
              )
            )}
          </div>
        </aside>

        <main className="admin-users__detail">
          {!selectedUser ? (
            <div className="admin-users__empty admin-users__empty--detail">
              Selecione um usuario.
            </div>
          ) : (
            <>
              <section className="admin-users__card">
                <div className="admin-users__card-title">
                  <div>
                    <h3>
                      {clean(
                        selectedUser.name
                      ) ||
                        "Usuario"}
                    </h3>

                    <p>
                      {selectedUser.email ||
                        "Sem e-mail"}
                    </p>
                  </div>

                  <span className="admin-users__plan-badge">
                    {accessLoading
                      ? "..."
                      : statusLabel(
                          subscription,
                          access?.accessGranted
                        )}
                  </span>
                </div>

                <dl className="admin-users__info-grid">
                  <div>
                    <dt>UID</dt>
                    <dd>
                      {selectedUser.uid}
                    </dd>
                  </div>

                  <div>
                    <dt>Telefone</dt>
                    <dd>
                      {selectedUser.phone ||
                        "—"}
                    </dd>
                  </div>

                  <div>
                    <dt>Cadastro</dt>
                    <dd>
                      {formatDate(
                        selectedUser.createdAt
                      )}
                    </dd>
                  </div>

                  <div>
                    <dt>
                      Ultima atividade
                    </dt>
                    <dd>
                      {formatDate(
                        selectedUser.lastActiveAt
                      )}
                    </dd>
                  </div>
                </dl>
              </section>

              <section className="admin-users__card">
                <h3>
                  Assinatura
                </h3>

                <p className="admin-users__readonly-note">
                  Fonte de verdade: backend de acesso.
                </p>

                <dl className="admin-users__info-grid">
                  <div>
                    <dt>Status</dt>
                    <dd>
                      {accessLoading
                        ? "Carregando..."
                        : statusLabel(
                            subscription,
                            access?.accessGranted
                          )}
                    </dd>
                  </div>

                  <div>
                    <dt>Produto</dt>
                    <dd>
                      {product?.planCode ||
                        subscription?.planCode ||
                        "—"}
                    </dd>
                  </div>

                  <div>
                    <dt>Valor</dt>
                    <dd>
                      {formatMoney(
                        product?.priceCents ??
                          subscription?.priceCents,
                        product?.currency ??
                          subscription?.currency
                      )}
                    </dd>
                  </div>

                  <div>
                    <dt>Duracao</dt>
                    <dd>
                      {Number(
                        product?.durationDays ??
                          subscription?.durationDays
                      ) || 30}
                      {" dias"}
                    </dd>
                  </div>

                  <div>
                    <dt>Inicio</dt>
                    <dd>
                      {formatDate(
                        subscription?.startedAt
                      )}
                    </dd>
                  </div>

                  <div>
                    <dt>Valido ate</dt>
                    <dd>
                      {formatDate(
                        subscription?.endsAt
                      )}
                    </dd>
                  </div>

                  <div>
                    <dt>Ativacoes</dt>
                    <dd>
                      {Number(
                        subscription?.grantCount ||
                          0
                      )}
                    </dd>
                  </div>

                  <div>
                    <dt>Pagamento</dt>
                    <dd>
                      {subscription?.lastPayment
                        ?.reference ||
                        subscription?.lastPayment
                          ?.paymentReference ||
                        "—"}
                    </dd>
                  </div>
                </dl>
              </section>

              <form
                className="admin-users__card"
                onSubmit={
                  handleActivate
                }
              >
                <h3>
                  Ativar / renovar
                </h3>

                <p className="admin-users__readonly-note">
                  Cada confirmacao concede mais 30 dias. Se a assinatura ainda estiver ativa, os novos 30 dias sao acrescentados ao vencimento atual.
                </p>

                <div className="admin-users__form-grid">
                  <label>
                    <span>
                      Referencia do pagamento PIX
                    </span>

                    <input
                      type="text"
                      value={
                        paymentReference
                      }
                      onChange={(event) => {
                        setPaymentReference(
                          event.target.value
                        );

                        setPendingOperation(
                          null
                        );

                        setError("");
                        setSuccess("");
                      }}
                      placeholder="ID PIX, comprovante ou referencia"
                      disabled={saving}
                    />
                  </label>
                </div>

                <div className="admin-users__actions">
                  <button
                    type="submit"
                    className="admin-users__save"
                    disabled={
                      saving ||
                      accessLoading ||
                      !clean(
                        paymentReference
                      )
                    }
                  >
                    {saving
                      ? "Processando..."
                      : "ATIVAR / RENOVAR +30 DIAS"}
                  </button>
                </div>
              </form>

              <section className="admin-users__card">
                <h3>
                  Revogar acesso
                </h3>

                <div className="admin-users__form-grid">
                  <label>
                    <span>
                      Motivo
                    </span>

                    <input
                      type="text"
                      value={
                        revokeReason
                      }
                      onChange={(event) => {
                        setRevokeReason(
                          event.target.value
                        );

                        setPendingOperation(
                          null
                        );

                        setError("");
                        setSuccess("");
                      }}
                      placeholder="Informe o motivo da revogacao"
                      disabled={saving}
                    />
                  </label>
                </div>

                <div className="admin-users__actions">
                  <button
                    type="button"
                    className="admin-users__secondary"
                    onClick={
                      handleRevoke
                    }
                    disabled={
                      saving ||
                      accessLoading ||
                      !clean(
                        revokeReason
                      )
                    }
                  >
                    {saving
                      ? "Processando..."
                      : "REVOGAR ACESSO"}
                  </button>
                </div>
              </section>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
