import { getDatabase } from '../db';
import { logger } from '../utils/logger';
import { YouTubeAuth } from '../api/youtube';
import chalk from 'chalk';
import inquirer from 'inquirer';

export async function handleSourcesCommand(args: string[]): Promise<void> {
  const db = getDatabase();
  const [subcommand, ...rest] = args;

  if (subcommand === 'discover') {
    await discoverPlaylists();
    return;
  }

  if (!subcommand || subcommand === 'list') {
    // Show all sources
    const sources = db.getAllSources();

    if (sources.length === 0) {
      logger.log('');
      logger.dim('No sources added yet.');
      logger.dim('Discover playlists with: sources discover');
      logger.log('');
      return;
    }

    logger.log('');
    logger.log(chalk.cyan(`Sources (${sources.length}):`));
    sources.forEach(source => {
      const syncedText = source.last_synced
        ? `synced ${getTimeAgo(source.last_synced)}`
        : 'never synced';

      logger.log(
        `  ${chalk.yellow(`[${source.id}]`)} ${source.name} ${chalk.dim(`(${source.song_count} songs, ${syncedText})`)}`
      );
    });
    logger.log('');
    return;
  }

  if (subcommand === 'add') {
    const input = rest.join(' ').trim();

    if (!input) {
      logger.error('Usage: sources add <playlist-url>');
      logger.log('');
      return;
    }

    // Parse playlist URL
    const playlistId = extractPlaylistId(input);
    if (!playlistId) {
      logger.error('Invalid playlist URL');
      logger.dim('Expected format: https://music.youtube.com/playlist?list=...');
      logger.log('');
      return;
    }

    // Check if already exists
    const existing = db.getSourceByYoutubeId(playlistId);
    if (existing) {
      logger.warn(`Playlist already added as "${existing.name}"`);
      logger.log('');
      return;
    }

    const id = db.insertSource({
      type: 'playlist',
      name: `Playlist ${playlistId.slice(0, 8)}...`,
      youtube_id: playlistId,
    });

    logger.success(`✓ Added playlist as source [${id}]`);
    logger.dim('Tip: Run "sync" to fetch songs from this playlist');
    logger.log('');
    return;
  }

  if (subcommand === 'remove') {
    const idStr = rest[0];

    if (!idStr) {
      logger.error('Usage: sources remove <id>');
      logger.dim('Get source IDs from: sources');
      logger.log('');
      return;
    }

    const id = parseInt(idStr);

    if (isNaN(id)) {
      logger.error('Usage: sources remove <id>');
      logger.dim('Get source IDs from: sources');
      logger.log('');
      return;
    }

    const source = db.getSourceById(id);
    if (!source) {
      logger.error(`Source [${id}] not found`);
      logger.log('');
      return;
    }

    db.deleteSource(id);
    logger.success(`✓ Removed "${source.name}" source`);
    logger.log('');
    return;
  }

  logger.error(`Unknown subcommand: ${subcommand}`);
  logger.dim('Available: sources, sources discover, sources add <url>, sources remove');
  logger.log('');
}

function extractPlaylistId(url: string): string | null {
  try {
    const match = url.match(/[?&]list=([^&]+)/);
    return match?.[1] || null;
  } catch {
    return null;
  }
}

async function discoverPlaylists(): Promise<void> {
  logger.log('');
  logger.info('Discovering your YouTube Music playlists...');

  try {
    const auth = new YouTubeAuth();
    if (!auth.loadToken()) {
      logger.error('Not authenticated. Run "auth" command first.');
      logger.log('');
      return;
    }

    const playlists = await auth.getUserPlaylists();

    if (playlists.length === 0) {
      logger.warn('No playlists found in your YouTube Music library');
      logger.log('');
      return;
    }

    logger.log('');

    // Use inquirer checkbox for interactive selection
    const answers = await inquirer.prompt([
      {
        type: 'checkbox',
        name: 'selectedPlaylists',
        message: 'Select playlists to add (space to toggle, enter to confirm)',
        prefix: '',
        choices: playlists.map(p => ({
          name: `${p.title} ${chalk.dim(`(${p.itemCount} items)`)}`,
          value: p,
          checked: false,
        })),
        pageSize: 15,
      },
    ]);

    const selectedPlaylists = answers.selectedPlaylists;

    if (selectedPlaylists.length === 0) {
      logger.warn('No playlists selected');
      logger.log('');
      return;
    }

    logger.log('');
    const db = getDatabase();
    let addedCount = 0;

    for (const playlist of selectedPlaylists) {
      // Check if already exists
      const existing = db.getSourceByYoutubeId(playlist.id);
      if (existing) {
        logger.warn(`"${playlist.title}" already added`);
        continue;
      }

      const id = db.insertSource({
        type: 'playlist',
        name: playlist.title,
        youtube_id: playlist.id,
      });
      logger.success(`✓ Added "${playlist.title}" [${id}]`);
      addedCount++;
    }

    logger.log('');
    if (addedCount > 0) {
      logger.dim('Run "sync" to fetch songs from selected playlists');
    }
    logger.log('');
  } catch (error) {
    if (error instanceof Error) {
      logger.error(error.message);
    } else {
      logger.error('Failed to discover playlists');
    }
    logger.log('');
  }
}

function getTimeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} mins ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
  return `${Math.floor(seconds / 86400)} days ago`;
}
