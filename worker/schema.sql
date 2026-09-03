-- =========================================================
-- DOT Real Estate — D1 Database Schema
-- =========================================================

PRAGMA foreign_keys = ON;

-- =========================================================
-- Users
-- =========================================================

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    username TEXT NOT NULL UNIQUE,

    password_hash TEXT NOT NULL,

    role TEXT NOT NULL DEFAULT 'consultant'
        CHECK (role IN ('admin', 'consultant')),

    name TEXT,

    active INTEGER NOT NULL DEFAULT 1
        CHECK (active IN (0, 1)),

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_username
ON users(username);

CREATE INDEX IF NOT EXISTS idx_users_active
ON users(active);


-- =========================================================
-- Sessions
-- =========================================================

CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    user_id INTEGER NOT NULL,

    token_hash TEXT NOT NULL UNIQUE,

    expires_at TEXT NOT NULL,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_token_hash
ON sessions(token_hash);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id
ON sessions(user_id);

CREATE INDEX IF NOT EXISTS idx_sessions_expires_at
ON sessions(expires_at);


-- =========================================================
-- Real Estate Files
-- =========================================================

CREATE TABLE IF NOT EXISTS files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    code INTEGER NOT NULL UNIQUE,

    type TEXT NOT NULL
        CHECK (
            type IN (
                'sale',
                'landlord',
                'buyer',
                'tenant'
            )
        ),

    name TEXT NOT NULL,

    phone TEXT,

    location TEXT,

    -- -------------------------
    -- Property information
    -- -------------------------

    property_type TEXT,

    area REAL,

    rooms INTEGER,

    year INTEGER,

    key_holder TEXT,

    condition TEXT,

    occupancy TEXT,

    -- -------------------------
    -- Sale / landlord financials
    -- -------------------------

    price REAL,

    current_deposit REAL,

    current_rent REAL,

    suggested_deposit REAL,

    suggested_rent REAL,

    -- -------------------------
    -- Buyer
    -- -------------------------

    capital REAL,

    -- -------------------------
    -- Tenant
    -- -------------------------

    deposit REAL,

    rent REAL,

    family_status TEXT,

    family_size INTEGER,

    -- -------------------------
    -- Other
    -- -------------------------

    notes TEXT,

    -- JSON array
    -- Example:
    -- ["parking","elevator","storage"]
    amenities TEXT,

    -- -------------------------
    -- Follow-up
    -- -------------------------

    follow_up_days INTEGER NOT NULL DEFAULT 10,

    follow_up_at TEXT,

    -- -------------------------
    -- Ownership / audit
    -- -------------------------

    created_by INTEGER,

    updated_by INTEGER,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- -------------------------
    -- Soft delete
    -- -------------------------

    status TEXT NOT NULL DEFAULT 'active'
        CHECK (
            status IN (
                'active',
                'archived'
            )
        ),

    FOREIGN KEY (created_by)
        REFERENCES users(id)
        ON DELETE SET NULL,

    FOREIGN KEY (updated_by)
        REFERENCES users(id)
        ON DELETE SET NULL
);


-- =========================================================
-- File indexes
-- =========================================================

CREATE INDEX IF NOT EXISTS idx_files_code
ON files(code);

CREATE INDEX IF NOT EXISTS idx_files_type
ON files(type);

CREATE INDEX IF NOT EXISTS idx_files_status
ON files(status);

CREATE INDEX IF NOT EXISTS idx_files_created_by
ON files(created_by);

CREATE INDEX IF NOT EXISTS idx_files_follow_up_at
ON files(follow_up_at);

CREATE INDEX IF NOT EXISTS idx_files_created_at
ON files(created_at);


-- =========================================================
-- Trigger: update users.updated_at
-- =========================================================

CREATE TRIGGER IF NOT EXISTS trg_users_updated_at
AFTER UPDATE ON users
FOR EACH ROW
BEGIN
    UPDATE users
    SET updated_at = CURRENT_TIMESTAMP
    WHERE id = NEW.id;
END;


-- =========================================================
-- Trigger: update files.updated_at
-- =========================================================

CREATE TRIGGER IF NOT EXISTS trg_files_updated_at
AFTER UPDATE ON files
FOR EACH ROW
BEGIN
    UPDATE files
    SET updated_at = CURRENT_TIMESTAMP
    WHERE id = NEW.id;
END;
