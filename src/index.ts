import { getEnvsOrExit } from './core/envs';
import { createLogger } from './core/logger';
import { Helmholtz, HelmholtzConfig } from './core/helmholtz';

const requiredEnvs = ['DISCORD_TOKEN', 'DISCORD_GUILD_ID', 'DISCORD_SOURCE_CHANNEL_ID'] as const;

const envs = getEnvsOrExit(requiredEnvs);
const logger = createLogger({
  name: 'Helmholtz',
  enableCloudLogging: !!process.env.ENABLE_CLOUD_LOGGING && process.env.ENABLE_CLOUD_LOGGING.toLowerCase() !== 'false',
});

const config: HelmholtzConfig = {
  discord: {
    token: envs.DISCORD_TOKEN,
    guildId: envs.DISCORD_GUILD_ID,
    sourceChannelId: envs.DISCORD_SOURCE_CHANNEL_ID,
  },
  logger,
};

const helmholtz = new Helmholtz(config);

process.on('uncaughtException', async (error) => {
  logger?.error(error);
  await helmholtz.destroy();
  process.exit(1);
});

process.on('unhandledRejection', async (error) => {
  logger?.error(error);
  await helmholtz.destroy();
  process.exit(1);
});

helmholtz.start();
