// Database types
export interface Source {
  id: number;
  type: 'liked' | 'playlist';
  name: string;
  youtube_id: string | null;
  last_synced: string | null;
  created_at: string;
}

export interface Song {
  id: string;
  title: string;
  artist: string | null;
  source_id: number | null;
  added_at: string;
  ai_processed: boolean;
}

export interface Category {
  id: number;
  song_id: string;
  type: string;
  value: string;
  confidence: number;
  created_at: string;
}

export interface Playlist {
  id: string;
  name: string;
  youtube_playlist_id: string | null;
  category_type: string;
  category_value: string;
  created_at: string;
  updated_at: string;
}

export interface SongWithCategories extends Song {
  categories: Category[];
}

export interface SourceWithStats extends Source {
  song_count: number;
}

// Analysis types
export type AnalysisType = 'mood' | 'genre' | 'energy' | 'all';
