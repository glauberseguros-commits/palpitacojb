import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  ADMIN_USER_PLAN_OPTIONS,
  listUsers,
  updateUserAccess,
} from "./userManagement.api";

import "./UserManagementPage.css";

function clean(value) {
  return String(value ?? "").trim();
}

function toDateInput(value) {
  const raw = clean(value);

  if (!raw) return "";

  const timestamp = Date.parse(raw);

  if (!Number.isFinite(timestamp)) return "";

  const date = new Date(timestamp);

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function dateInputToIso(value, endOfDay = false) {
  const raw = clean(value);

  if (!raw) return "";

  const suffix = endOfDay
    ? "T23:59:59.999"
    : "T00:00:00.000";

  const date = new Date(`${raw}${suffix}`);

  if (!Number.isFinite(date.getTime())) {
    throw new Error("Data inválida.");
  }

  return date.toISOString();
}

function formatDate(value) {
  if (!value) return "—";

  let candidate = value;

  if (
    typeof value === "object" &&
    typeof value.toDate === "function"
  ) {
    candidate = value.toDate();
  }

  const date =
    candidate instanceof Date
      ? candidate
      : new Date(candidate);

  if (!Number.isFinite(date.getTime())) {
    return "—";
  }

  return date.toLocaleString("pt-BR");
}

function makeDraft(user) {
  return {
    plan: clean(user?.plan).toUpperCase() || "FREE",
    planStartAt: toDateInput(user?.planStartAt),
    planEndAt: toDateInput(user?.planEndAt),
    isLifetime: user?.isLifetime === true,
  };
}

export default function UserManagementPage() {
  const [users, setUsers] = useState([]);
  const [queryText, setQueryText] = useState("");
  const [selectedUid, setSelectedUid] = useState("");
  const [draft, setDraft] = useState(makeDraft(null));

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const rows = await listUsers();

      setUsers(rows);

      setSelectedUid((current) => {
        if (
          current &&
          rows.some((user) => user.uid === current)
        ) {
          return current;
        }

        return rows[0]?.uid || "";
      });
    } catch (err) {
      console.error("[ADMIN-USERS] Falha ao listar usuários:", err);

      setError(
        err?.message ||
          "Não foi possível carregar os usuários."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const selectedUser = useMemo(
    () =>
      users.find((user) => user.uid === selectedUid) ||
      null,
    [users, selectedUid]
  );

  useEffect(() => {
    setDraft(makeDraft(selectedUser));
    setSuccess("");
    setError("");
  }, [selectedUser]);

  const filteredUsers = useMemo(() => {
    const needle = clean(queryText).toLocaleLowerCase("pt-BR");

    if (!needle) return users;

    return users.filter((user) => {
      const haystack = [
        user.name,
        user.email,
        user.uid,
        user.phone,
        user.plan,
      ]
        .map((value) =>
          clean(value).toLocaleLowerCase("pt-BR")
        )
        .join(" ");

      return haystack.includes(needle);
    });
  }, [users, queryText]);

  const hasChanges = useMemo(() => {
    if (!selectedUser) return false;

    const original = makeDraft(selectedUser);

    return (
      draft.plan !== original.plan ||
      draft.planStartAt !== original.planStartAt ||
      draft.planEndAt !== original.planEndAt ||
      draft.isLifetime !== original.isLifetime
    );
  }, [draft, selectedUser]);

  function updateDraft(field, value) {
    setDraft((current) => ({
      ...current,
      [field]: value,
    }));

    setSuccess("");
    setError("");
  }

  async function handleSave(event) {
    event.preventDefault();

    if (!selectedUser) return;

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const plan = clean(draft.plan).toUpperCase();

      const payload = {
        plan,
        isLifetime:
          plan === "FREE"
            ? false
            : draft.isLifetime === true,

        planStartAt:
          plan === "FREE"
            ? ""
            : dateInputToIso(
                draft.planStartAt,
                false
              ),

        planEndAt:
          plan === "FREE" ||
          draft.isLifetime === true
            ? ""
            : dateInputToIso(
                draft.planEndAt,
                true
              ),
      };

      await updateUserAccess(
        selectedUser.uid,
        payload
      );

      setSuccess("Acesso atualizado com sucesso.");

      await loadUsers();
    } catch (err) {
      console.error("[ADMIN-USERS] Falha ao salvar acesso:", err);

      setError(
        err?.message ||
          "Não foi possível salvar o acesso."
      );
    } finally {
      setSaving(false);
    }
  }

  const isFree = draft.plan === "FREE";
  const isLifetime = draft.isLifetime === true;

  return (
    <div className="admin-users">
      <div className="admin-users__header">
        <div>
          <h2>Usuários</h2>
          <p>
            Consulte usuários e gerencie o acesso comercial.
            Trial e perfil permanecem somente leitura.
          </p>
        </div>

        <button
          type="button"
          className="admin-users__refresh"
          onClick={loadUsers}
          disabled={loading || saving}
        >
          {loading ? "Carregando..." : "Atualizar lista"}
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
            <span>Buscar usuário</span>

            <input
              type="search"
              value={queryText}
              onChange={(event) =>
                setQueryText(event.target.value)
              }
              placeholder="Nome, e-mail, UID ou telefone"
            />
          </label>

          <div className="admin-users__counter">
            {filteredUsers.length} de {users.length} usuário(s)
          </div>

          <div className="admin-users__list">
            {loading ? (
              <div className="admin-users__empty">
                Carregando usuários...
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="admin-users__empty">
                Nenhum usuário encontrado.
              </div>
            ) : (
              filteredUsers.map((user) => {
                const active =
                  user.uid === selectedUid;

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
                      setSelectedUid(user.uid)
                    }
                  >
                    <strong>
                      {clean(user.name) ||
                        clean(user.email) ||
                        "Usuário sem nome"}
                    </strong>

                    <span>
                      {clean(user.email) || "Sem e-mail"}
                    </span>

                    <small>
                      {user.plan || "FREE"} · {user.uid}
                    </small>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        <main className="admin-users__detail">
          {!selectedUser ? (
            <div className="admin-users__empty admin-users__empty--detail">
              Selecione um usuário.
            </div>
          ) : (
            <>
              <section className="admin-users__card">
                <div className="admin-users__card-title">
                  <div>
                    <h3>
                      {clean(selectedUser.name) ||
                        "Usuário"}
                    </h3>

                    <p>{selectedUser.email || "Sem e-mail"}</p>
                  </div>

                  <span className="admin-users__plan-badge">
                    {selectedUser.plan || "FREE"}
                  </span>
                </div>

                <dl className="admin-users__info-grid">
                  <div>
                    <dt>UID</dt>
                    <dd>{selectedUser.uid}</dd>
                  </div>

                  <div>
                    <dt>Telefone</dt>
                    <dd>
                      {selectedUser.phone || "—"}
                    </dd>
                  </div>

                  <div>
                    <dt>Última atividade</dt>
                    <dd>
                      {formatDate(
                        selectedUser.lastActiveAt
                      )}
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
                </dl>
              </section>

              <section className="admin-users__card">
                <h3>Trial</h3>

                <p className="admin-users__readonly-note">
                  Somente leitura nesta versão.
                </p>

                <dl className="admin-users__info-grid">
                  <div>
                    <dt>Status</dt>
                    <dd>
                      {selectedUser.trialActive
                        ? "Ativo"
                        : "Inativo"}
                    </dd>
                  </div>

                  <div>
                    <dt>Início</dt>
                    <dd>
                      {formatDate(
                        selectedUser.trialStartAt
                      )}
                    </dd>
                  </div>

                  <div>
                    <dt>Fim</dt>
                    <dd>
                      {formatDate(
                        selectedUser.trialEndAt
                      )}
                    </dd>
                  </div>
                </dl>
              </section>

              <form
                className="admin-users__card"
                onSubmit={handleSave}
              >
                <h3>Gerenciar acesso</h3>

                <div className="admin-users__form-grid">
                  <label>
                    <span>Plano</span>

                    <select
                      value={draft.plan}
                      onChange={(event) =>
                        updateDraft(
                          "plan",
                          event.target.value
                        )
                      }
                      disabled={saving}
                    >
                      {ADMIN_USER_PLAN_OPTIONS.map(
                        (plan) => (
                          <option
                            key={plan}
                            value={plan}
                          >
                            {plan}
                          </option>
                        )
                      )}
                    </select>
                  </label>

                  <label>
                    <span>Data inicial</span>

                    <input
                      type="date"
                      value={draft.planStartAt}
                      onChange={(event) =>
                        updateDraft(
                          "planStartAt",
                          event.target.value
                        )
                      }
                      disabled={saving || isFree}
                    />
                  </label>

                  <label>
                    <span>Data final</span>

                    <input
                      type="date"
                      value={draft.planEndAt}
                      onChange={(event) =>
                        updateDraft(
                          "planEndAt",
                          event.target.value
                        )
                      }
                      disabled={
                        saving ||
                        isFree ||
                        isLifetime
                      }
                    />
                  </label>
                </div>

                <label className="admin-users__lifetime">
                  <input
                    type="checkbox"
                    checked={draft.isLifetime}
                    onChange={(event) =>
                      updateDraft(
                        "isLifetime",
                        event.target.checked
                      )
                    }
                    disabled={saving || isFree}
                  />

                  <span>Acesso vitalício</span>
                </label>

                <div className="admin-users__actions">
                  <button
                    type="button"
                    className="admin-users__secondary"
                    onClick={() =>
                      setDraft(makeDraft(selectedUser))
                    }
                    disabled={saving || !hasChanges}
                  >
                    Descartar alterações
                  </button>

                  <button
                    type="submit"
                    className="admin-users__save"
                    disabled={
                      saving ||
                      loading ||
                      !hasChanges
                    }
                  >
                    {saving
                      ? "Salvando..."
                      : "Salvar acesso"}
                  </button>
                </div>
              </form>
            </>
          )}
        </main>
      </div>
    </div>
  );
}