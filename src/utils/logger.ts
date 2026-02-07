import chalk from 'chalk';

export const logger = {
  info: (message: string) => console.info(chalk.blue(message)),
  success: (message: string) => console.info(chalk.green(message)),
  warn: (message: string) => console.warn(chalk.yellow(message)),
  error: (message: string) => console.error(chalk.red(message)),
  dim: (message: string) => console.info(chalk.dim(message)),
  log: (message: string) => console.log(message),
};
