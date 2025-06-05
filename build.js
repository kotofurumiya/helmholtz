import * as esbuild from 'esbuild';

await esbuild.build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'cjs',
  external: [
    '@google-cloud/firestore',
    '@google-cloud/text-to-speech',
    'discord.js',
    '@discordjs/opus',
    '@discordjs/voice',
    'dtrace-provider',
  ],
  outfile: 'dist/helmholtz.cjs',
});
