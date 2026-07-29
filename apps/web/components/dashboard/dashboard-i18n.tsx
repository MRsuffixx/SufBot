'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  dashboardMessage,
  type DashboardLocale,
  type DashboardMessageKey,
} from '@/lib/i18n/dashboard';

type DashboardI18nValue = {
  locale: DashboardLocale;
  setLocale: (locale: DashboardLocale) => void;
  t: (key: DashboardMessageKey) => string;
};

const DashboardI18nContext = createContext<DashboardI18nValue | null>(null);

export function DashboardI18nProvider({
  initialLocale,
  children,
}: {
  initialLocale: DashboardLocale;
  children: ReactNode;
}) {
  const [locale, setLocaleState] = useState<DashboardLocale>(initialLocale);

  useEffect(() => {
    const stored = window.localStorage.getItem('sufbot-dashboard-locale');
    if (stored === 'en' || stored === 'tr') setLocaleState(stored);
  }, []);

  const setLocale = useCallback((nextLocale: DashboardLocale) => {
    setLocaleState(nextLocale);
    window.localStorage.setItem('sufbot-dashboard-locale', nextLocale);
    document.documentElement.lang = nextLocale;
  }, []);

  const value = useMemo<DashboardI18nValue>(
    () => ({
      locale,
      setLocale,
      t: (key) => dashboardMessage(locale, key),
    }),
    [locale, setLocale],
  );

  return <DashboardI18nContext.Provider value={value}>{children}</DashboardI18nContext.Provider>;
}

export function useDashboardI18n(): DashboardI18nValue {
  const value = useContext(DashboardI18nContext);
  if (value === null) {
    throw new Error('useDashboardI18n must be used within DashboardI18nProvider.');
  }
  return value;
}
