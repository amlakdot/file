PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'consultant'
        CHECK (role IN ('admin', 'consultant')),
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS files (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL
        CHECK (type IN ('sale', 'landlord', 'buyer', 'tenant')),

    data TEXT NOT NULL,

    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN (
            'active',
            'followup',
            'reserved',
            'done',
            'archived'
        )),

    follow_up_date TEXT,
    follow_up_days INTEGER,

    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,

    FOREIGN KEY (created_by)
        REFERENCES users(id)
        ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL,

    FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_files_type
ON files(type);

CREATE INDEX IF NOT EXISTS idx_files_status
ON files(status);

CREATE INDEX IF NOT EXISTS idx_files_follow_up
ON files(follow_up_date);

CREATE INDEX IF NOT EXISTS idx_files_created_by
ON files(created_by);

CREATE INDEX IF NOT EXISTS idx_sessions_expires
ON sessions(expires_at);
