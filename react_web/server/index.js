// Express API for the Schema Designer & Normalization Advisor.
import cors from "cors";
import express from "express";
import { analyzeTable } from "./analysis.js";
import * as db from "./db.js";
import { DesignerError, decompositionDdl, schemaDdl } from "./ddl.js";

const app = express();
app.use(cors());
app.use(express.json());

// wraps async handlers so thrown errors reach the error middleware
const route = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).then((data) => data !== undefined && res.json(data)).catch(next);
const id = (req, name = "id") => {
  const n = Number(req.params[name]);
  if (!Number.isInteger(n) || n < 1) throw new DesignerError("Invalid id.");
  return n;
};

// ---- projects
app.get("/api/projects", route(() => db.listProjects()));
app.post("/api/projects", route(async (req, res) => {
  res.status(201);
  return db.createProject(req.body.name);
}));
app.delete("/api/projects/:id", route(async (req) => {
  await db.deleteProject(id(req));
  return { ok: true };
}));

// ---- schema of a project
app.get("/api/projects/:id/schema", route((req) => db.getSchema(id(req))));
app.get("/api/projects/:id/ddl", route(async (req) => {
  const tables = await db.getSchema(id(req));
  return { ddl: tables.length ? schemaDdl(tables) : "-- This project has no tables yet.\n" };
}));

// ---- tables
app.post("/api/projects/:id/tables", route(async (req, res) => {
  const tableId = await db.addTable(id(req), req.body.name, req.body.columns);
  res.status(201);
  return { id: tableId };
}));
app.delete("/api/tables/:id", route(async (req) => {
  await db.deleteTable(id(req));
  return { ok: true };
}));
app.post("/api/tables/:id/foreign-keys", route(async (req, res) => {
  const { column_name, ref_table, ref_column } = req.body;
  const fkId = await db.addForeignKey(id(req), column_name, ref_table, ref_column);
  res.status(201);
  return { id: fkId };
}));

// ---- functional dependencies
app.post("/api/tables/:id/fds", route(async (req, res) => {
  const fdId = await db.addFd(id(req), req.body.lhs, req.body.rhs);
  res.status(201);
  return { id: fdId };
}));
app.delete("/api/fds/:id", route(async (req) => {
  await db.deleteFd(id(req));
  return { ok: true };
}));

// ---- analysis and SQL export
app.get("/api/tables/:id/analysis", route(async (req) => analyzeTable(await db.getTable(id(req)))));
app.get("/api/tables/:id/ddl", route(async (req) => {
  const table = await db.getTable(id(req));
  const mode = req.query.mode;
  if (mode !== "3nf" && mode !== "bcnf") throw new DesignerError("mode must be '3nf' or 'bcnf'.");
  const result = analyzeTable(table);
  const relations = (mode === "3nf" ? result.decomposition_3nf : result.decomposition_bcnf).relations;
  return { ddl: decompositionDdl(table, relations) };
}));

// ---- errors
app.use((err, req, res, next) => {
  if (err instanceof DesignerError) return res.status(err.status).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: "Something went wrong on the server. Check that MySQL is running and schema.sql was loaded." });
});

const port = Number(process.env.PORT || 4000);
app.listen(port, () => console.log(`API listening on http://localhost:${port}`));
