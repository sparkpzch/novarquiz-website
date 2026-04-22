CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

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

alter table question_sessions
    owner to postgres;

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
                   ((ARRAY ['image'::character varying, 'video'::character varying, NULL::character varying])::text[])),
    media_url      text,
    timer_override integer,
    is_entry_point boolean                  default false                       not null,
    node_x         double precision         default 0                           not null,
    node_y         double precision         default 0                           not null,
    created_at     timestamp with time zone default now()                       not null,
    updated_at     timestamp with time zone default now()                       not null,
    node_type      varchar(20)              default 'normal'::character varying not null
);

alter table questions
    owner to postgres;

create index idx_questions_session
    on questions (session_id);

create table choices
(
    id          uuid                     default uuid_generate_v4() not null
        primary key,
    question_id uuid                                                not null
        references questions
            on delete cascade,
    label       char                                                not null
        constraint choices_label_check
            check (label = ANY (ARRAY ['A'::bpchar, 'B'::bpchar, 'C'::bpchar, 'D'::bpchar])),
    choice_text varchar(500)                                        not null,
    is_correct  boolean                  default false              not null,
    created_at  timestamp with time zone default now()              not null,
    unique (question_id, label)
);

alter table choices
    owner to postgres;

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
    unique (from_question_id, from_choice_label)
);

alter table question_connections
    owner to postgres;

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
    is_correct    boolean                  default false              not null,
    time_taken_ms integer,
    points_earned integer                  default 0                  not null,
    answered_at   timestamp with time zone default now()              not null
);

alter table user_answers
    owner to postgres;

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
    unique (session_id, user_id)
);

alter table leaderboard_entries
    owner to postgres;

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

alter table play_sessions
    owner to postgres;

create index idx_play_sessions_user
    on play_sessions (user_id);