import { Readable } from 'stream';
import Discord, {
  ChatInputCommandInteraction,
  Events,
  GatewayIntentBits,
  Interaction,
  Options,
  VoiceBasedChannel,
} from 'discord.js';
import { TextToSpeech } from './tts';
import type Logger from 'bunyan';
import { Firestore, FieldValue } from '@google-cloud/firestore';
import {
  AudioPlayer,
  StreamType,
  VoiceConnection,
  createAudioPlayer,
  createAudioResource,
  getVoiceConnection,
  joinVoiceChannel,
} from '@discordjs/voice';

type HelmholtzUserPreferences = {
  voiceGender?: 'male' | 'female';
  voicePitch?: number;
};

export type HelmholtzConfig = {
  readonly discord?: {
    readonly token: string;
    readonly guildId: string;
    readonly sourceChannelId: string;
  };
  readonly ttsClient: TextToSpeech;
  readonly logger?: Logger;
  readonly syncWithFirestore?: boolean;
};

type DestroyContext = {
  reason?: string;
  error?: unknown;
};

export class Helmholtz {
  #tts: TextToSpeech;
  #discord?: Discord.Client;
  #discordConfig: HelmholtzConfig['discord'];
  #audioPlayer: AudioPlayer;
  #userPreferences: Map<string, HelmholtzUserPreferences>;
  #logger?: Logger;
  #firestore?: Firestore;

  constructor(config: HelmholtzConfig) {
    this.#tts = config.ttsClient;
    this.#tts.warmup();
    this.#audioPlayer = createAudioPlayer();
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

    if (!this.#discordConfig) {
      this.#logger?.debug({
        helmholtzMessage: 'helmholtz does not connect to discord, since cannot detect any config',
      });
      return;
    }

    const discordClient = new Discord.Client({
      rest: {
        retries: 3,
      },
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.MessageContent,
      ],
      makeCache: Options.cacheWithLimits({
        ...Options.DefaultMakeCacheSettings,
        MessageManager: 20,
      }),
      sweepers: {
        ...Options.DefaultSweeperSettings,
        messages: {
          interval: 300,
          lifetime: 30,
        },
      },
    });

    discordClient.on(Events.VoiceStateUpdate, (oldState, newState) => {
      try {
        this.handleVoiceStateUpdate(oldState, newState);
      } catch (e) {
        this.#logger?.error({
          helmholtzMessage: 'cannot handle voiceStateUpdate event',
          error: e,
        });
      }
    });

    discordClient.on(Events.MessageCreate, (message) => {
      this.handleMessage(message).catch((e) => {
        this.#logger?.error({
          helmholtzMessage: 'cannot handle message event',
          error: e,
        });
      });
    });

    discordClient.on(Events.InteractionCreate, async (interaction) => {
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

  getCurrentVoiceChannel(): [VoiceBasedChannel, VoiceConnection] | [] {
    if (!this.#discord || !this.#discordConfig) {
      return [];
    }

    const guildId = this.#discordConfig.guildId;
    const guild = this.#discord.guilds.cache.get(guildId);
    const guildUser = guild?.members.me;

    const chan = guildUser?.voice.channel;
    const conn = getVoiceConnection(guildId);

    if (!chan || !conn) {
      return [];
    }

    return [chan, conn] || [];
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  handleVoiceStateUpdate(oldState: Discord.VoiceState, newState: Discord.VoiceState): void {
    if (!this.#discord || !this.#discordConfig) {
      return;
    }

    // do nothing if message is sent from different server.
    if (!newState.guild || newState.guild.id !== this.#discordConfig.guildId) {
      this.#logger?.warn({
        helmholtzMessage: 'discord guild server mismatch',
        helmholtzGuild: this.#discordConfig.guildId,
        messageGuildId: newState.guild?.id,
      });
      return;
    }

    const isStartChat = !oldState.channelId && !!newState.channelId;

    if (isStartChat) {
      const chan = this.#discord.channels.cache.get(this.#discordConfig.sourceChannelId);
      if (chan?.isTextBased()) {
        const text = `${newState.member?.toString()} が ${newState.channel?.toString()} に参加しました！`;
        chan.send(text);
      }
    }

    const [voiceChan, voiceConn] = this.getCurrentVoiceChannel();
    const activeMembers = voiceChan?.members || new Map();

    // disconnect if there is only Helmholtz in VoiceChannel
    if (activeMembers.size < 2) {
      voiceConn?.disconnect();
      return;
    }

    // warm up TTS connection.
    // TTS may respond faster.
    this.#tts.warmup();
  }

  async handleMessage(message: Discord.Message): Promise<void> {
    if (!this.#discord || !this.#discordConfig) {
      return;
    }

    const helmholtzGuildId = this.#discordConfig.guildId;
    const helmholtzTextChannelId = this.#discordConfig.sourceChannelId;

    const guild = message.guild;
    const voice = message.member?.voice;
    const voiceChannel = voice?.channel;
    const messageChannel = message.channel;
    const helmholtzGuildUser = guild?.members.me;

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
    if (channelMembers.size < 1) {
      return;
    }

    // do nothing if message is sent by self
    if (message.author.id === helmholtzGuildUser?.id) {
      return;
    }

    // some filters
    const text = message.content
      .replace(/https?:\/\/\S+/g, '') // remove URLs(annoying)
      .replace(/<a?:.*?:\d+>/g, '') // remove custom emojis(annoying)
      .slice(0, 80); // up to 80 characters

    // do nothing if text is empty
    if (!text) {
      return;
    }

    const currentHelmholtzConn = getVoiceConnection(helmholtzGuildId);
    const shouldMove = !currentHelmholtzConn || currentHelmholtzConn.joinConfig.channelId !== voiceChannel.id;

    if (!currentHelmholtzConn || shouldMove) {
      await this.moveToVoiceChannel(voiceChannel);
    }

    // genarate audio and push it to stream
    try {
      const userPref = await this.getUserPreferences(message.author.id);
      const voiceGender = userPref.voiceGender || 'female';
      const voicePitch = userPref.voicePitch ?? 0.0;

      const speechData = await this.#tts.synthesize(text, {
        voiceGender,
        voicePitch,
      });

      if (speechData && speechData.length > 0) {
        const audio = createAudioResource(Readable.from(speechData), {
          inputType: StreamType.OggOpus,
        });
        this.#audioPlayer.play(audio);
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

  async moveToVoiceChannel(channel: Discord.VoiceBasedChannel): Promise<VoiceConnection | undefined> {
    if (!this.#discord || !this.#discordConfig) {
      return;
    }

    const helmholtzGuildId = this.#discordConfig.guildId;
    const currentHelmholtzConn = getVoiceConnection(helmholtzGuildId);

    // move to the channel
    currentHelmholtzConn?.disconnect();
    const conn = joinVoiceChannel({
      channelId: channel.id,
      guildId: channel.guild.id,
      adapterCreator: channel.guild.voiceAdapterCreator,
    });

    // reconnect audio stream
    conn.subscribe(this.#audioPlayer);

    return conn;
  }

  async setUserPreferences(userId: string, preferences: HelmholtzUserPreferences): Promise<boolean> {
    if (!userId) {
      return false;
    }

    const pref = await this.getUserPreferences(userId);
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

  async getUserPreferences(userId: string): Promise<HelmholtzUserPreferences> {
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

  respondToInteraction(interaction: ChatInputCommandInteraction, content: string): void {
    interaction.reply({
      content,
      ephemeral: true,
    });
  }

  async handleInteraction(interaction: Interaction): Promise<void> {
    if (!this.#discord || !interaction.isChatInputCommand() || !interaction.command) {
      return;
    }

    const command = interaction.command;
    const subcommand = interaction.options.getSubcommand();
    const commandMember = interaction.member; // undefined if command is invoked in DM

    if (!commandMember) {
      this.respondToInteraction(interaction, `エラー：送信者が見つかりませんでした。`);
      return;
    }

    const memberId = commandMember.user.id;
    const memberName = commandMember.user.username;

    if (command.name.toLocaleLowerCase() !== 'helmholtz') {
      this.respondToInteraction(interaction, `おっと！これは私への命令ではありませんね。適切に処理できません。`);
      return;
    }

    if (subcommand === 'gender') {
      const voiceGender = interaction.options.getString('voice-gender');

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

    const pitchValue = interaction.options.getInteger('value');
    if (subcommand === 'pitch' && typeof pitchValue === 'number') {
      const voicePitch = Math.max(-20, Math.min(20, pitchValue));

      const setSuccess = await this.setUserPreferences(memberId, { voicePitch });
      if (setSuccess) {
        this.respondToInteraction(interaction, `\`${memberName}\` さんの声の高さを \`${voicePitch}\` に設定しました。`);
      } else {
        this.respondToInteraction(interaction, `エラー：\`${memberName}\` さんの声の高さを設定できませんでした。`);
      }

      return;
    }
  }

  async destroy(context?: DestroyContext): Promise<void> {
    const { reason, error } = context || {};

    this.#logger?.info({
      helmholtzMessage: 'destroying helmholtz client...',
      reason,
      error,
    });

    if (this.#discordConfig) {
      const conn = getVoiceConnection(this.#discordConfig.guildId);
      conn?.disconnect();
    }

    this.#discord?.destroy();
    await this.#tts.close();

    this.#logger?.info({
      helmholtzMessage: 'helmholtz client is destroyed successfully',
    });
  }
}
