import { TextToSpeechClient } from '@google-cloud/text-to-speech';
import { Logger } from './logger';

export type SynthesizeOptions = {
  voiceGender?: 'male' | 'female';
  voicePitch?: number;
};

export type TextToSpeech = {
  /**
   * Warm up a CloudTTS client.
   * This may improve very first response.
   * @returns Promise<void>
   */
  warmup: () => Promise<void>;

  /**
   * Synthesize `text` and return Promise with audio data.
   * @param text - Text to speech, clamped to max 50 characters.
   * @returns Promise\<Uint8Array | null | undefined\>
   */
  synthesize: (text: string, options?: SynthesizeOptions) => Promise<Uint8Array | null | undefined>;

  close: () => Promise<void>;
};

export type GoogleCloudTextToSpeechConfig = {
  readonly credentials?: {
    readonly client_email: string;
    readonly private_key: string;
  };
};

export class GoogleCloudTextToSpeech implements TextToSpeech {
  #ttsClient: TextToSpeechClient;

  constructor(config: GoogleCloudTextToSpeechConfig = {}) {
    const credentials = config.credentials;
    this.#ttsClient = new TextToSpeechClient({ credentials });
  }

  async warmup(): Promise<void> {
    // initialize() is called automatically
    // when calling any method for the first time.
    return this.#ttsClient.initialize().then(() => undefined);
  }

  async synthesize(text: string, options: SynthesizeOptions = {}): Promise<Uint8Array | null | undefined> {
    const voiceName = options.voiceGender === 'male' ? 'ja-JP-Wavenet-C' : 'ja-JP-Wavenet-A';
    const voicePitch = options.voicePitch ?? 0.0;

    const request = {
      input: { text },
      voice: {
        languageCode: 'ja-JP',
        name: voiceName,
      },
      audioConfig: {
        audioEncoding: 'OGG_OPUS',
        speakingRate: 1.2,
        pitch: voicePitch,
      },
    } as const;

    const [response] = await this.#ttsClient.synthesizeSpeech(request);
    const audioContent = response.audioContent;

    // if audioContent is base64 string
    if (typeof audioContent === 'string') {
      const decoded = new Uint8Array(Buffer.from(audioContent, 'base64').buffer);
      return decoded;
    }

    return audioContent;
  }

  async close(): Promise<void> {
    await this.#ttsClient.close();
  }
}

export class FakeTextToSpeech implements TextToSpeech {
  #logger?: Logger;

  constructor(options: { logger?: Logger } = {}) {
    this.#logger = options.logger;
  }

  async warmup(): Promise<void> {
    this.#logger?.debug({
      msg: 'FakeTextToSpeech: warmup()',
    });
  }

  async synthesize(text: string, options: SynthesizeOptions = {}): Promise<Uint8Array | null | undefined> {
    this.#logger?.debug({
      msg: 'FakeTextToSpeech: synthesize()',
      text,
      options,
    });

    return;
  }

  async close(): Promise<void> {
    this.#logger?.debug({
      msg: 'FakeTextToSpeech: close()',
    });
  }
}
