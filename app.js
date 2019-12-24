const Discord = require("discord.js");
const textToSpeech = require('@google-cloud/text-to-speech');

// 環境変数
const {
  DISCORD_TOKEN,
  DISCORD_GUILD_ID,
  DISCORD_CHANNEL_ID,
  DISCORD_SOURCE_CHANNEL_ID,
  GOOGLE_CLIENT_EMAIL,
  GOOGLE_PRIVATE_KEY
} = process.env;

let lacksEnv = false;

if(!DISCORD_TOKEN) {
  lacksEnv = true;
  console.error('env variable not found: DISCORD_TOKEN');
}

if(!DISCORD_GUILD_ID) {
  lacksEnv = true;
  console.error('env variable not found: DISCORD_GUILD_ID');
}

if(!DISCORD_CHANNEL_ID) {
  lacksEnv = true;
  console.error('env variable not found: DISCORD_CHANNEL_ID');
}

if(!DISCORD_SOURCE_CHANNEL_ID) {
  lacksEnv = true;
  console.error('env variable not found: DISCORD_SOURCE_CHANNEL_ID');
}

if(!GOOGLE_CLIENT_EMAIL) {
  lacksEnv = true;
  console.error('env variable not found: GOOGLE_CLIENT_EMAIL');
}

if(!GOOGLE_PRIVATE_KEY) {
  lacksEnv = true;
  console.error('env variable not found: GOOGLE_PRIVATE_KEY');
}

if(lacksEnv) {
  process.exit(1);
}

// テキスト → base64(mp3)
// Cloud Text-to-Speech APIを使用
async function textToSpeechBase64(text) {
  const request = {
    input: {text},
    voice: {languageCode: 'ja'},
    audioConfig: {audioEncoding: 'MP3'}
  };

  const [response] = await client.synthesizeSpeech(request);
  const buffer = Buffer.from(response.audioContent);
  return `data:audio/mpeg;base64,${buffer.toString('base64')}`;
}

const client = new textToSpeech.TextToSpeechClient({
  credentials: {
    client_email: GOOGLE_CLIENT_EMAIL,
    private_key: GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n')
  }
});

(async function main() {
  const discordClient = new Discord.Client();

  // ヘルムホルツだけになったらチャンネルから落ちる
  discordClient.on('voiceStateUpdate', (oldMember, newMember) => {
    const conn = discordClient.voiceConnections.get(DISCORD_GUILD_ID);
    if(conn && conn.channel && conn.channel.members.array().length < 2) {
      conn.disconnect();
    }
  });

  // ソースとなるテキストチャンネルで発言があった場合、
  // ボイスチャンネルに参加して発言する
  discordClient.on('message', async (message) => {
    const guild = message.guild;
    const channel = message.member.voiceChannel;
    if(
      guild.id !== DISCORD_GUILD_ID ||
      (!channel || channel.id !== DISCORD_CHANNEL_ID) ||
      message.channel.id !== DISCORD_SOURCE_CHANNEL_ID
    ) {
      return;
    }

    // 誰もいなかったら参加しない
    if(channel.members.array().length < 1) { return; }
    
    const conn = discordClient.voiceConnections.get(DISCORD_GUILD_ID) || await channel.join();
    const text = message.content.slice(0, 50);

    conn.playArbitraryInput(await textToSpeechBase64(text), {passes: 3, bitrate: 'auto'});
  });

  discordClient.once('ready', () => {
    console.log('Connected to Discord successfully!');
  });

  discordClient.login(DISCORD_TOKEN);
})();
