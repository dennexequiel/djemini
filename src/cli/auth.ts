import { YouTubeAuth } from '../api/youtube';
import { logger } from '../utils/logger';
import { OAUTH_CONFIG } from '../utils/constants';
import chalk from 'chalk';

interface AuthCallbackResult {
  code?: string;
  error?: string;
}

export async function authenticateYouTube(): Promise<boolean> {
  const auth = new YouTubeAuth();

  // Check existing authentication
  if (auth.loadToken()) {
    try {
      const youtube = auth.getYouTubeService();
      const { data } = await youtube.channels.list({ part: ['snippet'], mine: true });

      if (data.items?.[0]) {
        logger.success(`✓ Already authenticated as ${data.items[0].snippet?.title}`);
        logger.log('');
        return true;
      }
    } catch (error) {
      logger.warn('Token expired, re-authenticating...');
      logger.log('');
    }
  }

  const authUrl = auth.getAuthUrl();

  logger.dim("Copy and paste this URL in your browser if it doesn't open automatically:");
  logger.log(chalk.cyan(authUrl));
  logger.log('');

  // Auto-open browser
  try {
    Bun.spawn(['open', authUrl]);
  } catch (error) {
    logger.warn('Could not auto-open browser');
  }

  try {
    const code = await startOAuthServer();
    await auth.getTokenFromCode(code);

    const youtube = auth.getYouTubeService();
    const { data } = await youtube.channels.list({ part: ['snippet'], mine: true });
    const channel = data.items?.[0]?.snippet?.title || 'Unknown';

    logger.success(`✓ Authenticated as ${channel}`);
    logger.log('');
    return true;
  } catch (error: any) {
    logger.error(`✗ Authentication failed: ${error.message}`);
    logger.log('');
    return false;
  }
}

async function startOAuthServer(): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    let resolved = false;

    const server = Bun.serve({
      port: OAUTH_CONFIG.PORT,
      fetch(req) {
        if (resolved) {
          return new Response('OK');
        }

        const url = new URL(req.url);
        const code = url.searchParams.get('code');
        const error = url.searchParams.get('error');

        if (error) {
          resolved = true;
          server.stop();
          reject(new Error(`OAuth error: ${error}`));
          return new Response('djemini - Authentication failed. Close this tab and try again.');
        }

        if (code) {
          resolved = true;
          setTimeout(() => server.stop(), 200);
          resolve(code);
          return new Response(
            '<!DOCTYPE html>' +
              '<html>' +
              '<head>' +
              '  <meta charset="UTF-8">' +
              '  <title>Authentication Successful</title>' +
              '  <style>' +
              '    body { font-family: system-ui; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #1a1a1a; color: #fff; }' +
              '    .container { text-align: center; }' +
              '    .checkmark { color: #00ff88; font-size: 48px; margin-bottom: 20px; }' +
              '    h2 { color: #fff; margin-bottom: 10px; }' +
              '    p { color: #999; font-size: 18px; }' +
              '  </style>' +
              '</head>' +
              '<body>' +
              '  <div class="container">' +
              '    <div class="checkmark">✓</div>' +
              '    <h2>Authentication Successful</h2>' +
              '    <p>You can close this tab and return to the terminal.</p>' +
              '  </div>' +
              '</body>' +
              '</html>',
            { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
          );
        }

        return new Response('Waiting for authentication...', { status: 200 });
      },
    });

    // Timeout after configured duration
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        server.stop();
        reject(new Error('Authentication timeout'));
      }
    }, OAUTH_CONFIG.TIMEOUT_MS);
  });
}
