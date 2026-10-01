CREATE TABLE IF NOT EXISTS jackpot_rooms (
  code TEXT PRIMARY KEY,
  room_state JSONB NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS jackpot_rooms_updated_at_idx
  ON jackpot_rooms (updated_at);
