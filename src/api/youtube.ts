import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import * as fs from 'fs';
import { AppPaths } from '../utils/paths';
import { OAUTH_CONFIG } from '../utils/constants';
import { logger } from '../utils/logger';

export class YouTubeAuth {
  private oauth2Client: OAuth2Client;

  constructor() {
    const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI } = process.env;

    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI) {
      throw new Error(
        'Missing required environment variables: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI'
      );
    }

    this.oauth2Client = new google.auth.OAuth2(
      GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET,
      GOOGLE_REDIRECT_URI
    );
  }

  getAuthUrl(): string {
    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: OAUTH_CONFIG.SCOPES,
    });
  }

  async getTokenFromCode(code: string): Promise<void> {
    try {
      const { tokens } = await this.oauth2Client.getToken(code);
      this.oauth2Client.setCredentials(tokens);
      this.saveToken(tokens);
    } catch (error) {
      logger.error('Failed to exchange authorization code for token');
      throw error;
    }
  }

  private saveToken(tokens: any): void {
    try {
      fs.writeFileSync(AppPaths.getTokenPath(), JSON.stringify(tokens, null, 2));
    } catch (error) {
      logger.error('Failed to save authentication token');
      throw error;
    }
  }

  loadToken(): boolean {
    const tokenPath = AppPaths.getTokenPath();
    if (!fs.existsSync(tokenPath)) {
      return false;
    }

    try {
      const tokens = JSON.parse(fs.readFileSync(tokenPath, 'utf-8'));
      this.oauth2Client.setCredentials(tokens);
      return true;
    } catch (error) {
      logger.warn('Failed to load token, re-authentication required');
      return false;
    }
  }

  getClient(): OAuth2Client {
    return this.oauth2Client;
  }

  getYouTubeService() {
    return google.youtube({ version: 'v3', auth: this.oauth2Client });
  }

  async getUserPlaylists(): Promise<Array<{ id: string; title: string; itemCount: number }>> {
    const youtube = this.getYouTubeService();
    const playlists: Array<{ id: string; title: string; itemCount: number }> = [];
    let pageToken: string | undefined;

    do {
      const response = await youtube.playlists.list({
        part: ['snippet', 'contentDetails'],
        mine: true,
        maxResults: 50,
        pageToken,
      });

      if (response.data.items) {
        for (const item of response.data.items) {
          if (item.id && item.snippet?.title) {
            playlists.push({
              id: item.id,
              title: item.snippet.title,
              itemCount: item.contentDetails?.itemCount || 0,
            });
          }
        }
      }

      pageToken = response.data.nextPageToken || undefined;
    } while (pageToken);

    return playlists;
  }
}
