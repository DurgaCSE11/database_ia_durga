import { useEffect, useState } from "react";
import { api } from "../api.js";

const LADDER = ["1NF", "2NF", "3NF", "BCNF"];

function Ladder({ reached }) {
  const level = LADDER.indexOf(reached);
  return (
    <ol className="ladder" aria-label="Normal forms">
      {LADDER.map((nf, i) => (
        <li key={nf} className={i <= level ? "rung reached" : "rung"} aria-current={i === level ? "step" : undefined}>
          {nf}
        </li>
      ))}
    </ol>
  );
}

// Relational notation: key attributes are underlined.
function Relation({ index, relation }) {
  const key = new Set(relation.keys[0]);
  return (
    <li className="relation ident">
      R{index}(
      {relation.attributes.map((a, i) => (
        <span key={a}>
          {i > 0 && ", "}
          {key.has(a) ? <u>{a}</u> : a}
        </span>
      ))}
      )
      {relation.keys.length > 1 && <span className="muted"> also keys: {relation.keys.slice(1).map((k) => `{${k.join(", ")}}`).join(" ")}</span>}
    </li>
  );
}

function Decomposition({ title, needed, data, onSql }) {
  return (
    <section className="decomp">
      <h4>{title}</h4>
      {!needed ? (
        <p className="muted">Already satisfied, so no split is needed.</p>
      ) : (
        <>
          <ul className="plain">
            {data.relations.map((r, i) => <Relation key={i} index={i + 1} relation={r} />)}
          </ul>
          <p className="facts">
            <span className="ok">Lossless join</span>
            {data.dependency_preserving ? (
              <span className="ok">Keeps every dependency</span>
            ) : (
              <span className="bad">Loses at least one dependency</span>
            )}
          </p>
          <button type="button" className="secondary" onClick={onSql}>View SQL for {title}</button>
        </>
      )}
    </section>
  );
}

export default function Advisor({ table, onSql }) {
  const [state, setState] = useState({ tableId: null });

  useEffect(() => {
    let cancelled = false;
    api.analysis(table.id)
      .then((result) => !cancelled && setState({ tableId: table.id, result }))
      .catch((e) => !cancelled && setState({ tableId: table.id, error: e.message }));
    return () => { cancelled = true; };
  }, [table]);

  const ready = state.tableId === table.id;
  const r = ready ? state.result : null;

  return (
    <section className="panel advisor" aria-labelledby="advisor-heading" aria-live="polite">
      <h3 id="advisor-heading">Normalization advisor</h3>
      {!ready && <p className="muted">Analyzing…</p>}
      {ready && state.error && <p className="bad">{state.error}</p>}
      {r && (
        <>
          <Ladder reached={r.normal_form} />
          <p className="verdict">
            {r.violations.length === 0
              ? "This table is in Boyce-Codd normal form. Nothing to fix."
              : `Highest normal form reached: ${r.normal_form}. ${r.violations.length} problem${r.violations.length > 1 ? "s" : ""} to fix.`}
          </p>
          <p className="muted small">Assumes every column holds a single value (1NF).</p>

          <dl className="facts-list">
            <dt>Candidate keys</dt>
            <dd className="ident">{r.candidate_keys.map((k) => `{${k.join(", ")}}`).join("  ")}</dd>
            <dt>Non-key attributes</dt>
            <dd className="ident">{r.non_prime_attributes.join(", ") || "none"}</dd>
            <dt>Minimal cover</dt>
            <dd className="ident">
              {r.minimal_cover.length ? r.minimal_cover.map((f, i) => <div key={i}>{f.lhs.join(", ")} → {f.rhs.join(", ")}</div>) : "none"}
            </dd>
          </dl>

          {r.violations.length > 0 && (
            <>
              <h4>Problems</h4>
              <ul className="plain problems">
                {r.violations.map((v, i) => (
                  <li key={i}>
                    <div className="ident bad">{v.lhs.join(", ")} → {v.rhs.join(", ")}</div>
                    <div>{v.explanation}</div>
                  </li>
                ))}
              </ul>
            </>
          )}

          <Decomposition title="3NF" needed={r.needs_3nf} data={r.decomposition_3nf} onSql={() => onSql("3nf")} />
          <Decomposition title="BCNF" needed={r.needs_bcnf} data={r.decomposition_bcnf} onSql={() => onSql("bcnf")} />
        </>
      )}
    </section>
  );
}
