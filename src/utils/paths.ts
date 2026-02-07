import * as fs from 'fs';
import * as path from 'path';
import { PATHS } from './constants';

export class AppPaths {
  private static dataDir: string;

  static getDataDir(): string {
    if (!this.dataDir) {
      this.dataDir = path.join(process.cwd(), PATHS.DATA_DIR);
      if (!fs.existsSync(this.dataDir)) {
        fs.mkdirSync(this.dataDir, { recursive: true });
      }
    }
    return this.dataDir;
  }

  static getTokenPath(): string {
    return path.join(this.getDataDir(), PATHS.TOKEN_FILE);
  }

  static getDbPath(): string {
    return path.join(this.getDataDir(), PATHS.DB_FILE);
  }
}
