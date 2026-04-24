-- Consolidated Schema
-- Generated from migrations

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- --- 005_somchai_refac.sql ---
create table question_sessions
(
    id              uuid                     default uuid_generate_v4() not null
        primary key,
    name            varchar(255)                                        not null,
    description     text,
    cover_image_url text,
    timer_seconds   integer                  default 30                 not null,
    is_published    boolean                  default false              not null,
    created_by      varchar(128)                                        not null,
    created_at      timestamp with time zone default now()              not null,
    updated_at      timestamp with time zone default now()              not null
);



create table questions
(
    id             uuid                     default uuid_generate_v4()          not null
        primary key,
    session_id     uuid                                                         not null
        references question_sessions
            on delete cascade,
    question_order integer                  default 0                           not null,
    question_text  text                                                         not null,
    media_type     varchar(10)
        constraint questions_media_type_check
            check ((media_type)::text = ANY
                   (ARRAY [('image'::character varying)::text, ('video'::character varying)::text, (NULL::character varying)::text])),
    media_url      text,
    timer_override integer,
    is_entry_point boolean                  default false                       not null,
    node_x         double precision         default 0                           not null,
    node_y         double precision         default 0                           not null,
    created_at     timestamp with time zone default now()                       not null,
    updated_at     timestamp with time zone default now()                       not null,
    node_type      varchar(20)              default 'normal'::character varying not null
);



create index idx_questions_session
    on questions (session_id);

create table choices
(
    id           uuid                     default uuid_generate_v4() not null
        primary key,
    question_id  uuid                                                not null
        references questions
            on delete cascade,
    label        char                                                not null
        constraint choices_label_check
            check (label = ANY (ARRAY ['A'::bpchar, 'B'::bpchar, 'C'::bpchar, 'D'::bpchar])),
    choice_text  varchar(500)                                        not null,
    created_at   timestamp with time zone default now()              not null,
    explanation  text,
    score_impact integer                  default 0,
    unique (question_id, label)
);



create index idx_choices_question
    on choices (question_id);

create table question_connections
(
    id                uuid                     default uuid_generate_v4() not null
        primary key,
    session_id        uuid                                                not null
        references question_sessions
            on delete cascade,
    from_question_id  uuid                                                not null
        references questions
            on delete cascade,
    from_choice_label char                                                not null
        constraint question_connections_from_choice_label_check
            check (from_choice_label = ANY (ARRAY ['A'::bpchar, 'B'::bpchar, 'C'::bpchar, 'D'::bpchar])),
    to_question_id    uuid                                                not null
        references questions
            on delete cascade,
    created_at        timestamp with time zone default now()              not null,
    connection_type   varchar(50)              default 'standard'::character varying,
    unique (from_question_id, from_choice_label)
);



create index idx_connections_session
    on question_connections (session_id);

create index idx_connections_from
    on question_connections (from_question_id);

create table user_answers
(
    id            uuid                     default uuid_generate_v4() not null
        primary key,
    session_id    uuid                                                not null
        references question_sessions
            on delete cascade,
    user_id       varchar(128)                                        not null,
    question_id   uuid                                                not null
        references questions
            on delete cascade,
    chosen_label  char
        constraint user_answers_chosen_label_check
            check (chosen_label = ANY (ARRAY ['A'::bpchar, 'B'::bpchar, 'C'::bpchar, 'D'::bpchar])),
    time_taken_ms integer,
    utility_score integer                  default 0                  not null,
    answered_at   timestamp with time zone default now()              not null
);



create index idx_user_answers_session_user
    on user_answers (session_id, user_id);

create index idx_user_answers_question
    on user_answers (question_id);

create table leaderboard_entries
(
    id                uuid                     default uuid_generate_v4() not null
        primary key,
    session_id        uuid                                                not null
        references question_sessions
            on delete cascade,
    user_id           varchar(128)                                        not null,
    user_display_name varchar(255),
    user_photo_url    text,
    total_score       integer                  default 0                  not null,
    correct_count     integer                  default 0                  not null,
    incorrect_count   integer                  default 0                  not null,
    unanswered_count  integer                  default 0                  not null,
    streak            integer                  default 0                  not null,
    total_time_ms     integer                  default 0                  not null,
    completed_at      timestamp with time zone default now()              not null,
    utility_score     integer                  default 0,
    unique (session_id, user_id)
);



create index idx_leaderboard_session_score
    on leaderboard_entries (session_id asc, total_score desc);

create table play_sessions
(
    id                  uuid                     default uuid_generate_v4() not null
        primary key,
    session_id          uuid                                                not null
        references question_sessions
            on delete cascade,
    user_id             varchar(128)                                        not null,
    current_question_id uuid
        references questions,
    current_score       integer                  default 0                  not null,
    current_streak      integer                  default 0                  not null,
    started_at          timestamp with time zone default now()              not null,
    finished_at         timestamp with time zone,
    unique (session_id, user_id)
);



create index idx_play_sessions_user
    on play_sessions (user_id);












































-- --- 007_rename_tables.sql ---
ALTER TABLE question_sessions RENAME TO quizzes;
ALTER TABLE play_sessions RENAME TO sessions;


-- --- 008_make_timer_nullable.sql ---
-- Allow timer_seconds to be NULL on a quiz, meaning "no timer".
-- This was previously made nullable in 004 but reintroduced as NOT NULL in 005.
-- Since the table is now called 'quizzes' (from 007), we apply it there.

ALTER TABLE quizzes
    ALTER COLUMN timer_seconds DROP NOT NULL,
    ALTER COLUMN timer_seconds SET DEFAULT NULL;


-- --- 009_fix_session_foreign_key.sql ---
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




-- Neon Database Dump
-- Generated by export-neon.ts

BEGIN;

SET session_replication_role = 'replica';

-- Data for quizzes
INSERT INTO quizzes (id, name, description, cover_image_url, timer_seconds, is_published, created_by, created_at, updated_at, is_private, pin_code, share_token, quiz_id) VALUES ('035938f2-87ad-4b50-8a36-2dae88d2ea73', 'TEST001', 'test001', NULL, 30, TRUE, 'qPP3jkRGjSeLBXSKECCr0xCQE6q1', '2026-04-22T21:24:15.771Z', '2026-04-22T21:24:28.528Z', FALSE, '163400', 'bf67fd01-8624-4ab1-a396-f535fcd09f63', NULL);
INSERT INTO quizzes (id, name, description, cover_image_url, timer_seconds, is_published, created_by, created_at, updated_at, is_private, pin_code, share_token, quiz_id) VALUES ('6c479e82-105b-4b14-9cb3-9eb5bce92c32', 'Snowdrop: เส้นทางสู่หัวใจที่แข็งแรง', 'เกมจำลองการตัดสินใจด้านสุขภาพหัวใจของลุงสมชาย วัย 55 ปี ผ่านเหตุการณ์จริงในชีวิตประจำวัน เพื่อให้เข้าใจความเสี่ยงโรค ASCVD', NULL, NULL, FALSE, 'system', '2026-04-24T02:27:01.840Z', '2026-04-24T15:46:16.428Z', FALSE, '836729', '5a856262-4764-4046-9994-2fc8111a33ff', NULL);

-- Data for questions
INSERT INTO questions (id, session_id, question_order, question_text, media_type, media_url, timer_override, is_entry_point, node_x, node_y, created_at, updated_at, node_type) VALUES ('bffec14e-3000-4540-a3e7-a188467afdc4', '035938f2-87ad-4b50-8a36-2dae88d2ea73', 0, 'Alolololo', 'image', 'https://img1.yeggi.com/images-3d-model/c50/11560196_-tom-lizard-v3-no-ia-hopers-stl-file-for-3d-printing-', NULL, TRUE, 80, 80, '2026-04-22T21:24:28.592Z', '2026-04-22T21:24:28.592Z', 'normal');
INSERT INTO questions (id, session_id, question_order, question_text, media_type, media_url, timer_override, is_entry_point, node_x, node_y, created_at, updated_at, node_type) VALUES ('275c378e-dd3d-401d-ae2d-289b49a973ab', '035938f2-87ad-4b50-8a36-2dae88d2ea73', 1, 'Banana', NULL, NULL, NULL, FALSE, 464, 16, '2026-04-22T21:24:28.637Z', '2026-04-22T21:24:28.637Z', 'normal');
INSERT INTO questions (id, session_id, question_order, question_text, media_type, media_url, timer_override, is_entry_point, node_x, node_y, created_at, updated_at, node_type) VALUES ('88820bfc-db65-4f0d-b869-d16de45771e5', '6c479e82-105b-4b14-9cb3-9eb5bce92c32', 0, 'จุดเริ่มต้นหลังเลิกงาน – ลุงสมชายอายุ 55 ปี นั่งทำงานทั้งวัน ชอบกินของมัน เลิกงานแล้วจะกินอะไรดี?', NULL, NULL, NULL, TRUE, -96, 96, '2026-04-24T15:46:16.585Z', '2026-04-24T15:46:16.585Z', 'normal');
INSERT INTO questions (id, session_id, question_order, question_text, media_type, media_url, timer_override, is_entry_point, node_x, node_y, created_at, updated_at, node_type) VALUES ('152bbbe4-b61e-4bcf-8fc4-2dc1b7c5815b', '6c479e82-105b-4b14-9cb3-9eb5bce92c32', 1, 'สัญญาณเตือนของร่างกาย – หมอบอกว่าลุงเริ่มมีน้ำหนักเกินและความดันสูงขึ้น ลุงจะปรับไลฟ์สไตล์อย่างไร?', NULL, NULL, NULL, FALSE, 208, 96, '2026-04-24T15:46:16.896Z', '2026-04-24T15:46:16.896Z', 'normal');
INSERT INTO questions (id, session_id, question_order, question_text, media_type, media_url, timer_override, is_entry_point, node_x, node_y, created_at, updated_at, node_type) VALUES ('f2942772-b47a-4d4e-af09-9172723c5d56', '6c479e82-105b-4b14-9cb3-9eb5bce92c32', 2, 'อาการแปลกๆ เริ่มปรากฏ – ขณะเดินขึ้นบันได ลุงรู้สึกแน่นหน้าอกและหายใจไม่ค่อยออก ลุงควรทำอย่างไร?', NULL, NULL, NULL, FALSE, 496, 96, '2026-04-24T15:46:17.197Z', '2026-04-24T15:46:17.197Z', 'normal');
INSERT INTO questions (id, session_id, question_order, question_text, media_type, media_url, timer_override, is_entry_point, node_x, node_y, created_at, updated_at, node_type) VALUES ('79bfc15d-8eed-4acf-bc8b-4d91aeb37bc9', '6c479e82-105b-4b14-9cb3-9eb5bce92c32', 3, 'การวินิจฉัย – แพทย์ที่คลินิกถามว่าลุงอยากตรวจอะไรเพื่อดูสาเหตุของอาการ?', NULL, NULL, NULL, FALSE, 752, -96, '2026-04-24T15:46:17.506Z', '2026-04-24T15:46:17.506Z', 'normal');
INSERT INTO questions (id, session_id, question_order, question_text, media_type, media_url, timer_override, is_entry_point, node_x, node_y, created_at, updated_at, node_type) VALUES ('7eaa8fae-d7a5-4241-a03c-a99719920a2b', '6c479e82-105b-4b14-9cb3-9eb5bce92c32', 4, 'การรับมือกับผลตรวจ – ผลตรวจพบว่า LDL สูงมาก แพทย์แนะนำให้ปรับพฤติกรรม ลุงจะเลือกทำอะไร?', NULL, NULL, NULL, FALSE, 1024, -304, '2026-04-24T15:46:17.799Z', '2026-04-24T15:46:17.799Z', 'normal');
INSERT INTO questions (id, session_id, question_order, question_text, media_type, media_url, timer_override, is_entry_point, node_x, node_y, created_at, updated_at, node_type) VALUES ('593ed3f1-fc14-4b69-bf6d-f2a84964bedb', '6c479e82-105b-4b14-9cb3-9eb5bce92c32', 5, 'วิกฤตกลางดึก! – ตี 2 ลุงสมชายตื่นขึ้นมาด้วยอาการเจ็บหน้าอกรุนแรง เหงื่อออก และแขนซ้ายชา ลุงจะทำอย่างไร?', NULL, NULL, NULL, FALSE, 1280, 192, '2026-04-24T15:46:18.109Z', '2026-04-24T15:46:18.109Z', 'normal');
INSERT INTO questions (id, session_id, question_order, question_text, media_type, media_url, timer_override, is_entry_point, node_x, node_y, created_at, updated_at, node_type) VALUES ('d3d6a886-d7b5-46fe-a454-8849694b6435', '6c479e82-105b-4b14-9cb3-9eb5bce92c32', 6, 'ความจริงจากปากหมอ – แพทย์อธิบายว่าสาเหตุของอาการหัวใจวายของลุงคืออะไร?', NULL, NULL, NULL, FALSE, 1568, 192, '2026-04-24T15:46:18.407Z', '2026-04-24T15:46:18.407Z', 'normal');
INSERT INTO questions (id, session_id, question_order, question_text, media_type, media_url, timer_override, is_entry_point, node_x, node_y, created_at, updated_at, node_type) VALUES ('9fb9a4bd-a156-4034-9598-9d00c43dc3ee', '6c479e82-105b-4b14-9cb3-9eb5bce92c32', 7, 'การรักษาและการฟื้นฟู – หลังออกจากโรงพยาบาล แพทย์แนะนำให้ลุงทำอย่างไรเพื่อป้องกันหัวใจวายครั้งที่สอง?', NULL, NULL, NULL, FALSE, 1856, 192, '2026-04-24T15:46:18.704Z', '2026-04-24T15:46:18.704Z', 'normal');
INSERT INTO questions (id, session_id, question_order, question_text, media_type, media_url, timer_override, is_entry_point, node_x, node_y, created_at, updated_at, node_type) VALUES ('40b322c2-d5ed-4e57-8b58-9973ad93c752', '6c479e82-105b-4b14-9cb3-9eb5bce92c32', 8, 'การตั้งรับสู่อนาคต – ลุงสมชายอยากลดความเสี่ยง ASCVD ในระยะยาว เป้าหมายสำคัญที่สุดคืออะไร?', NULL, NULL, NULL, FALSE, 1728, -208, '2026-04-24T15:46:19.015Z', '2026-04-24T15:46:19.015Z', 'normal');
INSERT INTO questions (id, session_id, question_order, question_text, media_type, media_url, timer_override, is_entry_point, node_x, node_y, created_at, updated_at, node_type) VALUES ('8040d623-4732-4a71-a2cf-3b91bdc3a188', '6c479e82-105b-4b14-9cb3-9eb5bce92c32', 9, 'การรักษาความต่อเนื่อง – ผ่านมา 1 ปี ลุงสมชายจะทำอะไรเพื่อรักษาสุขภาพหัวใจให้ยั่งยืน?', NULL, NULL, NULL, FALSE, 2272, -224, '2026-04-24T15:46:19.310Z', '2026-04-24T15:46:19.310Z', 'normal');
INSERT INTO questions (id, session_id, question_order, question_text, media_type, media_url, timer_override, is_entry_point, node_x, node_y, created_at, updated_at, node_type) VALUES ('9bf3f9a8-9fdb-4d3b-b911-0f460123648f', '6c479e82-105b-4b14-9cb3-9eb5bce92c32', 10, 'BAD END 1 – สายเกินแก้ 💀 กล้ามเนื้อหัวใจขาดเลือดนานเกินไปจนเสียชีวิต หรือเกิดอุบัติเหตุระหว่างขับรถไปโรงพยาบาล', NULL, NULL, NULL, FALSE, 1568, 448, '2026-04-24T15:46:19.607Z', '2026-04-24T15:46:19.607Z', 'end');
INSERT INTO questions (id, session_id, question_order, question_text, media_type, media_url, timer_override, is_entry_point, node_x, node_y, created_at, updated_at, node_type) VALUES ('e7b0b147-aecc-4341-a274-f662392fc39a', '6c479e82-105b-4b14-9cb3-9eb5bce92c32', 11, 'GOOD END – หัวใจดวงใหม่ 🌸 ลุงสมชายมีน้ำหนักลดลง ความดันอยู่ในเกณฑ์ดี LDL ลดลงจนต่ำกว่าเป้าหมาย และมีคุณภาพชีวิตที่ดีขึ้นอย่างเห็นได้ชัด', NULL, NULL, NULL, FALSE, 2688, 0, '2026-04-24T15:46:19.673Z', '2026-04-24T15:46:19.673Z', 'end');
INSERT INTO questions (id, session_id, question_order, question_text, media_type, media_url, timer_override, is_entry_point, node_x, node_y, created_at, updated_at, node_type) VALUES ('ef6acac9-4f12-4172-950d-c11c5b2ae6cf', '6c479e82-105b-4b14-9cb3-9eb5bce92c32', 12, 'BAD END 3 – มฤตยูเงียบ 💀 คราบพลัคสะสมเงียบๆ จนเกิดภาวะหัวใจล้มเหลวเรื้อรัง', NULL, NULL, NULL, FALSE, 2800, -288, '2026-04-24T15:46:19.731Z', '2026-04-24T15:46:19.731Z', 'end');
INSERT INTO questions (id, session_id, question_order, question_text, media_type, media_url, timer_override, is_entry_point, node_x, node_y, created_at, updated_at, node_type) VALUES ('82e3e7a3-82f7-4dfc-bb61-78acff02215e', '6c479e82-105b-4b14-9cb3-9eb5bce92c32', 13, 'BAD END 2 – วงจรเดิมที่อันตรายกว่า 💀 หลอดเลือดอุดตันซ้ำ หัวใจทำงานผิดปกติถาวร คุณภาพชีวิตตกต่ำ', NULL, NULL, NULL, FALSE, 2224, 112, '2026-04-24T15:46:19.793Z', '2026-04-24T15:46:19.793Z', 'end');

-- Data for choices
INSERT INTO choices (id, question_id, label, choice_text, created_at, explanation, score_impact) VALUES ('a70ff4d9-7eac-478b-8f9b-f08caed784fd', 'bffec14e-3000-4540-a3e7-a188467afdc4', 'A', 'A', '2026-04-22T21:24:28.609Z', NULL, 0);
INSERT INTO choices (id, question_id, label, choice_text, created_at, explanation, score_impact) VALUES ('39250e00-b31f-4579-b1b2-62fb51f6bfbd', 'bffec14e-3000-4540-a3e7-a188467afdc4', 'B', 'B', '2026-04-22T21:24:28.612Z', NULL, 0);
INSERT INTO choices (id, question_id, label, choice_text, created_at, explanation, score_impact) VALUES ('01190159-9279-4369-ac53-384194ca1898', 'bffec14e-3000-4540-a3e7-a188467afdc4', 'C', 'C', '2026-04-22T21:24:28.614Z', NULL, 0);
INSERT INTO choices (id, question_id, label, choice_text, created_at, explanation, score_impact) VALUES ('0646f905-abf0-42b0-88dd-464bb4ca83b9', 'bffec14e-3000-4540-a3e7-a188467afdc4', 'D', 'D', '2026-04-22T21:24:28.616Z', NULL, 0);
INSERT INTO choices (id, question_id, label, choice_text, created_at, explanation, score_impact) VALUES ('675ee63c-0c23-430c-ad89-36887554f3ea', '275c378e-dd3d-401d-ae2d-289b49a973ab', 'A', 'C', '2026-04-22T21:24:28.641Z', NULL, 0);
INSERT INTO choices (id, question_id, label, choice_text, created_at, explanation, score_impact) VALUES ('5487eece-eaf5-4194-ac6f-d10a3b0e7a95', '275c378e-dd3d-401d-ae2d-289b49a973ab', 'B', 'D', '2026-04-22T21:24:28.643Z', NULL, 0);
INSERT INTO choices (id, question_id, label, choice_text, created_at, explanation, score_impact) VALUES ('e1679bd0-5d67-4b9c-8aaf-c0afbc129e82', '275c378e-dd3d-401d-ae2d-289b49a973ab', 'C', 'E', '2026-04-22T21:24:28.646Z', NULL, 0);
INSERT INTO choices (id, question_id, label, choice_text, created_at, explanation, score_impact) VALUES ('3126e57d-6135-4772-97f1-e1a63a8aa9d9', '275c378e-dd3d-401d-ae2d-289b49a973ab', 'D', 'F', '2026-04-22T21:24:28.650Z', NULL, 0);
INSERT INTO choices (id, question_id, label, choice_text, created_at, explanation, score_impact) VALUES ('fb9325f9-251b-4e0a-9045-5329061a3723', '88820bfc-db65-4f0d-b869-d16de45771e5', 'A', 'หมูกระทะ + เบียร์เย็นๆ', '2026-04-24T15:46:16.684Z', 'ไขมันสะสมในหลอดเลือดเพิ่มขึ้นอย่างรวดเร็ว', -10);
INSERT INTO choices (id, question_id, label, choice_text, created_at, explanation, score_impact) VALUES ('66f0484c-50f8-497c-a1ae-c139db6e0d34', '88820bfc-db65-4f0d-b869-d16de45771e5', 'B', 'ข้าว + ปลาต้ม + ผักน้ำพริก', '2026-04-24T15:46:16.743Z', 'ลดการสะสมของไขมันและดีต่อหัวใจในระยะยาว', 10);
INSERT INTO choices (id, question_id, label, choice_text, created_at, explanation, score_impact) VALUES ('2f2be187-5829-4c4d-8625-8b62b5466b7a', '88820bfc-db65-4f0d-b869-d16de45771e5', 'C', 'ก๋วยเตี๋ยวเนื้อเปื่อย + น้ำหวาน', '2026-04-24T15:46:16.789Z', 'น้ำตาลสูง เปลี่ยนเป็นไขมันสะสมได้', -5);
INSERT INTO choices (id, question_id, label, choice_text, created_at, explanation, score_impact) VALUES ('e065c31e-c903-4cfd-837f-78247cb2e533', '88820bfc-db65-4f0d-b869-d16de45771e5', 'D', 'อดมื้อเย็นไปเลย', '2026-04-24T15:46:16.835Z', 'ทำให้หิวจัดและระบบเผาผลาญพัง อาจตบะแตกกินหนักในมื้อถัดไป', -5);
INSERT INTO choices (id, question_id, label, choice_text, created_at, explanation, score_impact) VALUES ('5fab92a5-3cc8-4f66-9978-1caa1f2a2d2f', '152bbbe4-b61e-4bcf-8fc4-2dc1b7c5815b', 'A', 'เริ่มเดินเร็วหรือแกว่งแขน วันละ 30 นาที', '2026-04-24T15:46:16.990Z', 'กล้ามเนื้อหัวใจและหลอดเลือดเริ่มปรับตัวแข็งแรงขึ้น', 10);
INSERT INTO choices (id, question_id, label, choice_text, created_at, explanation, score_impact) VALUES ('018ce15d-8a57-4b69-a332-2a316a81dfc4', '152bbbe4-b61e-4bcf-8fc4-2dc1b7c5815b', 'B', 'นอนพักผ่อนอยู่บ้านเฉยๆ', '2026-04-24T15:46:17.036Z', 'ร่างกายไม่ได้ใช้งาน น้ำหนักพุ่งสูงขึ้น', -5);
INSERT INTO choices (id, question_id, label, choice_text, created_at, explanation, score_impact) VALUES ('70fabf8b-740e-4336-9a1a-6bc758a974c7', '152bbbe4-b61e-4bcf-8fc4-2dc1b7c5815b', 'C', 'ไปเตะบอลหรือวิ่งมาราธอนอย่างหนักทันที', '2026-04-24T15:46:17.082Z', 'ร่างกายปรับตัวไม่ทัน หัวใจทำงานหนักเกินไปจนอาจช็อกได้', -5);
INSERT INTO choices (id, question_id, label, choice_text, created_at, explanation, score_impact) VALUES ('e2bbde7c-c694-4f91-be74-ce46e94e3553', '152bbbe4-b61e-4bcf-8fc4-2dc1b7c5815b', 'D', 'ไม่เปลี่ยนพฤติกรรม ใช้ชีวิตเหมือนเดิม', '2026-04-24T15:46:17.128Z', 'ความเสี่ยงโรคหลอดเลือดหัวใจ (ASCVD) ก่อตัวขึ้นเงียบๆ', -10);
INSERT INTO choices (id, question_id, label, choice_text, created_at, explanation, score_impact) VALUES ('051cd200-762d-48ac-9b7d-02fa3bfebbdf', 'f2942772-b47a-4d4e-af09-9172723c5d56', 'A', 'หยุดพัก แล้วรีบนัดแพทย์เพื่อตรวจเช็กอาการ', '2026-04-24T15:46:17.294Z', 'เริ่มต้นหาสาเหตุอย่างถูกวิธี', 10);
INSERT INTO choices (id, question_id, label, choice_text, created_at, explanation, score_impact) VALUES ('566e7168-de07-45f5-acaf-84c48c91ca95', 'f2942772-b47a-4d4e-af09-9172723c5d56', 'B', 'คิดว่าแค่เหนื่อยธรรมดาตามวัย', '2026-04-24T15:46:17.346Z', 'อาการเริ่มแย่ลง หลอดเลือดอาจตีบไปแล้วกว่า 70%', -10);
INSERT INTO choices (id, question_id, label, choice_text, created_at, explanation, score_impact) VALUES ('82db0cde-bb5c-4e3e-ba48-c8c824f9a5fd', 'f2942772-b47a-4d4e-af09-9172723c5d56', 'C', 'แวะร้านขายยา ซื้อยาลดกรดมากิน', '2026-04-24T15:46:17.394Z', 'รักษาไม่ตรงจุด อาการที่แท้จริงยังซ่อนอยู่', -5);
INSERT INTO choices (id, question_id, label, choice_text, created_at, explanation, score_impact) VALUES ('c1f49dd6-d2a3-4c7d-9286-97678c20bfa0', 'f2942772-b47a-4d4e-af09-9172723c5d56', 'D', 'นั่งพักก่อน เดี๋ยวก็หาย', '2026-04-24T15:46:17.441Z', 'แม้จะหายชั่วคราว แต่อาการจะกลับมาเกิดซ้ำและรุนแรงขึ้น', -5);
INSERT INTO choices (id, question_id, label, choice_text, created_at, explanation, score_impact) VALUES ('b5e7dfc8-e312-4ab2-86f3-c29915ebfefe', '79bfc15d-8eed-4acf-bc8b-4d91aeb37bc9', 'A', 'ตรวจคลื่นไฟฟ้าหัวใจ (EKG)', '2026-04-24T15:46:17.594Z', 'แพทย์พบความผิดปกติของการเต้นของหัวใจ', 10);
INSERT INTO choices (id, question_id, label, choice_text, created_at, explanation, score_impact) VALUES ('ef379fbc-7192-450d-8ad0-0e966e9ecd6c', '79bfc15d-8eed-4acf-bc8b-4d91aeb37bc9', 'B', 'ตรวจระดับไขมันในเลือด', '2026-04-24T15:46:17.645Z', 'พบระดับคอเลสเตอรอลและไขมันเลว (LDL) สูงทะลุเกณฑ์', 10);
INSERT INTO choices (id, question_id, label, choice_text, created_at, explanation, score_impact) VALUES ('950055b1-eeb6-4584-b957-cc76a1d116cd', '79bfc15d-8eed-4acf-bc8b-4d91aeb37bc9', 'C', 'ขอเอกซเรย์ปอดอย่างเดียว', '2026-04-24T15:46:17.691Z', 'ไม่พบสาเหตุที่ชัดเจน เพราะปอดปกติ แต่ปัญหาอยู่ที่หัวใจ', -5);
INSERT INTO choices (id, question_id, label, choice_text, created_at, explanation, score_impact) VALUES ('86b03f79-27ee-4ff6-bfae-c5283bca330a', '79bfc15d-8eed-4acf-bc8b-4d91aeb37bc9', 'D', 'ปฏิเสธการตรวจเพราะกลัวเสียเงิน', '2026-04-24T15:46:17.738Z', 'พลาดโอกาสทองในการวินิจฉัยและป้องกัน', -10);
INSERT INTO choices (id, question_id, label, choice_text, created_at, explanation, score_impact) VALUES ('3a408785-9eda-4be1-8955-d62755c9b30e', '7eaa8fae-d7a5-4241-a03c-a99719920a2b', 'A', 'ปรับอาหาร ลดของมัน ของทอดอย่างจริงจัง', '2026-04-24T15:46:17.893Z', 'ไขมันในเลือดเริ่มลด คราบพลัคในหลอดเลือดหยุดการขยายตัว', 10);
INSERT INTO choices (id, question_id, label, choice_text, created_at, explanation, score_impact) VALUES ('1514f8bb-4fef-4db4-9cf0-4e7a0e7f6c18', '7eaa8fae-d7a5-4241-a03c-a99719920a2b', 'B', 'เริ่มออกกำลังกายสม่ำเสมอ + กินยา', '2026-04-24T15:46:17.940Z', 'สุขภาพหัวใจดีขึ้นอย่างเห็นได้ชัด', 10);
INSERT INTO choices (id, question_id, label, choice_text, created_at, explanation, score_impact) VALUES ('c1021efd-ac21-49c6-9c20-27b79ee71f93', '7eaa8fae-d7a5-4241-a03c-a99719920a2b', 'C', 'เครียดจัด เลยสูบบุหรี่จัดขึ้น', '2026-04-24T15:46:17.985Z', 'บุหรี่ทำให้หลอดเลือดอักเสบและตีบเร็วขึ้นทวีคูณ', -10);
INSERT INTO choices (id, question_id, label, choice_text, created_at, explanation, score_impact) VALUES ('df3af491-9cdd-45c3-8498-0790be7335bc', '7eaa8fae-d7a5-4241-a03c-a99719920a2b', 'D', 'งดของมัน แต่หันมากินของหวานจัดแทน', '2026-04-24T15:46:18.031Z', 'น้ำตาลสูงปรี๊ด เปลี่ยนเป็นไขมันไตรกลีเซอไรด์ เพิ่มความเสี่ยง', -5);
INSERT INTO choices (id, question_id, label, choice_text, created_at, explanation, score_impact) VALUES ('61c6dd3c-2749-442a-a2c6-dc8b84b0b7bd', '593ed3f1-fc14-4b69-bf6d-f2a84964bedb', 'A', 'โทร 1669 เรียกรถพยาบาลทันที', '2026-04-24T15:46:18.202Z', 'ได้รับการรักษาและให้ยาละลายลิ่มเลือดทันเวลา', 10);
INSERT INTO choices (id, question_id, label, choice_text, created_at, explanation, score_impact) VALUES ('abcd8bac-584c-4248-b911-5d13feec0410', '593ed3f1-fc14-4b69-bf6d-f2a84964bedb', 'B', 'นอนพักเฉยๆ หวังว่าเดี๋ยวก็ดีขึ้น', '2026-04-24T15:46:18.249Z', 'กล้ามเนื้อหัวใจขาดเลือดจนเสียชีวิต', -10);
INSERT INTO choices (id, question_id, label, choice_text, created_at, explanation, score_impact) VALUES ('4da56bcb-4eb4-433c-8c53-a30db38252c3', '593ed3f1-fc14-4b69-bf6d-f2a84964bedb', 'C', 'ฝืนขับรถไปโรงพยาบาลเอง', '2026-04-24T15:46:18.296Z', 'เสี่ยงต่อการหมดสติระหว่างทางและเกิดอุบัติเหตุรุนแรง', -5);
INSERT INTO choices (id, question_id, label, choice_text, created_at, explanation, score_impact) VALUES ('008bf10d-3339-48bb-a682-d396530ffdea', '593ed3f1-fc14-4b69-bf6d-f2a84964bedb', 'D', 'ลุกไปกินยาลดกรดและดื่มน้ำอุ่น', '2026-04-24T15:46:18.344Z', 'พลาดช่วงเวลาสำคัญที่สุดในการช่วยชีวิต', -10);
INSERT INTO choices (id, question_id, label, choice_text, created_at, explanation, score_impact) VALUES ('7d30a0b8-614d-4aa7-aee7-877437ca456a', 'd3d6a886-d7b5-46fe-a454-8849694b6435', 'A', 'หลอดเลือดตีบจากคราบไขมัน (Plaque)', '2026-04-24T15:46:18.501Z', 'ลุงสมชายเข้าใจสาเหตุของโรคได้อย่างถูกต้อง', 10);
INSERT INTO choices (id, question_id, label, choice_text, created_at, explanation, score_impact) VALUES ('08331e6a-73e5-4104-aa4e-0e3032c52a67', 'd3d6a886-d7b5-46fe-a454-8849694b6435', 'B', 'ดื่มน้ำเย็นจัดหลังกินของร้อน', '2026-04-24T15:46:18.547Z', 'เป็นความเชื่อที่ผิดและไม่เกี่ยวกับโรคหลอดเลือดหัวใจ', -10);
INSERT INTO choices (id, question_id, label, choice_text, created_at, explanation, score_impact) VALUES ('e0ce8c1f-9eac-4c6c-9889-8673e9806d27', 'd3d6a886-d7b5-46fe-a454-8849694b6435', 'C', 'เกิดจากอากาศร้อนจัดในไทย', '2026-04-24T15:46:18.594Z', 'อากาศเป็นแค่ปัจจัยกระตุ้นความเครียด ไม่ใช่สาเหตุหลัก', -10);
INSERT INTO choices (id, question_id, label, choice_text, created_at, explanation, score_impact) VALUES ('46a99832-0e62-4209-8bb4-044bd13aae26', 'd3d6a886-d7b5-46fe-a454-8849694b6435', 'D', 'กล้ามเนื้อหน้าอกอักเสบจากยกของหนัก', '2026-04-24T15:46:18.641Z', 'เข้าใจผิด เจ็บหน้าอกแบบนี้มาจากหัวใจ ไม่ใช่กล้ามเนื้อ', -10);
INSERT INTO choices (id, question_id, label, choice_text, created_at, explanation, score_impact) VALUES ('965c1bdc-45b4-495e-89aa-a5c023de5d2d', '9fb9a4bd-a156-4034-9598-9d00c43dc3ee', 'A', 'กินยาตามแพทย์สั่งอย่างเคร่งครัด', '2026-04-24T15:46:18.798Z', 'ยาช่วยควบคุมระดับไขมันและป้องกันลิ่มเลือดอุดตันซ้ำ', 10);
INSERT INTO choices (id, question_id, label, choice_text, created_at, explanation, score_impact) VALUES ('31ccf68f-603f-4805-b8bc-49dcae58e89c', '9fb9a4bd-a156-4034-9598-9d00c43dc3ee', 'B', 'เลิกสูบบุหรี่เด็ดขาด', '2026-04-24T15:46:18.844Z', 'ผนังหลอดเลือดเริ่มฟื้นฟู สุขภาพโดยรวมดีขึ้น', 10);
INSERT INTO choices (id, question_id, label, choice_text, created_at, explanation, score_impact) VALUES ('cc46e049-8906-44ea-a38b-01682a73b26b', '9fb9a4bd-a156-4034-9598-9d00c43dc3ee', 'C', 'แผลหายแล้ว กลับไปกินหมูกระทะ', '2026-04-24T15:46:18.890Z', 'อาการเดิมจะกลับมาเร็วขึ้น และครั้งหน้าอาจไม่โชคดีแบบนี้', -10);
INSERT INTO choices (id, question_id, label, choice_text, created_at, explanation, score_impact) VALUES ('269a14ce-b331-4aa1-868a-5836c2820870', '9fb9a4bd-a156-4034-9598-9d00c43dc3ee', 'D', 'เริ่มออกกำลังกายเบาๆ ตามแพทย์สั่ง', '2026-04-24T15:46:18.937Z', 'สุขภาพหัวใจกลับมาแข็งแรงอย่างค่อยเป็นค่อยไป', 10);
INSERT INTO choices (id, question_id, label, choice_text, created_at, explanation, score_impact) VALUES ('808d032d-c374-4b1e-aad1-85c024fdebdb', '40b322c2-d5ed-4e57-8b58-9973ad93c752', 'A', 'ควบคุมความดันโลหิตให้ปกติ', '2026-04-24T15:46:19.109Z', 'ลดแรงดันที่กระแทกผนังหลอดเลือด', 10);
INSERT INTO choices (id, question_id, label, choice_text, created_at, explanation, score_impact) VALUES ('9ae3bcef-c382-4eef-8b1a-8abcee38f256', '40b322c2-d5ed-4e57-8b58-9973ad93c752', 'B', 'คุมไขมัน (LDL) ให้ต่ำกว่าเป้าหมาย', '2026-04-24T15:46:19.155Z', 'หยุดยั้งการพอกตัวของตะกรันไขมัน', 10);
INSERT INTO choices (id, question_id, label, choice_text, created_at, explanation, score_impact) VALUES ('f5258787-349b-4921-b942-24e642e5c1b7', '40b322c2-d5ed-4e57-8b58-9973ad93c752', 'C', 'คุมระดับน้ำตาลในเลือดให้ปกติ', '2026-04-24T15:46:19.202Z', 'ป้องกันไม่ให้หลอดเลือดอักเสบจากเบาหวาน', 10);
INSERT INTO choices (id, question_id, label, choice_text, created_at, explanation, score_impact) VALUES ('d3957dbe-8532-4ba0-a0da-096bbc586ee9', '40b322c2-d5ed-4e57-8b58-9973ad93c752', 'D', 'ไม่ตรวจสุขภาพแล้ว ปล่อยตามกรรม', '2026-04-24T15:46:19.248Z', 'การไม่รู้คือความเสี่ยงที่น่ากลัวที่สุด', -10);
INSERT INTO choices (id, question_id, label, choice_text, created_at, explanation, score_impact) VALUES ('a44ce6c9-686c-408c-ac74-64dad1d517ef', '8040d623-4732-4a71-a2cf-3b91bdc3a188', 'A', 'ตรวจสุขภาพสม่ำเสมอ', '2026-04-24T15:46:19.404Z', 'ปรับแผนการรักษาให้เหมาะสมตามสภาพร่างกาย', 10);
INSERT INTO choices (id, question_id, label, choice_text, created_at, explanation, score_impact) VALUES ('db826a13-c3bf-415b-a0fa-8da711324b77', '8040d623-4732-4a71-a2cf-3b91bdc3a188', 'B', 'ชวนคนในครอบครัวออกกำลังกาย', '2026-04-24T15:46:19.450Z', 'สร้างสภาพแวดล้อมที่ดีและเป็นกำลังใจให้กัน', 10);
INSERT INTO choices (id, question_id, label, choice_text, created_at, explanation, score_impact) VALUES ('3d8d77d6-8973-40ce-85be-fb25d7f54224', '8040d623-4732-4a71-a2cf-3b91bdc3a188', 'C', 'กินยาบ้างไม่กินยาบ้าง', '2026-04-24T15:46:19.497Z', 'การหยุดยาเองอาจทำให้เกิดภาวะลิ่มเลือดอุดตันเฉียบพลันซ้ำ', -10);
INSERT INTO choices (id, question_id, label, choice_text, created_at, explanation, score_impact) VALUES ('ceefca8b-5af9-4a38-a503-1e5cde7ef1ac', '8040d623-4732-4a71-a2cf-3b91bdc3a188', 'D', 'ทนเอา ไม่สนใจอาการเตือนใดๆ', '2026-04-24T15:46:19.544Z', 'เข้าสู่ฉากจบ BAD END 3: มฤตยูเงียบ', -10);

-- Data for question_connections
INSERT INTO question_connections (id, session_id, from_question_id, from_choice_label, to_question_id, created_at, connection_type) VALUES ('08d4e31e-9f29-45ab-8221-9900210641b5', '035938f2-87ad-4b50-8a36-2dae88d2ea73', 'bffec14e-3000-4540-a3e7-a188467afdc4', 'A', '275c378e-dd3d-401d-ae2d-289b49a973ab', '2026-04-22T21:24:28.670Z', 'standard');
INSERT INTO question_connections (id, session_id, from_question_id, from_choice_label, to_question_id, created_at, connection_type) VALUES ('dfc67a4c-38ae-46af-bb44-750baa23c563', '6c479e82-105b-4b14-9cb3-9eb5bce92c32', '88820bfc-db65-4f0d-b869-d16de45771e5', 'A', '152bbbe4-b61e-4bcf-8fc4-2dc1b7c5815b', '2026-04-24T15:46:19.904Z', 'standard');
INSERT INTO question_connections (id, session_id, from_question_id, from_choice_label, to_question_id, created_at, connection_type) VALUES ('fb6c2cb3-fe34-4c98-a114-e8375dd9a1da', '6c479e82-105b-4b14-9cb3-9eb5bce92c32', '88820bfc-db65-4f0d-b869-d16de45771e5', 'B', '152bbbe4-b61e-4bcf-8fc4-2dc1b7c5815b', '2026-04-24T15:46:19.948Z', 'standard');
INSERT INTO question_connections (id, session_id, from_question_id, from_choice_label, to_question_id, created_at, connection_type) VALUES ('132a3a4f-77aa-4e8b-83f4-0e6324c0747f', '6c479e82-105b-4b14-9cb3-9eb5bce92c32', '88820bfc-db65-4f0d-b869-d16de45771e5', 'C', '152bbbe4-b61e-4bcf-8fc4-2dc1b7c5815b', '2026-04-24T15:46:19.997Z', 'standard');
INSERT INTO question_connections (id, session_id, from_question_id, from_choice_label, to_question_id, created_at, connection_type) VALUES ('9d0574be-42b2-4492-a61f-425d6f0a3163', '6c479e82-105b-4b14-9cb3-9eb5bce92c32', '88820bfc-db65-4f0d-b869-d16de45771e5', 'D', '152bbbe4-b61e-4bcf-8fc4-2dc1b7c5815b', '2026-04-24T15:46:20.044Z', 'standard');
INSERT INTO question_connections (id, session_id, from_question_id, from_choice_label, to_question_id, created_at, connection_type) VALUES ('7b4991fd-d14f-499a-8980-1225a2e9255f', '6c479e82-105b-4b14-9cb3-9eb5bce92c32', '152bbbe4-b61e-4bcf-8fc4-2dc1b7c5815b', 'A', 'f2942772-b47a-4d4e-af09-9172723c5d56', '2026-04-24T15:46:20.087Z', 'standard');
INSERT INTO question_connections (id, session_id, from_question_id, from_choice_label, to_question_id, created_at, connection_type) VALUES ('6908667a-8a7a-4242-98ef-2b6cf2dada83', '6c479e82-105b-4b14-9cb3-9eb5bce92c32', '152bbbe4-b61e-4bcf-8fc4-2dc1b7c5815b', 'B', 'f2942772-b47a-4d4e-af09-9172723c5d56', '2026-04-24T15:46:20.135Z', 'standard');
INSERT INTO question_connections (id, session_id, from_question_id, from_choice_label, to_question_id, created_at, connection_type) VALUES ('03bc3c8b-f30d-4b42-8e08-63ab4d54de6d', '6c479e82-105b-4b14-9cb3-9eb5bce92c32', '152bbbe4-b61e-4bcf-8fc4-2dc1b7c5815b', 'C', 'f2942772-b47a-4d4e-af09-9172723c5d56', '2026-04-24T15:46:20.181Z', 'standard');
INSERT INTO question_connections (id, session_id, from_question_id, from_choice_label, to_question_id, created_at, connection_type) VALUES ('1a1d9ff5-3501-4f6e-8b6d-f07d4b9beda1', '6c479e82-105b-4b14-9cb3-9eb5bce92c32', '152bbbe4-b61e-4bcf-8fc4-2dc1b7c5815b', 'D', 'f2942772-b47a-4d4e-af09-9172723c5d56', '2026-04-24T15:46:20.228Z', 'standard');
INSERT INTO question_connections (id, session_id, from_question_id, from_choice_label, to_question_id, created_at, connection_type) VALUES ('cdf6da76-4ab7-4c1c-821a-cbba5278b0bc', '6c479e82-105b-4b14-9cb3-9eb5bce92c32', 'f2942772-b47a-4d4e-af09-9172723c5d56', 'A', '79bfc15d-8eed-4acf-bc8b-4d91aeb37bc9', '2026-04-24T15:46:20.275Z', 'standard');
INSERT INTO question_connections (id, session_id, from_question_id, from_choice_label, to_question_id, created_at, connection_type) VALUES ('9ab05fb6-7e1f-4167-bb3c-0efbb990679b', '6c479e82-105b-4b14-9cb3-9eb5bce92c32', '79bfc15d-8eed-4acf-bc8b-4d91aeb37bc9', 'A', '7eaa8fae-d7a5-4241-a03c-a99719920a2b', '2026-04-24T15:46:20.322Z', 'standard');
INSERT INTO question_connections (id, session_id, from_question_id, from_choice_label, to_question_id, created_at, connection_type) VALUES ('cce0efef-fbba-4542-9f73-21f3d70555d1', '6c479e82-105b-4b14-9cb3-9eb5bce92c32', '79bfc15d-8eed-4acf-bc8b-4d91aeb37bc9', 'B', '7eaa8fae-d7a5-4241-a03c-a99719920a2b', '2026-04-24T15:46:20.369Z', 'standard');
INSERT INTO question_connections (id, session_id, from_question_id, from_choice_label, to_question_id, created_at, connection_type) VALUES ('dbd422c3-2a37-4f18-a88a-d1c9996a18fb', '6c479e82-105b-4b14-9cb3-9eb5bce92c32', '7eaa8fae-d7a5-4241-a03c-a99719920a2b', 'C', '593ed3f1-fc14-4b69-bf6d-f2a84964bedb', '2026-04-24T15:46:20.415Z', 'standard');
INSERT INTO question_connections (id, session_id, from_question_id, from_choice_label, to_question_id, created_at, connection_type) VALUES ('7ac69819-7efd-4d6e-b675-1e30762f521e', '6c479e82-105b-4b14-9cb3-9eb5bce92c32', '7eaa8fae-d7a5-4241-a03c-a99719920a2b', 'D', '593ed3f1-fc14-4b69-bf6d-f2a84964bedb', '2026-04-24T15:46:20.478Z', 'standard');
INSERT INTO question_connections (id, session_id, from_question_id, from_choice_label, to_question_id, created_at, connection_type) VALUES ('fcc0e512-5d15-4f4c-ad39-a68732a20e5d', '6c479e82-105b-4b14-9cb3-9eb5bce92c32', '79bfc15d-8eed-4acf-bc8b-4d91aeb37bc9', 'C', '593ed3f1-fc14-4b69-bf6d-f2a84964bedb', '2026-04-24T15:46:20.525Z', 'standard');
INSERT INTO question_connections (id, session_id, from_question_id, from_choice_label, to_question_id, created_at, connection_type) VALUES ('4e100545-eba7-4bd2-b20e-3782c0a55e57', '6c479e82-105b-4b14-9cb3-9eb5bce92c32', '79bfc15d-8eed-4acf-bc8b-4d91aeb37bc9', 'D', '593ed3f1-fc14-4b69-bf6d-f2a84964bedb', '2026-04-24T15:46:20.571Z', 'standard');
INSERT INTO question_connections (id, session_id, from_question_id, from_choice_label, to_question_id, created_at, connection_type) VALUES ('837030c6-4260-48cd-b0da-8ea1a957d24c', '6c479e82-105b-4b14-9cb3-9eb5bce92c32', 'f2942772-b47a-4d4e-af09-9172723c5d56', 'B', '593ed3f1-fc14-4b69-bf6d-f2a84964bedb', '2026-04-24T15:46:20.617Z', 'standard');
INSERT INTO question_connections (id, session_id, from_question_id, from_choice_label, to_question_id, created_at, connection_type) VALUES ('0bfa4431-2557-40b1-aaf8-bdc619f956a8', '6c479e82-105b-4b14-9cb3-9eb5bce92c32', 'f2942772-b47a-4d4e-af09-9172723c5d56', 'C', '593ed3f1-fc14-4b69-bf6d-f2a84964bedb', '2026-04-24T15:46:20.664Z', 'standard');
INSERT INTO question_connections (id, session_id, from_question_id, from_choice_label, to_question_id, created_at, connection_type) VALUES ('42ffe99c-b0e9-4d00-bcde-dfb25a496451', '6c479e82-105b-4b14-9cb3-9eb5bce92c32', 'f2942772-b47a-4d4e-af09-9172723c5d56', 'D', '593ed3f1-fc14-4b69-bf6d-f2a84964bedb', '2026-04-24T15:46:20.712Z', 'standard');
INSERT INTO question_connections (id, session_id, from_question_id, from_choice_label, to_question_id, created_at, connection_type) VALUES ('596d8cb4-92a0-4bd4-9791-2683beb0c3d3', '6c479e82-105b-4b14-9cb3-9eb5bce92c32', '593ed3f1-fc14-4b69-bf6d-f2a84964bedb', 'A', 'd3d6a886-d7b5-46fe-a454-8849694b6435', '2026-04-24T15:46:20.760Z', 'standard');
INSERT INTO question_connections (id, session_id, from_question_id, from_choice_label, to_question_id, created_at, connection_type) VALUES ('3a5ff713-21d1-47ce-ae4b-6e693396faf4', '6c479e82-105b-4b14-9cb3-9eb5bce92c32', 'd3d6a886-d7b5-46fe-a454-8849694b6435', 'A', '9fb9a4bd-a156-4034-9598-9d00c43dc3ee', '2026-04-24T15:46:20.807Z', 'standard');
INSERT INTO question_connections (id, session_id, from_question_id, from_choice_label, to_question_id, created_at, connection_type) VALUES ('6c3e5b8a-5c6e-4f19-beed-391fa18617c5', '6c479e82-105b-4b14-9cb3-9eb5bce92c32', 'd3d6a886-d7b5-46fe-a454-8849694b6435', 'B', '9fb9a4bd-a156-4034-9598-9d00c43dc3ee', '2026-04-24T15:46:20.853Z', 'standard');
INSERT INTO question_connections (id, session_id, from_question_id, from_choice_label, to_question_id, created_at, connection_type) VALUES ('bbbe9e5d-a5ae-4c77-b460-3b00153aecfa', '6c479e82-105b-4b14-9cb3-9eb5bce92c32', 'd3d6a886-d7b5-46fe-a454-8849694b6435', 'C', '9fb9a4bd-a156-4034-9598-9d00c43dc3ee', '2026-04-24T15:46:20.899Z', 'standard');
INSERT INTO question_connections (id, session_id, from_question_id, from_choice_label, to_question_id, created_at, connection_type) VALUES ('b5134892-485b-462b-9a40-34265b5396b2', '6c479e82-105b-4b14-9cb3-9eb5bce92c32', 'd3d6a886-d7b5-46fe-a454-8849694b6435', 'D', '9fb9a4bd-a156-4034-9598-9d00c43dc3ee', '2026-04-24T15:46:20.945Z', 'standard');
INSERT INTO question_connections (id, session_id, from_question_id, from_choice_label, to_question_id, created_at, connection_type) VALUES ('ff5e9a6d-7439-489e-b9b2-f21a429644df', '6c479e82-105b-4b14-9cb3-9eb5bce92c32', '9fb9a4bd-a156-4034-9598-9d00c43dc3ee', 'A', '40b322c2-d5ed-4e57-8b58-9973ad93c752', '2026-04-24T15:46:20.993Z', 'standard');
INSERT INTO question_connections (id, session_id, from_question_id, from_choice_label, to_question_id, created_at, connection_type) VALUES ('c0bb84ac-f9a8-411b-9c45-977d7ae468c2', '6c479e82-105b-4b14-9cb3-9eb5bce92c32', '9fb9a4bd-a156-4034-9598-9d00c43dc3ee', 'B', '40b322c2-d5ed-4e57-8b58-9973ad93c752', '2026-04-24T15:46:21.039Z', 'standard');
INSERT INTO question_connections (id, session_id, from_question_id, from_choice_label, to_question_id, created_at, connection_type) VALUES ('28f3d485-2688-4a5c-8b78-c790285b2db5', '6c479e82-105b-4b14-9cb3-9eb5bce92c32', '9fb9a4bd-a156-4034-9598-9d00c43dc3ee', 'D', '40b322c2-d5ed-4e57-8b58-9973ad93c752', '2026-04-24T15:46:21.083Z', 'standard');
INSERT INTO question_connections (id, session_id, from_question_id, from_choice_label, to_question_id, created_at, connection_type) VALUES ('4f0ea2d4-3b9b-431b-8c77-1c9268e73653', '6c479e82-105b-4b14-9cb3-9eb5bce92c32', '7eaa8fae-d7a5-4241-a03c-a99719920a2b', 'A', '40b322c2-d5ed-4e57-8b58-9973ad93c752', '2026-04-24T15:46:21.132Z', 'standard');
INSERT INTO question_connections (id, session_id, from_question_id, from_choice_label, to_question_id, created_at, connection_type) VALUES ('dd98ee0b-3ce0-4519-9f62-36c8a7387cc1', '6c479e82-105b-4b14-9cb3-9eb5bce92c32', '7eaa8fae-d7a5-4241-a03c-a99719920a2b', 'B', '40b322c2-d5ed-4e57-8b58-9973ad93c752', '2026-04-24T15:46:21.178Z', 'standard');
INSERT INTO question_connections (id, session_id, from_question_id, from_choice_label, to_question_id, created_at, connection_type) VALUES ('ff42d4d0-bcbb-4d46-a280-3ae5da8920fc', '6c479e82-105b-4b14-9cb3-9eb5bce92c32', '40b322c2-d5ed-4e57-8b58-9973ad93c752', 'A', '8040d623-4732-4a71-a2cf-3b91bdc3a188', '2026-04-24T15:46:21.225Z', 'standard');
INSERT INTO question_connections (id, session_id, from_question_id, from_choice_label, to_question_id, created_at, connection_type) VALUES ('5877a129-f0ba-43b4-8c4f-1854b05660c8', '6c479e82-105b-4b14-9cb3-9eb5bce92c32', '40b322c2-d5ed-4e57-8b58-9973ad93c752', 'B', '8040d623-4732-4a71-a2cf-3b91bdc3a188', '2026-04-24T15:46:21.272Z', 'standard');
INSERT INTO question_connections (id, session_id, from_question_id, from_choice_label, to_question_id, created_at, connection_type) VALUES ('7b2710de-f568-4735-b636-b5959aa7f1d2', '6c479e82-105b-4b14-9cb3-9eb5bce92c32', '40b322c2-d5ed-4e57-8b58-9973ad93c752', 'C', '8040d623-4732-4a71-a2cf-3b91bdc3a188', '2026-04-24T15:46:21.319Z', 'standard');
INSERT INTO question_connections (id, session_id, from_question_id, from_choice_label, to_question_id, created_at, connection_type) VALUES ('25095e60-f0bf-4b81-a19c-2bfb2ef9018d', '6c479e82-105b-4b14-9cb3-9eb5bce92c32', '8040d623-4732-4a71-a2cf-3b91bdc3a188', 'A', 'e7b0b147-aecc-4341-a274-f662392fc39a', '2026-04-24T15:46:21.366Z', 'standard');
INSERT INTO question_connections (id, session_id, from_question_id, from_choice_label, to_question_id, created_at, connection_type) VALUES ('d42ff17b-8b39-4406-ad6b-3aff2fb75ac9', '6c479e82-105b-4b14-9cb3-9eb5bce92c32', '8040d623-4732-4a71-a2cf-3b91bdc3a188', 'B', 'e7b0b147-aecc-4341-a274-f662392fc39a', '2026-04-24T15:46:21.413Z', 'standard');
INSERT INTO question_connections (id, session_id, from_question_id, from_choice_label, to_question_id, created_at, connection_type) VALUES ('3bf2924f-165e-4b95-b5fb-f78313c382d9', '6c479e82-105b-4b14-9cb3-9eb5bce92c32', '593ed3f1-fc14-4b69-bf6d-f2a84964bedb', 'B', '9bf3f9a8-9fdb-4d3b-b911-0f460123648f', '2026-04-24T15:46:21.460Z', 'standard');
INSERT INTO question_connections (id, session_id, from_question_id, from_choice_label, to_question_id, created_at, connection_type) VALUES ('2d6eca31-5afa-4259-864c-59c2b02f3d1f', '6c479e82-105b-4b14-9cb3-9eb5bce92c32', '593ed3f1-fc14-4b69-bf6d-f2a84964bedb', 'C', '9bf3f9a8-9fdb-4d3b-b911-0f460123648f', '2026-04-24T15:46:21.505Z', 'standard');
INSERT INTO question_connections (id, session_id, from_question_id, from_choice_label, to_question_id, created_at, connection_type) VALUES ('fdaaeb1c-ddbf-4e82-a979-c5ec44aa74a5', '6c479e82-105b-4b14-9cb3-9eb5bce92c32', '593ed3f1-fc14-4b69-bf6d-f2a84964bedb', 'D', '9bf3f9a8-9fdb-4d3b-b911-0f460123648f', '2026-04-24T15:46:21.552Z', 'standard');
INSERT INTO question_connections (id, session_id, from_question_id, from_choice_label, to_question_id, created_at, connection_type) VALUES ('6c0ef7e1-6f7f-4976-9eb1-6ecb853f6bab', '6c479e82-105b-4b14-9cb3-9eb5bce92c32', '8040d623-4732-4a71-a2cf-3b91bdc3a188', 'C', 'ef6acac9-4f12-4172-950d-c11c5b2ae6cf', '2026-04-24T15:46:21.599Z', 'standard');
INSERT INTO question_connections (id, session_id, from_question_id, from_choice_label, to_question_id, created_at, connection_type) VALUES ('2f114342-d647-42de-915b-9cd9b1db5434', '6c479e82-105b-4b14-9cb3-9eb5bce92c32', '8040d623-4732-4a71-a2cf-3b91bdc3a188', 'D', 'ef6acac9-4f12-4172-950d-c11c5b2ae6cf', '2026-04-24T15:46:21.646Z', 'standard');
INSERT INTO question_connections (id, session_id, from_question_id, from_choice_label, to_question_id, created_at, connection_type) VALUES ('dcfd7db3-bda1-4c6d-9307-2e5ea2a4a008', '6c479e82-105b-4b14-9cb3-9eb5bce92c32', '9fb9a4bd-a156-4034-9598-9d00c43dc3ee', 'C', '82e3e7a3-82f7-4dfc-bb61-78acff02215e', '2026-04-24T15:46:21.693Z', 'standard');
INSERT INTO question_connections (id, session_id, from_question_id, from_choice_label, to_question_id, created_at, connection_type) VALUES ('55df6787-ecb6-49f4-b05a-60a8984f9209', '6c479e82-105b-4b14-9cb3-9eb5bce92c32', '40b322c2-d5ed-4e57-8b58-9973ad93c752', 'D', '82e3e7a3-82f7-4dfc-bb61-78acff02215e', '2026-04-24T15:46:21.739Z', 'standard');

-- Data for user_answers
INSERT INTO user_answers (id, session_id, user_id, question_id, chosen_label, time_taken_ms, utility_score, answered_at) VALUES ('21556416-7ccb-4eb5-a219-03632766c5f5', '035938f2-87ad-4b50-8a36-2dae88d2ea73', 'qPP3jkRGjSeLBXSKECCr0xCQE6q1', 'bffec14e-3000-4540-a3e7-a188467afdc4', 'A', 577, 0, '2026-04-22T21:26:49.771Z');
INSERT INTO user_answers (id, session_id, user_id, question_id, chosen_label, time_taken_ms, utility_score, answered_at) VALUES ('74fb65d2-54f3-48c5-8a7b-8ec90da11f80', '035938f2-87ad-4b50-8a36-2dae88d2ea73', 'qPP3jkRGjSeLBXSKECCr0xCQE6q1', '275c378e-dd3d-401d-ae2d-289b49a973ab', 'B', 2204, 0, '2026-04-22T21:26:52.703Z');
INSERT INTO user_answers (id, session_id, user_id, question_id, chosen_label, time_taken_ms, utility_score, answered_at) VALUES ('750a1e05-3713-4ada-b952-15b6443c63ca', '035938f2-87ad-4b50-8a36-2dae88d2ea73', 'qPP3jkRGjSeLBXSKECCr0xCQE6q1', 'bffec14e-3000-4540-a3e7-a188467afdc4', 'A', 686, 0, '2026-04-22T21:27:00.412Z');
INSERT INTO user_answers (id, session_id, user_id, question_id, chosen_label, time_taken_ms, utility_score, answered_at) VALUES ('4174b3ac-420f-4ddc-a8e8-d347c1afb701', '035938f2-87ad-4b50-8a36-2dae88d2ea73', 'qPP3jkRGjSeLBXSKECCr0xCQE6q1', '275c378e-dd3d-401d-ae2d-289b49a973ab', 'A', 1683, 0, '2026-04-22T21:27:02.772Z');
INSERT INTO user_answers (id, session_id, user_id, question_id, chosen_label, time_taken_ms, utility_score, answered_at) VALUES ('6d8321c3-99a0-40ac-b346-cc2b06afeee1', '035938f2-87ad-4b50-8a36-2dae88d2ea73', 'qPP3jkRGjSeLBXSKECCr0xCQE6q1', 'bffec14e-3000-4540-a3e7-a188467afdc4', 'A', 4314, 0, '2026-04-22T21:29:06.089Z');

-- Data for leaderboard_entries
INSERT INTO leaderboard_entries (id, session_id, user_id, user_display_name, user_photo_url, total_score, correct_count, incorrect_count, unanswered_count, streak, total_time_ms, completed_at, utility_score) VALUES ('94796e61-d07f-44fa-a845-3ebd1f368277', '6c479e82-105b-4b14-9cb3-9eb5bce92c32', 'qPP3jkRGjSeLBXSKECCr0xCQE6q1', 'Spiral Tumvijit', 'https://lh3.googleusercontent.com/a/ACg8ocInRVGylMC-N_NO_Ns4enyPKyXGK9kYC7qpPWJsqZq0ZyFdPRA=s96-c', 40, 6, 3, 0, 5, 44846, '2026-04-24T03:07:48.244Z', 0);

-- Data for sessions
INSERT INTO sessions (id, session_id, user_id, current_question_id, current_score, current_streak, started_at, finished_at) VALUES ('b38ab209-7ace-4d37-bdd8-16b8e8f9a0df', '035938f2-87ad-4b50-8a36-2dae88d2ea73', 'qPP3jkRGjSeLBXSKECCr0xCQE6q1', 'bffec14e-3000-4540-a3e7-a188467afdc4', 0, 0, '2026-04-22T21:26:11.509Z', NULL);
INSERT INTO sessions (id, session_id, user_id, current_question_id, current_score, current_streak, started_at, finished_at) VALUES ('58546054-5329-4426-8f15-cbdbff48e414', '6c479e82-105b-4b14-9cb3-9eb5bce92c32', 'qPP3jkRGjSeLBXSKECCr0xCQE6q1', NULL, 40, 0, '2026-04-24T03:06:54.330Z', '2026-04-24T03:07:48.249Z');

SET session_replication_role = 'origin';
COMMIT;
