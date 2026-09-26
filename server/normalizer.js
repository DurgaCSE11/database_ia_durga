// Normalization engine (pure JavaScript, no database access).
// Attribute sets are JavaScript Sets of column names.
// A functional dependency (FD) is { lhs: Set, rhs: Set }.

export const MAX_COLUMNS = 14; // analysis is exponential in the number of columns

// ---------------------------------------------------------------- set helpers
const isSubset = (a, b) => [...a].every((x) => b.has(x));
const union = (...sets) => new Set(sets.flatMap((s) => [...s]));
const minus = (a, b) => new Set([...a].filter((x) => !b.has(x)));
const inter = (a, b) => new Set([...a].filter((x) => b.has(x)));
const sameSet = (a, b) => a.size === b.size && isSubset(a, b);
const sorted = (s) => [...s].sort();
const setKey = (s) => sorted(s).join("\u0000");
const compareSets = (a, b) => a.size - b.size || setKey(a).localeCompare(setKey(b));
const compareLists = (a, b) => sorted(a).join(",").localeCompare(sorted(b).join(","));

function* combinations(arr, size, start = 0, prefix = []) {
  if (prefix.length === size) {
    yield prefix;
    return;
  }
  for (let i = start; i < arr.length; i++) yield* combinations(arr, size, i + 1, [...prefix, arr[i]]);
}

export const fd = (lhs, rhs) => ({ lhs: new Set(lhs), rhs: new Set(rhs) });
const fdKey = (f) => `${setKey(f.lhs)}=>${setKey(f.rhs)}`;

// ---------------------------------------------------------------- basics
/** Attribute closure X+ under the given FDs. */
export function closure(attrs, fds) {
  const result = new Set(attrs);
  let changed = true;
  while (changed) {
    changed = false;
    for (const { lhs, rhs } of fds) {
      if (isSubset(lhs, result) && !isSubset(rhs, result)) {
        rhs.forEach((a) => result.add(a));
        changed = true;
      }
    }
  }
  return result;
}

export const isSuperkey = (attrs, relation, fds) => isSubset(new Set(relation), closure(attrs, fds));

/** All minimal keys of `relation`. */
export function candidateKeys(relation, fds) {
  const rel = new Set(relation);
  // an attribute is in EVERY key when the rest of the relation cannot determine it
  const must = new Set([...rel].filter((a) => !isSubset(rel, closure(minus(rel, new Set([a])), fds))));
  if (isSubset(rel, closure(must, fds))) return [must];
  const rest = sorted(minus(rel, must));
  if (rest.length > MAX_COLUMNS) throw new Error("Too many columns to search for candidate keys.");
  const keys = [];
  for (let size = 1; size <= rest.length; size++) {
    for (const combo of combinations(rest, size)) {
      const cand = union(must, new Set(combo));
      if (keys.some((k) => isSubset(k, cand))) continue; // not minimal
      if (isSubset(rel, closure(cand, fds))) keys.push(cand);
    }
  }
  return keys.sort(compareSets);
}

/** Rewrite every FD with a single attribute on the right (trivial parts dropped). */
export function splitRhs(fds) {
  const out = new Map();
  for (const { lhs, rhs } of fds) {
    for (const attr of sorted(minus(rhs, lhs))) {
      const f = fd(lhs, [attr]);
      out.set(fdKey(f), f);
    }
  }
  return [...out.values()];
}

/** Canonical cover: singleton RHS, no extraneous LHS attributes, no redundant FDs. */
export function minimalCover(fds) {
  const g = splitRhs(fds);
  const reduced = new Map();
  for (const { lhs, rhs } of g) {
    const left = new Set(lhs);
    for (const b of sorted(lhs)) {
      if (left.size > 1 && isSubset(rhs, closure(minus(left, new Set([b])), g))) left.delete(b);
    }
    const f = fd(left, rhs);
    reduced.set(fdKey(f), f);
  }
  let cover = [...reduced.values()];
  for (const f of [...cover]) {
    const rest = cover.filter((x) => x !== f);
    if (isSubset(f.rhs, closure(f.lhs, rest))) cover = rest;
  }
  return cover;
}

export function groupByLhs(fds) {
  const groups = new Map();
  for (const { lhs, rhs } of fds) {
    const k = setKey(lhs);
    if (!groups.has(k)) groups.set(k, { lhs, rhs: new Set() });
    rhs.forEach((a) => groups.get(k).rhs.add(a));
  }
  return [...groups.values()];
}

// ------------------------------------------------------- decomposition
const uniqueSets = (sets) => {
  const seen = new Map();
  sets.forEach((s) => seen.set(setKey(s), s));
  return [...seen.values()];
};

/** 3NF synthesis: lossless and dependency preserving. */
export function synthesize3NF(relation, fds) {
  let schemas = uniqueSets(groupByLhs(minimalCover(fds)).map(({ lhs, rhs }) => union(lhs, rhs)));
  schemas = schemas.filter((s) => !schemas.some((t) => t.size > s.size && isSubset(s, t)));
  const keys = candidateKeys(relation, fds);
  if (!keys.some((k) => schemas.some((s) => isSubset(k, s)))) schemas.push(keys[0]); // lossless join
  return schemas.sort((a, b) => compareLists(a, b));
}

function findBcnfViolation(rel, fds) {
  const attrs = sorted(rel);
  for (let size = 1; size < attrs.length; size++) {
    for (const combo of combinations(attrs, size)) {
      const x = new Set(combo);
      const c = inter(closure(x, fds), rel);
      if (!sameSet(c, x) && !sameSet(c, rel)) return { x, c }; // x determines more but is not a key
    }
  }
  return null;
}

/** BCNF decomposition: lossless, but may lose dependencies. */
export function decomposeBCNF(relation, fds) {
  const work = [new Set(relation)];
  const done = [];
  while (work.length) {
    const rel = work.pop();
    const violation = findBcnfViolation(rel, fds);
    if (!violation) done.push(rel);
    else {
      work.push(violation.c);
      work.push(union(minus(rel, violation.c), violation.x));
    }
  }
  return uniqueSets(done).sort(compareLists);
}

export function preservesDependencies(parts, fds) {
  return fds.every(({ lhs, rhs }) => {
    const result = new Set(lhs);
    let changed = true;
    while (changed) {
      changed = false;
      for (const ri of parts) {
        for (const a of inter(closure(inter(result, ri), fds), ri)) {
          if (!result.has(a)) {
            result.add(a);
            changed = true;
          }
        }
      }
    }
    return isSubset(rhs, result);
  });
}

// ------------------------------------------------------------ analysis
const KIND_ORDER = { partial: 0, transitive: 1, bcnf: 2 };
const list = (s) => sorted(s).join(", ");

function explain(kind, lhs, attrs, keys) {
  const x = list(lhs);
  const y = list(attrs);
  if (kind === "partial") {
    const key = keys.find((k) => k.size > lhs.size && isSubset(lhs, k));
    return `${x} is only part of the key (${list(key)}), yet it determines ${y}. Partial dependency: violates 2NF.`;
  }
  if (kind === "transitive") return `${x} is not a key, yet it determines ${y}. Transitive dependency: violates 3NF.`;
  return `${x} is not a key but determines ${y}, which is part of a key. Allowed by 3NF, violates BCNF.`;
}

function describe(parts, fds) {
  return {
    relations: parts.map((p) => ({ attributes: sorted(p), keys: candidateKeys(p, fds).map(sorted) })),
    lossless: true,
    dependency_preserving: preservesDependencies(parts, fds),
  };
}

/**
 * Full normalization report for one table.
 * Assumes the table is already in 1NF (every column holds atomic values).
 */
export function analyze(relationNames, fds) {
  const relation = new Set(relationNames);
  if (relation.size === 0) throw new Error("The table has no columns.");
  if (relation.size > MAX_COLUMNS) throw new Error(`Analysis supports up to ${MAX_COLUMNS} columns per table.`);
  for (const { lhs, rhs } of fds) {
    const unknown = minus(union(lhs, rhs), relation);
    if (unknown.size) throw new Error(`Dependency uses unknown column(s): ${list(unknown)}`);
  }

  const keys = candidateKeys(relation, fds);
  const prime = union(...keys);

  const grouped = new Map();
  for (const { lhs, rhs } of splitRhs(fds)) {
    const [attr] = rhs;
    if (isSuperkey(lhs, relation, fds)) continue;
    let kind;
    if (prime.has(attr)) kind = "bcnf";
    else if (keys.some((k) => k.size > lhs.size && isSubset(lhs, k))) kind = "partial";
    else kind = "transitive";
    const gk = `${setKey(lhs)}|${kind}`;
    if (!grouped.has(gk)) grouped.set(gk, { lhs, kind, attrs: new Set() });
    grouped.get(gk).attrs.add(attr);
  }

  const violations = [...grouped.values()]
    .map(({ lhs, kind, attrs }) => ({
      lhs: sorted(lhs),
      rhs: sorted(attrs),
      kind,
      explanation: explain(kind, lhs, attrs, keys),
    }))
    .sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.lhs.join(",").localeCompare(b.lhs.join(",")));

  const kinds = new Set(violations.map((v) => v.kind));
  let normalForm;
  if (kinds.size === 0) normalForm = "BCNF";
  else if (kinds.size === 1 && kinds.has("bcnf")) normalForm = "3NF";
  else if (!kinds.has("partial")) normalForm = "2NF";
  else normalForm = "1NF";

  const parts3nf = ["3NF", "BCNF"].includes(normalForm) ? [relation] : synthesize3NF(relation, fds);
  const partsBcnf = normalForm === "BCNF" ? [relation] : decomposeBCNF(relation, fds);

  return {
    relation: sorted(relation),
    candidate_keys: keys.map(sorted),
    prime_attributes: sorted(prime),
    non_prime_attributes: sorted(minus(relation, prime)),
    minimal_cover: groupByLhs(minimalCover(fds)).map(({ lhs, rhs }) => ({ lhs: sorted(lhs), rhs: sorted(rhs) })),
    normal_form: normalForm,
    violations,
    needs_3nf: ["1NF", "2NF"].includes(normalForm),
    needs_bcnf: normalForm !== "BCNF",
    decomposition_3nf: describe(parts3nf, fds),
    decomposition_bcnf: describe(partsBcnf, fds),
  };
}
