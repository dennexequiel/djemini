import { GoogleGenerativeAI } from '@google/generative-ai';
import { logger } from '../utils/logger';
import type { Song, AnalysisType } from '../types';

export interface SongAnalysis {
  song_id: string;
  mood?: string[];
  genre?: string[];
  energy?: string;
}

export interface PlaylistSuggestion {
  name: string;
  description: string;
  filters: {
    mood?: string[];
    genre?: string[];
    energy?: string[];
  };
}

export class GeminiService {
  private genAI: GoogleGenerativeAI;
  private model: any;

  constructor(apiKey: string) {
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
  }

  async suggestPlaylists(
    moods: string[],
    genres: string[],
    energyLevels: string[]
  ): Promise<PlaylistSuggestion[]> {
    const prompt = [
      "You are a music curator. Based on the following categories found in a user's library,",
      'suggest 5-10 logical playlists with simple, common names.',
      '',
      `Available moods: ${moods.join(', ')}`,
      `Available genres: ${genres.join(', ')}`,
      `Available energy levels: ${energyLevels.join(', ')}`,
      '',
      'Create playlists that combine these attributes in meaningful ways.',
      'Use simple, everyday names without buzzwords. Examples:',
      '- "Workout" (high energy + hip-hop/electronic + energetic mood)',
      '- "Late Night" (low energy + calm/melancholic + indie/r&b)',
      '- "Study" (medium energy + calm + electronic/classical)',
      '- "Party" (high energy + party mood + pop/dance)',
      '- "Sleep" (low energy + calm)',
      '- "Drive" (medium/high energy + various genres)',
      '- "Chill" (low/medium energy + calm/relaxed)',
      '',
      'Keep names 1-2 words, simple and descriptive.',
      'NO buzzwords like "bangers", "vibes", "mode", "flow", etc.',
      '',
      'Each playlist should:',
      '1. Have a simple, common name (1-2 words max)',
      '2. Have a brief description',
      '3. Define filters using the available categories above',
      '',
      'Return ONLY valid JSON, no markdown:',
      '{',
      '  "playlists": [',
      '    {',
      '      "name": "Workout",',
      '      "description": "High-energy tracks for exercise",',
      '      "filters": {',
      '        "mood": ["energetic", "uplifting"],',
      '        "genre": ["hip-hop", "electronic"],',
      '        "energy": ["high"]',
      '      }',
      '    }',
      '  ]',
      '}',
    ].join('\n');

    try {
      const result = await this.model.generateContent(prompt);
      const response = result.response.text();
      return this.parsePlaylists(response);
    } catch (error: any) {
      logger.error(`Gemini API error: ${error.message}`);
      throw error;
    }
  }

  private parsePlaylists(response: string): PlaylistSuggestion[] {
    try {
      let cleaned = response.trim();
      if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      }

      const parsed = JSON.parse(cleaned);
      return parsed.playlists || [];
    } catch (error: any) {
      logger.error(`Failed to parse playlist suggestions: ${error.message}`);
      logger.dim(`Response: ${response.substring(0, 200)}...`);
      throw new Error('Invalid response from Gemini');
    }
  }

  async analyzeSongs(songs: Song[], type: AnalysisType): Promise<SongAnalysis[]> {
    const prompt = this.buildPrompt(songs, type);

    try {
      const result = await this.model.generateContent(prompt);
      const response = result.response.text();
      return this.parseResponse(response, songs, type);
    } catch (error: any) {
      logger.error(`Gemini API error: ${error.message}`);
      throw error;
    }
  }

  private buildPrompt(songs: Song[], type: AnalysisType): string {
    const songList = songs
      .map((s, idx) => `${idx + 1}. "${s.title}" by ${s.artist || 'Unknown'}`)
      .join('\n');

    const instructions = [];

    if (type === 'mood' || type === 'all') {
      instructions.push(
        '**Mood** (can have multiple): happy, sad, energetic, calm, romantic, angry,',
        'nostalgic, melancholic, uplifting, dark, chill, party, emotional, empowering, dreamy'
      );
    }

    if (type === 'genre' || type === 'all') {
      instructions.push(
        '**Genre** (can have multiple): pop, rock, hip-hop, r&b, electronic, indie,',
        'country, jazz, classical, metal, folk, latin, k-pop, alternative, edm, soul,',
        'funk, reggae, punk, blues'
      );
    }

    if (type === 'energy' || type === 'all') {
      instructions.push('**Energy** (single value): low, medium, high');
    }

    const filters = [];
    if (type === 'mood' || type === 'all') filters.push('"mood": ["happy", "uplifting"],');
    if (type === 'genre' || type === 'all') filters.push('"genre": ["pop", "electronic"],');
    if (type === 'energy' || type === 'all') filters.push('"energy": "high"');

    return [
      'Analyze the following songs and categorize them.',
      'Return ONLY valid JSON, no markdown or explanations.',
      '',
      'Songs:',
      songList,
      '',
      ...instructions,
      '',
      'Return format:',
      '{',
      '  "analyses": [',
      '    {',
      '      "song_id": 1,',
      `      ${filters.join('\n      ')}`,
      '    }',
      '  ]',
      '}',
    ].join('\n');
  }

  private parseResponse(response: string, songs: Song[], type: AnalysisType): SongAnalysis[] {
    try {
      // Remove markdown code blocks if present
      let cleaned = response.trim();
      if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      }

      const parsed = JSON.parse(cleaned);
      const analyses: SongAnalysis[] = [];

      for (const analysis of parsed.analyses) {
        const songIndex = analysis.song_id - 1;
        if (songIndex >= 0 && songIndex < songs.length) {
          const song = songs[songIndex];
          if (song) {
            analyses.push({
              song_id: song.id,
              mood: analysis.mood,
              genre: analysis.genre,
              energy: analysis.energy,
            });
          }
        }
      }

      return analyses;
    } catch (error: any) {
      logger.error(`Failed to parse Gemini response: ${error.message}`);
      logger.dim(`Response: ${response.substring(0, 200)}...`);
      throw new Error('Invalid response from Gemini');
    }
  }
}
