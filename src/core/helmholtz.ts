import { Readable } from 'stream';
import Discord from 'discord.js';
import { TextToSpeech, GoogleCloudTextToSpeech } from './tts';
import type Logger from 'bunyan';

export type HelmholtzConfig = {
  readonly discord: {
    readonly token: string;
    readonly guildId: string;
    readonly sourceChannelId: string;
  };
  readonly logger?: Logger;
};

export class Helmholtz {
  #tts: TextToSpeech;
  #discord?: Discord.Client;
  #discordConfig: HelmholtzConfig['discord'];
  #audioStream: Readable;
  #logger?: Logger;

  constructor(config: HelmholtzConfig) {
    this.#tts = new GoogleCloudTextToSpeech();
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    this.#audioStream = new Readable({ read: () => {} });
    this.#discordConfig = config.discord;
    this.#logger = config.logger;
  }

  start(): void {
    this.#discord?.destroy();

    const discordClient = new Discord.Client({
      messageCacheMaxSize: 20,
      messageSweepInterval: 30,
      retryLimit: 3,
    });

    discordClient.on('voiceStateUpdate', (oldState, newState) => {
      try {
        this.handleVoiceStateUpdate(oldState, newState);
      } catch (e) {
        this.#logger?.error({
          helmholtzMessage: 'cannot handle voiceStateUpdate event',
          error: e,
        });
      }
    });

    discordClient.on('message', (message) => {
      this.handleMessage(message).catch((e) => {
        this.#logger?.error({
          helmholtzMessage: 'cannot handle message event',
          error: e,
        });
      });
    });

    discordClient.on('warn', (info) => {
      this.#logger?.warn({
        helmholtzMessage: 'warning',
        info,
      });
    });

    discordClient.on('error', (e) => {
      this.#logger?.error({
        helmholtzMessage: 'error',
        error: e,
      });
    });

    discordClient.once('ready', () => {
      this.#logger?.info({
        helmholtzMessage: 'Helmholtz is ready',
      });
    });

    discordClient
      .login(this.#discordConfig.token)
      .then(() => {
        this.#logger?.info({
          helmholtzMessage: 'login succeeded',
        });
      })
      .catch((e) => {
        this.#logger?.error({
          helmholtzMessage: 'login failed',
          error: e,
        });

        throw e;
      });

    this.#discord = discordClient;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  handleVoiceStateUpdate(oldState: Discord.VoiceState, newState: Discord.VoiceState): void {
    if (!this.#discord) {
      return;
    }

    const guildId = this.#discordConfig.guildId;
    const conn = this.#discord.voice?.connections?.get(guildId);
    const activeMembers = conn?.channel.members.array() || [];

    // disconnect if there is only Helmholtz in VoiceChannel
    if (activeMembers.length < 2) {
      conn?.disconnect();
      return;
    }

    // warm up TTS connection.
    // TTS may respond faster.
    this.#tts.warmup();
  }

  async handleMessage(message: Discord.Message): Promise<void> {
    if (!this.#discord) {
      return;
    }

    const helmholtzGuildId = this.#discordConfig.guildId;
    const helmholtzTextChannelId = this.#discordConfig.sourceChannelId;

    const guild = message.guild;
    const voice = message.member?.voice;
    const voiceChannel = voice?.channel;
    const messageChannel = message.channel;

    // do nothing if we cannot get a voice channel.
    // Note: In most cases, the message sender is not in any voice channel.
    if (!voiceChannel) {
      return;
    }

    const channelMembers = voiceChannel.members;

    // do nothing if message is sent from different server.
    if (!guild || guild.id !== this.#discordConfig.guildId) {
      this.#logger?.warn({
        helmholtzMessage: 'discord guild server mismatch',
        helmholtzGuild: this.#discordConfig.guildId,
        messageGuildId: guild?.id,
      });
      return;
    }

    // do nothing if a message is in another channel.
    if (messageChannel.id !== helmholtzTextChannelId) {
      return;
    }

    // do nothing if a message sender is not self-muted.
    if (!voice?.selfMute) {
      return;
    }

    // do nothing if no one is in a channel.
    if (channelMembers.array().length < 1) {
      return;
    }

    // some filters
    const text = message.content
      .replace(/https?:\/\/\S+/g, '') // remove URLs(annoying)
      .replace(/<a?:.*?:\d+>/g, '') // remove custom emojis(annoying)
      .slice(0, 50); // up to 50 characters

    // do nothing if text is empty
    if (!text) {
      return;
    }

    const currentHelmholtzConn = this.#discord.voice?.connections.get(helmholtzGuildId);
    const shouldMove = !currentHelmholtzConn || currentHelmholtzConn.channel.id !== voiceChannel.id;

    if (!currentHelmholtzConn || shouldMove) {
      await this.moveToVoiceChannel(voiceChannel);
    }

    // genarate audio and push it to stream
    try {
      const speechData = await this.#tts.synthesize(text);
      if (speechData && speechData.length > 0) {
        this.#audioStream.push(speechData);
      } else {
        this.#logger?.warn({
          helmholtzMessage: 'empty audio emitted on text-to-speech service',
          originalMessageLength: message.content.length,
          filteredMessageLength: text.length,
        });
      }
    } catch (e) {
      this.#logger?.error({
        helmholtzMessage: 'error on text-to-speech service',
        error: e,
      });
    }
  }

  async moveToVoiceChannel(channel: Discord.VoiceChannel): Promise<Discord.VoiceConnection | undefined> {
    if (!this.#discord) {
      return;
    }

    const helmholtzGuildId = this.#discordConfig.guildId;
    const currentHelmholtzConn = this.#discord.voice?.connections.get(helmholtzGuildId);

    // move to the channel
    currentHelmholtzConn?.disconnect();
    const conn = await channel.join();

    // reconnect audio stream
    conn.play(this.#audioStream, {
      type: 'ogg/opus', // depends on ./tts.ts
      highWaterMark: 6, // default is 12
      bitrate: 96,
      fec: true, // enable forward error correction
      volume: false, // discord.js doc says set this false improve perf.
    });

    return conn;
  }

  async destroy(): Promise<void> {
    this.#discord?.destroy();
    await this.#tts.close();
  }
}
