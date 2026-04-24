-- Drop all tables in dependency order (CASCADE handles FK constraints)
DROP TABLE IF EXISTS play_sessions CASCADE;
DROP TABLE IF EXISTS leaderboard_entries CASCADE;
DROP TABLE IF EXISTS user_answers CASCADE;
DROP TABLE IF EXISTS question_connections CASCADE;
DROP TABLE IF EXISTS choices CASCADE;
DROP TABLE IF EXISTS questions CASCADE;
DROP TABLE IF EXISTS question_sessions CASCADE;
