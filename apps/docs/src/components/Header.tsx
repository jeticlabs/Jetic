import { Search, Menu, X, Code } from 'lucide-react';

interface HeaderProps {
  onOpenSearch: () => void;
  isMobileMenuOpen: boolean;
  onToggleMobileMenu: () => void;
}

export function Header({ onOpenSearch, isMobileMenuOpen, onToggleMobileMenu }: HeaderProps) {
  return (
    <header className="sticky top-0 z-40 flex h-14 w-full items-center justify-between border-b border-zinc-800/80 bg-[#090b11]/90 px-4 backdrop-blur-md lg:px-6">
      <div className="flex items-center gap-3.5">
        <button
          type="button"
          onClick={onToggleMobileMenu}
          aria-label="Toggle navigation menu"
          className="flex h-8 w-8 items-center justify-center rounded-md border border-zinc-800 text-zinc-400 transition-colors hover:bg-zinc-800/60 hover:text-zinc-100 lg:hidden"
        >
          {isMobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        </button>

        <a href="/" className="flex items-center gap-2.5 transition-opacity hover:opacity-90">
          <img src="/jetic.png" alt="jetic" className="h-6 w-6 object-contain" />
          <div className="flex items-baseline gap-1.5">
            <span className="text-sm font-semibold tracking-tight text-white">Jetic</span>
            <span className="text-xs font-medium text-zinc-400">Docs</span>
          </div>
        </a>

        <span className="hidden rounded-md border border-zinc-800 bg-zinc-900/60 px-2 py-0.5 font-mono text-[11px] font-medium text-zinc-400 sm:inline-block">
          v0.3.0
        </span>
      </div>

      <div className="flex items-center gap-3">
        {/* Search Bar Trigger */}
        <button
          type="button"
          onClick={onOpenSearch}
          className="flex h-9 w-44 items-center justify-between rounded-md border border-zinc-800 bg-zinc-900/50 px-3 text-xs text-zinc-400 transition-colors hover:border-zinc-700 hover:bg-zinc-900/80 hover:text-zinc-200 sm:w-64"
        >
          <div className="flex items-center gap-2">
            <Search className="h-3.5 w-3.5 text-zinc-400" />
            <span className="truncate">Search docs...</span>
          </div>
          <kbd className="hidden rounded border border-zinc-700/60 bg-zinc-800/70 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400 sm:inline-block">
            ⌘K
          </kbd>
        </button>

        {/* Quick External Links */}
        <div className="flex items-center gap-1.5 border-l border-zinc-800/80 pl-3">
          <a
            href="https://github.com/jeticlabs/Jetic"
            target="_blank"
            rel="noopener noreferrer"
            title="GitHub Repository"
            className="flex h-8 w-8 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-zinc-800/60 hover:text-zinc-100"
          >
            <Code className="h-4 w-4" />
          </a>
        </div>
      </div>
    </header>
  );
}

