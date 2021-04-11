import fetch from 'node-fetch';
import { getEnvsOrExit } from '../src/core/envs';
import { helmholtzCommand } from './slash_commands';

const requiredEnvs = ['DISCORD_TOKEN', 'DISCORD_APPLICATION_ID', 'DISCORD_GUILD_ID'] as const;
const envs = getEnvsOrExit(requiredEnvs);
const endpoint = `https://discord.com/api/v8/applications/${envs.DISCORD_APPLICATION_ID}/guilds/${envs.DISCORD_GUILD_ID}/commands`;

(async function main() {
  const response = await fetch(endpoint, {
    method: 'post',
    body: JSON.stringify(helmholtzCommand),
    headers: {
      Authorization: `Bot ${envs.DISCORD_TOKEN}`,
      'Content-Type': 'application/json',
    },
  });

  const json = await response.json();

  console.log(JSON.stringify(json, null, 2));
})();
