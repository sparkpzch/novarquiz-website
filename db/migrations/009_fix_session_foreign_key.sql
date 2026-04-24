-- Fix foreign key constraint on sessions (formerly play_sessions).
-- When a quiz is edited, its questions are deleted and re-created.
-- We must allow this by setting current_question_id to NULL if the question it points to is deleted.

-- 1. Drop the existing constraint
-- The constraint name is "play_sessions_current_question_id_fkey" (from original table name)
ALTER TABLE sessions 
    DROP CONSTRAINT IF EXISTS play_sessions_current_question_id_fkey;

-- 2. Add it back with ON DELETE SET NULL
ALTER TABLE sessions
    ADD CONSTRAINT sessions_current_question_id_fkey 
    FOREIGN KEY (current_question_id) 
    REFERENCES questions(id) 
    ON DELETE SET NULL;
