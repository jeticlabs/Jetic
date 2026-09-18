import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Copy, Check, Info, AlertTriangle, Lightbulb, AlertCircle } from 'lucide-react';

interface MarkdownRendererProps {
  content: string;
}

function CodeBlock({ children, className }: { children: React.ReactNode; className?: string }) {
  const [copied, setCopied] = useState(false);
  const codeString = String(children).replace(/\n$/, '');
  const match = /language-(\w+)/.exec(className || '');
  const lang = match ? match[1] : 'text';

  const handleCopy = () => {
    navigator.clipboard.writeText(codeString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative my-5 overflow-hidden rounded-lg border border-zinc-800 bg-[#0b0d13]">
      <div className="flex items-center justify-between border-b border-zinc-800/80 bg-zinc-900/60 px-4 py-2 text-xs font-mono text-zinc-400">
        <span className="text-zinc-400 font-medium">{lang}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1.5 rounded bg-zinc-800/70 px-2 py-1 text-xs text-zinc-300 transition-colors hover:bg-zinc-700 hover:text-white"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5 text-emerald-400" />
              <span className="text-emerald-400 font-medium">Copied</span>
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <div className="overflow-x-auto p-4 text-xs leading-relaxed font-mono text-zinc-200 select-all">
        <pre>{codeString}</pre>
      </div>
    </div>
  );
}

function AlertBlockquote({ children }: { children: React.ReactNode }) {
  const text = String(React.Children.toArray(children).map(c => typeof c === 'string' ? c : '').join(''));

  let type: 'note' | 'tip' | 'warning' | 'important' = 'note';
  if (text.includes('[!TIP]')) type = 'tip';
  else if (text.includes('[!WARNING]')) type = 'warning';
  else if (text.includes('[!IMPORTANT]')) type = 'important';

  const styles = {
    note: {
      border: 'border-blue-500/30',
      bg: 'bg-blue-500/10',
      text: 'text-blue-400',
      icon: Info,
      title: 'NOTE',
    },
    tip: {
      border: 'border-emerald-500/30',
      bg: 'bg-emerald-500/10',
      text: 'text-emerald-400',
      icon: Lightbulb,
      title: 'TIP',
    },
    warning: {
      border: 'border-amber-500/30',
      bg: 'bg-amber-500/10',
      text: 'text-amber-400',
      icon: AlertTriangle,
      title: 'WARNING',
    },
    important: {
      border: 'border-purple-500/30',
      bg: 'bg-purple-500/10',
      text: 'text-purple-400',
      icon: AlertCircle,
      title: 'IMPORTANT',
    },
  }[type];

  const Icon = styles.icon;

  return (
    <div className={`my-5 rounded-lg border ${styles.border} ${styles.bg} p-4`}>
      <div className={`flex items-center gap-2 mb-1.5 font-medium text-xs ${styles.text}`}>
        <Icon className="h-4 w-4 shrink-0" />
        <span>{styles.title}</span>
      </div>
      <div className="text-sm leading-relaxed text-zinc-300 [&>p]:m-0">
        {children}
      </div>
    </div>
  );
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <div className="prose prose-invert max-w-none text-zinc-300 text-sm leading-relaxed">
      <ReactMarkdown
        components={{
          h1: ({ children }) => {
            const id = String(children).toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
            return (
              <h1 id={id} className="scroll-mt-24 text-2xl font-bold tracking-tight text-white mb-4 pb-2 border-b border-zinc-800">
                {children}
              </h1>
            );
          },
          h2: ({ children }) => {
            const id = String(children).toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
            return (
              <h2 id={id} className="scroll-mt-24 text-lg font-semibold tracking-tight text-white mt-8 mb-3 pt-4 border-t border-zinc-800/60">
                {children}
              </h2>
            );
          },
          h3: ({ children }) => {
            const id = String(children).toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
            return (
              <h3 id={id} className="scroll-mt-24 text-base font-semibold text-zinc-100 mt-6 mb-2">
                {children}
              </h3>
            );
          },
          p: ({ children }) => <p className="mb-4 text-zinc-300 text-sm leading-relaxed">{children}</p>,
          ul: ({ children }) => <ul className="mb-4 list-disc pl-5 space-y-1.5 text-sm text-zinc-300">{children}</ul>,
          ol: ({ children }) => <ol className="mb-4 list-decimal pl-5 space-y-1.5 text-sm text-zinc-300">{children}</ol>,
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          hr: () => <hr className="my-6 border-zinc-800" />,
          blockquote: ({ children }) => <AlertBlockquote>{children}</AlertBlockquote>,
          code: ({ inline, className, children, ...props }: any) => {
            if (inline) {
              return (
                <code
                  className="rounded bg-zinc-800/80 px-1.5 py-0.5 text-xs font-mono text-amber-300/90 border border-zinc-700/50"
                  {...props}
                >
                  {children}
                </code>
              );
            }
            return <CodeBlock className={className}>{children}</CodeBlock>;
          },
          table: ({ children }) => (
            <div className="my-5 overflow-x-auto rounded-lg border border-zinc-800 bg-[#0b0d13]">
              <table className="w-full text-left text-xs">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="border-b border-zinc-800 bg-zinc-900/60 text-zinc-200 font-semibold">{children}</thead>,
          th: ({ children }) => <th className="px-4 py-2.5 font-medium text-zinc-200">{children}</th>,
          td: ({ children }) => <td className="px-4 py-2.5 border-t border-zinc-800/50 text-zinc-300">{children}</td>,
          a: ({ href, children }) => (
            <a
              href={href}
              target={href?.startsWith('http') ? '_blank' : undefined}
              rel={href?.startsWith('http') ? 'noopener noreferrer' : undefined}
              className="font-medium text-amber-400 hover:text-amber-300 underline decoration-amber-500/30 underline-offset-4 transition-colors"
            >
              {children}
            </a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

