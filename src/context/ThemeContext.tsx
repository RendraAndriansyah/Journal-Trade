import { createContext, useContext, useEffect, useRef, useState } from 'react';

type Theme = 'dark' | 'light';

interface ThemeContextValue {
  theme: Theme;
  targetTheme: Theme;
  isTransitioning: boolean;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'dark',
  targetTheme: 'dark',
  isTransitioning: false,
  toggleTheme: () => {},
});

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem('gj-theme') as Theme | null;
    return saved ?? 'dark';
  });
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [targetTheme, setTargetTheme] = useState<Theme>(theme);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Only persist to localStorage — DOM class is set synchronously in toggleTheme
  useEffect(() => {
    localStorage.setItem('gj-theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(t => {
      const next = t === 'dark' ? 'light' : 'dark';

      // 1. Apply DOM class immediately — no React cycle lag
      document.documentElement.classList.toggle('dark', next === 'dark');

      // 2. Show overlay
      setTargetTheme(next);
      setIsTransitioning(true);

      // 3. Hide overlay after animation completes (600ms)
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setIsTransitioning(false), 600);

      return next;
    });
  };

  return (
    <ThemeContext.Provider value={{ theme, targetTheme, isTransitioning, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
