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
-- Dexscreener's chain ids verbatim, not our own shorthand. `chain` is a hashed
-- field: 'solana' is what went into every record hash, so 'sol' in the database
-- would mean the stored row and the hash beside it describe different chains,
-- and an export read straight from here could not be recomputed by anyone.
CREATE TYPE chain_id     AS ENUM ('solana', 'base', 'bsc', 'ethereum');
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
  -- Wide on purpose. These are values the application carries as doubles, and
  -- the record hash covers String(thatDouble) — so a column that cannot hold
  -- the double exactly produces a row that can never verify, on a table that
  -- cannot correct it. entry_mc at numeric(40,4) silently rounded
  -- 433527.17956647283 to 433527.1796 and did precisely that. A double prints
  -- at most 17 significant digits; 40 decimal places is room, and numeric is
  -- variable-length so the headroom costs nothing. PgStore re-reads and
  -- re-hashes every row before committing, so a value that still does not fit
  -- is refused at insert rather than discovered later.
  entry_price   numeric(80,40) NOT NULL,
  entry_supply  numeric(80,40) NOT NULL,
  entry_mc      numeric(80,40) NOT NULL,

  -- Everything else integrity.js freezes. These are not denormalised copies of
  -- tokens.symbol and friends — they are the values that went into record_hash,
  -- and they have to live on the append-only table or the chain cannot be
  -- recomputed from the database at all. tokens.symbol is refreshed; a provider
  -- renaming a token would otherwise invalidate every hash that ever covered it.
  hash_version    smallint NOT NULL DEFAULT 3,
  pair_address    text NOT NULL,
  symbol          text NOT NULL,
  entry_supply_source text NOT NULL,            -- 'marketCap' | 'fdv' | 'derived'
  liquidity_usd   numeric(80,40) NOT NULL,
  score           smallint NOT NULL,
  reason_ids      text[] NOT NULL,
  entry_volume_h1 numeric(80,40) NOT NULL DEFAULT 0,  -- hashed from version 3
  entry_volume_m5 numeric(80,40) NOT NULL DEFAULT 0,

  -- Published alongside the call but outside the hash: prose, links and the
  -- on-chain reading. Same footing as name and dex — descriptive, not frozen.
  name          text,
  dex           text,
  image_url     text,
  reasons       text[],
  links         jsonb,
  -- What the chain said when it fired, or null when nothing could be read.
  -- Null is published as "not checked" and never as clean; see chain.js.
  chain_checks  jsonb,

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

-- One caller cannot fire the same token twice in the same ten-minute slot.
-- Slots are fixed and aligned to the hour, not a rolling window: 10:09 and
-- 10:11 are two minutes apart and land in different slots. The real guard
-- against re-firing is cooldownHours in rules.js; this only stops a retry or
-- a double-delivered candidate becoming two rows on a record that cannot
-- delete either of them.
--
-- Binned in UTC because an index expression has to be IMMUTABLE, and
-- date_trunc over a timestamptz is only STABLE — it depends on the session's
-- TimeZone. Postgres rejects the index outright, which is how this file came
-- to be described as "runs as-is" without ever having run.
CREATE UNIQUE INDEX calls_dedupe
  ON calls (caller_id, chain, token_address,
            date_bin(interval '10 minutes', fired_at AT TIME ZONE 'UTC', timestamp '2000-01-01'));

CREATE INDEX calls_fired_at   ON calls (fired_at DESC);
CREATE INDEX calls_caller     ON calls (caller_id, fired_at DESC);
CREATE INDEX calls_token      ON calls (chain, token_address, fired_at DESC);

-- Hard guarantee: rows can be inserted, never changed or removed.
CREATE RULE calls_no_update AS ON UPDATE TO calls DO INSTEAD NOTHING;
CREATE RULE calls_no_delete AS ON DELETE TO calls DO INSTEAD NOTHING;

-- ─────────── marks (the mutable scoreboard, 1:1 with calls) ───────────

CREATE TABLE call_marks (
  call_id        uuid PRIMARY KEY REFERENCES calls(id),

  -- Same width as the call's own figures. Marks are not hashed, but each one is
  -- computed from the one before it, so a column that rounds makes the series
  -- drift away from what the engine actually observed.
  peak_mc        numeric(80,40) NOT NULL,
  peak_at        timestamptz(6) NOT NULL,
  peak_x         numeric(80,40) NOT NULL,

  -- Peak stops at settle so a verdict is reproducible; peak_all keeps moving.
  -- Both are recorded because a call that settled at 1.8x and later touched 4x
  -- is two true facts, and collapsing them into one loses the honest half.
  peak_all_mc    numeric(80,40),
  peak_all_x     numeric(80,40),
  peak_all_at    timestamptz(6),

  now_mc         numeric(80,40) NOT NULL,
  now_x          numeric(80,40) NOT NULL,

  -- Where the token says it lives. A property of the token now rather than of
  -- the call as it fired, so it rides on the mutable half and reaches calls
  -- written before we recorded any.
  links          jsonb,

  first_2x_at    timestamptz(6),                -- null if never reached, or if backfilled
  seconds_to_2x  integer,
  observed_live  boolean NOT NULL DEFAULT true, -- false disables the "2x in" display

  -- The trailing stop, walked forward by the poller over every observation it
  -- makes. It is recorded rather than recomputed because the published series
  -- is decimated at 96 samples and thinned to 24 again, and a stop re-walked
  -- over 24 points is a different number on the one figure a holder was
  -- alerted on. exit_at null with trail_high_x set means it has been watched
  -- and has not filled; both null means the call predates the rule, which is
  -- not the same answer and must not render as the same answer.
  trail_high_x   numeric(80,40),
  exit_x         numeric(80,40),
  exit_high_x    numeric(80,40),
  exit_at        timestamptz(6),
  exit_seconds   integer,
  exit_rule      text,

  state          call_state NOT NULL DEFAULT 'live',
  verdict        verdict    NOT NULL DEFAULT 'open',
  is_dead        boolean    NOT NULL DEFAULT false,  -- orthogonal: a win can be dead
  dead_at        timestamptz,
  settled_at     timestamptz,

  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX marks_verdict ON call_marks (verdict, state);
-- The alert fires on the transition, so the poller asks for the rows that have
-- not filled yet on every pass.
CREATE INDEX marks_open_exit ON call_marks (call_id) WHERE exit_at IS NULL;
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

-- Marks the poller actually saw, per call. Keyed on the call rather than the
-- token because the chart on a call page claims to plot that call's own
-- observations, and two calls on one token would otherwise share a series.
-- Decimated by the app at 96 points, so this stays small by construction.
CREATE TABLE call_samples (
  call_id uuid NOT NULL REFERENCES calls(id),
  ts      timestamptz(6) NOT NULL,
  mc      numeric(80,40) NOT NULL,
  PRIMARY KEY (call_id, ts)
);

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
  call_count  integer NOT NULL,
  network     text   NOT NULL DEFAULT 'base',
  -- Nullable, and that is the point: a publisher that fails still records the
  -- anchor it built, with no transaction on it, so the window stays visibly
  -- pending. An anchor row is not a published anchor — only a tx_hash is.
  tx_hash     text,
  built_at    timestamptz(6) NOT NULL,
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

-- The symbol here is the call's own frozen copy, not tokens.symbol. They are
-- usually equal and the difference is the entire point: the register publishes
-- what the token was called when we fired, which is what the hash covers.
CREATE VIEW register AS
SELECT
  c.id, c.seq, c.fired_at, c.chain, c.token_address, c.pair_address,
  c.entry_mc, c.entry_price, c.entry_supply, c.entry_supply_source,
  c.liquidity_usd, c.score, c.reason_ids, c.reasons, c.links, c.chain_checks,
  c.entry_volume_h1, c.entry_volume_m5, c.hash_version, c.proof_tx_hash,
  c.symbol, coalesce(c.name, t.name) AS name,
  coalesce(c.dex, t.launchpad) AS dex,
  coalesce(c.image_url, t.image_url) AS image_url, t.launchpad,
  cl.handle AS caller, cl.display_name AS caller_name, cl.kind AS caller_kind,
  m.peak_mc, m.peak_x, m.now_mc, m.now_x,
  m.verdict, m.is_dead, m.state,
  CASE WHEN m.observed_live THEN m.seconds_to_2x END AS seconds_to_2x,
  encode(c.record_hash, 'hex') AS record_hash,
  encode(c.chain_hash,  'hex') AS chain_hash
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


/* ═══════════════════ telegram subscribers ═══════════════════
   Operational state, not evidence. Nothing here is hashed, rows are edited and
   deleted freely, and that is exactly why it lives at the bottom of this file
   rather than beside calls — the append-only guarantee is about the register,
   and diluting where it applies is how it stops meaning anything.

   No tier column, deliberately. A key can be sold between the moment its holder
   links a chat and the moment a call fires; a stored tier would keep paying the
   seller and strand the buyer on the public leg. The tier is read from the
   chain at send time, every time. */
CREATE TABLE tg_subscribers (
  chat_id     bigint PRIMARY KEY,

  -- One address, one chat: linking again moves the binding rather than fanning
  -- one wallet's latency out across every chat that ever claimed it.
  address     text UNIQUE,
  linked_at   timestamptz,

  -- Chain, minimum score and market-cap ceiling, as the subscriber set them.
  filters     jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- False when the person blocked the bot. Kept rather than deleted so a
  -- re-/start is a reactivation and not a stranger.
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  seen_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX tg_active ON tg_subscribers (chat_id) WHERE active;

COMMENT ON COLUMN tg_subscribers.address IS
  'The wallet a chat proved it controls, via a code issued in the chat and a
   SIWE signature on the site. Neither half alone binds anything.';
