import type { BotServices } from './services.js';

declare module '@sapphire/framework' {
  interface Preconditions {
    Authorized: never;
  }

  interface Container {
    sufbot: BotServices;
  }
}

export {};
