// Light/dark theme. Default follows the system; an explicit choice is stored per browser.
import { useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';
const KEY = 'theme';

function stored(): Theme | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : null;
  } catch {
    return null;
  }
}

const media = () => window.matchMedia?.('(prefers-color-scheme: dark)');

export function useTheme(): [Theme, (t: Theme) => void] {
  const [choice, setChoice] = useState<Theme | null>(stored);
  const [systemDark, setSystemDark] = useState(() => Boolean(media()?.matches));

  useEffect(() => {
    const m = media();
    if (!m) return;
    const on = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);

  const theme: Theme = choice ?? (systemDark ? 'dark' : 'light');
  const set = (t: Theme) => {
    setChoice(t);
    document.documentElement.setAttribute('data-theme', t);
    try {
      localStorage.setItem(KEY, t);
    } catch {
      /* storage blocked: the choice lasts for this page view */
    }
  };
  return [theme, set];
}
