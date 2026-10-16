CREATE TABLE web_auth_sessions (
 id uuid PRIMARY KEY, user_id text NOT NULL, member_id text NOT NULL,
 organization_id text NOT NULL, credential_version text NOT NULL,
 expires_at timestamptz NOT NULL, revoked_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX web_auth_sessions_expiry_idx ON web_auth_sessions(expires_at);
CREATE INDEX web_auth_sessions_user_idx ON web_auth_sessions(user_id);
CREATE TABLE web_login_challenges (
 id uuid PRIMARY KEY, user_id text NOT NULL, expires_at timestamptz NOT NULL,
 consumed_at timestamptz, failures integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX web_login_challenges_expiry_idx ON web_login_challenges(expires_at);
CREATE TABLE web_qr_bindings (
 token text PRIMARY KEY, initiator_hash text NOT NULL, expires_at timestamptz NOT NULL
);
CREATE INDEX web_qr_bindings_expiry_idx ON web_qr_bindings(expires_at);
CREATE TABLE web_passkey_challenges (
 challenge text PRIMARY KEY, user_id text, kind text NOT NULL,
 expires_at timestamptz NOT NULL, consumed_at timestamptz
);
CREATE INDEX web_passkey_challenges_expiry_idx ON web_passkey_challenges(expires_at);
