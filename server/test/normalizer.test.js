import assert from "node:assert/strict";
import test from "node:test";
import { decompositionDdl, schemaDdl, validateIdentifier, validateType } from "../ddl.js";
import { analyze, candidateKeys, closure, fd, minimalCover } from "../normalizer.js";

const fds = (text) => text.split(";").map((p) => {
  const [l, r] = p.split("->");
  return fd(l.split(",").map((s) => s.trim()), r.split(",").map((s) => s.trim()));
});

test("closure", () => {
  assert.deepEqual([...closure(["A"], fds("A->B; B->C"))].sort(), ["A", "B", "C"]);
});

test("multiple candidate keys", () => {
  assert.deepEqual(candidateKeys(["A", "B", "C"], fds("A,B->C; C->B")).map((k) => [...k].sort()), [["A", "B"], ["A", "C"]]);
});

test("minimal cover drops redundant dependencies", () => {
  const cover = minimalCover(fds("A->B; B->C; A->C; A,B->C"));
  assert.equal(cover.length, 2);
});

test("partial dependency => 1NF and 3NF split", () => {
  const r = analyze(["sid", "cid", "sname", "grade"], fds("sid,cid->grade; sid->sname"));
  assert.equal(r.normal_form, "1NF");
  assert.equal(r.violations[0].kind, "partial");
  assert.deepEqual(r.decomposition_3nf.relations.map((x) => x.attributes).sort(), [["cid", "grade", "sid"], ["sid", "sname"]]);
  assert.equal(r.decomposition_3nf.dependency_preserving, true);
});

test("transitive dependency => 2NF", () => {
  const r = analyze(["emp", "name", "dept", "dname"], fds("emp->name,dept; dept->dname"));
  assert.equal(r.normal_form, "2NF");
  assert.equal(r.violations[0].kind, "transitive");
});

test("3NF but not BCNF loses a dependency when split", () => {
  const r = analyze(["A", "B", "C"], fds("A,B->C; C->B"));
  assert.equal(r.normal_form, "3NF");
  assert.equal(r.needs_3nf, false);
  assert.equal(r.decomposition_bcnf.dependency_preserving, false);
});

test("BCNF table has no violations", () => {
  const r = analyze(["A", "B", "C"], fds("A->B,C"));
  assert.equal(r.normal_form, "BCNF");
  assert.deepEqual(r.violations, []);
});

test("validation rejects injection", () => {
  assert.equal(validateType("varchar(50)"), "VARCHAR(50)");
  assert.throws(() => validateIdentifier("x; DROP TABLE y"));
  assert.throws(() => validateType("INT); DROP TABLE x; --"));
});

test("ddl orders tables and adds foreign keys to decompositions", () => {
  const col = (name, pk = false) => ({ name, data_type: "INT", is_primary_key: pk, is_nullable: !pk, is_unique: false });
  const ddl = schemaDdl([
    { name: "orders", columns: [col("id", true), col("customer_id")], foreign_keys: [{ columns: ["customer_id"], ref_table: "customers", ref_columns: ["id"] }] },
    { name: "customers", columns: [col("id", true)], foreign_keys: [] },
  ]);
  assert.ok(ddl.indexOf("CREATE TABLE `customers`") < ddl.indexOf("CREATE TABLE `orders`"));

  const table = { name: "emp", columns: ["emp", "name", "dept", "dname"].map((n) => col(n, n === "emp")), foreign_keys: [], fds: [] };
  const r = analyze(["emp", "name", "dept", "dname"], fds("emp->name,dept; dept->dname"));
  const out = decompositionDdl(table, r.decomposition_3nf.relations);
  assert.match(out, /CREATE TABLE `emp_dept`/);
  assert.match(out, /REFERENCES/);
});
