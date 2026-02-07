import { getDatabase } from '../db';
import { logger } from '../utils/logger';
import { GeminiService } from '../services/gemini';
import chalk from 'chalk';
import type { Song, Category } from '../types';

interface SongWithCategories extends Song {
  moods: string[];
  genres: string[];
  energy: string | null;
}

export async function handleCreateCommand(args: string[]): Promise<void> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    logger.error('GEMINI_API_KEY not found in .env');
    return;
  }

  const db = getDatabase();
  const gemini = new GeminiService(apiKey);

  // Get all processed songs with their categories
  const songs = db.getAllSongs().filter(s => s.ai_processed);

  if (songs.length === 0) {
    logger.log('');
    logger.warn('No analyzed songs found');
    logger.dim('Run "analyze" first to categorize your music');
    logger.log('');
    return;
  }

  logger.log('');
  logger.info(`Analyzing ${songs.length} songs to create logical playlists...`);
  logger.log('');

  // Build song data with categories
  const songsWithCategories: SongWithCategories[] = songs.map(song => {
    const categories = db.getCategoriesBySongId(song.id);
    return {
      ...song,
      moods: categories.filter(c => c.type === 'mood').map(c => c.value),
      genres: categories.filter(c => c.type === 'genre').map(c => c.value),
      energy: categories.find(c => c.type === 'energy')?.value || null,
    };
  });

  // Get category statistics for the prompt
  const allMoods = new Set<string>();
  const allGenres = new Set<string>();
  const energyLevels = new Map<string, number>();

  songsWithCategories.forEach(song => {
    song.moods.forEach(m => allMoods.add(m));
    song.genres.forEach(g => allGenres.add(g));
    if (song.energy) {
      energyLevels.set(song.energy, (energyLevels.get(song.energy) || 0) + 1);
    }
  });

  logger.dim('Library breakdown:');
  logger.dim(`  Moods: ${Array.from(allMoods).join(', ')}`);
  logger.dim(`  Genres: ${Array.from(allGenres).join(', ')}`);
  logger.dim(
    `  Energy: ${Array.from(energyLevels.entries())
      .map(([k, v]) => `${k}(${v})`)
      .join(', ')}`
  );
  logger.log('');

  // Ask Gemini to suggest playlist groupings
  try {
    logger.info('Asking AI for playlist suggestions...');
    const suggestions = await gemini.suggestPlaylists(
      Array.from(allMoods),
      Array.from(allGenres),
      Array.from(energyLevels.keys())
    );

    if (suggestions.length === 0) {
      logger.warn('AI could not suggest any playlists');
      return;
    }

    logger.log('');
    logger.success(`✓ AI suggested ${suggestions.length} playlists:`);
    logger.log('');

    // Create playlists
    for (const suggestion of suggestions) {
      logger.log(chalk.cyan(`📁 ${suggestion.name}`));
      logger.dim(`   ${suggestion.description}`);

      // Find matching songs
      const matchingSongs = songsWithCategories.filter(song => {
        const moodMatch =
          !suggestion.filters.mood || suggestion.filters.mood.some(m => song.moods.includes(m));
        const genreMatch =
          !suggestion.filters.genre || suggestion.filters.genre.some(g => song.genres.includes(g));
        const energyMatch =
          !suggestion.filters.energy ||
          (song.energy && suggestion.filters.energy.includes(song.energy));

        return moodMatch && genreMatch && energyMatch;
      });

      if (matchingSongs.length > 0) {
        // Check if playlist already exists
        const existingPlaylist = db.getPlaylistByName(suggestion.name);

        if (existingPlaylist) {
          // Update existing playlist
          logger.info(`Updating "${suggestion.name}"...`);

          // Clear old songs
          db.clearPlaylistSongs(existingPlaylist.id);

          // Add new matching songs
          for (const song of matchingSongs) {
            db.addSongToPlaylist(existingPlaylist.id, song.id);
          }

          logger.success(`   ✓ Updated with ${matchingSongs.length} songs`);
        } else {
          // Create new playlist
          const playlistId = `pl_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          db.insertPlaylist({
            id: playlistId,
            name: suggestion.name,
            youtube_playlist_id: null,
            category_type: 'ai_group',
            category_value: suggestion.name.toLowerCase().replace(/\s+/g, '_'),
          });

          // Add songs to playlist
          for (const song of matchingSongs) {
            db.addSongToPlaylist(playlistId, song.id);
          }

          logger.success(`   ✓ Created with ${matchingSongs.length} songs`);
        }
      } else {
        logger.dim(`   No matching songs`);
      }
      logger.log('');
    }

    logger.success('✓ Playlists created!');
    logger.dim('View with "status" command');
    logger.log('');
  } catch (error: any) {
    logger.error(`Failed to create playlists: ${error.message}`);
    logger.log('');
  }
}
