import { useState, useEffect } from 'react';
import { Sun, Moon } from 'lucide-react';
import { type PageId } from '../../types';

export function Topbar({ currentPage }: { currentPage: PageId }) {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  useEffect(() => {
    const storedTheme = localStorage.getItem('theme') as 'dark' | 'light';
    if (storedTheme) {
      setTheme(storedTheme);
      document.documentElement.classList.toggle('dark', storedTheme === 'dark');
    } else {
      document.documentElement.classList.add('dark');
    }
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    document.documentElement.classList.toggle('dark', newTheme === 'dark');
    document.documentElement.classList.remove('light');
    if (newTheme === 'light') {
      document.documentElement.classList.add('light');
    }
  };

  const formatTitle = (id: string) => {
    return id.charAt(0).toUpperCase() + id.slice(1);
  };

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b theme-border theme-bg-base px-6">
      <div className="flex items-center gap-2">
        <h1 className="text-[15px] font-medium theme-text-primary">{formatTitle(currentPage)}</h1>
      </div>
      <div className="flex items-center gap-3">
        {/* You can add top bar pills here like Traces / Env status later */}
        <button
          onClick={toggleTheme}
          className="flex h-8 w-8 items-center justify-center rounded-md border theme-border theme-bg-overlay theme-text-muted hover:theme-bg-overlay-md hover:theme-text transition-colors"
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        >
          {theme === 'dark' ? <Sun className="h-4 w-4" strokeWidth={2} /> : <Moon className="h-4 w-4" strokeWidth={2} />}
        </button>
      </div>
    </header>
  );
}
