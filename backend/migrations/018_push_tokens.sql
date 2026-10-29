-- Telling a person when someone they trust reaches out (Edwin, 2026-10-29;
-- notify.go). A phone that turned it on keeps its push address here, for the
-- one person signed in on it. Nothing about what was shared is stored.
-- Deleting the account deletes its addresses.
CREATE TABLE IF NOT EXISTS push_tokens (
    token      text        PRIMARY KEY,
    account_id text        NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
    platform   text        NOT NULL CHECK (platform IN ('ios', 'android')),
    updated_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS push_tokens_account ON push_tokens (account_id);
