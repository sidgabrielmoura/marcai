-- Legacy tokens remain stored but cannot receive pushes until re-registered.
ALTER TABLE user_device_tokens ADD COLUMN IF NOT EXISTS session_id uuid;
CREATE INDEX IF NOT EXISTS user_device_tokens_session_id_idx ON user_device_tokens(session_id);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='user_device_tokens_session_id_fkey') THEN
    ALTER TABLE user_device_tokens ADD CONSTRAINT user_device_tokens_session_id_fkey
      FOREIGN KEY (session_id) REFERENCES web_auth_sessions(id) ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
