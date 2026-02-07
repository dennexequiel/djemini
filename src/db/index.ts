import { Database } from 'bun:sqlite';
import { AppPaths } from '../utils/paths';
import { SCHEMA } from './schema';
import type { Song, Category, Playlist, Source, SourceWithStats } from '../types';
import { logger } from '../utils/logger';

export class DatabaseService {
  private db: Database;

  constructor() {
    const dbPath = AppPaths.getDbPath();
    this.db = new Database(dbPath);
    this.db.exec('PRAGMA journal_mode = WAL');
    this.initialize();
  }

  private initialize(): void {
    try {
      this.db.exec(SCHEMA);
      logger.dim('Database initialized');
    } catch (error: any) {
      logger.error(`Failed to initialize database: ${error.message}`);
      throw error;
    }
  }

  // ========== SOURCE OPERATIONS ==========

  insertSource(source: Omit<Source, 'id' | 'created_at' | 'last_synced'>): number {
    const stmt = this.db.prepare(`
      INSERT INTO sources (type, name, youtube_id)
      VALUES (?, ?, ?)
    `);
    const result = stmt.run(source.type, source.name, source.youtube_id);
    return result.lastInsertRowid as number;
  }

  getSourceById(id: number): Source | null {
    const stmt = this.db.prepare('SELECT * FROM sources WHERE id = ?');
    return stmt.get(id) as Source | null;
  }

  getAllSources(): SourceWithStats[] {
    const stmt = this.db.prepare(`
      SELECT s.*, COUNT(DISTINCT so.id) as song_count
      FROM sources s
      LEFT JOIN songs so ON s.id = so.source_id
      GROUP BY s.id
      ORDER BY s.created_at DESC
    `);
    return stmt.all() as SourceWithStats[];
  }

  getSourceByYoutubeId(youtubeId: string): Source | null {
    const stmt = this.db.prepare('SELECT * FROM sources WHERE youtube_id = ?');
    return stmt.get(youtubeId) as Source | null;
  }

  deleteSource(id: number): void {
    const stmt = this.db.prepare('DELETE FROM sources WHERE id = ?');
    stmt.run(id);
  }

  updateSourceSyncTime(id: number): void {
    const stmt = this.db.prepare('UPDATE sources SET last_synced = CURRENT_TIMESTAMP WHERE id = ?');
    stmt.run(id);
  }

  // ========== SONG OPERATIONS ==========

  insertSong(song: Omit<Song, 'added_at' | 'ai_processed'>): void {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO songs (id, title, artist, source_id)
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(song.id, song.title, song.artist, song.source_id);
  }

  insertSongs(songs: Omit<Song, 'added_at' | 'ai_processed'>[]): void {
    const insert = this.db.prepare(`
      INSERT OR IGNORE INTO songs (id, title, artist, source_id)
      VALUES (?, ?, ?, ?)
    `);

    const insertMany = this.db.transaction(songs => {
      for (const song of songs) {
        insert.run(song.id, song.title, song.artist, song.source_id);
      }
    });

    insertMany(songs);
  }

  getSongById(id: string): Song | null {
    const stmt = this.db.prepare('SELECT * FROM songs WHERE id = ?');
    return stmt.get(id) as Song | null;
  }

  getAllSongs(): Song[] {
    const stmt = this.db.prepare('SELECT * FROM songs ORDER BY added_at DESC');
    return stmt.all() as Song[];
  }

  getUnprocessedSongs(limit?: number): Song[] {
    const query = limit
      ? 'SELECT * FROM songs WHERE ai_processed = 0 LIMIT ?'
      : 'SELECT * FROM songs WHERE ai_processed = 0';

    const stmt = this.db.prepare(query);
    return (limit ? stmt.all(limit) : stmt.all()) as Song[];
  }

  markSongAsProcessed(id: string): void {
    const stmt = this.db.prepare('UPDATE songs SET ai_processed = 1 WHERE id = ?');
    stmt.run(id);
  }

  getSongCount(): number {
    const result = this.db.prepare('SELECT COUNT(*) as count FROM songs').get() as {
      count: number;
    };
    return result.count;
  }

  getProcessedSongCount(): number {
    const result = this.db
      .prepare('SELECT COUNT(*) as count FROM songs WHERE ai_processed = 1')
      .get() as { count: number };
    return result.count;
  }

  // ========== CATEGORY OPERATIONS ==========

  insertCategory(category: Omit<Category, 'id' | 'created_at'>): void {
    const stmt = this.db.prepare(`
      INSERT INTO categories (song_id, type, value, confidence)
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(category.song_id, category.type, category.value, category.confidence);
  }

  insertCategories(categories: Omit<Category, 'id' | 'created_at'>[]): void {
    const insert = this.db.prepare(`
      INSERT INTO categories (song_id, type, value, confidence)
      VALUES (?, ?, ?, ?)
    `);

    const insertMany = this.db.transaction(categories => {
      for (const cat of categories) {
        insert.run(cat.song_id, cat.type, cat.value, cat.confidence);
      }
    });

    insertMany(categories);
  }

  getCategoriesBySongId(songId: string): Category[] {
    const stmt = this.db.prepare('SELECT * FROM categories WHERE song_id = ?');
    return stmt.all(songId) as Category[];
  }

  getSongsByCategory(type: string, value: string): Song[] {
    const stmt = this.db.prepare(`
      SELECT DISTINCT s.* FROM songs s
      JOIN categories c ON s.id = c.song_id
      WHERE c.type = ? AND c.value = ?
      ORDER BY s.added_at DESC
    `);
    return stmt.all(type, value) as Song[];
  }

  getAllCategoriesByType(type: string): { value: string; count: number }[] {
    const stmt = this.db.prepare(`
      SELECT value, COUNT(*) as count
      FROM categories
      WHERE type = ?
      GROUP BY value
      ORDER BY count DESC
    `);
    return stmt.all(type) as { value: string; count: number }[];
  }

  // ========== PLAYLIST OPERATIONS ==========

  insertPlaylist(playlist: Omit<Playlist, 'created_at' | 'updated_at'>): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO playlists (id, name, youtube_playlist_id, category_type, category_value)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(
      playlist.id,
      playlist.name,
      playlist.youtube_playlist_id,
      playlist.category_type,
      playlist.category_value
    );
  }

  getPlaylistById(id: string): Playlist | null {
    const stmt = this.db.prepare('SELECT * FROM playlists WHERE id = ?');
    return stmt.get(id) as Playlist | null;
  }

  getPlaylistByName(name: string): Playlist | null {
    const stmt = this.db.prepare('SELECT * FROM playlists WHERE name = ?');
    return stmt.get(name) as Playlist | null;
  }

  getAllPlaylists(): Playlist[] {
    const stmt = this.db.prepare('SELECT * FROM playlists ORDER BY created_at DESC');
    return stmt.all() as Playlist[];
  }

  updatePlaylistYouTubeId(id: string, youtubePlaylistId: string): void {
    const stmt = this.db.prepare(`
      UPDATE playlists 
      SET youtube_playlist_id = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    stmt.run(youtubePlaylistId, id);
  }

  addSongToPlaylist(playlistId: string, songId: string): void {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO playlist_songs (playlist_id, song_id)
      VALUES (?, ?)
    `);
    stmt.run(playlistId, songId);
  }

  getPlaylistSongs(playlistId: string): Song[] {
    const stmt = this.db.prepare(`
      SELECT s.* FROM songs s
      JOIN playlist_songs ps ON s.id = ps.song_id
      WHERE ps.playlist_id = ?
      ORDER BY ps.added_at DESC
    `);
    return stmt.all(playlistId) as Song[];
  }

  getPlaylistCount(): number {
    const result = this.db.prepare('SELECT COUNT(*) as count FROM playlists').get() as {
      count: number;
    };
    return result.count;
  }

  clearPlaylistSongs(playlistId: string): void {
    const stmt = this.db.prepare('DELETE FROM playlist_songs WHERE playlist_id = ?');
    stmt.run(playlistId);
  }

  // ========== UTILITY ==========

  close(): void {
    this.db.close();
  }

  resetData(): void {
    // Delete all songs, categories, playlists, and playlist_songs but keep sources
    this.db.exec('DELETE FROM playlist_songs');
    this.db.exec('DELETE FROM categories');
    this.db.exec('DELETE FROM playlists');
    this.db.exec('DELETE FROM songs');
    // Reset last_synced for all sources
    this.db.exec('UPDATE sources SET last_synced = NULL');
  }

  clearPlaylists(): void {
    // Only delete playlists and their songs, keep everything else
    this.db.exec('DELETE FROM playlist_songs');
    this.db.exec('DELETE FROM playlists');
  }
}

// Singleton instance
let dbInstance: DatabaseService | null = null;

export function getDatabase(): DatabaseService {
  if (!dbInstance) {
    dbInstance = new DatabaseService();
  }
  return dbInstance;
}
