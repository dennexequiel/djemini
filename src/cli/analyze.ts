import { getDatabase } from '../db';
import { logger } from '../utils/logger';
import { GeminiService } from '../services/gemini';
import type { AnalysisType } from '../types';

const BATCH_SIZE = 15; // Process 15 songs at a time to avoid rate limits

export async function handleAnalyzeCommand(args: string[]): Promise<void> {
  // Parse --type flag
  let type: AnalysisType = 'all';
  const typeArg = args.find(arg => arg.startsWith('--type='));

  if (typeArg) {
    const value = typeArg.split('=')[1] as AnalysisType;
    if (['mood', 'genre', 'energy', 'all'].includes(value)) {
      type = value;
    } else {
      logger.error('Invalid type. Use: mood, genre, energy, or all');
      return;
    }
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    logger.error('GEMINI_API_KEY not found in .env');
    return;
  }

  const db = getDatabase();
  const gemini = new GeminiService(apiKey);

  // Get unprocessed songs
  const allSongs = db.getAllSongs();
  const unprocessedSongs = allSongs.filter(s => !s.ai_processed);

  if (unprocessedSongs.length === 0) {
    logger.log('');
    logger.success('✓ All songs have been analyzed');
    logger.dim(`Total: ${allSongs.length} songs`);
    logger.log('');
    return;
  }

  logger.log('');
  logger.info(`Analyzing ${unprocessedSongs.length} songs (${type})...`);
  logger.dim(`Processing in batches of ${BATCH_SIZE}`);
  logger.log('');

  let processed = 0;
  let failed = 0;

  // Process in batches
  for (let i = 0; i < unprocessedSongs.length; i += BATCH_SIZE) {
    const batch = unprocessedSongs.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(unprocessedSongs.length / BATCH_SIZE);

    try {
      logger.dim(`Batch ${batchNum}/${totalBatches} (${batch.length} songs)...`);

      const analyses = await gemini.analyzeSongs(batch, type);

      // Save categories to database
      for (const analysis of analyses) {
        if (type === 'mood' || type === 'all') {
          if (analysis.mood) {
            for (const mood of analysis.mood) {
              db.insertCategory({
                song_id: analysis.song_id,
                type: 'mood',
                value: mood,
                confidence: 1.0,
              });
            }
          }
        }

        if (type === 'genre' || type === 'all') {
          if (analysis.genre) {
            for (const genre of analysis.genre) {
              db.insertCategory({
                song_id: analysis.song_id,
                type: 'genre',
                value: genre,
                confidence: 1.0,
              });
            }
          }
        }

        if (type === 'energy' || type === 'all') {
          if (analysis.energy) {
            db.insertCategory({
              song_id: analysis.song_id,
              type: 'energy',
              value: analysis.energy,
              confidence: 1.0,
            });
          }
        }

        // Mark as processed
        db.markSongAsProcessed(analysis.song_id);
      }

      processed += analyses.length;
      logger.success(`  ✓ Processed ${analyses.length} songs`);

      // Small delay between batches to avoid rate limiting
      if (i + BATCH_SIZE < unprocessedSongs.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch (error: any) {
      logger.error(`  ✗ Batch failed: ${error.message}`);
      failed += batch.length;
    }
  }

  logger.log('');
  logger.success(`✓ Analysis complete`);
  logger.info(`Processed: ${processed} songs`);
  if (failed > 0) {
    logger.warn(`Failed: ${failed} songs`);
  }
  logger.log('');
  logger.dim('Run "status" to see your library breakdown');
  logger.log('');
}
