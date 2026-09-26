// MySQL persistence layer (mysql2 connection pool).
import "dotenv/config";
import mysql from "mysql2/promise";
import { DesignerError, validateIdentifier, validateType } from "./ddl.js";

export const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "schema_designer",
  waitForConnections: true,
  connectionLimit: 10,
});

const one = async (sql, params) => (await pool.query(sql, params))[0][0];
const all = async (sql, params) => (await pool.query(sql, params))[0];

/** Run several statements atomically on one connection. */
async function transaction(work) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await work(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    if (err.code === "ER_DUP_ENTRY") throw new DesignerError("That name already exists.", 409);
    if (err.code === "ER_NO_REFERENCED_ROW_2") throw new DesignerError("The project or table no longer exists.", 404);
    throw err;
  } finally {
    conn.release();
  }
}

// ---------------------------------------------------------------- projects
export const listProjects = () => all("SELECT id, name FROM projects ORDER BY name");

export async function createProject(name) {
  const clean = String(name ?? "").trim();
  if (!clean || clean.length > 100) throw new DesignerError("Project name must be 1-100 characters.");
  const id = await transaction(async (conn) => (await conn.query("INSERT INTO projects (name) VALUES (?)", [clean]))[0].insertId);
  return { id, name: clean };
}

export const deleteProject = (id) => pool.query("DELETE FROM projects WHERE id = ?", [id]);

// ------------------------------------------------------------------ tables
export async function addTable(projectId, name, columns) {
  const tableName = validateIdentifier(name, "table name");
  if (!Array.isArray(columns) || columns.length === 0) throw new DesignerError("A table needs at least one column.");
  const seen = new Set();
  const rows = columns.map((c, position) => {
    const columnName = validateIdentifier(c.name, "column name");
    if (seen.has(columnName)) throw new DesignerError(`Duplicate column '${columnName}'.`);
    seen.add(columnName);
    const isPk = Boolean(c.is_primary_key);
    return [
      columnName,
      validateType(c.data_type || "VARCHAR(100)"),
      isPk,
      c.is_nullable !== false && !isPk,
      Boolean(c.is_unique) && !isPk,
      position,
    ];
  });
  return transaction(async (conn) => {
    const [res] = await conn.query("INSERT INTO design_tables (project_id, name) VALUES (?, ?)", [projectId, tableName]);
    await conn.query(
      "INSERT INTO design_columns (table_id, name, data_type, is_primary_key, is_nullable, is_unique, position) VALUES ?",
      [rows.map((r) => [res.insertId, ...r])]
    );
    return res.insertId;
  });
}

export const deleteTable = (id) => pool.query("DELETE FROM design_tables WHERE id = ?", [id]);

export async function addForeignKey(tableId, column, refTable, refColumn) {
  const table = await one("SELECT project_id FROM design_tables WHERE id = ?", [tableId]);
  if (!table) throw new DesignerError("Table not found.", 404);
  const col = await one("SELECT id FROM design_columns WHERE table_id = ? AND name = ?", [tableId, column]);
  const ref = await one(
    `SELECT c.id AS column_id, t.id AS table_id FROM design_columns c
       JOIN design_tables t ON t.id = c.table_id
      WHERE t.project_id = ? AND t.name = ? AND c.name = ?`,
    [table.project_id, refTable, refColumn]
  );
  if (!col || !ref) throw new DesignerError("Column or referenced table/column not found.");
  return transaction(async (conn) => {
    const [res] = await conn.query(
      "INSERT INTO design_foreign_keys (table_id, column_id, ref_table_id, ref_column_id) VALUES (?, ?, ?, ?)",
      [tableId, col.id, ref.table_id, ref.column_id]
    );
    return res.insertId;
  });
}

// ------------------------------------------------------------ dependencies
export async function addFd(tableId, lhsIn, rhsIn) {
  const lhs = [...new Set(lhsIn ?? [])];
  const rhs = [...new Set(rhsIn ?? [])];
  if (!lhs.length || !rhs.length) throw new DesignerError("A dependency needs at least one column on each side.");
  if (rhs.every((c) => lhs.includes(c))) throw new DesignerError("That dependency is trivial (right side is inside the left side).");
  const rows = await all("SELECT id, name FROM design_columns WHERE table_id = ?", [tableId]);
  const ids = new Map(rows.map((r) => [r.name, r.id]));
  const unknown = [...lhs, ...rhs].filter((c) => !ids.has(c));
  if (unknown.length) throw new DesignerError(`Unknown column(s): ${unknown.join(", ")}`);
  return transaction(async (conn) => {
    const [res] = await conn.query("INSERT INTO functional_dependencies (table_id) VALUES (?)", [tableId]);
    const attrs = [...lhs.map((c) => [res.insertId, ids.get(c), "LHS"]), ...rhs.map((c) => [res.insertId, ids.get(c), "RHS"])];
    await conn.query("INSERT INTO fd_attributes (fd_id, column_id, side) VALUES ?", [attrs]);
    return res.insertId;
  });
}

export const deleteFd = (id) => pool.query("DELETE FROM functional_dependencies WHERE id = ?", [id]);

// -------------------------------------------------------------------- read
/** Everything about a project: tables with columns, foreign keys and FDs. */
export async function getSchema(projectId) {
  const tables = await all("SELECT id, name FROM design_tables WHERE project_id = ? ORDER BY name", [projectId]);
  const byId = new Map(tables.map((t) => [t.id, { ...t, columns: [], foreign_keys: [], fds: [] }]));

  const columns = await all(
    `SELECT c.* FROM design_columns c JOIN design_tables t ON t.id = c.table_id
      WHERE t.project_id = ? ORDER BY c.table_id, c.position`,
    [projectId]
  );
  for (const c of columns) {
    byId.get(c.table_id).columns.push({
      ...c,
      is_primary_key: Boolean(c.is_primary_key),
      is_nullable: Boolean(c.is_nullable),
      is_unique: Boolean(c.is_unique),
    });
  }

  const fks = await all(
    `SELECT fk.id, fk.table_id, c.name AS column_name, rt.name AS ref_table, rc.name AS ref_column
       FROM design_foreign_keys fk
       JOIN design_tables t ON t.id = fk.table_id
       JOIN design_columns c ON c.id = fk.column_id
       JOIN design_tables rt ON rt.id = fk.ref_table_id
       JOIN design_columns rc ON rc.id = fk.ref_column_id
      WHERE t.project_id = ? ORDER BY fk.id`,
    [projectId]
  );
  for (const fk of fks) {
    byId.get(fk.table_id).foreign_keys.push({
      id: fk.id,
      columns: [fk.column_name],
      ref_table: fk.ref_table,
      ref_columns: [fk.ref_column],
    });
  }

  const rows = await all(
    `SELECT f.id, f.table_id, fa.side, c.name
       FROM functional_dependencies f
       JOIN fd_attributes fa ON fa.fd_id = f.id
       JOIN design_columns c ON c.id = fa.column_id
       JOIN design_tables t ON t.id = f.table_id
      WHERE t.project_id = ? ORDER BY f.id, c.position`,
    [projectId]
  );
  const fds = new Map();
  for (const r of rows) {
    if (!fds.has(r.id)) fds.set(r.id, { id: r.id, table_id: r.table_id, lhs: [], rhs: [] });
    fds.get(r.id)[r.side === "LHS" ? "lhs" : "rhs"].push(r.name);
  }
  for (const f of fds.values()) byId.get(f.table_id).fds.push(f);

  return [...byId.values()];
}

export async function getTable(tableId) {
  const row = await one("SELECT project_id FROM design_tables WHERE id = ?", [tableId]);
  if (!row) throw new DesignerError("Table not found.", 404);
  const schema = await getSchema(row.project_id);
  return schema.find((t) => t.id === Number(tableId));
}
