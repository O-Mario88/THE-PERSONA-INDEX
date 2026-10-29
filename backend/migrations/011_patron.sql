-- The Persona Index Patron and walking alongside one person (Edwin's brief,
-- 2026-10-29; patron.go, pair.go).
--
-- entitlements: one row per purchase, held by an account ('a:' and its id)
-- or, before it signs in, by a phone ('d:' and a keyed hash of its pass, a
-- key no other table uses). Only the plan, its days, where it came from and
-- the store's own reference: no address, card or name.
CREATE TABLE IF NOT EXISTS entitlements (
    ref    text PRIMARY KEY,
    owner  text NOT NULL,
    plan   text NOT NULL CHECK (plan IN ('monthly', 'yearly', 'duo_monthly', 'duo_yearly', 'founding', 'pass_90', 'pass_365')),
    since  date NOT NULL,
    until  date,            -- the last day it holds; NULL for a Founding place, which never ends
    source text NOT NULL CHECK (source IN ('apple', 'google', 'web', 'test'))
);

CREATE INDEX IF NOT EXISTS entitlements_owner ON entitlements (owner);
CREATE INDEX IF NOT EXISTS entitlements_plan ON entitlements (plan);

-- pairs: one ask, or two people walking alongside each other. An account is
-- in one pair at most, as the one who asked or the one asked (pair.go keeps
-- it so under a lock). Deleting either account removes the row.
CREATE TABLE IF NOT EXISTS pairs (
    from_account text    NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
    to_account   text    NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
    walking      boolean NOT NULL DEFAULT false,
    since        date    NOT NULL,
    PRIMARY KEY (from_account),
    UNIQUE (to_account)
);
