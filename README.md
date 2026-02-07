# 🎧 djemini

> AI-powered YouTube Music organizer. Stop scrolling through thousands of unsorted songs.

Automatically categorizes your YouTube Music library by mood, genre, and energy, then creates smart playlists like "Workout," "Study," "Late Night," and pushes them back to YouTube Music.

All local. No cloud database. Your data stays on your machine.

---

## Quick Start

### Prerequisites

- **Bun** - JavaScript runtime ([install here](https://bun.sh))
- **Google Cloud account** - Free tier is sufficient
- **Gemini API key** - Free for basic usage

### Installation

1. **Clone and install dependencies:**
   ```bash
   git clone <your-repo-url>
   cd djemini
   bun install
   ```

2. **Set up environment variables:**
   ```bash
   cp .env.example .env
   ```

### Configuration

#### 1. Get Google OAuth Credentials

For YouTube API access:

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project (or select existing one)
3. Enable **YouTube Data API v3**
   - Navigate to "APIs & Services" → "Library"
   - Search for "YouTube Data API v3"
   - Click "Enable"
4. Create OAuth 2.0 credentials
   - Go to "APIs & Services" → "Credentials"
   - Click "Create Credentials" → "OAuth 2.0 Client ID"
   - Choose "Desktop app" as application type
   - Set authorized redirect URI: `http://localhost:3000/oauth2callback`
5. Copy your **Client ID** and **Client Secret**

#### 2. Get Gemini API Key

For AI categorization:

1. Visit [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Click "Create API Key"
3. Copy the generated key

#### 3. Update Your `.env` File

Open `.env` and add your credentials:

```env
GOOGLE_CLIENT_ID=your_client_id_here
GOOGLE_CLIENT_SECRET=your_client_secret_here
GOOGLE_REDIRECT_URI=http://localhost:3000/oauth2callback
GEMINI_API_KEY=your_gemini_api_key_here
```

### Run

```bash
bun start
```

Follow the interactive prompts to authenticate and start organizing your music.

---

## How It Works

```bash
bun start
```

Five commands to organize your entire library:

**1. Connect sources** → `sources discover` - Pick which playlists to organize  
**2. Sync songs** → `sync` - Download metadata, filter out podcasts  
**3. Analyze** → `analyze` - AI categorizes by mood/genre/energy  
**4. Create playlists** → `create` - AI suggests playlists based on categories  
**5. Push to YouTube** → `push` - Create/update playlists on YouTube Music

Each song gets categorized with confidence scores. AI suggests playlists like "Workout," "Late Night," "Study" based on your library.

---

## Commands

| Command | Description |
|---------|-------------|
| `auth` | Switch YouTube Music accounts |
| `sources` / `sources list` | View tracked playlists |
| `sources discover` | Find and add your playlists |
| `sources add <url>` | Add public playlist by URL |
| `sources remove <id>` | Remove source |
| `sync` | Sync all songs |
| `sync --source=<id>` | Sync specific source |
| `analyze` | Full AI categorization |
| `analyze --type=mood\|genre\|energy` | Analyze specific type |
| `create` | Generate playlist suggestions |
| `push` | Push playlists to YouTube |
| `playlists` / `playlists list` | View local playlists |
| `playlists clear` | Delete all playlists |
| `status` | Library stats |
| `reset` | Clear all data |
| `info` | Show data paths |
| `clear` | Clear screen |
| `exit` | Exit CLI |

---

## Features

- **Smart AI categorization** - Mood, genre, energy with confidence scores
- **Token-efficient** - Batches 20 songs per API request
- **Music-only filtering** - Skips podcasts and audiobooks
- **Local SQLite database** - No cloud, all data on your machine
- **Multi-source support** - Liked songs + multiple playlists
- **No buzzwords** - Simple playlist names ("Workout," "Study," "Chill")
- **Fast sync** - Only fetches new songs after initial sync

---

## Data Storage

Everything in `data/` folder (gitignored):
- `djemini.db` - SQLite database (sources, songs, categories, playlists)
- `token.json` - YouTube OAuth token

**Tables:** sources, songs, categories, playlists, playlist_songs

---

## Project Structure

```
djemini/
├── src/
│   ├── api/          # YouTube API client
│   ├── cli/          # Commands (auth, sync, analyze, create, push)
│   ├── db/           # SQLite operations
│   ├── services/     # AI & sync logic
│   ├── types/        # TypeScript types
│   └── utils/        # Helpers
├── data/             # Database & tokens (gitignored)
├── AGENTS.md         # Dev documentation
└── .env              # API keys (gitignored)
```

---

## Development

```bash
bun start                   # Run app
bunx tsc --noEmit           # Type check
bun run format              # Format code
bun run format:check        # Check formatting
```

See [`AGENTS.md`](./AGENTS.md) for architecture, database schema, and code guidelines.

---

## Troubleshooting

**"Exceeded your quota"** - YouTube API free tier: 10,000 units/day. Sync uses ~1 unit/song, playlists use 50-100 each. Wait 24hrs or request increase.

**"Auth token expired"** - Delete `data/token.json`, run `auth` to re-authenticate.

**Songs missing** - Non-music content (podcasts, live streams) is auto-filtered.

**Weird AI results** - Confidence <0.7 are guesses. Re-run `analyze` or check song titles.

**Clear playlists** - Run `playlists clear` or use SQL: `DELETE FROM playlists; DELETE FROM playlist_songs;`

---

## Tips

- Test with small playlists (50-100 songs) first
- Run `status` to check library stats
- Use `playlists` to preview before pushing to YouTube
- Don't like suggestions? Run `create` again for new ones

---

## Contributing

PRs welcome! Read `AGENTS.md`, run `bun run format`, ensure `bunx tsc --noEmit` passes.

---

## License

MIT

---

## Credits

- [Bun](https://bun.sh) - JavaScript runtime with SQLite
- [Google Gemini](https://ai.google.dev) - AI categorization
- [YouTube Data API](https://developers.google.com/youtube/v3) - Playlist management
- [Inquirer](https://github.com/SBoudrias/Inquirer.js) - CLI prompts
- [Chalk](https://github.com/chalk/chalk) - Terminal colors

---

Made by someone tired of scrolling through 2,000+ unsorted songs.
