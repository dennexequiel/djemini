import { YouTubeAuth } from '../api/youtube';
import { getDatabase } from '../db';
import { logger } from '../utils/logger';
import type { Song } from '../types';

interface VideoItem {
  id: string;
  title: string;
  artist: string;
  channelTitle: string;
}

export class SyncService {
  private youtubeAuth: YouTubeAuth;

  constructor() {
    this.youtubeAuth = new YouTubeAuth();
    if (!this.youtubeAuth.loadToken()) {
      throw new Error('Not authenticated. Run "auth" command first.');
    }
  }

  async syncSource(sourceId: number): Promise<void> {
    const db = getDatabase();
    const source = db.getSourceById(sourceId);

    if (!source) {
      throw new Error(`Source [${sourceId}] not found`);
    }

    logger.info(`Syncing ${source.name}...`);

    let videos: VideoItem[];

    if (source.type === 'liked') {
      videos = await this.fetchLikedVideos();
    } else {
      videos = await this.fetchPlaylistVideos(source.youtube_id!);
    }

    // Filter music videos
    const musicVideos = this.filterMusicVideos(videos);

    // Save to database
    const songs: Omit<Song, 'added_at' | 'ai_processed'>[] = musicVideos.map(video => ({
      id: video.id,
      title: video.title,
      artist: video.artist,
      source_id: sourceId,
    }));

    if (songs.length > 0) {
      db.insertSongs(songs);
      db.updateSourceSyncTime(sourceId);
      logger.success(`✓ Synced ${songs.length} tracks from ${source.name}`);
    } else {
      logger.warn('No music tracks found');
    }
  }

  private async fetchLikedVideos(): Promise<VideoItem[]> {
    const youtube = this.youtubeAuth.getYouTubeService();
    const videos: VideoItem[] = [];
    let pageToken: string | undefined;

    do {
      const response = await youtube.videos.list({
        part: ['snippet'],
        myRating: 'like',
        maxResults: 50,
        pageToken,
      });

      if (response.data.items) {
        for (const item of response.data.items) {
          if (item.snippet && item.id) {
            const title = item.snippet.title || 'Unknown';
            const { artist, cleanTitle } = this.extractArtistFromTitle(
              title,
              item.snippet.channelTitle || 'Unknown'
            );

            videos.push({
              id: item.id,
              title: cleanTitle,
              artist,
              channelTitle: item.snippet.channelTitle || 'Unknown',
            });
          }
        }
      }

      pageToken = response.data.nextPageToken || undefined;
    } while (pageToken);

    return videos;
  }

  private async fetchPlaylistVideos(playlistId: string): Promise<VideoItem[]> {
    const youtube = this.youtubeAuth.getYouTubeService();
    const videos: VideoItem[] = [];
    let pageToken: string | undefined;

    do {
      const response = await youtube.playlistItems.list({
        part: ['snippet', 'contentDetails'],
        playlistId,
        maxResults: 50,
        pageToken,
      });

      if (response.data.items) {
        // Collect video IDs to fetch details in batch
        const videoIds = response.data.items
          .filter(item => item.snippet?.resourceId?.videoId)
          .map(item => item.snippet!.resourceId!.videoId!);

        // Fetch video details to get actual channel (artist)
        if (videoIds.length > 0) {
          const videoDetails = await youtube.videos.list({
            part: ['snippet'],
            id: videoIds,
          });

          if (videoDetails.data.items) {
            for (const video of videoDetails.data.items) {
              if (video.snippet && video.id) {
                const title = video.snippet.title || 'Unknown';
                const actualChannelTitle = video.snippet.channelTitle || 'Unknown';
                const { artist, cleanTitle } = this.extractArtistFromTitle(
                  title,
                  actualChannelTitle
                );

                videos.push({
                  id: video.id,
                  title: cleanTitle,
                  artist,
                  channelTitle: actualChannelTitle,
                });
              }
            }
          }
        }
      }

      pageToken = response.data.nextPageToken || undefined;
    } while (pageToken);

    return videos;
  }

  private filterMusicVideos(videos: VideoItem[]): VideoItem[] {
    const nonMusicPatterns = [
      /podcast/i,
      /interview/i,
      /talk show/i,
      /documentary/i,
      /news/i,
      /vlog/i,
      /review/i,
      /reaction/i,
      /tutorial/i,
      /lesson/i,
      /course/i,
    ];

    return videos.filter(video => {
      const text = `${video.title} ${video.channelTitle}`.toLowerCase();
      return !nonMusicPatterns.some(pattern => pattern.test(text));
    });
  }

  private extractArtistFromTitle(
    title: string,
    fallback: string
  ): { artist: string; cleanTitle: string } {
    // Common patterns: "Artist - Song", "Artist: Song", "Artist | Song"
    const separators = [' - ', ' – ', ' — ', ': ', ' | '];

    for (const sep of separators) {
      if (title.includes(sep)) {
        const parts = title.split(sep);
        if (parts.length >= 2 && parts[0]) {
          return {
            artist: this.cleanArtistName(parts[0].trim()),
            cleanTitle: parts.slice(1).join(sep).trim(),
          };
        }
      }
    }

    // No separator found, use channel title as artist
    return {
      artist: this.cleanArtistName(fallback),
      cleanTitle: title,
    };
  }

  private cleanArtistName(artist: string): string {
    // Remove YouTube's "- Topic" suffix from official artist channels
    return artist.replace(/ - Topic$/i, '').trim();
  }
}
