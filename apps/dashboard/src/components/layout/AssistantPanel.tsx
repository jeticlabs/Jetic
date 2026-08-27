import { X } from "lucide-react";


interface AssistantPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AssistantPanel({ isOpen, onClose }: AssistantPanelProps) {
  if (!isOpen) return null;

  return (
    <div className="absolute inset-y-0 right-0 w-[400px] border-l border-white/10 bg-[#0a0a0a] shadow-2xl flex flex-col z-50">
      {/* Header */}
      <div className="flex h-14 items-center justify-between border-b border-white/10 px-5">
        <div className="flex items-center gap-2 text-emerald-400">

          <span className="text-[14px] font-medium">Jetic AI</span>
        </div>
        <button
          onClick={onClose}
          className=" hover:text-zinc-300 text-sm hover:bg-zinc-800/20 p-2 rounded-full"
        >
          <X className="" size={13} />
        </button>
      </div>

      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        <div className="flex flex-col items-center pt-8 pb-4">
          <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-zinc-800 text-[13px] font-medium text-zinc-300">
            J
          </div>
          <h2 className="text-[17px] font-semibold text-white text-center">
            How can I help you test your APIs?
          </h2>
          <p className="text-zinc-500 text-[13px] mt-2 text-center">
            Ask me to generate simulations, debug traces, or explain API behavior.
          </p>
        </div>
      </div>

      {/* Input Area */}
      <div className="p-4 border-t border-white/10 bg-white/[0.01]">
        <div className="rounded border border-emerald-600/60 bg-white/[0.015] focus-within:border-emerald-500 transition-colors">
          <textarea
            rows={2}
            placeholder="E.g. Test password reset flow..."
            className="w-full resize-none bg-transparent px-4 pb-2 pt-3.5 text-[13.5px] text-zinc-200 placeholder:text-zinc-500 focus:outline-none"
          />
          <div className="flex items-center justify-between px-3 pb-3 pt-1">
            <div className="flex gap-2">
              <span className="text-[11px] text-zinc-500 font-mono bg-white/[0.05] px-2 py-0.5 rounded">gpt-4o</span>
            </div>
            <button className="text-[12px] font-medium text-emerald-400 hover:text-emerald-300">
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
