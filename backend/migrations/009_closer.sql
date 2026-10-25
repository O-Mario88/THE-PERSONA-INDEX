-- Closer Together (Connect 3.0, closer.go). Each table holds only what a
-- person chose to give: the words of a share and whom it went to, broad
-- Common Ground tags and whom they opted in to, and fixed-phrase reach-outs.
-- Everything goes with the account; disconnecting drops what two people
-- shared with each other (pgcloser.go).

CREATE TABLE IF NOT EXISTS shares (
    id         text        PRIMARY KEY,
    sender     text        NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
    kind       text        NOT NULL CHECK (kind IN ('helped', 'win')),
    theme      text        NOT NULL,
    body       text        NOT NULL,
    why        text        NOT NULL DEFAULT '',
    try_this   text        NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS shares_sender ON shares (sender);

CREATE TABLE IF NOT EXISTS share_recipients (
    share_id  text NOT NULL REFERENCES shares (id) ON DELETE CASCADE,
    recipient text NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
    PRIMARY KEY (share_id, recipient)
);

CREATE INDEX IF NOT EXISTS share_recipients_recipient ON share_recipients (recipient);

-- changed_on: new tags may be added once a week, so the overlap cannot be
-- used to read a friend's whole list.
CREATE TABLE IF NOT EXISTS common_tags (
    account_id text   PRIMARY KEY REFERENCES accounts (id) ON DELETE CASCADE,
    tags       text[] NOT NULL,
    changed_on date   NOT NULL
);

-- a opted in to Common Ground with b. Shown only when b opted in to a too.
CREATE TABLE IF NOT EXISTS common_consent (
    a text NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
    b text NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
    PRIMARY KEY (a, b)
);

CREATE TABLE IF NOT EXISTS reach_outs (
    id         text NOT NULL PRIMARY KEY,
    sender     text NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
    receiver   text NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
    kind       text NOT NULL CHECK (kind IN ('support', 'celebrate')),
    phrase     text NOT NULL,
    reached_on date NOT NULL,
    UNIQUE (sender, receiver, kind, reached_on)
);

CREATE INDEX IF NOT EXISTS reach_outs_receiver ON reach_outs (receiver, reached_on);
