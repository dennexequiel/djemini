#!/usr/bin/env bun
import readline from 'readline';
import chalk from 'chalk';
import dotenv from 'dotenv';
import fs from 'fs';
import inquirer from 'inquirer';
import { checkRuntime } from './utils/check-runtime';
import { AppPaths } from './utils/paths';
import { logger } from './utils/logger';
import { getDatabase } from './db';
import { authenticateYouTube } from './cli/auth';
import { handleSourcesCommand } from './cli/sources';
import { handleAnalyzeCommand } from './cli/analyze';
import { handleCreateCommand } from './cli/create';
import { handlePushCommand } from './cli/push';
import { SyncService } from './services/sync';

checkRuntime();
dotenv.config();

const commands = {
  auth: 'Switch YouTube Music account',
  sources: 'Manage sources (discover, add <url>, remove <id>, list)',
  sync: 'Fetch songs from sources (sync or sync --source=<id>)',
  analyze: 'Categorize songs with AI (analyze or analyze --type=mood|genre|energy)',
  create: 'Create AI-suggested playlists from categories',
  push: 'Push local playlists to YouTube Music',
  playlists: 'playlists list, playlists clear',
  status: 'Show library stats',
  reset: 'Clear all data (keeps sources)',
  info: 'Show app info',
  clear: 'Clear screen',
  exit: 'Exit djemini',
} as const;

type Command = keyof typeof commands;

let currentLoggedInUser: string | null = null;

const ASCII_ART = `
██████╗      ██╗███████╗███╗   ███╗██╗███╗   ██╗██╗
██╔══██╗     ██║██╔════╝████╗ ████║██║████╗  ██║██║
██║  ██║     ██║█████╗  ██╔████╔██║██║██╔██╗ ██║██║
██║  ██║██   ██║██╔══╝  ██║╚██╔╝██║██║██║╚██╗██║██║
██████╔╝╚█████╔╝███████╗██║ ╚═╝ ██║██║██║ ╚████║██║
╚═════╝  ╚════╝ ╚══════╝╚═╝     ╚═╝╚═╝╚═╝  ╚═══╝╚═╝
`;

function showSplash(): Promise<void> {
  return new Promise(resolve => {
    console.clear();
    logger.log('');
    logger.log(chalk.magenta(ASCII_ART));
    logger.log(chalk.dim('YouTube Music Organizer powered by Gemini AI'));
    logger.log('');

    setTimeout(() => {
      console.clear();
      resolve();
    }, 500);
  });
}

async function getCurrentUser(): Promise<string | null> {
  try {
    const { YouTubeAuth } = await import('./api/youtube');
    const auth = new YouTubeAuth();
    if (!auth.loadToken()) return null;

    const youtube = auth.getYouTubeService();
    const { data } = await youtube.channels.list({ part: ['snippet'], mine: true });
    return data.items?.[0]?.snippet?.title || null;
  } catch {
    return null;
  }
}

function showWelcome(accountName?: string | null): void {
  logger.log('');
  logger.log(chalk.magenta(ASCII_ART));
  logger.log(chalk.dim('YouTube Music Organizer powered by Gemini AI'));

  const userToShow = accountName ?? currentLoggedInUser;
  if (userToShow) {
    logger.log('');
    logger.log(chalk.gray('Logged in as: ') + chalk.cyan(userToShow));
  }

  logger.log('');
  logger.log(chalk.cyan('Commands:'));
  Object.entries(commands).forEach(([cmd, desc]) => {
    logger.log(`  ${chalk.yellow(cmd.padEnd(12))} ${chalk.dim(desc)}`);
  });
  logger.log('');
}

async function handleCommand(input: string): Promise<boolean> {
  // Remove leading slash if present and parse command + args
  const trimmed = input.trim().toLowerCase().replace(/^\//, '');
  const parts = trimmed.split(/\s+/);
  const cmd = parts[0];
  const args = parts.slice(1);

  switch (cmd) {
    case 'auth':
      logger.log('');
      logger.info('Switching YouTube Music account...');
      logger.log('');

      try {
        // Force re-authentication by removing existing token
        const tokenPath = AppPaths.getTokenPath();
        if (require('fs').existsSync(tokenPath)) {
          require('fs').unlinkSync(tokenPath);
        }

        await authenticateYouTube();
        logger.log('');
      } catch (error) {
        logger.log('');
        logger.error('Account switch failed');
        logger.log('');
      }
      break;

    case 'sources':
      // Temporarily disable keypress and raw mode for inquirer
      (global as any).pauseKeypress?.();
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }

      await handleSourcesCommand(args);

      // Re-enable keypress and raw mode
      process.stdin.resume();
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(true);
      }
      (global as any).resumeKeypress?.();
      break;

    case 'sync':
      logger.log('');
      try {
        const db = getDatabase();
        const syncService = new SyncService();

        // Check if --source flag is provided
        const sourceArg = args.find(arg => arg.startsWith('--source='));

        if (sourceArg) {
          const parts = sourceArg.split('=');
          if (parts[1]) {
            const sourceId = parseInt(parts[1]);
            if (isNaN(sourceId)) {
              logger.error('Invalid source ID');
              logger.log('');
              break;
            }
            await syncService.syncSource(sourceId);
          } else {
            logger.error('Invalid source ID');
            logger.log('');
            break;
          }
        } else {
          // Sync all sources
          const sources = db.getAllSources();
          if (sources.length === 0) {
            logger.warn('No sources found');
            logger.dim('Add sources with: sources add liked');
            logger.log('');
            break;
          }

          for (const source of sources) {
            await syncService.syncSource(source.id);
          }
        }
      } catch (error) {
        if (error instanceof Error) {
          logger.error(error.message);
        } else {
          logger.error('Sync failed');
        }
      }
      logger.log('');
      break;

    case 'analyze':
      await handleAnalyzeCommand(args);
      break;

    case 'create':
      await handleCreateCommand(args);
      break;

    case 'push':
      await handlePushCommand(args);
      break;

    case 'playlists':
      {
        const subCmd = args[0];
        const db = getDatabase();

        if (subCmd === 'clear') {
          logger.log('');
          logger.warn('⚠️  This will delete all local playlists.');
          logger.dim(
            'Songs and categories will be kept. You can recreate playlists with "create".'
          );
          logger.log('');

          // Temporarily disable keypress and raw mode for inquirer
          (global as any).pauseKeypress?.();
          if (process.stdin.isTTY) {
            process.stdin.setRawMode(false);
          }

          try {
            const { confirmed } = await inquirer.prompt([
              {
                type: 'confirm',
                name: 'confirmed',
                message: 'Clear all playlists?',
                default: false,
              },
            ]);

            if (confirmed) {
              db.clearPlaylists();
              logger.log('');
              logger.success('✓ Playlists cleared');
              logger.log('');
            } else {
              logger.log('');
              logger.info('Cancelled');
              logger.log('');
            }
          } catch (error) {
            logger.log('');
            logger.error('Cancelled');
            logger.log('');
          }

          // Re-enable keypress and raw mode
          process.stdin.resume();
          if (process.stdin.isTTY) {
            process.stdin.setRawMode(true);
          }
          (global as any).resumeKeypress?.();
        } else {
          // List playlists
          const playlists = db.getAllPlaylists();

          if (playlists.length === 0) {
            logger.log('');
            logger.dim('No playlists found.');
            logger.dim('Run "create" to generate playlists from your categories.');
            logger.log('');
          } else {
            logger.log('');
            logger.log(chalk.cyan(`Playlists (${playlists.length}):`));
            logger.log('');

            for (const playlist of playlists) {
              const songs = db.getPlaylistSongs(playlist.id);
              const pushed = playlist.youtube_playlist_id ? '✓' : '○';
              logger.log(
                `  ${pushed} ${chalk.white(playlist.name)} ${chalk.dim(`(${songs.length} songs)`)}`
              );
              if (playlist.youtube_playlist_id) {
                logger.dim(
                  `    https://music.youtube.com/playlist?list=${playlist.youtube_playlist_id}`
                );
              }
            }
            logger.log('');
            logger.dim('✓ = pushed to YouTube Music, ○ = local only');
            logger.log('');
          }
        }
      }
      break;

    case 'status':
      logger.log('');
      const db = getDatabase();
      const songCount = db.getSongCount();
      const processedCount = db.getProcessedSongCount();
      const sources = db.getAllSources();

      logger.log(chalk.bold.magenta('djemini Status'));
      logger.log('');
      logger.log(chalk.gray('Sources:        ') + chalk.white(sources.length));
      logger.log(chalk.gray('Total songs:    ') + chalk.white(songCount));
      logger.log(chalk.gray('Categorized:    ') + chalk.white(processedCount));
      logger.log(chalk.gray('Pending:        ') + chalk.white(songCount - processedCount));
      logger.log('');
      break;

    case 'reset':
      // Temporarily disable keypress and raw mode for inquirer
      (global as any).pauseKeypress?.();
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }

      logger.log('');
      logger.warn('⚠️  This will delete all songs, categories, and playlists.');
      logger.dim('Sources will be kept. This cannot be undone.');
      logger.log('');

      try {
        const { confirmed } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'confirmed',
            message: 'Are you sure you want to reset all data?',
            default: false,
          },
        ]);

        if (confirmed) {
          const db = getDatabase();
          db.resetData();
          logger.log('');
          logger.success('✓ All data has been reset');
          logger.dim('Sources are still available. Run "sync" to re-fetch songs.');
          logger.log('');
        } else {
          logger.log('');
          logger.info('Reset cancelled');
          logger.log('');
        }
      } catch (error) {
        logger.log('');
        logger.error('Reset cancelled');
        logger.log('');
      }

      // Re-enable keypress and raw mode
      process.stdin.resume();
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(true);
      }
      (global as any).resumeKeypress?.();
      break;

    case 'info':
      logger.log('');
      logger.log(chalk.bold.magenta('djemini'));
      logger.log(chalk.gray('Data:     ') + chalk.white(AppPaths.getDataDir()));
      logger.log(chalk.gray('Token:    ') + chalk.white(AppPaths.getTokenPath()));
      logger.log(chalk.gray('Database: ') + chalk.white(AppPaths.getDbPath()));
      logger.log('');
      break;

    case 'clear':
      console.clear();
      showWelcome();
      break;

    case 'exit':
      logger.log('');
      logger.log(chalk.magenta('The music never stops, just the organizing does.'));
      logger.log(chalk.dim('Until next time...'));
      logger.log('');
      return true;

    case '':
      break;

    default:
      logger.log('');
      logger.error(`Unknown command: ${input}`);
      logger.dim('Type clear to see available commands');
      logger.log('');
      break;
  }

  return false;
}

async function checkAuth(): Promise<boolean> {
  const { YouTubeAuth } = await import('./api/youtube');
  const auth = new YouTubeAuth();
  return auth.loadToken();
}

async function main(): Promise<void> {
  // Show splash screen for 1.5 seconds
  await showSplash();

  // Check authentication
  const isAuthenticated = await checkAuth();
  let currentUser: string | null = null;

  if (!isAuthenticated) {
    logger.log('');
    logger.warn('⚠️  Not authenticated');
    logger.log('');
    logger.dim('djemini needs to access your YouTube Music library.');
    logger.dim('This will open your browser for Google authentication.');
    logger.log('');

    try {
      const { proceed } = await inquirer.prompt([
        {
          type: 'input',
          name: 'proceed',
          message: 'Authenticate now? (y/n)',
          prefix: '>',
          validate: (input: string) => {
            const val = input.trim().toLowerCase();
            if (val === 'y' || val === 'yes' || val === 'n' || val === 'no') {
              return true;
            }
            return 'Please enter y or n';
          },
        },
      ]);

      const answer = proceed.trim().toLowerCase();

      if (answer === 'y' || answer === 'yes') {
        logger.log('');

        await authenticateYouTube();

        logger.log('');
        logger.success('✓ Successfully authenticated');
        logger.log('');

        currentUser = await getCurrentUser();
        currentLoggedInUser = currentUser;
      } else {
        logger.log('');
        logger.info('Authentication skipped');
        logger.dim('Exiting djemini...');
        logger.log('');
        process.exit(0);
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('User force closed')) {
        // Ctrl+C was pressed
        logger.log('');
        logger.log(chalk.magenta('The music never stops, just the organizing does.'));
        logger.log(chalk.dim('Until next time...'));
        logger.log('');
        process.exit(0);
      } else {
        logger.log('');
        logger.error('Authentication cancelled');
        logger.log('');
        process.exit(1);
      }
    }
  } else {
    logger.log('');
    logger.success('✓ Authenticated');
    currentUser = await getCurrentUser();
    currentLoggedInUser = currentUser;
  }

  // Then show full welcome with commands
  showWelcome(currentUser);

  // Setup stdin and keypress handling AFTER inquirer
  let inputBuffer = '';
  let commandHistory: string[] = [];
  let historyIndex = -1;
  let keypressEnabled = true;

  const handleInput = async (char: string, key: any) => {
    if (!keypressEnabled) return; // Ignore keypresses when disabled

    if (key.name === 'return') {
      const command = inputBuffer.trim();

      // Clear current line and show dimmed command
      process.stdout.write('\r\x1b[K');
      if (command) {
        logger.log(chalk.dim('> ' + command));
        // Add to history
        if (command && commandHistory[commandHistory.length - 1] !== command) {
          commandHistory.push(command);
        }
        historyIndex = -1;
      } else {
        process.stdout.write('\n');
      }

      inputBuffer = '';

      // Execute command
      const shouldExit = await handleCommand(command);
      if (shouldExit) {
        process.exit(0);
      }

      // Show fresh prompt
      process.stdout.write(chalk.cyan('> '));
    } else if (key.name === 'up') {
      // Navigate history backwards
      if (commandHistory.length > 0) {
        if (historyIndex === -1) {
          historyIndex = commandHistory.length - 1;
        } else if (historyIndex > 0) {
          historyIndex--;
        }

        inputBuffer = commandHistory[historyIndex] || '';
        process.stdout.write('\r\x1b[K' + chalk.cyan('> ') + inputBuffer);
      }
    } else if (key.name === 'down') {
      // Navigate history forwards
      if (historyIndex !== -1) {
        if (historyIndex < commandHistory.length - 1) {
          historyIndex++;
          inputBuffer = commandHistory[historyIndex] || '';
        } else {
          historyIndex = -1;
          inputBuffer = '';
        }
        process.stdout.write('\r\x1b[K' + chalk.cyan('> ') + inputBuffer);
      }
    } else if (key.name === 'backspace') {
      if (inputBuffer.length > 0) {
        inputBuffer = inputBuffer.slice(0, -1);
        // Erase character visually
        process.stdout.write('\b \b');
      }
    } else if (key.ctrl && key.name === 'c') {
      process.stdout.write('\n');
      logger.log('');
      logger.log(chalk.magenta('The music never stops, just the organizing does.'));
      logger.log(chalk.dim('Until next time...'));
      logger.log('');
      process.exit(0);
    } else if (char && !key.ctrl && !key.meta && char.length === 1 && char.charCodeAt(0) >= 32) {
      inputBuffer += char;
      process.stdout.write(char);
    }
  };

  // Setup raw mode and keypress handling
  process.stdin.resume();
  process.stdin.setEncoding('utf8');

  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }

  readline.emitKeypressEvents(process.stdin);

  // Initial prompt
  process.stdout.write(chalk.cyan('> '));

  // Store reference to handler so we can disable/enable
  const wrappedHandler = async (char: string, key: any) => {
    await handleInput(char, key);
  };

  process.stdin.on('keypress', wrappedHandler);

  // Export functions to pause/resume keypress handling
  (global as any).pauseKeypress = () => {
    keypressEnabled = false;
  };
  (global as any).resumeKeypress = () => {
    keypressEnabled = true;
  };
}

main().catch((error: Error) => {
  logger.error(`Fatal error: ${error.message}`);
  process.exit(1);
});
