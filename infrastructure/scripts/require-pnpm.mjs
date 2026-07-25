const userAgent = process.env.npm_config_user_agent ?? '';

if (!userAgent.startsWith('pnpm/')) {
  console.error('SufBot uses pnpm. Run `corepack enable` and then `pnpm install`.');
  process.exit(1);
}
