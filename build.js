import * as esbuild from 'esbuild';

await esbuild.build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  external: [
    '@google-cloud/firestore',
    '@google-cloud/text-to-speech',
    '@google-cloud/logging-bunyan',
    'discord.js',
    '@discordjs/opus',
    '@discordjs/voice',
    'dtrace-provider',
  ],
  outfile: 'dist/helmholtz.cjs',
});
