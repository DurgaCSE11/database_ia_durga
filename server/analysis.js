// Glue between stored designs and the normalization engine.
import { DesignerError } from "./ddl.js";
import { analyze, fd } from "./normalizer.js";

/** Stored FDs plus the ones implied by the PRIMARY KEY and UNIQUE columns. */
export function buildFds(table) {
  const everything = table.columns.map((c) => c.name);
  const fds = table.fds.map((f) => fd(f.lhs, f.rhs));
  const pk = table.columns.filter((c) => c.is_primary_key).map((c) => c.name);
  if (pk.length) fds.push(fd(pk, everything));
  table.columns.filter((c) => c.is_unique).forEach((c) => fds.push(fd([c.name], everything)));
  return fds;
}

export function analyzeTable(table) {
  try {
    return analyze(table.columns.map((c) => c.name), buildFds(table));
  } catch (err) {
    throw new DesignerError(err.message); // engine limits (too many columns...) are user-facing
  }
}
