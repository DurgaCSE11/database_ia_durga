# DB Schema Designer & Normalization Advisor

MySQL backend, two interchangeable front ends:

- **Option A: Python console app** (`python_console/`)
- **Option B: React website** (`react_web/`, Node/Express API + React)

Both use the same MySQL metadata schema (`schema.sql`) and the same normalization algorithms
(written once in Python, once in JavaScript, covered by the same test cases).

```
schema-designer/
  schema.sql            MySQL metadata database (run once)
  sample_data.sql       optional demo project with a badly normalized table
  python_console/       Option A
  react_web/            Option B
```

---

## 1. What the system does

1. **Design**: create projects, add tables with columns (type, primary key, NOT NULL, UNIQUE), add single-column foreign keys.
2. **Declare functional dependencies (FDs)** such as `student_id -> student_name`. Primary keys and UNIQUE columns are added automatically as `key -> all columns`.
3. **Advise**: for a table, report candidate keys, prime / non-prime attributes, minimal cover, the highest normal form reached (1NF-BCNF), every violation with a plain-language explanation, and a suggested **3NF** and **BCNF** decomposition (with lossless-join and dependency-preservation flags).
4. **Generate MySQL DDL** for the whole design, or for a suggested decomposition (new tables, primary keys and foreign keys between them).

Every design is saved in MySQL, so it survives restarts.

---

## 2. Shared foundation

### 2.1 Metadata schema (MySQL)

| Table | Purpose |
|---|---|
| `projects` | one row per design |
| `design_tables` | tables being designed (unique name per project) |
| `design_columns` | columns: type, PK / NULL / UNIQUE flags, position |
| `design_foreign_keys` | single-column FK: column -> referenced table.column |
| `functional_dependencies` | one row per FD |
| `fd_attributes` | which columns are on the LHS / RHS of each FD (`side` ENUM) |

The metadata is itself normalized: FDs are stored as rows in `fd_attributes`, not as comma-separated strings. `ON DELETE CASCADE` keeps deletes consistent.

### 2.2 Normalization engine

| Step | Method |
|---|---|
| Closure `X+` | repeat: if `lhs ⊆ result`, add `rhs`, until nothing changes |
| Candidate keys | attributes the rest cannot determine are in every key; search the remaining attributes by increasing size, skipping supersets of keys already found |
| Minimal cover | split right sides -> drop extraneous left attributes -> drop redundant FDs |
| Classify each FD `X -> A` | `X` is a superkey: fine. Else if `A` is prime: **BCNF violation only**. Else if `X` is a proper subset of a key: **partial dependency (breaks 2NF)**. Else: **transitive dependency (breaks 3NF)** |
| Normal form | no violations = BCNF; only BCNF-type = 3NF; no partial ones = 2NF; otherwise 1NF |
| 3NF decomposition | synthesis: group the minimal cover by left side, drop subsumed relations, add a key relation if none contains a key (lossless and dependency preserving) |
| BCNF decomposition | find `X` where `X+ ∩ R` is neither `X` nor `R`; split into `X+ ∩ R` and `(R - X+) ∪ X`; repeat (lossless, may lose dependencies) |
| Dependency preservation | for each FD, grow its left side using closures inside each relation; check the right side is reached |

### 2.3 Assumptions and limits (mention these in your report)

- Tables are assumed to be in 1NF (atomic values); the advisor starts from 2NF.
- FDs come from the designer; they are not discovered from data.
- Up to 14 columns per table (the search is exponential).
- Foreign keys are single-column. Multi-valued and join dependencies (4NF/5NF) are out of scope.

---

## 3. Option A: Python console app

### 3.1 Architecture

```
main.py  (menus, prompts, printing)
   |-- db.py         MySQL access (mysql-connector-python), transactions
   |-- analysis.py   turns a stored table into (columns, FDs) for the engine
   |-- normalizer.py pure algorithms, no I/O
   |-- ddl.py        input validation + CREATE TABLE generation
```

### 3.2 Build order

1. Run `schema.sql`, test the connection.
2. `normalizer.py` + unit tests first (no database needed).
3. `ddl.py` (validation + DDL) with tests.
4. `db.py`: projects, tables, columns, FKs, FDs, `get_schema()`.
5. `main.py`: menus for project / table / FD management.
6. Wire "Analyze" and "Generate SQL", then polish output.

### 3.3 Run

```bash
mysql -u root -p < schema.sql
mysql -u root -p < sample_data.sql          # optional demo

cd python_console
python -m venv venv
source venv/bin/activate                   # Windows: venv\Scripts\activate
pip install -r requirements.txt

export DB_USER=root DB_PASSWORD=yourpassword   # Windows cmd: set DB_USER=root & set DB_PASSWORD=yourpassword
python main.py
python -m unittest discover -s tests       # run the tests
```

### 3.4 Demo flow

`2` Select project -> `1` University demo -> `5` Show schema -> `10` Analyze -> `1` (the table) -> `3` to print the 3NF SQL.

---

## 4. Option B: React website

### 4.1 Architecture

A browser cannot talk to MySQL directly, so there is a small API in between.

```
React (Vite, :5173)  --/api-->  Express (:4000)  -->  MySQL
   components                    routes (index.js)
                                 db.js (mysql2 pool)
                                 normalizer.js, ddl.js, analysis.js
```

### 4.2 API

| Method and path | Purpose |
|---|---|
| `GET /api/projects`, `POST /api/projects`, `DELETE /api/projects/:id` | projects |
| `GET /api/projects/:id/schema` | tables with columns, FKs, FDs |
| `GET /api/projects/:id/ddl` | `CREATE TABLE` script for the project |
| `POST /api/projects/:id/tables`, `DELETE /api/tables/:id` | tables |
| `POST /api/tables/:id/foreign-keys` | add a foreign key |
| `POST /api/tables/:id/fds`, `DELETE /api/fds/:id` | functional dependencies |
| `GET /api/tables/:id/analysis` | full normalization report |
| `GET /api/tables/:id/ddl?mode=3nf\|bcnf` | SQL for a suggested decomposition |

### 4.3 UI

- Left rail: projects. Top: table tabs, "New table", "Generate SQL".
- Left panel: columns, foreign keys, dependency editor (tick boxes for both sides).
- Right panel: the advisor. It reruns after every change and shows the 1NF -> BCNF ladder, keys, problems, and both decompositions with "View SQL".
- SQL dialog with copy and download.

### 4.4 Build order

1. Server: `db.js`, `normalizer.js` (+ tests), `ddl.js`, then routes; test with curl.
2. Client: `api.js`, project list, new-table form.
3. Table panel (columns, FKs, dependency form).
4. Advisor panel and SQL dialog.
5. Styling, empty states, error banner.

### 4.5 Run

```bash
mysql -u root -p < schema.sql
mysql -u root -p < sample_data.sql          # optional demo

# terminal 1 - API
cd react_web/server
cp .env.example .env                        # edit DB_USER / DB_PASSWORD
npm install
npm start                                   # http://localhost:4000
npm test                                    # engine tests

# terminal 2 - website
cd react_web/client
npm install
npm run dev                                 # open http://localhost:5173
```

---

## 5. Choosing

| | Python console | React website |
|---|---|---|
| Effort | lower (about 4 files of logic) | higher (API + UI) |
| Demo impact | functional, text only | visual, easier to present |
| New skills needed | none | Node, Express, React |
| Risk | very low | more moving parts |

Suggestion: build Option A first (the engine and database layer are the hard parts and are reused in concept by Option B), then move to Option B if time allows.

---

## 6. Security and quality notes

- All SQL uses bound parameters. Table, column and type names typed by users are validated against strict patterns before being placed in generated DDL, so a name like `x; DROP TABLE y` is rejected.
- Multi-step writes (a table with its columns, an FD with its attributes) run in one transaction.
- Both engines are covered by tests: closure, keys, minimal cover, 1NF / 2NF / 3NF / BCNF classification, decompositions, DDL.

## 7. Extension ideas

- Discover FDs from real data with `GROUP BY ... HAVING COUNT(DISTINCT ...) > 1` checks.
- Import an existing MySQL database from `information_schema`.
- ER diagram view; edit/delete columns; composite foreign keys.
- 4NF (multivalued dependencies) and a step-by-step "explain the algorithm" mode.
