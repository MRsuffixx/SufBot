import nextVitals from 'eslint-config-next/core-web-vitals';
import { baseConfig } from './base.mjs';

export const nextConfig = [...baseConfig, ...nextVitals];

