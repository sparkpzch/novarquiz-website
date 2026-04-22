-- NovarQuiz Database Schema
-- Question sessions, questions, choices, node-graph connections, user answers, leaderboard

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- Question Sessions (a group of questions, like a "quiz")
-- ============================================================
CREATE TABLE question_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    cover_image_url TEXT,
    timer_seconds INTEGER NOT NULL DEFAULT 30,
    is_published BOOLEAN NOT NULL DEFAULT FALSE,
    created_by VARCHAR(128) NOT NULL, -- Firebase UID
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Questions (individual questions within a session)
-- ============================================================
CREATE TABLE questions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES question_sessions(id) ON DELETE CASCADE,
    question_order INTEGER NOT NULL DEFAULT 0,
    question_text TEXT NOT NULL,
    media_type VARCHAR(10) CHECK (media_type IN ('image', 'video', NULL)),
    media_url TEXT,
    timer_override INTEGER, -- override session timer for this question
    is_entry_point BOOLEAN NOT NULL DEFAULT FALSE, -- first question in graph
    -- Node position for the graph editor
    node_x FLOAT NOT NULL DEFAULT 0,
    node_y FLOAT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_questions_session ON questions(session_id);

-- ============================================================
-- Choices (4 choices per question: A, B, C, D)
-- ============================================================
CREATE TABLE choices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    label CHAR(1) NOT NULL CHECK (label IN ('A', 'B', 'C', 'D')),
    choice_text VARCHAR(500) NOT NULL,
    is_correct BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(question_id, label)
);

CREATE INDEX idx_choices_question ON choices(question_id);

-- ============================================================
-- Question Connections (node graph edges)
-- From a choice, connect to another question
-- ============================================================
CREATE TABLE question_connections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES question_sessions(id) ON DELETE CASCADE,
    from_question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    from_choice_label CHAR(1) NOT NULL CHECK (from_choice_label IN ('A', 'B', 'C', 'D')),
    to_question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(from_question_id, from_choice_label)
);

CREATE INDEX idx_connections_session ON question_connections(session_id);
CREATE INDEX idx_connections_from ON question_connections(from_question_id);

-- ============================================================
-- User Answers (tracks each user's answer per question)
-- ============================================================
CREATE TABLE user_answers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES question_sessions(id) ON DELETE CASCADE,
    user_id VARCHAR(128) NOT NULL, -- Firebase UID
    question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    chosen_label CHAR(1) CHECK (chosen_label IN ('A', 'B', 'C', 'D')),
    is_correct BOOLEAN NOT NULL DEFAULT FALSE,
    time_taken_ms INTEGER, -- how long the user took
    points_earned INTEGER NOT NULL DEFAULT 0,
    answered_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_user_answers_session_user ON user_answers(session_id, user_id);
CREATE INDEX idx_user_answers_question ON user_answers(question_id);

-- ============================================================
-- Leaderboard Entries (aggregated score per user per session)
-- ============================================================
CREATE TABLE leaderboard_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES question_sessions(id) ON DELETE CASCADE,
    user_id VARCHAR(128) NOT NULL, -- Firebase UID
    user_display_name VARCHAR(255),
    user_photo_url TEXT,
    total_score INTEGER NOT NULL DEFAULT 0,
    correct_count INTEGER NOT NULL DEFAULT 0,
    incorrect_count INTEGER NOT NULL DEFAULT 0,
    unanswered_count INTEGER NOT NULL DEFAULT 0,
    streak INTEGER NOT NULL DEFAULT 0,
    total_time_ms INTEGER NOT NULL DEFAULT 0,
    completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(session_id, user_id)
);

CREATE INDEX idx_leaderboard_session_score ON leaderboard_entries(session_id, total_score DESC);

-- ============================================================
-- Play Sessions (tracks an active play-through)
-- ============================================================
CREATE TABLE play_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES question_sessions(id) ON DELETE CASCADE,
    user_id VARCHAR(128) NOT NULL,
    current_question_id UUID REFERENCES questions(id),
    current_score INTEGER NOT NULL DEFAULT 0,
    current_streak INTEGER NOT NULL DEFAULT 0,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ,
    UNIQUE(session_id, user_id)
);

CREATE INDEX idx_play_sessions_user ON play_sessions(user_id);
