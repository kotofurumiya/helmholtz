const Discord = require("discord.js");
const textToSpeech = require('@google-cloud/text-to-speech');
const { Readable } = require('stream');

// 環境変数

const envs = [
  'DISCORD_TOKEN',
  'DISCORD_GUILD_ID',
  'DISCORD_SOURCE_CHANNEL_ID',
  'GOOGLE_CLIENT_EMAIL',
  'GOOGLE_PRIVATE_KEY'
];

let lacksEnv = false;
for(const envName of envs) {
  if(!process.env[envName]) {
    lacksEnv = true;
    console.error(`env variable not found: ${envName}`);
  }
}

if(lacksEnv) {
  process.exit(1);
}

const {
  DISCORD_TOKEN,
  DISCORD_GUILD_ID,
  DISCORD_SOURCE_CHANNEL_ID,
  GOOGLE_CLIENT_EMAIL,
  GOOGLE_PRIVATE_KEY
} = process.env;

// テキスト → ReadableStream
// Cloud Text-to-Speech APIを使用
async function textToSpeechReadableStream(text) {
  const request = {
    input: {text},
    voice: {
      languageCode: 'ja-JP',
      name: 'ja-JP-Wavenet-A'
    },
    audioConfig: {
      audioEncoding: 'OGG_OPUS',
      speakingRate: 1.2
    }
  };

  const [response] = await client.synthesizeSpeech(request);
  const stream = new Readable({ read() {} });
  stream.push(response.audioContent);

  return stream;
}

const client = new textToSpeech.TextToSpeechClient({
  credentials: {
    client_email: GOOGLE_CLIENT_EMAIL,
    private_key: GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n')
  }
});

(async function main() {
  const discordClient = new Discord.Client({
    messageCacheMaxSize: 20,
    messageSweepInterval: 30
  });

  // ヘルムホルツだけになったらチャンネルから落ちる
  discordClient.on('voiceStateUpdate', (oldState, newState) => {
    const conn = discordClient.voice.connections.get(DISCORD_GUILD_ID);
    if(conn && conn.channel && conn.channel.members.array().length < 2) {
      conn.disconnect();
    }
  });

  // ソースとなるテキストチャンネルで発言があった場合、
  // ボイスチャンネルに参加して発言する
  discordClient.on('message', async (message) => {
    const guild = message.guild;
    const channel = message.member.voice.channel;

    // ミュートの人の特定テキストチャンネルの発言だけ拾う
    if(
      !message.member.voice.selfMute || guild.id !== DISCORD_GUILD_ID || 
      !channel || message.channel.id !== DISCORD_SOURCE_CHANNEL_ID
    ) {
      return;
    }

    const text = message
        .content
        .replace(/https?:\/\/\S+/g, '')
        .replace(/<a?:.*?:\d+>/g, '')   // カスタム絵文字を除去
        .slice(0, 50);

    // テキストが空なら何もしない
    if(!text) { return; }

    // 誰もいなかったら参加しない
    if(channel.members.array().length < 1) { return; }

    // 発言者の参加チャンネルが、
    // 今のヘルムホルツ参加チャンネルと違うなら移動する
    const currentConnection = discordClient.voice.connections.get(DISCORD_GUILD_ID);
    const shouldMove = !currentConnection || currentConnection.channel.id !== channel.id;
    const conn = shouldMove ? await channel.join() : currentConnection;

    conn.play(await textToSpeechReadableStream(text), {highWaterMark: 6, bitrate: 'auto'});
  });

  discordClient.once('ready', () => {
    console.log('Connected to Discord successfully!');
  });

  discordClient.login(DISCORD_TOKEN);
})().catch((e) => console.error(e));