import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Copy, Check, Info, AlertTriangle, Lightbulb, AlertCircle } from 'lucide-react';
import { ImageLightbox } from './ImageLightbox';

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
    <div className="prose prose-invert max-w-none text-zinc-300 text-sm leading-relaxed prose-headings:scroll-mt-24 prose-p:mb-4 prose-p:leading-relaxed prose-strong:text-zinc-100 prose-strong:font-semibold prose-em:text-zinc-300">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
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
          ul: ({ children, className }: any) => {
            // GFM task lists get contains-task-list class
            const isTaskList = className?.includes('contains-task-list');
            return (
              <ul className={`mb-4 space-y-1.5 text-sm text-zinc-300 ${isTaskList ? 'list-none pl-0' : 'list-disc pl-5'}`}>
                {children}
              </ul>
            );
          },
          ol: ({ children }) => <ol className="mb-4 list-decimal pl-5 space-y-1.5 text-sm text-zinc-300">{children}</ol>,
          li: ({ children, checked, className, ...props }: any) => {
            const isTaskItem = typeof checked === 'boolean' || className?.includes('task-list-item');
            if (isTaskItem) {
              return (
                <li className="flex items-start gap-2 leading-relaxed list-none" {...props}>
                  <input
                    type="checkbox"
                    checked={checked}
                    readOnly
                    className="mt-1 h-3.5 w-3.5 shrink-0 rounded border-zinc-700 bg-zinc-800 text-amber-500 focus:ring-0 focus:ring-offset-0"
                  />
                  <span className={`flex-1 ${checked ? 'text-zinc-500 line-through' : 'text-zinc-300'}`}>{children}</span>
                </li>
              );
            }
            return <li className="leading-relaxed marker:text-zinc-500">{children}</li>;
          },
          hr: () => <hr className="my-6 border-zinc-800" />,
          blockquote: ({ children }) => <AlertBlockquote>{children}</AlertBlockquote>,
          strong: ({ children }) => <strong className="font-semibold text-zinc-100">{children}</strong>,
          em: ({ children }) => <em className="italic text-zinc-300">{children}</em>,
          del: ({ children }) => <del className="text-zinc-500 line-through decoration-zinc-600">{children}</del>,
          input: ({ checked, ...props }: any) => {
            // Fallback for stray checkbox inputs outside li (GFM)
            if (props.type === 'checkbox') {
              return <input type="checkbox" checked={checked} readOnly className="h-3.5 w-3.5 rounded border-zinc-700 bg-zinc-800 text-amber-500" {...props} />;
            }
            return <input {...props} />;
          },
          pre: ({ children }: any) => <>{children}</>,
          code: ({ inline, className, children, ...props }: any) => {
            // react-markdown v10: inline is boolean, code blocks have className language-*
            const isInline = inline ?? !className;
            if (isInline) {
              return (
                <code
                  className="rounded bg-zinc-800/80 px-1.5 py-0.5 text-xs font-mono text-amber-300/90 border border-zinc-700/50 break-words"
                  {...props}
                >
                  {children}
                </code>
              );
            }
            return <CodeBlock className={className}>{children}</CodeBlock>;
          },
          table: ({ children }) => (
            <div className="my-6 overflow-x-auto rounded-xl border border-zinc-800 bg-[#0b0d13] shadow-sm">
              <table className="w-full text-left text-xs border-collapse">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-zinc-900/80 text-zinc-100">{children}</thead>,
          tbody: ({ children }) => <tbody className="divide-y divide-zinc-800/50">{children}</tbody>,
          tr: ({ children }) => <tr className="even:bg-zinc-900/30 hover:bg-zinc-800/30 transition-colors">{children}</tr>,
          th: ({ children, style }: any) => (
            <th style={style} className="px-4 py-3 text-left text-xs font-semibold tracking-wide text-zinc-200 border-b border-zinc-800 whitespace-nowrap">
              {children}
            </th>
          ),
          td: ({ children, style }: any) => (
            <td style={style} className="px-4 py-3 text-xs leading-relaxed text-zinc-300 align-top">
              {children}
            </td>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              target={href?.startsWith('http') ? '_blank' : undefined}
              rel={href?.startsWith('http') ? 'noopener noreferrer' : undefined}
              className="font-medium text-amber-400 hover:text-amber-300 underline decoration-amber-500/30 underline-offset-4 transition-colors break-words"
            >
              {children}
            </a>
          ),
          img: ({ src, alt }: any) => (
            <ImageLightbox src={src || ''} alt={alt || ''} caption={alt || ''} />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

