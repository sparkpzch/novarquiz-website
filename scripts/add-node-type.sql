-- Run this migration before using situationNode type
ALTER TABLE questions
  ADD COLUMN IF NOT EXISTS node_type VARCHAR(20) NOT NULL DEFAULT 'normal';
