import { useState } from "react";
import { api } from "../api.js";

function CheckGroup({ legend, columns, selected, onToggle }) {
  return (
    <fieldset className="check-group">
      <legend>{legend}</legend>
      {columns.map((c) => (
        <label key={c.name} className="check">
          <input type="checkbox" checked={selected.includes(c.name)} onChange={() => onToggle(c.name)} />
          <span className="ident">{c.name}</span>
        </label>
      ))}
    </fieldset>
  );
}

function DependencyForm({ table, attempt, onChange }) {
  const [lhs, setLhs] = useState([]);
  const [rhs, setRhs] = useState([]);
  const toggle = (set) => (name) => set((cur) => (cur.includes(name) ? cur.filter((n) => n !== name) : [...cur, name]));

  const submit = (e) => {
    e.preventDefault();
    attempt(async () => {
      await api.addFd(table.id, lhs, rhs);
      setLhs([]);
      setRhs([]);
      await onChange();
    });
  };

  return (
    <form onSubmit={submit} className="fd-form">
      <CheckGroup legend="Determinant (left side)" columns={table.columns} selected={lhs} onToggle={toggle(setLhs)} />
      <CheckGroup legend="Determines (right side)" columns={table.columns} selected={rhs} onToggle={toggle(setRhs)} />
      <button type="submit" disabled={!lhs.length || !rhs.length}>Add dependency</button>
    </form>
  );
}

function ForeignKeyForm({ table, schema, attempt, onChange }) {
  const [column, setColumn] = useState("");
  const [refTable, setRefTable] = useState("");
  const [refColumn, setRefColumn] = useState("");
  const target = schema.find((t) => t.name === refTable);

  const submit = (e) => {
    e.preventDefault();
    attempt(async () => {
      await api.addForeignKey(table.id, { column_name: column, ref_table: refTable, ref_column: refColumn });
      setColumn(""); setRefTable(""); setRefColumn("");
      await onChange();
    });
  };

  return (
    <form onSubmit={submit} className="fk-form">
      <label>Column
        <select value={column} onChange={(e) => setColumn(e.target.value)}>
          <option value="">Choose…</option>
          {table.columns.map((c) => <option key={c.id}>{c.name}</option>)}
        </select>
      </label>
      <label>References table
        <select value={refTable} onChange={(e) => { setRefTable(e.target.value); setRefColumn(""); }}>
          <option value="">Choose…</option>
          {schema.map((t) => <option key={t.id}>{t.name}</option>)}
        </select>
      </label>
      <label>Referenced column
        <select value={refColumn} onChange={(e) => setRefColumn(e.target.value)} disabled={!target}>
          <option value="">Choose…</option>
          {target?.columns.map((c) => <option key={c.id}>{c.name}</option>)}
        </select>
      </label>
      <button type="submit" disabled={!column || !refTable || !refColumn}>Add foreign key</button>
    </form>
  );
}

export default function TablePanel({ table, schema, attempt, onChange, onDelete }) {
  const removeFd = (id) => attempt(async () => { await api.deleteFd(id); await onChange(); });

  return (
    <section className="panel" aria-labelledby="table-heading">
      <div className="panel-head">
        <h3 id="table-heading" className="ident">{table.name}</h3>
        <button type="button" className="link danger-text" onClick={onDelete}>Delete table</button>
      </div>

      <table className="grid">
        <thead>
          <tr><th scope="col">Column</th><th scope="col">Type</th><th scope="col">Constraints</th></tr>
        </thead>
        <tbody>
          {table.columns.map((c) => (
            <tr key={c.id}>
              <td className="ident">{c.name}</td>
              <td className="ident">{c.data_type}</td>
              <td>
                {[c.is_primary_key && "Primary key", !c.is_primary_key && !c.is_nullable && "Not null", c.is_unique && "Unique"]
                  .filter(Boolean).join(", ") || "None"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h4>Foreign keys</h4>
      {table.foreign_keys.length === 0 ? (
        <p className="muted">None yet.</p>
      ) : (
        <ul className="plain">
          {table.foreign_keys.map((fk) => (
            <li key={fk.id} className="ident">{fk.columns.join(", ")} references {fk.ref_table}({fk.ref_columns.join(", ")})</li>
          ))}
        </ul>
      )}
      <ForeignKeyForm table={table} schema={schema} attempt={attempt} onChange={onChange} />

      <h4>Functional dependencies</h4>
      <p className="muted">
        The primary key and unique columns already count as dependencies. Add the others your data follows,
        for example <span className="ident">student_id</span> determines <span className="ident">student_name</span>.
      </p>
      {table.fds.length > 0 && (
        <ul className="plain fd-list">
          {table.fds.map((f) => (
            <li key={f.id}>
              <span className="ident">{f.lhs.join(", ")} → {f.rhs.join(", ")}</span>
              <button type="button" className="link danger-text" onClick={() => removeFd(f.id)} aria-label={`Remove dependency ${f.lhs.join(", ")} to ${f.rhs.join(", ")}`}>Remove</button>
            </li>
          ))}
        </ul>
      )}
      <DependencyForm table={table} attempt={attempt} onChange={onChange} />
    </section>
  );
}
