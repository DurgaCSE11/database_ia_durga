import { useState } from "react";

const TYPES = ["INT", "BIGINT", "VARCHAR(100)", "VARCHAR(255)", "TEXT", "DATE", "DATETIME", "DECIMAL(10,2)", "BOOLEAN", "CHAR(2)"];
const blankColumn = () => ({ name: "", data_type: "VARCHAR(100)", is_primary_key: false, is_nullable: true, is_unique: false });

export default function NewTableForm({ onSave, onCancel }) {
  const [name, setName] = useState("");
  const [columns, setColumns] = useState([blankColumn()]);
  const [saving, setSaving] = useState(false);

  const update = (i, patch) => setColumns((cols) => cols.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const remove = (i) => setColumns((cols) => cols.filter((_, j) => j !== i));

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    await onSave(name, columns.filter((c) => c.name.trim()));
    setSaving(false);
  };

  return (
    <form className="panel" onSubmit={submit}>
      <h3>New table</h3>
      <div className="field">
        <label htmlFor="table-name">Table name</label>
        <input id="table-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="enrollment" required />
      </div>

      <datalist id="type-options">{TYPES.map((t) => <option key={t} value={t} />)}</datalist>

      <div className="col-editor">
        <div className="col-row col-head" aria-hidden="true">
          <span>Column</span><span>Type</span><span>Primary key</span><span>Allow NULL</span><span>Unique</span><span />
        </div>
        {columns.map((c, i) => (
          <div className="col-row" key={i}>
            <input aria-label={`Column ${i + 1} name`} value={c.name} onChange={(e) => update(i, { name: e.target.value })} placeholder="student_id" />
            <input aria-label={`Column ${i + 1} type`} list="type-options" value={c.data_type} onChange={(e) => update(i, { data_type: e.target.value })} />
            <input type="checkbox" aria-label={`Column ${i + 1} is part of the primary key`} checked={c.is_primary_key}
              onChange={(e) => update(i, { is_primary_key: e.target.checked, is_nullable: e.target.checked ? false : c.is_nullable })} />
            <input type="checkbox" aria-label={`Column ${i + 1} allows NULL`} checked={c.is_nullable && !c.is_primary_key} disabled={c.is_primary_key}
              onChange={(e) => update(i, { is_nullable: e.target.checked })} />
            <input type="checkbox" aria-label={`Column ${i + 1} is unique`} checked={c.is_unique} onChange={(e) => update(i, { is_unique: e.target.checked })} />
            <button type="button" className="link" onClick={() => remove(i)} disabled={columns.length === 1}>Remove</button>
          </div>
        ))}
      </div>

      <div className="actions">
        <button type="button" className="secondary" onClick={() => setColumns((cols) => [...cols, blankColumn()])}>Add column</button>
        <button type="submit" disabled={saving || !name.trim() || !columns.some((c) => c.name.trim())}>Save table</button>
        {onCancel && <button type="button" className="link" onClick={onCancel}>Cancel</button>}
      </div>
    </form>
  );
}
