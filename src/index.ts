import { getEnvsOrExit } from './core/envs';
import { createLogger, LogLevels } from './core/logger';
import { Helmholtz, HelmholtzConfig } from './core/helmholtz';
import { GoogleCloudTextToSpeech } from './core/tts';

const requiredEnvs = ['DISCORD_TOKEN', 'DISCORD_GUILD_ID', 'DISCORD_SOURCE_CHANNEL_ID'] as const;
const envs = getEnvsOrExit(requiredEnvs);

const discord = {
  token: envs.DISCORD_TOKEN,
  guildId: envs.DISCORD_GUILD_ID,
  sourceChannelId: envs.DISCORD_SOURCE_CHANNEL_ID,
};

const ttsClient = new GoogleCloudTextToSpeech();
const syncWithFirestore =
  !!process.env.ENABLE_SYNC_WITH_FIRESTORE && process.env.ENABLE_SYNC_WITH_FIRESTORE.toLowerCase() !== 'false';

const logger = createLogger({
  loglevel: LogLevels.INFO,
});

const config: HelmholtzConfig = {
  discord,
  ttsClient,
  logger,
  syncWithFirestore,
};

const helmholtz = new Helmholtz(config);

process.on('uncaughtException', async (error) => {
  logger?.error({ error });
  await helmholtz
    .destroy({
      reason: 'uncaughtException',
      error,
    })
    .catch(() => undefined);
  process.exit(1);
});

process.on('unhandledRejection', async (error) => {
  logger?.error({ error });
  await helmholtz
    .destroy({
      reason: 'uncaughtException',
      error,
    })
    .catch(() => undefined);
  process.exit(1);
});

process.on('exit', () => {
  helmholtz
    .destroy({
      reason: 'exit',
    })
    .catch(() => undefined);
});

process.on('SIGTERM', () => {
  helmholtz
    .destroy({
      reason: 'SIGTERM',
    })
    .catch(() => undefined);
});

helmholtz.start();
