import React from "react";

export default function Top3View(props) {
  const {
    title = "Top 3",
    isLoading,
    error,
    items,
    top3,
    rows,
    data,
  } = props || {};

  const list =
    (Array.isArray(top3) && top3) ||
    (Array.isArray(items) && items) ||
    (Array.isArray(rows) && rows) ||
    [];

  return (
    <div style={{ padding: 16, color: "#fff" }}>
      <h2 style={{ margin: "0 0 12px" }}>{title}</h2>

      {isLoading ? <div>Carregando…</div> : null}

      {error ? (
        <div style={{ marginTop: 12, color: "#ff6b6b" }}>
          <b>Erro:</b> {String(error?.message || error)}
        </div>
      ) : null}

      {!isLoading && !error && list.length === 0 ? (
        <div style={{ opacity: 0.8 }}>
          Sem dados para exibir (Top3View criado como ponte).
        </div>
      ) : null}

      {!isLoading && !error && list.length > 0 ? (
        <div style={{ marginTop: 12 }}>
          <div style={{ opacity: 0.8, marginBottom: 8 }}>
            Itens: {list.length}
          </div>

          <div style={{ display: "grid", gap: 8 }}>
            {list.slice(0, 10).map((it, idx) => (
              <div
                key={it?.id || it?.key || idx}
                style={{
                  padding: 10,
                  borderRadius: 10,
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.10)",
                }}
              >
                <div style={{ fontWeight: 700, marginBottom: 4 }}>
                  #{idx + 1}
                </div>
                <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>
                  {JSON.stringify(it, null, 2)}
                </pre>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <details style={{ marginTop: 16, opacity: 0.9 }}>
        <summary>Debug props</summary>
        <pre style={{ whiteSpace: "pre-wrap" }}>
          {JSON.stringify(
            {
              keys: Object.keys(props || {}),
              hasData: !!data,
            },
            null,
            2
          )}
        </pre>
      </details>
    </div>
  );
}
