// Thin wrapper around the Express API. Every failure becomes an Error with a readable message.
async function request(path, { method = "GET", body } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status}).`);
  return data;
}

export const api = {
  projects: () => request("/projects"),
  createProject: (name) => request("/projects", { method: "POST", body: { name } }),
  deleteProject: (id) => request(`/projects/${id}`, { method: "DELETE" }),
  schema: (projectId) => request(`/projects/${projectId}/schema`),
  projectDdl: (projectId) => request(`/projects/${projectId}/ddl`),
  addTable: (projectId, name, columns) => request(`/projects/${projectId}/tables`, { method: "POST", body: { name, columns } }),
  deleteTable: (id) => request(`/tables/${id}`, { method: "DELETE" }),
  addForeignKey: (tableId, body) => request(`/tables/${tableId}/foreign-keys`, { method: "POST", body }),
  addFd: (tableId, lhs, rhs) => request(`/tables/${tableId}/fds`, { method: "POST", body: { lhs, rhs } }),
  deleteFd: (id) => request(`/fds/${id}`, { method: "DELETE" }),
  analysis: (tableId) => request(`/tables/${tableId}/analysis`),
  tableDdl: (tableId, mode) => request(`/tables/${tableId}/ddl?mode=${mode}`),
};
