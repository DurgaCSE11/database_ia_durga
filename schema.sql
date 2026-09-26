-- =====================================================================
-- Schema Designer & Normalization Advisor - metadata database (MySQL 8)
-- Run once:   mysql -u root -p < schema.sql
-- The designer stores the schemas you are designing in these tables.
-- The metadata itself is normalized (no comma-separated lists).
-- =====================================================================
CREATE DATABASE IF NOT EXISTS schema_designer
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE schema_designer;

CREATE TABLE IF NOT EXISTS projects (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(100) NOT NULL UNIQUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- one row per table being designed
CREATE TABLE IF NOT EXISTS design_tables (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  project_id INT NOT NULL,
  name       VARCHAR(64) NOT NULL,
  UNIQUE KEY uq_table_per_project (project_id, name),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS design_columns (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  table_id       INT NOT NULL,
  name           VARCHAR(64) NOT NULL,
  data_type      VARCHAR(50) NOT NULL DEFAULT 'VARCHAR(100)',
  is_primary_key BOOLEAN NOT NULL DEFAULT FALSE,
  is_nullable    BOOLEAN NOT NULL DEFAULT TRUE,
  is_unique      BOOLEAN NOT NULL DEFAULT FALSE,
  position       INT NOT NULL DEFAULT 0,
  UNIQUE KEY uq_column_per_table (table_id, name),
  FOREIGN KEY (table_id) REFERENCES design_tables(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- single-column foreign keys between designed tables
CREATE TABLE IF NOT EXISTS design_foreign_keys (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  table_id      INT NOT NULL,
  column_id     INT NOT NULL,
  ref_table_id  INT NOT NULL,
  ref_column_id INT NOT NULL,
  UNIQUE KEY uq_fk_column (column_id),
  FOREIGN KEY (table_id)      REFERENCES design_tables(id)  ON DELETE CASCADE,
  FOREIGN KEY (column_id)     REFERENCES design_columns(id) ON DELETE CASCADE,
  FOREIGN KEY (ref_table_id)  REFERENCES design_tables(id)  ON DELETE CASCADE,
  FOREIGN KEY (ref_column_id) REFERENCES design_columns(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- functional dependencies  X -> Y  (X and Y are sets of columns)
CREATE TABLE IF NOT EXISTS functional_dependencies (
  id       INT AUTO_INCREMENT PRIMARY KEY,
  table_id INT NOT NULL,
  FOREIGN KEY (table_id) REFERENCES design_tables(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS fd_attributes (
  fd_id     INT NOT NULL,
  column_id INT NOT NULL,
  side      ENUM('LHS','RHS') NOT NULL,
  PRIMARY KEY (fd_id, column_id, side),
  FOREIGN KEY (fd_id)     REFERENCES functional_dependencies(id) ON DELETE CASCADE,
  FOREIGN KEY (column_id) REFERENCES design_columns(id)          ON DELETE CASCADE
) ENGINE=InnoDB;
