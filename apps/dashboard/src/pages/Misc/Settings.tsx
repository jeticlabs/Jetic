import React, { useEffect, useState } from 'react';
import {
  Bell,
  Check,
  ChevronRight,
  Code2,
  Globe,
  Info,
  Loader2,
  Palette,
  Save,
  Shield,
  Terminal,
  Trash2,
  User,
  X,
  Zap,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SettingsData {
  project: { name: string; language: string; framework: string };
  environments: { name: string; baseUrl: string }[];
}

// ─── UI Primitives ─────────────────────────────────────────────────────────────

function SectionHeader({
  icon: Icon,
  label,
  description,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  description?: string;
}) {
  return (
    <div className="flex items-start gap-3 pb-4 border-b border-white/10">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04]">
        <Icon className="h-[15px] w-[15px] text-blue-400" strokeWidth={2} />
      </div>
      <div>
        <p className="text-[13.5px] font-medium text-white">{label}</p>
        {description && (
          <p className="mt-0.5 text-[11px] text-zinc-500">{description}</p>
        )}
      </div>
    </div>
  );
}

function Row({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b border-white/[0.06] last:border-0">
      <div className="min-w-0">
        <p className="text-[13px] text-zinc-200">{label}</p>
        {description && (
          <p className="text-[11px] text-zinc-500 mt-0.5">{description}</p>
        )}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Toggle({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={`relative flex h-5 w-9 items-center rounded-full border transition-colors ${value
        ? 'bg-blue-500 border-blue-400'
        : 'bg-white/[0.04] border-white/10'
        }`}
    >
      <span
        className={`absolute h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${value ? 'translate-x-4' : 'translate-x-0.5'
          }`}
      />
    </button>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
  mono = false,
  type = 'text',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
  type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`w-56 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[12px] text-zinc-200 outline-none focus:border-blue-500/50 focus:bg-white/[0.05] placeholder-zinc-600 transition-colors ${mono ? 'font-mono' : ''
        }`}
    />
  );
}

function SelectInput({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-lg border border-white/10 bg-zinc-900 px-3 py-1.5 text-[12px] text-zinc-200 outline-none focus:border-blue-500/50 transition-colors"
    >
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

function Card({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-lg border border-white/10 bg-white/[0.02] p-5 space-y-1 ${className}`}
    >
      {children}
    </div>
  );
}

function SaveBtn({
  saving,
  onClick,
}: {
  saving: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={saving}
      className="flex items-center gap-1.5 rounded-lg bg-blue-500 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-blue-400 disabled:opacity-50 transition-colors"
    >
      {saving ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
      ) : (
        <Save className="h-3.5 w-3.5" strokeWidth={2} />
      )}
      {saving ? 'Saving…' : 'Save'}
    </button>
  );
}

// ─── Sidebar nav ───────────────────────────────────────────────────────────────

const SECTIONS = [
  { id: 'general', label: 'General', icon: User },
  { id: 'environments', label: 'Environments', icon: Globe },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'editor', label: 'Editor', icon: Code2 },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'api', label: 'API & Auth', icon: Shield },
  { id: 'advanced', label: 'Advanced', icon: Terminal },
] as const;

type SectionId = (typeof SECTIONS)[number]['id'];

// ─── Sections ─────────────────────────────────────────────────────────────────

function GeneralSection({ model }: { model: SettingsData | null }) {
  const [name, setName] = useState(model?.project?.name ?? '');
  const [lang, setLang] = useState(model?.project?.language ?? 'TypeScript');
  const [framework, setFramework] = useState(
    model?.project?.framework ?? 'Express'
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setName(model?.project?.name ?? '');
    setLang(model?.project?.language ?? 'TypeScript');
    setFramework(model?.project?.framework ?? 'Express');
  }, [model]);

  const save = async () => {
    setSaving(true);
    await new Promise((r) => setTimeout(r, 600));
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-5">
      <SectionHeader
        icon={User}
        label="General"
        description="Project identity and basic configuration"
      />
      <Card>
        <Row label="Project Name" description="Display name shown in the dashboard">
          <TextInput value={name} onChange={setName} placeholder="My API" />
        </Row>
        <Row label="Language" description="Primary language of your backend">
          <SelectInput
            value={lang}
            onChange={setLang}
            options={['TypeScript', 'JavaScript', 'Python', 'Go', 'Rust']}
          />
        </Row>
        <Row label="Framework" description="HTTP framework used by your server">
          <SelectInput
            value={framework}
            onChange={setFramework}
            options={['Express', 'Fastify', 'Hono', 'Koa', 'NestJS', 'Other']}
          />
        </Row>
        <div className="flex justify-end pt-2 gap-2">
          {saved && (
            <span className="flex items-center gap-1 text-[11px] text-emerald-400">
              <Check className="h-3.5 w-3.5" strokeWidth={2} /> Saved
            </span>
          )}
          <SaveBtn saving={saving} onClick={save} />
        </div>
      </Card>
    </div>
  );
}

function EnvironmentsSection({ model }: { model: SettingsData | null }) {
  const [envs, setEnvs] = useState<{ name: string; baseUrl: string }[]>(
    model?.environments ?? [{ name: 'local', baseUrl: 'http://localhost:3000' }]
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setEnvs(
      model?.environments ?? [{ name: 'local', baseUrl: 'http://localhost:3000' }]
    );
  }, [model]);

  const addEnv = () => setEnvs((e) => [...e, { name: '', baseUrl: '' }]);
  const removeEnv = (i: number) => setEnvs((e) => e.filter((_, idx) => idx !== i));
  const updateEnv = (i: number, field: 'name' | 'baseUrl', val: string) =>
    setEnvs((e) => e.map((env, idx) => (idx === i ? { ...env, [field]: val } : env)));

  const save = async () => {
    setSaving(true);
    await new Promise((r) => setTimeout(r, 600));
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-5">
      <SectionHeader
        icon={Globe}
        label="Environments"
        description="Configure your API base URLs for simulation"
      />
      <Card>
        <div className="space-y-2">
          <div className="flex items-center gap-4 px-1 mb-2">
            <p className="w-24 text-[10px] uppercase tracking-wider text-zinc-600 font-semibold">
              Name
            </p>
            <p className="flex-1 text-[10px] uppercase tracking-wider text-zinc-600 font-semibold">
              Base URL
            </p>
          </div>
          {envs.map((env, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                value={env.name}
                onChange={(e) => updateEnv(i, 'name', e.target.value)}
                placeholder="local"
                className="w-24 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[12px] text-zinc-200 outline-none focus:border-blue-500/50 focus:bg-white/[0.05] placeholder-zinc-600 transition-colors"
              />
              <input
                value={env.baseUrl}
                onChange={(e) => updateEnv(i, 'baseUrl', e.target.value)}
                placeholder="http://localhost:3000"
                className="flex-1 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 font-mono text-[12px] text-zinc-200 outline-none focus:border-blue-500/50 focus:bg-white/[0.05] placeholder-zinc-600 transition-colors"
              />
              <button
                onClick={() => removeEnv(i)}
                className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-zinc-500 hover:bg-red-500/10 hover:border-red-500/30 hover:text-red-400 transition-colors"
              >
                <X className="h-3.5 w-3.5" strokeWidth={2} />
              </button>
            </div>
          ))}
          <button
            onClick={addEnv}
            className="text-[12px] text-blue-400 hover:text-blue-300 transition-colors mt-1"
          >
            + Add environment
          </button>
        </div>
        <div className="flex justify-end pt-3 gap-2 border-t border-white/[0.06]">
          {saved && (
            <span className="flex items-center gap-1 text-[11px] text-emerald-400">
              <Check className="h-3.5 w-3.5" strokeWidth={2} /> Saved
            </span>
          )}
          <SaveBtn saving={saving} onClick={save} />
        </div>
      </Card>

      <div className="rounded-lg border border-white/10 bg-white/[0.02] px-4 py-3 flex items-start gap-2.5">
        <Info className="h-3.5 w-3.5 text-blue-400/70 shrink-0 mt-0.5" strokeWidth={2} />
        <p className="text-[11px] text-zinc-500">
          The{' '}
          <code className="text-zinc-300 bg-white/[0.06] px-1 py-0.5 rounded text-[10px]">
            local
          </code>{' '}
          environment is used as the default base URL for simulations and endpoint testing.
        </p>
      </div>
    </div>
  );
}

function AppearanceSection() {
  const [theme, setTheme] = useState<'dark' | 'darker'>('dark');
  const [accentColor, setAccent] = useState('blue');
  const [density, setDensity] = useState<'comfortable' | 'compact'>('comfortable');
  const [animations, setAnimations] = useState(true);

  const accents = ['blue', 'violet', 'emerald', 'amber', 'rose'];
  const accentDots: Record<string, string> = {
    blue: '#3b82f6',
    violet: '#8b5cf6',
    emerald: '#34d399',
    amber: '#fbbf24',
    rose: '#fb7185',
  };

  return (
    <div className="space-y-5">
      <SectionHeader
        icon={Palette}
        label="Appearance"
        description="Customize the look and feel of the dashboard"
      />
      <Card>
        <Row label="Theme" description="Choose your preferred colour scheme">
          <div className="flex gap-px overflow-hidden rounded-lg border border-white/10">
            {(['dark', 'darker'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTheme(t)}
                className={`px-3 py-1.5 text-[12px] transition-colors capitalize ${theme === t
                  ? 'bg-blue-500 text-white'
                  : 'text-zinc-400 hover:text-zinc-200 bg-white/[0.02] hover:bg-white/[0.05]'
                  }`}
              >
                {t}
              </button>
            ))}
          </div>
        </Row>
        <Row label="Accent Colour" description="Primary highlight colour throughout the UI">
          <div className="flex items-center gap-2">
            {accents.map((a) => (
              <button
                key={a}
                onClick={() => setAccent(a)}
                className={`h-5 w-5 rounded-full border-2 transition-transform ${accentColor === a
                  ? 'scale-110 border-white/40'
                  : 'border-transparent hover:scale-105'
                  }`}
                style={{ background: accentDots[a] }}
              />
            ))}
          </div>
        </Row>
        <Row label="Density" description="Controls spacing throughout the layout">
          <div className="flex gap-px overflow-hidden rounded-lg border border-white/10">
            {(['comfortable', 'compact'] as const).map((d) => (
              <button
                key={d}
                onClick={() => setDensity(d)}
                className={`px-3 py-1.5 text-[12px] transition-colors capitalize ${density === d
                  ? 'bg-blue-500 text-white'
                  : 'text-zinc-400 hover:text-zinc-200 bg-white/[0.02] hover:bg-white/[0.05]'
                  }`}
              >
                {d}
              </button>
            ))}
          </div>
        </Row>
        <Row label="Animations" description="Smooth transitions and micro-animations">
          <Toggle value={animations} onChange={setAnimations} />
        </Row>
      </Card>
    </div>
  );
}

function EditorSection() {
  const [fontSize, setFontSize] = useState('11');
  const [tabSize, setTabSize] = useState('2');
  const [wordWrap, setWordWrap] = useState(true);
  const [lineNumbers, setLineNumbers] = useState(true);
  const [highlight, setHighlight] = useState(true);

  return (
    <div className="space-y-5">
      <SectionHeader
        icon={Code2}
        label="Editor"
        description="Source viewer and code display preferences"
      />
      <Card>
        <Row label="Font Size" description="Monospace font size in the source viewer">
          <SelectInput
            value={fontSize}
            onChange={setFontSize}
            options={['10', '11', '12', '13', '14']}
          />
        </Row>
        <Row label="Tab Size" description="Number of spaces per indentation level">
          <SelectInput
            value={tabSize}
            onChange={setTabSize}
            options={['2', '4', '8']}
          />
        </Row>
        <Row label="Word Wrap" description="Wrap long lines in the source viewer">
          <Toggle value={wordWrap} onChange={setWordWrap} />
        </Row>
        <Row label="Line Numbers" description="Show line numbers in the source viewer gutter">
          <Toggle value={lineNumbers} onChange={setLineNumbers} />
        </Row>
        <Row
          label="Highlight Handler Line"
          description="Highlight the matched handler line in source view"
        >
          <Toggle value={highlight} onChange={setHighlight} />
        </Row>
      </Card>
    </div>
  );
}

function NotificationsSection() {
  const [scanComplete, setScanComplete] = useState(true);
  const [simulationDone, setSimulationDone] = useState(true);
  const [simulationFail, setSimulationFail] = useState(true);
  const [memoryUpdate, setMemoryUpdate] = useState(false);
  const [desktopNotifs, setDesktopNotifs] = useState(false);

  return (
    <div className="space-y-5">
      <SectionHeader
        icon={Bell}
        label="Notifications"
        description="Control when and how you're notified"
      />
      <Card>
        <Row label="Scan complete" description="Notify when a project scan finishes">
          <Toggle value={scanComplete} onChange={setScanComplete} />
        </Row>
        <Row label="Simulation complete" description="Notify when a workflow run finishes">
          <Toggle value={simulationDone} onChange={setSimulationDone} />
        </Row>
        <Row label="Simulation failure" description="Notify when a workflow step fails">
          <Toggle value={simulationFail} onChange={setSimulationFail} />
        </Row>
        <Row label="Memory updates" description="Notify on runtime memory changes">
          <Toggle value={memoryUpdate} onChange={setMemoryUpdate} />
        </Row>
        <Row label="Desktop notifications" description="Show browser push notifications">
          <Toggle value={desktopNotifs} onChange={setDesktopNotifs} />
        </Row>
      </Card>
    </div>
  );
}

function ApiSection() {
  const [defaultBearer, setDefaultBearer] = useState('');
  const [timeout, setTimeout_] = useState('10000');
  const [autoRetry, setAutoRetry] = useState(false);
  const [showSecrets, setShowSecrets] = useState(false);

  return (
    <div className="space-y-5">
      <SectionHeader
        icon={Shield}
        label="API & Auth"
        description="Default request settings for endpoint simulation"
      />
      <Card>
        <Row
          label="Default Bearer Token"
          description="Pre-fill bearer token in simulate panels"
        >
          <div className="flex items-center gap-1.5">
            <input
              type={showSecrets ? 'text' : 'password'}
              value={defaultBearer}
              onChange={(e) => setDefaultBearer(e.target.value)}
              placeholder="eyJ…"
              className="w-48 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 font-mono text-[12px] text-zinc-200 outline-none focus:border-blue-500/50 focus:bg-white/[0.05] placeholder-zinc-600 transition-colors"
            />
            <button
              onClick={() => setShowSecrets((s) => !s)}
              className="text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              {showSecrets ? 'Hide' : 'Show'}
            </button>
          </div>
        </Row>
        <Row
          label="Request Timeout"
          description="Milliseconds before a simulated request times out"
        >
          <SelectInput
            value={timeout}
            onChange={setTimeout_}
            options={['5000', '10000', '15000', '30000', '60000']}
          />
        </Row>
        <Row
          label="Auto-retry on 5xx"
          description="Automatically retry failed requests once"
        >
          <Toggle value={autoRetry} onChange={setAutoRetry} />
        </Row>
      </Card>
    </div>
  );
}

function AdvancedSection({ onClearMemory }: { onClearMemory: () => void }) {
  const [scanOnStart, setScanOnStart] = useState(false);
  const [debugMode, setDebugMode] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState('30');
  const [clearing, setClearing] = useState(false);
  const [cleared, setCleared] = useState(false);

  const clearMemory = async () => {
    setClearing(true);
    await new Promise((r) => setTimeout(r, 800));
    setClearing(false);
    setCleared(true);
    setTimeout(() => setCleared(false), 2000);
    onClearMemory();
  };

  return (
    <div className="space-y-5">
      <SectionHeader
        icon={Terminal}
        label="Advanced"
        description="Developer and diagnostic options"
      />
      <Card>
        <Row label="Scan on start" description="Auto-scan project when the dashboard loads">
          <Toggle value={scanOnStart} onChange={setScanOnStart} />
        </Row>
        <Row label="Auto-refresh model" description="Periodically reload model.json from disk">
          <Toggle value={autoRefresh} onChange={setAutoRefresh} />
        </Row>
        {autoRefresh && (
          <Row label="Refresh interval" description="How often to poll for model changes">
            <SelectInput
              value={refreshInterval}
              onChange={setRefreshInterval}
              options={['10', '30', '60', '120']}
            />
          </Row>
        )}
        <Row label="Debug mode" description="Verbose logging in the browser console">
          <Toggle value={debugMode} onChange={setDebugMode} />
        </Row>
      </Card>

      {/* Danger zone */}
      <div className="rounded-lg border border-red-500/20 bg-red-500/[0.03] overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-red-500/10">
          <Trash2 className="h-[15px] w-[15px] text-red-400/60" strokeWidth={2} />
          <span className="text-[11px] font-semibold tracking-wider text-red-400/70">
            DANGER ZONE
          </span>
        </div>
        <div className="p-4 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[13px] text-zinc-200">Clear Runtime Memory</p>
              <p className="text-[11px] text-zinc-500 mt-0.5">
                Delete all stored memory keys and values
              </p>
            </div>
            <button
              onClick={clearMemory}
              disabled={clearing}
              className="flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/[0.06] px-3 py-1.5 text-[12px] text-red-400 hover:bg-red-500/10 disabled:opacity-50 transition-colors"
            >
              {clearing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
              ) : cleared ? (
                <Check className="h-3.5 w-3.5" strokeWidth={2} />
              ) : (
                <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
              )}
              {clearing ? 'Clearing…' : cleared ? 'Cleared' : 'Clear Memory'}
            </button>
          </div>
          <div className="flex items-center justify-between gap-4 pt-3 border-t border-red-500/10">
            <div>
              <p className="text-[13px] text-zinc-200">Reset Model</p>
              <p className="text-[11px] text-zinc-500 mt-0.5">
                Delete{' '}
                <code className="text-zinc-400 bg-white/[0.06] px-1 py-0.5 rounded text-[10px]">
                  .jetic/model.json
                </code>{' '}
                and start fresh
              </p>
            </div>
            <button className="flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/[0.06] px-3 py-1.5 text-[12px] text-red-400 hover:bg-red-500/10 transition-colors">
              <Trash2 className="h-3.5 w-3.5" strokeWidth={2} /> Reset Model
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── About badge ───────────────────────────────────────────────────────────────

function AboutBadge() {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] p-4 flex items-center gap-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04]">
        <Zap className="h-[15px] w-[15px] text-blue-400" strokeWidth={2} />
      </div>
      <div>
        <p className="text-[13.5px] font-medium text-white">Jetic Studio</p>
        <p className="text-[11px] text-zinc-500">v0.1.0 · Local development dashboard</p>
      </div>
      <div className="ml-auto flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.02] px-2.5 py-1">
        <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
        <span className="text-[11px] text-zinc-400 font-medium">Running</span>
      </div>
    </div>
  );
}

// ─── Sidebar nav item ─────────────────────────────────────────────────────────

function SettingsNavItem({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex w-full items-center gap-3 rounded-lg px-3 py-1.5 text-left text-[13.5px] transition-colors ${active
        ? 'bg-white/[0.07] text-white font-medium'
        : 'text-zinc-400 hover:bg-white/[0.03] hover:text-zinc-200'
        }`}
    >
      {active && (
        <span className="absolute -left-3 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-full bg-blue-500" />
      )}
      <Icon className="h-[15px] w-[15px] shrink-0" strokeWidth={2} />
      <span>{label}</span>
      {active && (
        <ChevronRight className="ml-auto h-3.5 w-3.5 opacity-40" strokeWidth={2} />
      )}
    </button>
  );
}

// ─── Main Settings page ────────────────────────────────────────────────────────

export function Settings() {
  const [section, setSection] = useState<SectionId>('general');
  const [model, setModel] = useState<SettingsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/model')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setModel(data))
      .catch(() => { })
      .finally(() => setLoading(false));
  }, []);

  const renderSection = () => {
    switch (section) {
      case 'general': return <GeneralSection model={model} />;
      case 'environments': return <EnvironmentsSection model={model} />;
      case 'appearance': return <AppearanceSection />;
      case 'editor': return <EditorSection />;
      case 'notifications': return <NotificationsSection />;
      case 'api': return <ApiSection />;
      case 'advanced': return <AdvancedSection onClearMemory={() => { }} />;
      default: return null;
    }
  };

  return (
    <div className="flex min-h-full w-full flex-col">

      {/* ── Header ── */}
      <div className="flex items-center justify-between border-b border-white/10 px-6 py-5">
        <div>
          <h1 className="text-[15px] font-medium text-white leading-none">Settings</h1>
          <p className="mt-0.5 text-[11px] text-zinc-500">Configure Jetic Studio</p>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Settings sidebar ── */}
        <nav className="w-52 shrink-0 border-r border-white/10 bg-black/20 select-none overflow-y-auto p-3 space-y-0.5">

          {/* Group label */}
          <span className="px-3 pb-1.5 pt-1 block text-[11px] font-semibold tracking-wider text-zinc-500">
            CONFIGURATION
          </span>

          <div className="flex flex-col gap-0.5">
            {SECTIONS.map(({ id, label, icon }) => (
              <SettingsNavItem
                key={id}
                icon={icon}
                label={label}
                active={section === id}
                onClick={() => setSection(id)}
              />
            ))}
          </div>

          {/* Version pill */}
          <div className="hidden pt-4 mt-2 border-t border-white/10">
            <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.02] px-2.5 py-1 w-fit">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
              <span className="text-[11px] font-medium text-zinc-400">v0.1.0</span>
            </div>
          </div>
        </nav>

        {/* ── Content panel ── */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-16 animate-pulse rounded-lg border border-white/10 bg-white/[0.02]"
                  style={{ opacity: 1 - i * 0.25 }}
                />
              ))}
            </div>
          ) : (
            <>
              <AboutBadge />
              {renderSection()}
            </>
          )}
        </div>
      </div>
    </div>
  );
}