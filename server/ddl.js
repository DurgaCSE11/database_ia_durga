// Input validation and MySQL DDL generation.

const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
const TYPE_RE = /^[A-Za-z]+(\(\s*\d+(\s*,\s*\d+)?\s*\))?(\s+UNSIGNED)?$/i;

/** A problem the user can fix (bad name, unknown column, duplicate...). Sent to the client as HTTP 400/409. */
export class DesignerError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

export function validateIdentifier(value, label = "name") {
  const v = String(value ?? "").trim();
  if (!IDENT_RE.test(v)) {
    throw new DesignerError(
      `Invalid ${label} '${v}'. Use letters, digits and underscores; start with a letter or underscore; max 64 characters.`
    );
  }
  return v;
}

export function validateType(value) {
  const v = String(value ?? "").trim();
  if (!TYPE_RE.test(v)) {
    throw new DesignerError(`Invalid data type '${v}'. Examples: INT, VARCHAR(100), DECIMAL(10,2), DATE.`);
  }
  return v.toUpperCase();
}

const q = (name) => "`" + name.replaceAll("`", "``") + "`";
const cols = (names) => names.map(q).join(", ");
const fkSql = (fk) => `FOREIGN KEY (${cols(fk.columns)}) REFERENCES ${q(fk.ref_table)} (${cols(fk.ref_columns)})`;

/** CREATE TABLE statement. `fks` overrides which foreign keys are written inline. */
export function tableDdl(table, fks = table.foreign_keys) {
  const pk = table.columns.filter((c) => c.is_primary_key).map((c) => c.name);
  const lines = table.columns.map((c) =>
    [q(c.name), c.data_type, c.is_primary_key || !c.is_nullable ? "NOT NULL" : ""].filter(Boolean).join(" ")
  );
  if (pk.length) lines.push(`PRIMARY KEY (${cols(pk)})`);
  for (const c of table.columns) {
    if (c.is_unique && !(pk.length === 1 && pk[0] === c.name)) lines.push(`UNIQUE (${q(c.name)})`);
  }
  fks.forEach((fk) => lines.push(fkSql(fk)));
  return `CREATE TABLE ${q(table.name)} (\n  ${lines.join(",\n  ")}\n) ENGINE=InnoDB;`;
}

/**
 * DDL for a whole design, referenced tables first.
 * Foreign keys that cannot be written inline (circular references)
 * are emitted as ALTER TABLE statements at the end.
 */
export function schemaDdl(tables) {
  const names = new Set(tables.map((t) => t.name));
  let remaining = [...tables].sort((a, b) => a.name.localeCompare(b.name));
  const emitted = new Set();
  const blocks = [];
  const alters = [];
  const targets = (t) => new Set(t.foreign_keys.map((fk) => fk.ref_table).filter((n) => names.has(n) && n !== t.name));

  while (remaining.length) {
    let ready = remaining.filter((t) => [...targets(t)].every((n) => emitted.has(n)));
    const cyclic = ready.length === 0;
    if (cyclic) ready = remaining.slice(0, 1);
    for (const t of ready) {
      const inline = t.foreign_keys.filter((fk) => !cyclic || emitted.has(fk.ref_table) || fk.ref_table === t.name);
      blocks.push(tableDdl(t, inline));
      t.foreign_keys
        .filter((fk) => !inline.includes(fk))
        .forEach((fk) => alters.push(`ALTER TABLE ${q(t.name)} ADD ${fkSql(fk)};`));
      emitted.add(t.name);
    }
    remaining = remaining.filter((t) => !emitted.has(t.name));
  }
  return [...blocks, ...alters].join("\n\n") + "\n";
}

/**
 * DDL for a suggested decomposition (each new table is named <table>_<primary key columns>).
 * `relations` comes from analyze(): [{ attributes: [...], keys: [[...], ...] }, ...]
 */
export function decompositionDdl(table, relations) {
  const order = table.columns.map((c) => c.name);
  const originals = new Map(table.columns.map((c) => [c.name, c]));
  const primary = relations.map((r) => new Set(r.keys[0]));
  const used = new Set();
  const names = primary.map((pk) => {
    const base = `${table.name}_${order.filter((n) => pk.has(n)).join("_")}`.slice(0, 60);
    let name = base;
    for (let n = 2; used.has(name); n++) name = `${base}_${n}`;
    used.add(name);
    return name;
  });

  const tables = relations.map((rel, i) => {
    const attrs = new Set(rel.attributes);
    const columns = order
      .filter((n) => attrs.has(n))
      .map((n) => ({ ...originals.get(n), is_primary_key: primary[i].has(n), is_unique: false }));
    const foreign_keys = [];
    relations.forEach((_, j) => {
      const otherKey = primary[j];
      const holdsKey = [...otherKey].every((n) => attrs.has(n));
      const sameKey = otherKey.size === primary[i].size && [...otherKey].every((n) => primary[i].has(n));
      if (i !== j && holdsKey && !sameKey) {
        const keyCols = order.filter((n) => otherKey.has(n));
        foreign_keys.push({ columns: keyCols, ref_table: names[j], ref_columns: keyCols });
      }
    });
    return { name: names[i], columns, foreign_keys };
  });
  return schemaDdl(tables);
}
