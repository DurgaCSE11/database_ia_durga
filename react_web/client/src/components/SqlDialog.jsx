import { useEffect, useRef, useState } from "react";

export default function SqlDialog({ sql, onClose }) {
  const ref = useRef(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const dialog = ref.current;
    if (sql && dialog && !dialog.open) dialog.showModal();
  }, [sql]);

  if (!sql) return null;

  const copy = async () => {
    await navigator.clipboard.writeText(sql.ddl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const download = () => {
    const url = URL.createObjectURL(new Blob([sql.ddl], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = sql.filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <dialog ref={ref} className="sql-dialog" onClose={onClose} aria-labelledby="sql-title">
      <h3 id="sql-title">{sql.title}</h3>
      <pre className="sql"><code>{sql.ddl}</code></pre>
      <div className="actions">
        <button type="button" onClick={copy}>{copied ? "Copied" : "Copy SQL"}</button>
        <button type="button" className="secondary" onClick={download}>Download .sql</button>
        <button type="button" className="link" onClick={() => ref.current.close()}>Close</button>
      </div>
    </dialog>
  );
}
