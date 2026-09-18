import { useEffect, useState, useCallback } from 'react';
import { X, ZoomIn, Maximize2, ImageOff } from 'lucide-react';

interface ImageLightboxProps {
  src: string;
  alt?: string;
  caption?: string;
}

export function ImageLightbox({ src, alt, caption }: ImageLightboxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  const close = useCallback(() => setIsOpen(false), []);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen, close]);

  // Missing src or explicit placeholder marker
  const isPlaceholder = !src || src.includes('YOUR_') || src.includes('placeholder');

  if (isPlaceholder) {
    return (
      <div className="my-6 rounded-xl border border-dashed border-zinc-700/80 bg-zinc-900/30 p-6 text-center">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-zinc-800/60 border border-zinc-700/50">
          <ImageOff className="h-5 w-5 text-zinc-500" />
        </div>
        <p className="mt-3 text-xs font-medium text-zinc-300">{alt || 'Screenshot placeholder'}</p>
        {caption && <p className="mt-1 text-[11px] text-zinc-500 max-w-xl mx-auto leading-relaxed">{caption}</p>}
        <p className="mt-2 text-[10px] text-zinc-600 font-mono">Replace with: {src || 'screenshots/your-image.png'}</p>
      </div>
    );
  }

  return (
    <>
      {/* Thumbnail — follows App.tsx card style: border-zinc-800/80 bg-zinc-900/30 rounded-xl */}
      <figure className="my-6 group">
        <div
          role="button"
          tabIndex={0}
          onClick={() => setIsOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setIsOpen(true);
            }
          }}
          className="relative overflow-hidden rounded-xl border border-zinc-800/80 bg-[#0b0d13] cursor-zoom-in focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/40 transition-all hover:border-zinc-700 hover:shadow-lg hover:shadow-black/20"
          aria-label={`View larger: ${alt || 'image'}`}
        >
          {/* Top bar like CodeBlock header */}
          <div className="flex items-center justify-between border-b border-zinc-800/60 bg-zinc-900/40 px-3 py-1.5">
            <span className="text-[10px] font-mono text-zinc-500 truncate pr-2">{alt || 'Preview'}</span>
            <span className="inline-flex items-center gap-1 rounded bg-zinc-800/70 px-1.5 py-0.5 text-[10px] font-medium text-zinc-400 border border-zinc-700/40 group-hover:bg-amber-500/10 group-hover:text-amber-400 group-hover:border-amber-500/20 transition-colors shrink-0">
              <Maximize2 className="h-3 w-3" />
              Click to enlarge
            </span>
          </div>

          <div className="relative bg-[#090b11] flex items-center justify-center p-2 sm:p-3">
            {!loaded && !error && (
              <div className="absolute inset-0 flex items-center justify-center bg-zinc-900/40">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-700 border-t-amber-500/60" />
              </div>
            )}
            {error ? (
              <div className="flex flex-col items-center gap-2 py-8 text-zinc-500">
                <ImageOff className="h-8 w-8 text-zinc-600" />
                <span className="text-xs">Failed to load image</span>
                <span className="text-[10px] font-mono text-zinc-600">{src}</span>
              </div>
            ) : (
              <img
                src={src}
                alt={alt || ''}
                loading="lazy"
                onLoad={() => setLoaded(true)}
                onError={() => setError(true)}
                className={`max-w-full h-auto rounded-md border border-zinc-800/50 object-contain transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
                style={{ maxHeight: '420px' }}
              />
            )}
            {/* Hover zoom overlay */}
            {!error && loaded && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/20 transition-colors">
                <span className="opacity-0 group-hover:opacity-100 inline-flex items-center gap-1.5 rounded-full bg-black/70 backdrop-blur px-3 py-1.5 text-xs font-medium text-white border border-white/10 transition-all scale-95 group-hover:scale-100">
                  <ZoomIn className="h-3.5 w-3.5" />
                  View larger
                </span>
              </div>
            )}
          </div>
        </div>
        {(alt || caption) && (
          <figcaption className="mt-2 text-center text-[11px] leading-relaxed text-zinc-500">
            {caption || alt}
          </figcaption>
        )}
      </figure>

      {/* Lightbox Dialog — matches App.tsx backdrop bg-black/70 backdrop-blur-sm */}
      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 sm:p-6 lg:p-8"
          onClick={close}
          role="dialog"
          aria-modal="true"
          aria-label={alt || 'Image preview'}
        >
          <div
            className="relative flex max-h-[90vh] max-w-[92vw] flex-col overflow-hidden rounded-xl border border-zinc-800 bg-[#0c0e14] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Dialog header */}
            <div className="flex items-center justify-between border-b border-zinc-800/80 bg-zinc-900/40 px-4 py-3 shrink-0">
              <div className="min-w-0 pr-4">
                <p className="text-sm font-medium text-white truncate">{alt || 'Image preview'}</p>
                {caption && caption !== alt && (
                  <p className="text-xs text-zinc-400 truncate">{caption}</p>
                )}
              </div>
              <button
                type="button"
                onClick={close}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:bg-zinc-800 hover:text-white transition-colors"
                aria-label="Close preview"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Large image */}
            <div className="overflow-auto bg-[#090b11] p-3 sm:p-4 flex items-center justify-center">
              <img
                src={src}
                alt={alt || ''}
                className="max-h-[72vh] max-w-full h-auto w-auto rounded-lg border border-zinc-800/50 object-contain shadow-xl"
              />
            </div>

            {/* Footer hint */}
            <div className="border-t border-zinc-800/60 bg-zinc-900/30 px-4 py-2 text-center text-[11px] text-zinc-500">
              Press <kbd className="rounded border border-zinc-700 bg-zinc-800 px-1 py-0.5 font-mono text-[10px] text-zinc-400">Esc</kbd> or click backdrop to close
            </div>
          </div>
        </div>
      )}
    </>
  );
}
