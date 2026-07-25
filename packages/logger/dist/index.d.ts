import pino, { Logger } from 'pino';
export { Logger } from 'pino';

type LoggerBindings = {
    app: 'api' | 'bot' | 'web' | 'worker' | 'database' | 'test';
    environment: string;
    version?: string;
};
declare const createLogger: (bindings: LoggerBindings, options?: {
    level?: string;
    pretty?: boolean;
    destination?: pino.DestinationStream;
}) => Logger;

export { type LoggerBindings, createLogger };
