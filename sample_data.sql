-- Optional demo: an un-normalized enrollment table with classic problems.
-- Run after schema.sql:   mysql -u root -p < sample_data.sql
USE schema_designer;

INSERT INTO projects (name) VALUES ('University demo');
SET @p = LAST_INSERT_ID();

INSERT INTO design_tables (project_id, name) VALUES (@p, 'enrollment');
SET @t = LAST_INSERT_ID();

INSERT INTO design_columns (table_id, name, data_type, is_primary_key, is_nullable, position) VALUES
  (@t, 'student_id',   'INT',          TRUE,  FALSE, 0),
  (@t, 'course_id',    'INT',          TRUE,  FALSE, 1),
  (@t, 'student_name', 'VARCHAR(100)', FALSE, TRUE,  2),
  (@t, 'course_name',  'VARCHAR(100)', FALSE, TRUE,  3),
  (@t, 'instructor',   'VARCHAR(100)', FALSE, TRUE,  4),
  (@t, 'grade',        'CHAR(2)',      FALSE, TRUE,  5);

-- student_id -> student_name
INSERT INTO functional_dependencies (table_id) VALUES (@t);
SET @f1 = LAST_INSERT_ID();
INSERT INTO fd_attributes (fd_id, column_id, side)
SELECT @f1, id, 'LHS' FROM design_columns WHERE table_id = @t AND name = 'student_id'
UNION ALL
SELECT @f1, id, 'RHS' FROM design_columns WHERE table_id = @t AND name = 'student_name';

-- course_id -> course_name, instructor
INSERT INTO functional_dependencies (table_id) VALUES (@t);
SET @f2 = LAST_INSERT_ID();
INSERT INTO fd_attributes (fd_id, column_id, side)
SELECT @f2, id, 'LHS' FROM design_columns WHERE table_id = @t AND name = 'course_id'
UNION ALL
SELECT @f2, id, 'RHS' FROM design_columns WHERE table_id = @t AND name IN ('course_name', 'instructor');
