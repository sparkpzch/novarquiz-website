-- Per-quiz toggle for randomising the order choices are presented in.
--
-- Display order only: `choices.label` (A/B/C/D) stays bound to its choice, so
-- question_connections.from_choice_label and user_answers.chosen_label keep
-- resolving to the same choice regardless of the order a player sees.
ALTER TABLE quizzes
  ADD COLUMN IF NOT EXISTS shuffle_choices boolean NOT NULL DEFAULT false;
