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
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-white/10 px-6 bg-[#0a0a0a] dark:bg-[#0a0a0a]">
      <div className="flex items-center gap-2">
        <h1 className="text-[15px] font-medium text-white">{formatTitle(currentPage)}</h1>
      </div>
      <div className="flex items-center gap-3">
        {/* You can add top bar pills here like Traces / Env status later */}
        <button
          onClick={toggleTheme}
          className="flex h-8 w-8 items-center justify-center rounded-md border border-white/10 bg-white/[0.015] text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200 transition-colors"
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        >
          {theme === 'dark' ? <Sun className="h-4 w-4" strokeWidth={2} /> : <Moon className="h-4 w-4" strokeWidth={2} />}
        </button>
      </div>
    </header>
  );
}
