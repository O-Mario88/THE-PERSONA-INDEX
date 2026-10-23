-- Yours to keep (Phase 3 of the review of 2026-10-15).
--
-- 1. Plan checks. A plan ("When ___, I will ___") stays on the phone. When
--    the next sitting asks how it went, only "did it" or "not yet" comes to
--    the server, with the phone's date, so the weekly mirror can count them.
--    Each check arrives under its own random key: a resend counts once, and
--    no two checks can be tied to one plan here. Never the plan's words.
--    Checks go after five weeks with the rest of the mirror, and at once
--    when the phone deletes everything.
CREATE TABLE IF NOT EXISTS mirror_plan_checks (
    device_key text NOT NULL,
    check_key  text NOT NULL,   -- the phone's random key for this one check
    checked_on date NOT NULL,   -- the phone's date; never the moment
    status     text NOT NULL CHECK (status IN ('did', 'not_yet')),
    PRIMARY KEY (device_key, check_key)
);

CREATE INDEX IF NOT EXISTS mirror_plan_checks_on ON mirror_plan_checks (checked_on);

-- 2. Encrypted backups. A backup is sealed on the phone with a key made from
--    its 12-word phrase, and the server cannot open it. It is found by the
--    SHA-256 of a second key made from the same phrase, which only the phone
--    can show, so this table cannot be read, and it holds nothing that ties
--    a backup to a device, an answer or a vote. Each write names the version
--    it replaces, so two phones cannot silently overwrite each other. A
--    backup no phone has written or read for 400 days goes.
CREATE TABLE IF NOT EXISTS vaults (
    vault_id text    PRIMARY KEY,   -- hex SHA-256 of the phone's vault key
    version  integer NOT NULL CHECK (version > 0),
    sealed   bytea   NOT NULL,
    seen_on  date    NOT NULL       -- last written or read, to the day
);

CREATE INDEX IF NOT EXISTS vaults_seen_on ON vaults (seen_on);
