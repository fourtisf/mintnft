-- ══════════════════════════════════════════════════════════════
--  Proof — database schema
--  PostgreSQL 15+ (TimescaleDB optional, see candles_1m)
--
--  Design note: a call always belongs to a caller. The house desk is
--  just caller #1. This is what lets the product run as a single desk
--  today and as a multi-caller referee later with zero migration.
-- ══════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─────────── enums ───────────

CREATE TYPE caller_kind  AS ENUM ('house', 'external');
CREATE TYPE call_state   AS ENUM ('live', 'settled');
CREATE TYPE verdict      AS ENUM ('open', 'win', 'miss');
CREATE TYPE chain_id     AS ENUM ('sol', 'base', 'bsc', 'eth');
CREATE TYPE key_tier     AS ENUM ('t1', 't2', 't3');

-- ─────────── callers ───────────

CREATE TABLE callers (
  id            bigserial PRIMARY KEY,
  handle        text NOT NULL UNIQUE,           -- 'desk', 'nightbell'
  display_name  text NOT NULL,
  kind          caller_kind NOT NULL DEFAULT 'external',
  twitter       text,
  telegram      text,
  -- where we ingest their calls from; null for the house desk
  ingest_source text,                           -- 'telegram:-1001234', 'x:12345'
  active        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN callers.ingest_source IS
  'Where the watcher listens. Changing this never rewrites history.';

-- ─────────── tokens ───────────

CREATE TABLE tokens (
  chain        chain_id NOT NULL,
  address      text     NOT NULL,
  symbol       text,
  name         text,
  decimals     smallint,
  image_url    text,
  launchpad    text,                            -- 'pump.fun', 'clanker', 'four.meme'
  total_supply numeric(40,0),                   -- refreshed; entry copy is frozen on the call
  first_seen   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (chain, address)
);

-- ─────────── calls (append-only) ───────────

CREATE TABLE calls (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq           bigserial UNIQUE NOT NULL,      -- position in the integrity chain
  caller_id     bigint NOT NULL REFERENCES callers(id),
  chain         chain_id NOT NULL,
  token_address text NOT NULL,

  -- entry is frozen at insert and never updated. this is the whole product.
  fired_at      timestamptz(6) NOT NULL,
  entry_price   numeric(40,18) NOT NULL,
  entry_supply  numeric(40,0)  NOT NULL,
  entry_mc      numeric(40,4)  NOT NULL,

  source_kind   text NOT NULL,                  -- 'telegram' | 'x' | 'manual' | 'api'
  source_ref    text,                           -- message id / tweet id
  proof_tx_hash text,                           -- desk's own entry tx, if any
  note          text,

  -- integrity
  record_hash   bytea NOT NULL,                 -- sha256(canonical json of the above)
  chain_hash    bytea NOT NULL,                 -- sha256(prev.chain_hash || record_hash)

  created_at    timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (chain, token_address) REFERENCES tokens(chain, address)
);

-- one caller cannot fire the same token twice inside 10 minutes
CREATE UNIQUE INDEX calls_dedupe
  ON calls (caller_id, chain, token_address, date_trunc('hour', fired_at),
            (extract(minute from fired_at)::int / 10));

CREATE INDEX calls_fired_at   ON calls (fired_at DESC);
CREATE INDEX calls_caller     ON calls (caller_id, fired_at DESC);
CREATE INDEX calls_token      ON calls (chain, token_address, fired_at DESC);

-- Hard guarantee: rows can be inserted, never changed or removed.
CREATE RULE calls_no_update AS ON UPDATE TO calls DO INSTEAD NOTHING;
CREATE RULE calls_no_delete AS ON DELETE TO calls DO INSTEAD NOTHING;

-- ─────────── marks (the mutable scoreboard, 1:1 with calls) ───────────

CREATE TABLE call_marks (
  call_id        uuid PRIMARY KEY REFERENCES calls(id),

  peak_mc        numeric(40,4) NOT NULL,
  peak_at        timestamptz(6) NOT NULL,
  peak_x         numeric(12,4)  NOT NULL,

  now_mc         numeric(40,4) NOT NULL,
  now_x          numeric(12,4) NOT NULL,

  first_2x_at    timestamptz(6),                -- null if never reached, or if backfilled
  seconds_to_2x  integer,
  observed_live  boolean NOT NULL DEFAULT true, -- false disables the "2x in" display

  state          call_state NOT NULL DEFAULT 'live',
  verdict        verdict    NOT NULL DEFAULT 'open',
  is_dead        boolean    NOT NULL DEFAULT false,  -- orthogonal: a win can be dead
  dead_at        timestamptz,
  settled_at     timestamptz,

  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX marks_verdict ON call_marks (verdict, state);
CREATE INDEX marks_peak    ON call_marks (peak_x DESC);

COMMENT ON COLUMN call_marks.is_dead IS
  'Separate from verdict on purpose. A call can be stamped a win and go dead
   later; the register shows both marks, never replaces one with the other.';

-- ─────────── price history ───────────
-- Peak is computed from 1-minute candle highs, not from whatever the poller
-- happened to catch. That makes it deterministic and reproducible by anyone.

CREATE TABLE candles_1m (
  chain    chain_id NOT NULL,
  address  text     NOT NULL,
  minute   timestamptz NOT NULL,
  high     numeric(40,18) NOT NULL,
  low      numeric(40,18) NOT NULL,
  close    numeric(40,18) NOT NULL,
  supply   numeric(40,0)  NOT NULL,
  source   text NOT NULL,
  PRIMARY KEY (chain, address, minute)
);
CREATE INDEX candles_lookup ON candles_1m (chain, address, minute DESC);
-- SELECT create_hypertable('candles_1m','minute');   -- if using TimescaleDB

-- spot ticks drive the live UI only; they never decide a verdict
CREATE TABLE spot_ticks (
  chain   chain_id NOT NULL,
  address text NOT NULL,
  ts      timestamptz(6) NOT NULL,
  price   numeric(40,18) NOT NULL,
  supply  numeric(40,0) NOT NULL,
  PRIMARY KEY (chain, address, ts)
);

-- ─────────── integrity anchoring ───────────

CREATE TABLE anchors (
  id          bigserial PRIMARY KEY,
  seq_from    bigint NOT NULL,
  seq_to      bigint NOT NULL,
  chain_head  bytea  NOT NULL,      -- chain_hash of calls.seq = seq_to
  merkle_root bytea  NOT NULL,
  network     text   NOT NULL,      -- 'base'
  tx_hash     text   NOT NULL,
  anchored_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX anchors_range ON anchors (seq_to DESC);

-- ─────────── keys (mirrored from chain, never authoritative) ───────────

CREATE TABLE keys (
  token_id   integer PRIMARY KEY,
  owner      text NOT NULL,
  tier       key_tier,               -- null until the season seed is revealed
  minted_at  timestamptz,
  synced_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX keys_owner ON keys (lower(owner));

-- ─────────── sessions ───────────

CREATE TABLE auth_nonces (
  nonce      text PRIMARY KEY,
  address    text,
  issued_at  timestamptz NOT NULL DEFAULT now(),
  used       boolean NOT NULL DEFAULT false
);
CREATE INDEX nonces_gc ON auth_nonces (issued_at);

-- ══════════════════════════════════════════════════════════════
--  Views — every published number comes from here, nowhere else
-- ══════════════════════════════════════════════════════════════

CREATE VIEW register AS
SELECT
  c.id, c.seq, c.fired_at, c.chain, c.token_address,
  c.entry_mc, c.proof_tx_hash,
  t.symbol, t.name, t.image_url, t.launchpad,
  cl.handle AS caller, cl.display_name AS caller_name, cl.kind AS caller_kind,
  m.peak_mc, m.peak_x, m.now_mc, m.now_x,
  m.verdict, m.is_dead, m.state,
  CASE WHEN m.observed_live THEN m.seconds_to_2x END AS seconds_to_2x,
  encode(c.record_hash, 'hex') AS record_hash
FROM calls c
JOIN call_marks m ON m.call_id = c.id
JOIN callers   cl ON cl.id = c.caller_id
JOIN tokens     t ON t.chain = c.chain AND t.address = c.token_address;

-- Hit rate never drops the failures. Misses and dead calls stay in the
-- denominator; that is the only reason the number means anything.
CREATE VIEW caller_stats AS
SELECT
  cl.id, cl.handle, cl.display_name, cl.kind,
  count(*)                                        AS calls,
  count(*) FILTER (WHERE m.verdict = 'win')       AS wins,
  count(*) FILTER (WHERE m.is_dead)               AS dead,
  round(count(*) FILTER (WHERE m.verdict='win')::numeric
        / nullif(count(*),0), 4)                  AS hit_rate,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY m.peak_x) AS median_peak_x,
  max(m.peak_x)                                   AS best_peak_x,
  avg(m.peak_x)                                   AS avg_peak_x
FROM callers cl
JOIN calls c       ON c.caller_id = cl.id
JOIN call_marks m  ON m.call_id = c.id
WHERE c.fired_at > now() - interval '30 days'
GROUP BY cl.id;

CREATE VIEW chain_stats AS
SELECT
  c.chain,
  count(*) AS calls,
  round(count(*) FILTER (WHERE m.verdict='win')::numeric
        / nullif(count(*),0), 4) AS hit_rate,
  avg(m.peak_x) AS avg_peak_x
FROM calls c
JOIN call_marks m ON m.call_id = c.id
WHERE c.fired_at > now() - interval '7 days'
GROUP BY c.chain;
