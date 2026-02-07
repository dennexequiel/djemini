import { getDatabase } from '../db';
import { logger } from '../utils/logger';
import { YouTubeAuth } from '../api/youtube';

export async function handlePushCommand(args: string[]): Promise<void> {
  const db = getDatabase();
  const youtubeAuth = new YouTubeAuth();

  // Check authentication by trying to load token
  try {
    youtubeAuth.loadToken();
  } catch (error) {
    logger.error('Not authenticated. Run "auth" first.');
    return;
  }

  const playlists = db.getAllPlaylists();

  if (playlists.length === 0) {
    logger.log('');
    logger.warn('No playlists found');
    logger.dim('Run "create" first to generate playlists');
    logger.log('');
    return;
  }

  logger.log('');
  logger.warn('⚠️  YouTube API Quota Warning:');
  logger.dim('Each song costs 50 quota units. Daily limit is 10,000 units (≈200 songs).');
  logger.dim('This push will attempt to add songs. Press Ctrl+C to cancel.');
  logger.log('');

  // Wait 2 seconds to let user read
  await new Promise(resolve => setTimeout(resolve, 2000));

  logger.info(`Found ${playlists.length} local playlists`);
  logger.log('');

  const youtube = youtubeAuth.getYouTubeService();
  let created = 0;
  let updated = 0;
  let skipped = 0;
  let totalAdded = 0;
  let totalFailed = 0;

  for (const playlist of playlists) {
    const songs = db.getPlaylistSongs(playlist.id);

    if (songs.length === 0) {
      logger.dim(`⊘ "${playlist.name}" - No songs, skipping`);
      skipped++;
      continue;
    }

    try {
      if (!playlist.youtube_playlist_id) {
        // Create new YouTube playlist
        logger.info(`Creating "${playlist.name}" (${songs.length} songs)...`);

        const createResponse = await youtube.playlists.insert({
          part: ['snippet', 'status'],
          requestBody: {
            snippet: {
              title: playlist.name,
              description: `Created by djemini - ${playlist.category_type}: ${playlist.category_value}`,
            },
            status: {
              privacyStatus: 'private',
            },
          },
        });

        const youtubePlaylistId = createResponse.data.id!;
        db.updatePlaylistYouTubeId(playlist.id, youtubePlaylistId);

        // Add all songs with progress
        let addedCount = 0;
        let failedCount = 0;

        for (let i = 0; i < songs.length; i++) {
          const song = songs[i];
          if (!song) continue;

          try {
            await youtube.playlistItems.insert({
              part: ['snippet'],
              requestBody: {
                snippet: {
                  playlistId: youtubePlaylistId,
                  resourceId: {
                    kind: 'youtube#video',
                    videoId: song.id,
                  },
                },
              },
            });
            addedCount++;

            // Show progress every 10 songs
            if ((i + 1) % 10 === 0 || i === songs.length - 1) {
              process.stdout.write(`\r  Progress: ${i + 1}/${songs.length} songs...`);
            }
          } catch (error: any) {
            failedCount++;

            // Check if quota exceeded
            if (error.message?.includes('quota') || error.code === 403) {
              logger.log('');
              logger.error(`  ✗ YouTube API quota exceeded at song ${i + 1}/${songs.length}`);
              logger.dim(`  Successfully added: ${addedCount}, Failed: ${failedCount}`);
              logger.log('');
              logger.warn(
                '⚠️  Hit daily quota limit. Try again tomorrow or request quota increase:'
              );
              logger.dim('https://console.cloud.google.com/apis/api/youtube.googleapis.com/quotas');
              logger.log('');
              return;
            }
          }
        }

        logger.log('');
        if (failedCount > 0) {
          logger.warn(
            `  ⚠ Created with ${addedCount}/${songs.length} songs (${failedCount} unavailable)`
          );
        } else {
          logger.success(`  ✓ Created with ${addedCount} songs`);
        }

        totalAdded += addedCount;
        totalFailed += failedCount;
        created++;
      } else {
        // For existing playlists, just show info - don't auto-update to save quota
        const existingCount = songs.length;
        logger.dim(`⊘ "${playlist.name}" - Already pushed (${existingCount} songs)`);
        logger.dim(`  Run "playlists clear" then "push" to recreate if needed`);
        skipped++;
      }

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error: any) {
      if (error.message?.includes('quota') || error.code === 403) {
        logger.error(`  ✗ YouTube API quota exceeded`);
        logger.log('');
        logger.warn('⚠️  Hit daily quota limit. Try again tomorrow.');
        logger.log('');
        return;
      }
      logger.error(`  ✗ Failed: ${error.message}`);
    }

    logger.log('');
  }

  logger.success('✓ Push complete');
  logger.info(`Created: ${created}, Skipped: ${skipped}`);
  logger.info(`Songs added: ${totalAdded}, Failed: ${totalFailed}`);
  logger.log('');
  logger.dim('View your playlists at: https://music.youtube.com/');
  logger.log('');
}
