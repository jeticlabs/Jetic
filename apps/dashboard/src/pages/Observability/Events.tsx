export function Events() {
  return (
    <div className="flex flex-1 flex-col theme-bg-base theme-text-primary">
      <div className="flex items-center justify-between border-b theme-border px-6 py-5">
        <div>
          <h1 className="text-[15px] font-medium leading-none theme-text-primary">Events</h1>
          <p className="mt-1 text-[11px] theme-text-muted">Stream of events emitted by the workspace.</p>
        </div>
      </div>
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="jetic-card flex w-full max-w-md flex-col items-center gap-2 px-6 py-10 text-center">
          <span className="text-[13px] font-medium theme-text-primary">Under development</span>
          <span className="text-[11px] theme-text-muted">This page is coming soon.</span>
        </div>
      </div>
    </div>
  );
}
