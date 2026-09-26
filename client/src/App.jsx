import { useCallback, useEffect, useState } from "react";
import { api } from "./api.js";
import Advisor from "./components/Advisor.jsx";
import NewTableForm from "./components/NewTableForm.jsx";
import SqlDialog from "./components/SqlDialog.jsx";
import TablePanel from "./components/TablePanel.jsx";

export default function App() {
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState(null);
  const [schema, setSchema] = useState([]);
  const [tableId, setTableId] = useState(null);
  const [adding, setAdding] = useState(false);
  const [newProject, setNewProject] = useState("");
  const [error, setError] = useState("");
  const [sql, setSql] = useState(null);

  // runs an action and shows any failure in the banner instead of crashing
  const attempt = useCallback(async (fn) => {
    try {
      setError("");
      return await fn();
    } catch (e) {
      setError(e.message);
    }
  }, []);

  const loadProjects = useCallback(async (selectId) => {
    const list = await api.projects();
    setProjects(list);
    setProjectId((current) => selectId ?? (list.some((p) => p.id === current) ? current : list[0]?.id ?? null));
  }, []);

  const loadSchema = useCallback(async () => {
    if (!projectId) {
      setSchema([]);
      return;
    }
    const tables = await api.schema(projectId);
    setSchema(tables);
    setTableId((current) => (tables.some((t) => t.id === current) ? current : tables[0]?.id ?? null));
  }, [projectId]);

  useEffect(() => { attempt(() => loadProjects()); }, [attempt, loadProjects]);
  useEffect(() => { attempt(loadSchema); }, [attempt, loadSchema]);

  const project = projects.find((p) => p.id === projectId);
  const table = schema.find((t) => t.id === tableId);

  const createProject = (e) => {
    e.preventDefault();
    attempt(async () => {
      const created = await api.createProject(newProject);
      setNewProject("");
      await loadProjects(created.id);
    });
  };

  const deleteProject = () => {
    if (!window.confirm(`Delete project "${project.name}" and all of its tables?`)) return;
    attempt(async () => {
      await api.deleteProject(projectId);
      setProjectId(null);
      await loadProjects();
    });
  };

  const saveTable = (name, columns) =>
    attempt(async () => {
      const { id } = await api.addTable(projectId, name, columns);
      await loadSchema();
      setTableId(id);
      setAdding(false);
    });

  const deleteTable = () => {
    if (!window.confirm(`Delete table "${table.name}"?`)) return;
    attempt(async () => {
      await api.deleteTable(tableId);
      await loadSchema();
    });
  };

  const showProjectSql = () =>
    attempt(async () => {
      const { ddl } = await api.projectDdl(projectId);
      setSql({ title: `${project.name}: CREATE TABLE statements`, ddl, filename: `${project.name.replace(/\W+/g, "_")}.sql` });
    });

  const showDecompositionSql = (mode) =>
    attempt(async () => {
      const { ddl } = await api.tableDdl(tableId, mode);
      setSql({ title: `${table.name}: ${mode === "3nf" ? "3NF" : "BCNF"} decomposition`, ddl, filename: `${table.name}_${mode}.sql` });
    });

  return (
    <div className="shell">
      <aside className="rail">
        <h1 className="brand">Schema Designer</h1>
        <p className="brand-sub">and Normalization Advisor</p>

        <h2 className="rail-heading">Projects</h2>
        {projects.length === 0 && <p className="rail-empty">No projects yet.</p>}
        <ul className="project-list">
          {projects.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className="project-item"
                aria-current={p.id === projectId ? "true" : undefined}
                onClick={() => { setProjectId(p.id); setAdding(false); }}
              >
                {p.name}
              </button>
            </li>
          ))}
        </ul>

        <form className="rail-form" onSubmit={createProject}>
          <label htmlFor="new-project">New project</label>
          <input id="new-project" value={newProject} onChange={(e) => setNewProject(e.target.value)} placeholder="e.g. Library system" />
          <button type="submit" disabled={!newProject.trim()}>Create project</button>
        </form>
      </aside>

      <main className="main">
        {error && (
          <div className="banner" role="alert">
            <span>{error}</span>
            <button type="button" className="link" onClick={() => setError("")}>Dismiss</button>
          </div>
        )}

        {!project ? (
          <section className="empty">
            <h2>Start with a project</h2>
            <p>A project holds the tables you are designing. Create one in the sidebar to begin.</p>
          </section>
        ) : (
          <>
            <header className="page-head">
              <h2>{project.name}</h2>
              <div className="actions">
                <button type="button" onClick={() => setAdding(true)}>New table</button>
                <button type="button" className="secondary" onClick={showProjectSql} disabled={schema.length === 0}>Generate SQL</button>
                <button type="button" className="danger" onClick={deleteProject}>Delete project</button>
              </div>
            </header>

            {schema.length > 0 && (
              <nav className="tabs" aria-label="Tables">
                {schema.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className="tab"
                    aria-current={!adding && t.id === tableId ? "true" : undefined}
                    onClick={() => { setTableId(t.id); setAdding(false); }}
                  >
                    {t.name}
                  </button>
                ))}
              </nav>
            )}

            {adding || schema.length === 0 ? (
              <NewTableForm onSave={saveTable} onCancel={schema.length ? () => setAdding(false) : null} />
            ) : (
              table && (
                <div className="workspace">
                  <TablePanel table={table} schema={schema} attempt={attempt} onChange={loadSchema} onDelete={deleteTable} />
                  <Advisor table={table} onSql={showDecompositionSql} />
                </div>
              )
            )}
          </>
        )}
      </main>

      <SqlDialog sql={sql} onClose={() => setSql(null)} />
    </div>
  );
}
