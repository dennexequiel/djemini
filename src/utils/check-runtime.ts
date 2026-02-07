import chalk from 'chalk';

export function checkRuntime(): void {
  // @ts-ignore - Bun global
  if (typeof Bun === 'undefined') {
    console.error('');
    console.error(chalk.red.bold('❌ Bun is required to run djemini'));
    console.error('');
    console.error(chalk.gray("This project uses Bun's native SQLite and TypeScript runtime."));
    console.error('');
    console.error(chalk.cyan('Install Bun:'));
    console.error(chalk.white('  curl -fsSL https://bun.sh/install | bash'));
    console.error('');
    console.error(chalk.dim('Or visit: https://bun.sh'));
    console.error('');
    process.exit(1);
  }
}
