'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from './ui/button';

type ThemePreference = 'light' | 'dark' | 'system';

const themeOrder: readonly ThemePreference[] = ['system', 'light', 'dark'];

export function ThemeToggle() {
  const [theme, setTheme] = useState<ThemePreference>('system');

  useEffect(() => {
    const stored = window.localStorage.getItem('sufbot-theme');
    const preference: ThemePreference =
      stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
    document.documentElement.dataset.theme = preference;
    setTheme(preference);
  }, []);

  const toggle = (): void => {
    const currentIndex = themeOrder.indexOf(theme);
    const next = themeOrder[(currentIndex + 1) % themeOrder.length] ?? 'system';
    setTheme(next);
    document.documentElement.dataset.theme = next;
    window.localStorage.setItem('sufbot-theme', next);
  };

  const label =
    theme === 'system'
      ? 'Theme: system. Switch to light theme'
      : theme === 'light'
        ? 'Theme: light. Switch to dark theme'
        : 'Theme: dark. Switch to system theme';
  const Icon = theme === 'system' ? Monitor : theme === 'light' ? Sun : Moon;

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      title={label}
      onClick={toggle}
    >
      <Icon size={16} aria-hidden="true" />
    </Button>
  );
}
