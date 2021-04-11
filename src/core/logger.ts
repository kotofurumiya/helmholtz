import bunyan from 'bunyan';
import { LoggingBunyan } from '@google-cloud/logging-bunyan';

export type HelmholtzLoggerOptions = {
  readonly name: string;
  readonly enableCloudLogging?: boolean;
};

export const createLogger = (options: HelmholtzLoggerOptions): bunyan => {
  // log -> info, warn, error, fatal
  // don't -> trace, debug
  const streams: bunyan.Stream[] = [{ stream: process.stdout, level: 'info' }];

  if (options.enableCloudLogging) {
    const loggingBunyan = new LoggingBunyan();
    streams.push(loggingBunyan.stream('info'));
  }

  return bunyan.createLogger({
    name: options.name,
    streams,
  });
};
