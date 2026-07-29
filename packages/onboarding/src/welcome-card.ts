import { promises as dns } from 'node:dns';
import { request } from 'node:https';
import { BlockList, isIP } from 'node:net';
import sharp, { type OverlayOptions } from 'sharp';
import type { WelcomeCardConfig } from './contracts.js';

const MAX_REMOTE_BYTES = 5 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 8 * 1024 * 1024;
const blockedAddresses = new BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  blockedAddresses.addSubnet(network, prefix, 'ipv4');
}
blockedAddresses.addAddress('::', 'ipv6');
blockedAddresses.addAddress('::1', 'ipv6');
blockedAddresses.addSubnet('fc00::', 7, 'ipv6');
blockedAddresses.addSubnet('fe80::', 10, 'ipv6');
blockedAddresses.addSubnet('ff00::', 8, 'ipv6');
blockedAddresses.addSubnet('2001:db8::', 32, 'ipv6');
blockedAddresses.addSubnet('::ffff:0:0', 96, 'ipv6');

const supportedContentTypes = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

export type WelcomeCardText = {
  title: string;
  subtitle: string;
  body: string;
  memberCount: string;
};

export type WelcomeCardInput = {
  config: WelcomeCardConfig;
  text: WelcomeCardText;
  avatar: Buffer;
  background?: Buffer;
  serverIcon?: Buffer;
};

export type GeneratedWelcomeCard = {
  buffer: Buffer;
  contentType: 'image/png' | 'image/jpeg';
  filename: 'welcome-card.png' | 'welcome-card.jpg';
};

const assertPublicAddress = (address: string, family: 4 | 6): void => {
  if (
    isIP(address) !== family ||
    blockedAddresses.check(address, family === 4 ? 'ipv4' : 'ipv6')
  ) {
    throw new TypeError('Remote image host resolved to a non-public address.');
  }
};

export const validateRemoteImageUrl = async (
  input: string,
): Promise<{ url: URL; address: string; family: 4 | 6 }> => {
  const url = new URL(input);
  if (
    url.protocol !== 'https:' ||
    url.username !== '' ||
    url.password !== '' ||
    (url.port !== '' && url.port !== '443') ||
    url.hostname.length > 253 ||
    url.hostname.toLowerCase() === 'localhost' ||
    url.hostname.toLowerCase().endsWith('.localhost')
  ) {
    throw new TypeError('Remote images require a public HTTPS URL without credentials.');
  }
  if (isIP(url.hostname) !== 0) {
    const family = isIP(url.hostname) as 4 | 6;
    assertPublicAddress(url.hostname, family);
    return { url, address: url.hostname, family };
  }
  const addresses = await dns.lookup(url.hostname, { all: true, verbatim: true });
  if (addresses.length === 0) throw new TypeError('Remote image host did not resolve.');
  for (const address of addresses) {
    if (address.family !== 4 && address.family !== 6) {
      throw new TypeError('Remote image host resolved with an unsupported address family.');
    }
    assertPublicAddress(address.address, address.family);
  }
  const selected = addresses[0];
  if (selected === undefined || (selected.family !== 4 && selected.family !== 6)) {
    throw new TypeError('Remote image host did not resolve.');
  }
  return { url, address: selected.address, family: selected.family };
};

const downloadOnce = async (
  input: string,
): Promise<{ buffer?: Buffer; redirect?: string }> => {
  const validated = await validateRemoteImageUrl(input);
  return new Promise((resolve, reject) => {
    const operation = request(
      validated.url,
      {
        headers: {
          accept: 'image/png,image/jpeg,image/webp,image/gif',
          'user-agent': 'SufBot/0.1 image-fetcher',
        },
        lookup: (_hostname, _options, callback) => {
          callback(null, validated.address, validated.family);
        },
      },
      (response) => {
        const status = response.statusCode ?? 0;
        if ([301, 302, 303, 307, 308].includes(status)) {
          const location = response.headers.location;
          response.resume();
          if (location === undefined) {
            reject(new TypeError('Remote image redirect was missing a location.'));
            return;
          }
          resolve({ redirect: new URL(location, validated.url).toString() });
          return;
        }
        if (status !== 200) {
          response.resume();
          reject(new TypeError('Remote image server returned an unsupported status.'));
          return;
        }
        const contentType = response.headers['content-type']?.split(';', 1)[0]?.toLowerCase();
        if (contentType === undefined || !supportedContentTypes.has(contentType)) {
          response.resume();
          reject(new TypeError('Remote image content type is unsupported.'));
          return;
        }
        const declaredLength = Number(response.headers['content-length'] ?? 0);
        if (declaredLength > MAX_REMOTE_BYTES) {
          response.resume();
          reject(new TypeError('Remote image exceeds the size limit.'));
          return;
        }
        const chunks: Buffer[] = [];
        let received = 0;
        response.on('data', (chunk: Buffer) => {
          received += chunk.length;
          if (received > MAX_REMOTE_BYTES) {
            operation.destroy(new TypeError('Remote image exceeds the size limit.'));
            return;
          }
          chunks.push(chunk);
        });
        response.once('end', () => resolve({ buffer: Buffer.concat(chunks) }));
      },
    );
    operation.setTimeout(5_000, () =>
      operation.destroy(new TypeError('Remote image request timed out.')),
    );
    operation.once('error', reject);
    operation.end();
  });
};

export const fetchSafeRemoteImage = async (input: string): Promise<Buffer> => {
  let current = input;
  for (let redirects = 0; redirects <= 2; redirects += 1) {
    const result = await downloadOnce(current);
    if (result.buffer !== undefined) {
      const metadata = await sharp(result.buffer, {
        limitInputPixels: 16_777_216,
        animated: false,
      }).metadata();
      if (
        metadata.width === undefined ||
        metadata.height === undefined ||
        metadata.width < 1 ||
        metadata.height < 1 ||
        metadata.width > 4096 ||
        metadata.height > 4096 ||
        metadata.width * metadata.height > 16_777_216
      ) {
        throw new TypeError('Remote image dimensions are unsupported.');
      }
      return result.buffer;
    }
    if (result.redirect === undefined || redirects === 2) {
      throw new TypeError('Remote image redirect limit exceeded.');
    }
    current = result.redirect;
  }
  throw new TypeError('Remote image could not be downloaded.');
};

const xml = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');

const color = (value: number): string => `#${value.toString(16).padStart(6, '0')}`;
const clipped = (value: string, maximum: number): string =>
  [...value].length <= maximum ? value : `${[...value].slice(0, maximum - 1).join('')}…`;

export const generateWelcomeCard = async (
  input: WelcomeCardInput,
): Promise<GeneratedWelcomeCard> => {
  const { config } = input;
  const base =
    input.background === undefined
      ? await sharp({
          create: {
            width: config.width,
            height: config.height,
            channels: 4,
            background: color(config.accentColor),
          },
        })
          .png()
          .toBuffer()
      : await sharp(input.background, { limitInputPixels: 16_777_216 })
          .rotate()
          .resize(config.width, config.height, {
            fit: config.backgroundFit === 'COVER' ? 'cover' : 'contain',
            position: config.backgroundPosition.toLowerCase() as
              | 'center'
              | 'top'
              | 'bottom'
              | 'left'
              | 'right',
            background: color(config.accentColor),
          })
          .png()
          .toBuffer();
  const avatarMask =
    config.avatarShape === 'CIRCLE'
      ? `<svg width="${config.avatarSize}" height="${config.avatarSize}"><circle cx="${
          config.avatarSize / 2
        }" cy="${config.avatarSize / 2}" r="${config.avatarSize / 2}" fill="white"/></svg>`
      : `<svg width="${config.avatarSize}" height="${config.avatarSize}"><rect width="${
          config.avatarSize
        }" height="${config.avatarSize}" rx="28" fill="white"/></svg>`;
  const avatar = await sharp(input.avatar, { limitInputPixels: 16_777_216 })
    .rotate()
    .resize(config.avatarSize, config.avatarSize, { fit: 'cover' })
    .composite([{ input: Buffer.from(avatarMask), blend: 'dest-in' }])
    .png()
    .toBuffer();
  const avatarX = Math.max(40, Math.round(config.height * 0.16));
  const avatarY = Math.round((config.height - config.avatarSize) / 2);
  const textX =
    config.textAlignment === 'CENTER'
      ? Math.round(config.width / 2)
      : config.textAlignment === 'RIGHT'
        ? config.width - 70
        : avatarX + config.avatarSize + 70;
  const anchor =
    config.textAlignment === 'CENTER'
      ? 'middle'
      : config.textAlignment === 'RIGHT'
        ? 'end'
        : 'start';
  const family =
    config.font === 'SERIF'
      ? 'Georgia, serif'
      : config.font === 'MONO'
        ? 'Consolas, monospace'
        : 'Arial, sans-serif';
  const borderShape =
    config.avatarShape === 'CIRCLE'
      ? `<circle cx="${avatarX + config.avatarSize / 2}" cy="${
          avatarY + config.avatarSize / 2
        }" r="${config.avatarSize / 2 + config.avatarBorderWidth}" fill="${color(
          config.avatarBorderColor,
        )}"/>`
      : `<rect x="${avatarX - config.avatarBorderWidth}" y="${
          avatarY - config.avatarBorderWidth
        }" width="${config.avatarSize + config.avatarBorderWidth * 2}" height="${
          config.avatarSize + config.avatarBorderWidth * 2
        }" rx="32" fill="${color(config.avatarBorderColor)}"/>`;
  const overlay = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${config.width}" height="${config.height}">
      <rect width="100%" height="100%" fill="#000" opacity="${config.overlayOpacity}"/>
      ${borderShape}
      <g font-family="${family}" fill="${color(config.textColor)}" text-anchor="${anchor}">
        <text x="${textX}" y="${Math.round(config.height * 0.28)}" font-size="38" font-weight="800"
          letter-spacing="5">${xml(clipped(input.text.title, 40))}</text>
        <text x="${textX}" y="${Math.round(config.height * 0.45)}" font-size="52" font-weight="700">
          ${xml(clipped(input.text.subtitle, 36))}</text>
        <text x="${textX}" y="${Math.round(config.height * 0.61)}" font-size="28">
          ${xml(clipped(input.text.body, 70))}</text>
        <text x="${textX}" y="${Math.round(config.height * 0.75)}" font-size="24" opacity="0.9">
          ${xml(clipped(input.text.memberCount, 50))}</text>
      </g>
    </svg>`,
  );
  const composites: OverlayOptions[] = [
    { input: overlay, top: 0, left: 0 },
    { input: avatar, top: avatarY, left: avatarX },
  ];
  if (config.showServerIcon && input.serverIcon !== undefined) {
    const iconSize = Math.max(48, Math.min(96, Math.round(config.height * 0.16)));
    const icon = await sharp(input.serverIcon, { limitInputPixels: 16_777_216 })
      .rotate()
      .resize(iconSize, iconSize, { fit: 'cover' })
      .png()
      .toBuffer();
    composites.push({ input: icon, top: 28, left: config.width - iconSize - 28 });
  }
  const composed = sharp(base).composite(composites);
  const buffer =
    config.format === 'JPEG'
      ? await composed.jpeg({ quality: config.quality, mozjpeg: true }).toBuffer()
      : await composed.png({ compressionLevel: 9 }).toBuffer();
  if (buffer.length > MAX_OUTPUT_BYTES) throw new TypeError('Generated welcome card is too large.');
  return config.format === 'JPEG'
    ? { buffer, contentType: 'image/jpeg', filename: 'welcome-card.jpg' }
    : { buffer, contentType: 'image/png', filename: 'welcome-card.png' };
};
