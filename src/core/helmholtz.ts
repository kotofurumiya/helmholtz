import { Readable } from 'stream';
import Discord from 'discord.js';
import { TextToSpeech, GoogleCloudTextToSpeech } from './tts';
import type Logger from 'bunyan';
import { Firestore, FieldValue } from '@google-cloud/firestore';

// FIXME: remove this after discord.js supports slash commands
type DiscordSlashCommandOption = {
  readonly name: string;
  readonly type: number;
  readonly value?: string | number;
  readonly options?: DiscordSlashCommandOption[];
};

// FIXME: remove this after discord.js supports slash commands
type DiscordSlashCommand = {
  readonly id: string;
  readonly name: string;
  readonly options?: DiscordSlashCommandOption[];
};

// FIXME: remove this after discord.js supports slash commands
type DiscordInteraction = {
  readonly id: string;
  readonly application_id: string;
  readonly type: number;
  readonly token: string;
  readonly member?: {
    readonly user: {
      readonly id: string;
      readonly username: string;
      readonly avatar: string;
      readonly discriminator: string;
      readonly public_flags: number;
    };
    readonly roles: string[];
    readonly premium_since: string;
    readonly permissions: string;
    readonly pending: boolean;
    readonly nick: string;
    readonly mute: boolean;
    readonly joined_at: string;
    readonly is_pending: boolean;
    readonly deaf: boolean;
  };
  readonly guild_id: string;
  readonly data?: DiscordSlashCommand;
  readonly channel_id: string;
};

type HelmholtzUserPreferences = {
  voiceGender?: 'male' | 'female';
  voicePitch?: number;
};

export type HelmholtzConfig = {
  readonly discord: {
    readonly token: string;
    readonly guildId: string;
    readonly sourceChannelId: string;
  };
  readonly logger?: Logger;
  readonly syncWithFirestore?: boolean;
};

export class Helmholtz {
  #tts: TextToSpeech;
  #discord?: Discord.Client;
  #discordConfig: HelmholtzConfig['discord'];
  #audioStream: Readable;
  #userPreferences: Map<string, HelmholtzUserPreferences>;
  #logger?: Logger;
  #firestore?: Firestore;

  constructor(config: HelmholtzConfig) {
    this.#tts = new GoogleCloudTextToSpeech();
    this.#tts.warmup();
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    this.#audioStream = new Readable({ read: () => {} });
    this.#discordConfig = config.discord;
    this.#userPreferences = new Map();
    this.#logger = config.logger;

    // enable cloud firestore if config is set.
    if (config.syncWithFirestore) {
      this.#firestore = new Firestore();
    }
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

    // FIXME: replace ws event to client event after discord.js supports slash commands
    discordClient.ws.on('INTERACTION_CREATE' as Discord.WSEventType, async (interaction: DiscordInteraction) => {
      try {
        await this.handleInteraction(interaction);
      } catch (e) {
        this.#logger?.error({
          helmholtzMessage: 'cannot handle interaction(slash command) event',
          error: e,
        });
      }
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
      const userPref = await this.getUserPreferecnes(message.author.id);
      const voiceGender = userPref.voiceGender || 'female';
      const voicePitch = userPref.voicePitch || 1.0;

      const speechData = await this.#tts.synthesize(text, {
        voiceGender,
        voicePitch,
      });

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

  async setUserPreferences(userId: string, preferences: HelmholtzUserPreferences): Promise<boolean> {
    if (!userId) {
      return false;
    }

    const pref = await this.getUserPreferecnes(userId);
    const newPref = { ...pref, ...preferences };
    this.#userPreferences.set(userId, newPref);

    if (this.#firestore) {
      const collection = this.#firestore.collection('userPreferences');
      const doc = collection.doc(userId);
      doc.set(
        {
          ...preferences,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }

    return true;
  }

  async getUserPreferecnes(userId: string): Promise<HelmholtzUserPreferences> {
    if (!userId) {
      return {};
    }

    let pref = this.#userPreferences.get(userId);

    if (!pref && this.#firestore) {
      const collection = this.#firestore.collection('userPreferences');
      const docRef = collection.doc(userId);
      const docSnapshot = await docRef.get();
      const docData = docSnapshot.data();

      if (docData) {
        pref = docData;
        this.#userPreferences.set(userId, docData);
      }
    }

    return pref || {};
  }

  respondToInteraction(interaction: DiscordInteraction, content: string): void {
    if (this.#discord && !('api' in this.#discord)) {
      this.#logger?.warn({
        helmholtzMessage: 'unofficial discord.js api `client.api` not found. You should find another way.',
        feature: 'slash commands',
      });
      return;
    }

    // FIXME: access to internal `api` object because discord.js not supports slahs commands yet.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this.#discord as any)?.api.interactions(interaction.id, interaction.token).callback.post({
      data: {
        type: 4, // 4 = ChannelMessageWithSource
        data: {
          content,
        },
      },
    });
  }

  async handleInteraction(interaction: DiscordInteraction): Promise<void> {
    if (!this.#discord) {
      return;
    }

    const command = interaction.data;
    const subcommand = command?.options?.[0];
    const subcommandOption = subcommand?.options?.[0];
    const commandMember = interaction.member; // undefined if command is invoked in DM

    if (!commandMember) {
      this.respondToInteraction(interaction, `エラー：送信者が見つかりませんでした。`);
      return;
    }

    const memberId = commandMember.user.id;
    const memberName = commandMember.user.username;

    if (command?.name.toLocaleLowerCase() !== 'helmholtz') {
      this.respondToInteraction(interaction, `おっと！これは私への命令ではありませんね。適切に処理できません。`);
      return;
    }

    if (subcommand?.name === 'gender') {
      const voiceGender = subcommandOption?.value;

      if (voiceGender === 'male' || voiceGender === 'female') {
        const displayStr = voiceGender === 'male' ? '男性' : '女性';
        const setSuccess = await this.setUserPreferences(memberId, { voiceGender });
        if (setSuccess) {
          this.respondToInteraction(interaction, `\`${memberName}\` さんの声を \`${displayStr}\` に設定しました。`);
        } else {
          this.respondToInteraction(interaction, `エラー：\`${memberName}\` さんの声を設定できませんでした。`);
        }
        return;
      }

      this.respondToInteraction(interaction, `エラー：無効な値が指定されました。`);
      return;
    }

    if (subcommand?.name === 'pitch' && typeof subcommandOption?.value === 'number') {
      const voicePitch = Math.max(-20, Math.min(20, subcommandOption.value));

      const setSuccess = await this.setUserPreferences(memberId, { voicePitch });
      if (setSuccess) {
        this.respondToInteraction(interaction, `\`${memberName}\` さんの声の高さを \`${voicePitch}\` に設定しました。`);
      } else {
        this.respondToInteraction(interaction, `エラー：\`${memberName}\` さんの声の高さを設定できませんでした。`);
      }

      return;
    }
  }

  async destroy(): Promise<void> {
    const conn = this.#discord?.voice?.connections.get(this.#discordConfig.guildId);
    conn?.disconnect();
    this.#discord?.destroy();
    await this.#tts.close();
  }
}
