# AGENTS.md - djemini Developer Guide

> Comprehensive documentation for AI agents and developers working on djemini.

## Table of Contents
- [Project Overview](#project-overview)
- [Quick Start](#quick-start)
- [Project Structure](#project-structure)
- [Build & Test Commands](#build--test-commands)
- [Code Style Guidelines](#code-style-guidelines)
- [Architecture & Design](#architecture--design)
- [Database Schema](#database-schema)
- [Key Workflows](#key-workflows)
- [Security Considerations](#security-considerations)
- [Common Patterns](#common-patterns)
- [Git Guidelines](#git-guidelines)
- [Troubleshooting](#troubleshooting)


## Project Overview

CLI tool that organizes YouTube Music libraries using AI. Fetches songs, categorizes them by mood/genre/energy via Gemini AI, and creates organized playlists.

**Tech Stack:**
- **Runtime:** Bun (latest)
- **AI:** Google Gemini 2.5 Flash
- **APIs:** YouTube Data API v3
- **UI:** Terminal CLI with `inquirer`

**Core Features:**
- Authenticate with YouTube Music
- Discover and sync playlists
- AI-powered song categorization (mood/genre/energy)
- Generate logical playlists with AI
- Push playlists to YouTube Music
- Quota-aware API usage


## Quick Start

**Prerequisites:** [Bun](https://bun.sh) installed

```bash
bun install
cp .env.example .env
# Configure .env with API keys (see README.md)
bun start
```

**First Run:**
```
auth → sources discover → sync → analyze → create → push
```


## Project Structure

```
djemini/
├── src/
│   ├── api/
│   │   └── youtube.ts        # YouTube OAuth & API wrapper
│   ├── cli/
│   │   ├── auth.ts           # Authentication flow
│   │   ├── sources.ts        # Playlist management
│   │   ├── analyze.ts        # AI categorization (batched)
│   │   ├── create.ts         # Playlist generation
│   │   └── push.ts           # Push to YouTube
│   ├── db/
│   │   ├── schema.ts         # Table definitions
│   │   └── index.ts          # Database operations
│   ├── services/
│   │   ├── sync.ts           # Fetch YouTube videos
│   │   └── gemini.ts         # AI categorization
│   ├── types/
│   │   └── index.ts          # Shared types only
│   ├── utils/
│   │   ├── logger.ts         # Console output
│   │   ├── paths.ts          # Data paths
│   │   ├── constants.ts      # OAuth & API constants
│   │   └── check-runtime.ts  # Bun validation
│   └── index.ts              # CLI entry point
├── data/                     # User data (gitignored)
│   ├── djemini.db            # SQLite database
│   └── token.json            # OAuth token
├── .env                      # Environment variables (gitignored)
├── .prettierrc               # Formatting config
├── package.json
├── tsconfig.json
├── AGENTS.md                 # This file
└── README.md
```


## Build & Test Commands

```bash
bun start              # Run CLI
bun run format         # Format code
bunx tsc --noEmit      # Type check
```

**Pre-commit:** Format → Type check → Manual test → Verify no .env or data/ staged


## Code Style Guidelines

**Prettier:** 2 spaces, single quotes, 100 char line length, semicolons, ES5 trailing commas

**TypeScript:**
```typescript
// Direct imports (not namespace imports)
import { getDatabase } from '../db';

// Type everything explicitly
function processData(input: string): number { }

// const for immutables, avoid var
const API_URL = 'https://api.example.com';
```

**Naming:**
- Files: lowercase (`gemini.ts`, `youtube.ts`)
- Folders: lowercase (`cli/`, `services/`)
- Types: PascalCase (`Song`, `PlaylistSuggestion`)
- Functions: camelCase (`authenticateYouTube`)

**Long Strings:**
```typescript
// Use array.join() for multi-line prompts (Prettier can format arrays)
const prompt = [
  'Line 1',
  'Line 2',
  `Dynamic: ${variable}`,
].join('\n');
```

**Type Organization:**
- **Public types** (used in 2+ files) → `src/types/index.ts`
- **Private types** (used in 1 file) → Co-locate in same file

**Error Handling:**
```typescript
try {
  await apiCall();
} catch (error: any) {
  if (error.message?.includes('quota')) {
    logger.error('API quota exceeded');
    return;
  }
  throw error;
}
```


## Architecture & Design

**Type Organization (Co-location Principle):**
- **Public types** (used in 2+ files) → `src/types/index.ts`: Database models, extended models, common enums
- **Private types** (used in 1 file) → Co-locate in same file

**Key Decisions:**

**Bun:** Native SQLite, fast TypeScript execution, simpler than Node.js

**Gemini 2.5 Flash:** Cost-effective batch processing, good JSON output

**SQLite:** Local-first, fast for <100k songs, single file backup

**Artist Extraction:** Primary from `videos.list` API, fallback from title parsing, cleanup " - Topic" suffix

**Quota Management:** Batch AI requests (20 songs/request), skip processed songs, graceful error handling
4. Stop immediately on quota errors


## Database Schema

See `src/db/schema.ts` for complete table definitions and indexes.


## Key Workflows

**1. Authentication**
```
auth → Generate OAuth URL → Open browser → User authorizes → 
Callback with code → Exchange for tokens → Save to data/token.json → 
Fetch channel info → Display logged-in user
```

**2. Sync**
```
sources discover → Fetch YouTube playlists → Show checkbox → User selects → Save to DB
sync → For each source: Fetch videos (batch 50) → Parse artist from title → 
Filter non-music → Save songs → Mark synced
```

**3. Analysis**
```
analyze → Get unprocessed songs → Batch into groups of 20 → 
For each: Send to Gemini → Parse JSON response → Save categories → 
Mark processed
```

**4. Playlist Creation**
```
create → Get categorized songs → Build category breakdown → 
Send to Gemini for suggestions → AI returns 5-10 playlist ideas → 
Match songs using filters → Save to playlists & playlist_songs tables
```

**5. Push to YouTube**
```
push → Get local playlists → For each without youtube_playlist_id:
Create playlist on YouTube → Add songs (expensive!) → Save ID
If exists: Skip (user must run playlists clear to update)
```


## Security Considerations

**Sensitive Files (NEVER COMMIT):**
- `.env` - API keys & secrets
- `data/djemini.db` - User's music library
- `data/token.json` - OAuth tokens

**API Keys:**
- Store in `.env` only (never hardcode)
- Use `.env.example` as template
- Rotate if accidentally committed

**OAuth Tokens:**
- Stored in `data/token.json`
- Contains refresh token (long-lived)
- Delete file to force re-authentication

**Rate Limiting:**
- YouTube API: 10,000 units/day
- Gemini: Tier-based limits
- Handle quota errors gracefully

### OAuth Token Security
- Tokens stored in `data/token.json` (gitignored)
- Contains access token (short-lived) and refresh token (long-lived)
- If compromised: User should revoke via Google Account settings
- Auto-refresh handled by googleapis library

### User Data Privacy
- Database contains user's music preferences (sensitive)
- All data stored locally (never sent to external servers except YouTube/Gemini APIs)
- Users should backup `data/` directory themselves

### Rate Limiting
- YouTube API: Respect 10,000 units/day quota
- Gemini API: No hard limit but monitor costs
- Implement delays between batch requests (avoid rate limit bans)


## Common Patterns

**Database Transactions:**
```typescript
const insertMany = this.db.transaction((items) => {
  for (const item of items) {
    stmt.run(item.id, item.title, item.artist);
  }
});
insertMany(songs);
```

**Inquirer with Raw Mode:**
```typescript
// Pause keypress handler before inquirer
(global as any).pauseKeypress?.();
if (process.stdin.isTTY) process.stdin.setRawMode(false);

await inquirer.prompt([/* ... */]);

// Resume after
process.stdin.resume();
if (process.stdin.isTTY) process.stdin.setRawMode(true);
(global as any).resumeKeypress?.();
```

**Error Handling:**
```typescript
try {
  await youtube.playlistItems.insert(/* ... */);
} catch (error: any) {
  if (error.message?.includes('quota') || error.code === 403) {
    logger.error('YouTube API quota exceeded');
    return;
  }
  logger.error(`Failed: ${error.message}`);
}
```

**Logging:**
```typescript
logger.info('Starting sync...');     // Normal ops
logger.success('Sync complete');     // Success
logger.warn('Quota warning');        // Warnings
logger.error('Failed');              // Errors
logger.dim('Hint: run status');      // Instructions
```


## Git Guidelines

**Commit Messages (Conventional Commits):**
```
feat: add playlist export command
fix: handle unavailable videos in sync
refactor: consolidate type definitions
docs: update AGENTS.md
chore: update dependencies
```

Types: `feat`, `fix`, `refactor`, `docs`, `chore`, `test`

**Branch Strategy:**
- `main` - Stable, production-ready
- `feature/*` - New features
- `fix/*` - Bug fixes
- `refactor/*` - Code improvements

**Pre-commit:**
```bash
bun run format             # Format
bunx tsc --noEmit          # Type check
bun start                  # Test manually
git status                 # Verify no .env or data/
```


## Troubleshooting

**"Not authenticated"** → Run `auth` command

**"YouTube API quota exceeded"** → Wait 24 hours or [request increase](https://console.cloud.google.com/apis/api/youtube.googleapis.com/quotas)

**"Gemini API error"** → Verify `.env` has `GEMINI_API_KEY`

**Database errors** → Run `reset` command

**Keyboard unresponsive** → Restart app


## Additional Resources

- [Bun Docs](https://bun.sh/docs)
- [YouTube Data API](https://developers.google.com/youtube/v3)
- [Gemini AI](https://ai.google.dev/docs)

**API Setup:** See README.md


**Last Updated:** 2026-02-07
