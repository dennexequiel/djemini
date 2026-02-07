export const OAUTH_CONFIG = {
  PORT: 3000,
  TIMEOUT_MS: 120000, // 2 minutes
  SCOPES: [
    'https://www.googleapis.com/auth/youtube.readonly',
    'https://www.googleapis.com/auth/youtube',
  ],
};

export const PATHS = {
  DATA_DIR: 'data',
  TOKEN_FILE: 'token.json',
  DB_FILE: 'library.db',
} as const;
