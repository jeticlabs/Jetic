import { useState, useEffect } from 'react';
import { DOCS_REGISTRY } from './content/docsMap';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { MarkdownRenderer } from './components/MarkdownRenderer';
import { TableOfContents } from './components/TableOfContents';
import { DocPagination } from './components/DocPagination';
import { SearchModal } from './components/SearchModal';
import { ChevronRight, ExternalLink } from 'lucide-react';

export const App = () => {
  const [activeDocId, setActiveDocId] = useState<string>(() => {
    const hash = window.location.hash.replace('#', '');
    if (hash && DOCS_REGISTRY.some((d) => d.id === hash)) {
      return hash;
    }
    return 'introduction';
  });

  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    window.location.hash = activeDocId;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [activeDocId]);

  const currentDoc = DOCS_REGISTRY.find((d) => d.id === activeDocId) ?? DOCS_REGISTRY[0];

  const handleSelectDoc = (id: string) => {
    setActiveDocId(id);
    setIsMobileMenuOpen(false);
  };

  return (
    <div className="min-h-screen bg-[#090b11] text-zinc-200 antialiased font-sans">
      {/* Top Header */}
      <Header
        onOpenSearch={() => setIsSearchOpen(true)}
        isMobileMenuOpen={isMobileMenuOpen}
        onToggleMobileMenu={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
      />

      {/* Main Layout Grid */}
      <div className="mx-auto flex max-w-[1440px] min-h-[calc(100vh-3.5rem)]">
        {/* Desktop Left Sidebar */}
        <aside className="hidden w-72 shrink-0 border-r border-zinc-800/70 lg:block sticky top-14 h-[calc(100vh-3.5rem)]">
          <Sidebar activeDocId={activeDocId} onSelectDoc={handleSelectDoc} />
        </aside>

        {/* Mobile Left Sidebar Drawer */}
        {isMobileMenuOpen && (
          <div className="fixed inset-0 z-40 lg:hidden flex">
            <div
              className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity"
              onClick={() => setIsMobileMenuOpen(false)}
            />
            <div className="relative z-50 w-72 h-full bg-[#0b0d14] border-r border-zinc-800 pt-14">
              <Sidebar activeDocId={activeDocId} onSelectDoc={handleSelectDoc} />
            </div>
          </div>
        )}

        {/* Center Main Documentation Container */}
        <main className="flex-1 min-w-0 px-6 py-8 lg:px-12 max-w-4xl mx-auto xl:mx-0">
          {/* Breadcrumb Navigation */}
          <nav aria-label="Breadcrumb" className="mb-6 flex items-center gap-1.5 text-xs text-zinc-400 font-medium">
            <span className="text-zinc-400">Docs</span>
            <ChevronRight className="h-3.5 w-3.5 text-zinc-600" />
            <span className="text-zinc-400">{currentDoc.category}</span>
            <ChevronRight className="h-3.5 w-3.5 text-zinc-600" />
            <span className="text-zinc-200 font-semibold">{currentDoc.title}</span>
          </nav>

          {/* Document Header Hero Section */}
          <header className="mb-8 rounded-xl border border-zinc-800/80 bg-zinc-900/30 p-6 sm:p-7">
            <div className="mb-3 inline-flex items-center rounded-md border border-amber-500/20 bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-400">
              {currentDoc.category}
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white mb-3 sm:text-3xl">
              {currentDoc.title}
            </h1>
            <p className="text-sm text-zinc-400 leading-relaxed max-w-3xl">
              {currentDoc.description}
            </p>
          </header>

          {/* Render Markdown Content */}
          <article className="prose-container">
            <MarkdownRenderer content={currentDoc.content} />
          </article>

          {/* Article Bottom Pagination */}
          <DocPagination currentDocId={activeDocId} onSelectDoc={handleSelectDoc} />
        </main>

        {/* Desktop Right Sidebar: On This Page TOC */}
        <aside className="hidden w-64 shrink-0 p-6 xl:block sticky top-14 h-[calc(100vh-3.5rem)] overflow-y-auto border-l border-zinc-800/50">
          <TableOfContents content={currentDoc.content} />

          {/* Integration Quick Info */}
          <div className="mt-8 rounded-lg border border-zinc-800/80 bg-zinc-900/40 p-4 text-xs space-y-2">
            <h3 className="font-semibold text-zinc-200 text-xs">MCP Editor Integration</h3>
            <p className="text-zinc-400 text-[11.5px] leading-relaxed">
              Connect <code className="text-amber-300 bg-zinc-800/80 px-1 py-0.5 rounded font-mono text-[11px]">jetic mcp</code> to your AI editor for conversational modeling.
            </p>
            <a
              href="https://github.com/jeticlabs/Jetic"
              target="_blank"
              rel="noopener noreferrer"
              className="pt-1 inline-flex items-center gap-1.5 text-xs font-medium text-amber-400 hover:text-amber-300 transition-colors"
            >
              <span>View Source</span>
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </aside>
      </div>

      {/* Cmd + K Search Modal */}
      <SearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        onSelectDoc={handleSelectDoc}
      />
    </div>
  );
};

