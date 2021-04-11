import { TextToSpeechClient } from '@google-cloud/text-to-speech';

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
  synthesize: (text: string) => Promise<Uint8Array | null | undefined>;

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
    // when calling any method for the fiest time.
    return this.#ttsClient.initialize().then(() => undefined);
  }

  async synthesize(text: string): Promise<Uint8Array | null | undefined> {
    const request = {
      input: { text },
      voice: {
        languageCode: 'ja-JP',
        name: 'ja-JP-Wavenet-A',
      },
      audioConfig: {
        audioEncoding: 'OGG_OPUS',
        speakingRate: 1.2,
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
