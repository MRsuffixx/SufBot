'use client';

import { Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from './ui/button';

export function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem('sufbot-theme');
    const shouldUseDark =
      stored === 'dark' ||
      (stored === null && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = shouldUseDark ? 'dark' : 'light';
    setDark(shouldUseDark);
  }, []);

  const toggle = (): void => {
    const next = !dark;
    setDark(next);
    document.documentElement.dataset.theme = next ? 'dark' : 'light';
    window.localStorage.setItem('sufbot-theme', next ? 'dark' : 'light');
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      aria-label={dark ? 'Use light theme' : 'Use dark theme'}
      onClick={toggle}
    >
      {dark ? <Sun size={17} /> : <Moon size={17} />}
    </Button>
  );
}
