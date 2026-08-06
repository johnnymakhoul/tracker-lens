import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/toaster';
import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArrowRight,
  Ban,
  ChevronDown,
  CircleHelp,
  Database,
  Globe2,
  LayoutDashboard,
  LockKeyhole,
  MoreHorizontal,
  Network,
  Pause,
  Play,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Target,
  TimerReset,
} from 'lucide-react';

type RequestStatus = 'blocked' | 'allowed';
type Signal = { name: string; count: number; detail: string };
type TrackedRequest = {
  id: string;
  host: string;
  path: string;
  source: string;
  time: string;
  status: RequestStatus;
  kind: string;
  initials: string;
  signals: Signal[];
};

type LiveSnapshot = {
  enabled: boolean;
  tabId?: number;
  snapshot: {
    page?: {
      host?: string;
      title?: string;
      url?: string;
    } | null;
    requests?: Array<{
      id: string;
      host: string;
      path: string;
      url: string;
      method?: string;
      type?: string;
      party?: string;
      timestamp?: number;
      signals?: {
        query?: Array<{ name: string; value: string }>;
        cookies?: Array<{ name: string; value: string }>;
        body?: Array<{ name: string; value: string }>;
        context?: Array<{ name: string; value: string }>;
        headers?: Record<string, string>;
      };
    }>;
    stats?: {
      total: number;
      thirdParty: number;
      withCookies: number;
      withContext: number;
    };
  };
};

type ExtensionRuntime = {
  sendMessage: (message: unknown, callback: (response?: LiveSnapshot) => void) => void;
};

function getExtensionRuntime(): ExtensionRuntime | null {
  const candidate = (window as Window & { chrome?: { runtime?: ExtensionRuntime } }).chrome?.runtime;
  return candidate?.sendMessage ? candidate : null;
}

function formatSignalDetail(name: string, values: Array<{ name: string; value: string }>, headers?: Record<string, string>) {
  if (name === 'Request headers') {
    const present = Object.entries(headers || {}).filter(([, value]) => value);
    return present.length ? present.map(([key, value]) => `${key}: ${value}`).join(' · ') : 'No selected identifying headers observed';
  }
  if (!values.length) return 'No values observed for this signal type';
  return values.slice(0, 8).map((item) => item.name ? `${item.name}=${item.value || '[empty]'}` : item.value).join(' · ');
}

function mapLiveRequest(request: NonNullable<LiveSnapshot['snapshot']['requests']>[number], index: number): TrackedRequest {
  const signals = request.signals || {};
  const signalGroups: Signal[] = [
    { name: 'URL parameters', count: signals.query?.length || 0, detail: formatSignalDetail('URL parameters', signals.query || []) },
    { name: 'Cookies', count: signals.cookies?.length || 0, detail: formatSignalDetail('Cookies', signals.cookies || []) },
    { name: 'Request body', count: signals.body?.length || 0, detail: formatSignalDetail('Request body', signals.body || []) },
    { name: 'Page context', count: signals.context?.length || 0, detail: formatSignalDetail('Page context', signals.context || []) },
    { name: 'Request headers', count: Object.values(signals.headers || {}).filter(Boolean).length, detail: formatSignalDetail('Request headers', [], signals.headers) },
  ].filter((signal) => signal.count > 0);

  return {
    id: request.id,
    host: request.host || 'unknown destination',
    path: request.path || '/',
    source: 'current tab',
    time: request.timestamp ? new Date(request.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'just now',
    status: 'allowed',
    kind: `${request.type || 'Request'} · ${request.method || 'GET'}`,
    initials: (request.host || '?').replace(/^www\./, '').charAt(0).toUpperCase(),
    signals: signalGroups.length ? signalGroups : [{ name: 'No exposed values', count: 0, detail: 'The browser observed the destination, but no readable signal values were available.' }],
  };
}

const queryClient = new QueryClient();

const requests: TrackedRequest[] = [
  {
    id: 'r-01',
    host: 'connect.facebook.net',
    path: '/en_US/fbevents.js',
    source: 'newsroom.example',
    time: 'just now',
    status: 'blocked',
    kind: 'Script · 42.8 KB',
    initials: 'f',
    signals: [
      { name: 'Page URL', count: 1, detail: 'https://newsroom.example/article/quiet-machines' },
      { name: 'Browser fingerprint', count: 7, detail: 'Canvas, screen size, language, timezone, platform and feature probes' },
      { name: 'Referrer', count: 1, detail: 'https://newsroom.example/' },
    ],
  },
  {
    id: 'r-02',
    host: 'analytics.google.com',
    path: '/g/collect?v=2',
    source: 'newsroom.example',
    time: '12 sec ago',
    status: 'allowed',
    kind: 'Beacon · 1.2 KB',
    initials: 'G',
    signals: [
      { name: 'Page URL', count: 1, detail: 'https://newsroom.example/article/quiet-machines' },
      { name: 'Event metadata', count: 3, detail: 'Page view, viewport size and engagement timestamp' },
    ],
  },
  {
    id: 'r-03',
    host: 'cdn.segment.com',
    path: '/analytics.js/v1/project',
    source: 'newsroom.example',
    time: '31 sec ago',
    status: 'blocked',
    kind: 'Script · 18.4 KB',
    initials: 'S',
    signals: [
      { name: 'Page URL', count: 1, detail: 'https://newsroom.example/article/quiet-machines' },
      { name: 'Anonymous ID', count: 1, detail: 'Segment anonymousId: 61b3…b729' },
    ],
  },
  {
    id: 'r-04',
    host: 'static.ads-twitter.com',
    path: '/uwt.js',
    source: 'newsroom.example',
    time: '1 min ago',
    status: 'blocked',
    kind: 'Script · 9.7 KB',
    initials: 'x',
    signals: [
      { name: 'Page URL', count: 1, detail: 'https://newsroom.example/article/quiet-machines' },
      { name: 'Campaign ID', count: 2, detail: 'Conversion and click attribution parameters' },
    ],
  },
  {
    id: 'r-05',
    host: 'fonts.googleapis.com',
    path: '/css2?family=Newsreader',
    source: 'newsroom.example',
    time: '2 min ago',
    status: 'allowed',
    kind: 'Stylesheet · 2.1 KB',
    initials: 'A',
    signals: [
      { name: 'Requested font', count: 1, detail: 'Newsreader:400,600' },
    ],
  },
];

const bars = [26, 34, 21, 43, 30, 56, 48, 63, 45, 68, 51, 60, 38, 73, 57, 82, 64, 77, 91, 66, 78, 57, 69, 52, 72, 86, 62, 78, 93, 74, 81, 88];

function CaptureSwitch({ on, onToggle, compact = false }: { on: boolean; onToggle: () => void; compact?: boolean }) {
  return (
    <button
      type="button"
      className={`switch ${on ? 'on' : ''}`}
      onClick={onToggle}
      aria-label={on ? 'Pause capture' : 'Resume capture'}
      data-testid="button-toggle-capture"
      style={compact ? undefined : { width: 39, height: 22 }}
    >
      <div className="switch-thumb" />
    </button>
  );
}

function Sidebar({ captureOn, onToggle, page, onPage }: { captureOn: boolean; onToggle: () => void; page: string; onPage: (page: string) => void }) {
  const items = [
    { label: 'Overview', icon: LayoutDashboard },
    { label: 'Destinations', icon: Globe2 },
    { label: 'Signals', icon: Target },
  ];
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark"><ShieldCheck size={17} strokeWidth={2.1} /></div>
        <div className="brand-copy">
          <div className="brand-title">Tracker Lens</div>
          <div className="brand-caption">browser observability</div>
        </div>
      </div>
      <div className="nav-label">Inspect</div>
      <nav className="nav-list" aria-label="Main navigation">
        {items.map(({ label, icon: Icon }) => (
          <button
            type="button"
            key={label}
            className={`nav-item ${page === label ? 'active' : ''}`}
            onClick={() => onPage(label)}
            data-testid={`button-nav-${label.toLowerCase()}`}
          >
            <Icon size={15} strokeWidth={1.8} /><span>{label}</span>
          </button>
        ))}
      </nav>
      <div className="sidebar-spacer" />
      <div className="capture-card">
        <div className="capture-label"><span>Capture</span><CaptureSwitch on={captureOn} onToggle={onToggle} compact /></div>
        <div className="capture-sub">{captureOn ? 'Observing this tab in real time.' : 'Paused until you resume observation.'}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: captureOn ? 'hsl(var(--sidebar-primary))' : 'rgba(233,237,227,.45)', font: '9px var(--app-font-mono)' }}>
          {captureOn ? <Activity size={11} /> : <Pause size={11} />} {captureOn ? 'LIVE SESSION' : 'SESSION PAUSED'}
        </div>
      </div>
      <div className="sidebar-footer">
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', color: 'rgba(233,237,227,.6)', marginBottom: 5 }}><LockKeyhole size={11} /> Local by default</div>
        No browsing data leaves this device.
      </div>
    </aside>
  );
}

function StatRow({ icon: Icon, name, note, value }: { icon: typeof Activity; name: string; note: string; value: string }) {
  return (
    <div className="stat-row" data-testid={`stat-${name.toLowerCase().replaceAll(' ', '-')}`}>
      <div className="stat-icon"><Icon size={15} /></div>
      <div className="stat-copy"><div className="stat-name">{name}</div><div className="stat-note">{note}</div></div>
      <div className="stat-value">{value}</div>
    </div>
  );
}

function RequestList({ items, selected, onSelect, query, onQuery }: { items: TrackedRequest[]; selected: string; onSelect: (id: string) => void; query: string; onQuery: (query: string) => void }) {
  const filtered = useMemo(() => items.filter((item) => `${item.host} ${item.source} ${item.kind}`.toLowerCase().includes(query.toLowerCase())), [items, query]);
  return (
    <section className="panel list-panel" aria-label="Observed requests">
      <div className="list-toolbar">
        <div className="search-wrap">
          <Search size={14} />
          <input value={query} onChange={(event) => onQuery(event.target.value)} className="search-input" type="search" placeholder="Filter destinations..." aria-label="Filter destinations" data-testid="input-search-destinations" />
        </div>
        <button type="button" className="filter-button" aria-label="Filter request types" data-testid="button-filter"><SlidersHorizontal size={14} /></button>
      </div>
      {filtered.length ? filtered.map((request) => (
        <button type="button" key={request.id} onClick={() => onSelect(request.id)} className={`request-row ${selected === request.id ? 'selected' : ''}`} data-testid={`button-request-${request.id}`}>
          <div className="destination-mark">{request.initials}</div>
          <div className="request-copy"><div className="request-host">{request.host}</div><div className="request-type">{request.kind}</div></div>
          <div className="request-time">{request.time}</div>
          <div className={`request-status ${request.status}`} />
        </button>
      )) : (
        <div className="empty-state"><Search size={21} /><h3>No matching destinations</h3><p>Try a host name, request type, or clear the current filter.</p></div>
      )}
    </section>
  );
}

function DetailPanel({ request }: { request?: TrackedRequest }) {
  const [expanded, setExpanded] = useState<string | null>(request?.signals[0]?.name ?? null);
  if (!request) return <section className="panel detail-panel"><div className="empty-state"><Target size={24} /><h3>Select a request</h3><p>Choose a destination to inspect the signals it attempted to send.</p></div></section>;
  return (
    <section className="panel detail-panel" data-testid="panel-request-detail">
      <div className="detail-head">
        <div className="detail-title">
          <div className="destination-mark">{request.initials}</div>
          <div><h3>{request.host}</h3><p>{request.path}</p></div>
        </div>
        <div className={`status-badge ${request.status}`}>{request.status === 'blocked' ? 'Blocked' : 'Allowed'}</div>
      </div>
      <div className="data-heading"><h4>Data signals observed</h4><span>{request.signals.reduce((total, signal) => total + signal.count, 0)} signals</span></div>
      <div>
        {request.signals.map((signal) => {
          const isOpen = expanded === signal.name;
          return (
            <div className="signal-row" key={signal.name}>
              <button type="button" className="signal-button" onClick={() => setExpanded(isOpen ? null : signal.name)} data-testid={`button-expand-signal-${signal.name.toLowerCase().replaceAll(' ', '-')}`}>
                {signal.name === 'Browser fingerprint' ? <FingerprintIcon /> : signal.name === 'Page URL' ? <Globe2 size={14} /> : <Database size={14} />}
                <span className="signal-name">{signal.name}</span><span className="signal-count">{signal.count} {signal.count === 1 ? 'value' : 'values'}</span><ChevronDown size={14} className={`signal-expand ${isOpen ? 'open' : ''}`} />
              </button>
              {isOpen && <div className="signal-detail">{signal.detail}</div>}
            </div>
          );
        })}
      </div>
      <div className="detail-meta">
        <div className="meta-box"><span className="meta-label">Source page</span><div className="meta-value">{request.source}</div></div>
        <div className="meta-box"><span className="meta-label">Method</span><div className="meta-value">GET / HTTPS</div></div>
        <div className="meta-box"><span className="meta-label">Observed</span><div className="meta-value">{request.time}</div></div>
      </div>
    </section>
  );
}

function FingerprintIcon() {
  return <span style={{ display: 'grid', placeItems: 'center', width: 14, height: 14, color: 'hsl(var(--muted-foreground))' }}><span style={{ width: 10, height: 10, border: '1px solid currentColor', borderRadius: '50%', borderBottomColor: 'transparent' }} /></span>;
}

function Dashboard({ captureOn, onToggle, liveSnapshot, liveMode }: { captureOn: boolean; onToggle: () => void; liveSnapshot: LiveSnapshot['snapshot'] | null; liveMode: boolean }) {
  const [range, setRange] = useState('24 hours');
  const [selected, setSelected] = useState(requests[0].id);
  const [query, setQuery] = useState('');
  const liveRequests = useMemo(() => (liveSnapshot?.requests || []).map(mapLiveRequest), [liveSnapshot]);
  const displayedRequests = liveMode ? liveRequests : requests;
  const selectedRequest = displayedRequests.find((request) => request.id === selected) || displayedRequests[0];
  const blocked = displayedRequests.filter((request) => request.status === 'blocked').length;
  const stats = liveSnapshot?.stats;
  const currentHost = liveSnapshot?.page?.host || 'newsroom.example';
  const observedCount = liveMode ? stats?.total || 0 : 148;
  const destinationCount = liveMode ? stats?.thirdParty || 0 : 23;
  const signalCount = liveMode ? (stats?.withCookies || 0) + (stats?.withContext || 0) : 47;

  useEffect(() => {
    if (selectedRequest && selectedRequest.id !== selected) setSelected(selectedRequest.id);
  }, [selected, selectedRequest]);

  return (
    <main className="main">
      <header className="topbar">
        <div className="crumbs"><span>Current tab</span><ArrowRight size={12} /><strong>newsroom.example</strong></div>
        <div className="top-actions">
          <button type="button" className="icon-button" aria-label="Help" data-testid="button-help"><CircleHelp size={15} /></button>
          <button type="button" className="icon-button" aria-label="Settings" data-testid="button-settings"><Settings2 size={15} /></button>
          <button type="button" className="icon-button" aria-label="More options" data-testid="button-more"><MoreHorizontal size={16} /></button>
        </div>
      </header>
      <div className="content">
        {!captureOn && <div className="paused-banner animate-rise"><Pause size={17} /><div style={{ flex: 1 }}><strong>Capture is paused</strong><span>New requests will not be recorded until you resume the session.</span></div><button type="button" className="icon-button" onClick={onToggle} aria-label="Resume capture" data-testid="button-resume-capture"><Play size={14} /></button></div>}
        <div className="headline-row animate-rise">
          <div><div className="eyebrow">{liveMode ? 'Live tab / field notes' : 'Session / field notes'}</div><h1>Make the invisible legible.</h1><p className="headline-copy">A quiet readout of what this page asks other companies to know about you.</p></div>
          <div className="range-picker" role="group" aria-label="Time range">
            {['1 hour', '24 hours', '7 days'].map((item) => <button type="button" key={item} className={`range-button ${range === item ? 'active' : ''}`} onClick={() => setRange(item)} data-testid={`button-range-${item.replace(' ', '-')}`}>{item}</button>)}
          </div>
        </div>
        <div className="overview-grid">
          <section className="panel hero-panel animate-rise delay-1">
            <div className="panel-kicker"><span>Observed activity · {range}</span><span className="live-pill"><span className="live-dot" /> {captureOn ? 'Live' : 'Paused'}</span></div>
            <div className="metric"><div className="metric-number">{observedCount}</div><div className="metric-label">requests observed</div></div>
            <div className="metric-foot"><b>{blocked} destinations blocked</b> before they could connect · 11.4 KB kept local</div>
            <div className="bar-chart" aria-label="Request activity over time">{bars.map((height, index) => <div key={`${height}-${index}`} className="bar" style={{ height: `${height}%` }} />)}</div>
            <div className="chart-caption"><span>12:00 AM</span><span>now</span></div>
          </section>
          <section className="panel stats-panel animate-rise delay-2">
            <StatRow icon={Ban} name="Blocked" note="Known tracking destinations" value="64" />
            <StatRow icon={Network} name="Destinations" note="Unique third parties" value={String(destinationCount)} />
            <StatRow icon={Database} name="Data signals" note="Values in outbound requests" value={String(signalCount)} />
            <StatRow icon={TimerReset} name="Time observed" note="Since session started" value="02:14" />
          </section>
        </div>
        <div className="section-title-row animate-rise delay-2"><div className="section-title">Request ledger</div><div className="section-note">select a row to inspect the payload</div></div>
        <div className="request-layout animate-rise delay-3"><RequestList items={displayedRequests} selected={selected} onSelect={setSelected} query={query} onQuery={setQuery} /><DetailPanel request={selectedRequest} /></div>
      </div>
    </main>
  );
}

function App() {
  const [captureOn, setCaptureOn] = useState(true);
  const [page, setPage] = useState('Overview');
  const [liveSnapshot, setLiveSnapshot] = useState<LiveSnapshot['snapshot'] | null>(null);
  const [liveMode, setLiveMode] = useState(false);

  useEffect(() => {
    const runtime = getExtensionRuntime();
    if (!runtime) return;
    setLiveMode(true);
    const refresh = () => runtime.sendMessage({ type: 'getSnapshot' }, (response) => {
      if (!response) return;
      setCaptureOn(response.enabled);
      setLiveSnapshot(response.snapshot);
    });
    refresh();
    const timer = window.setInterval(refresh, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const toggleCapture = () => {
    const next = !captureOn;
    setCaptureOn(next);
    const runtime = getExtensionRuntime();
    runtime?.sendMessage({ type: 'setCapture', enabled: next }, () => undefined);
  };

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <div className="app-shell">
          <Sidebar captureOn={captureOn} onToggle={toggleCapture} page={page} onPage={setPage} />
          <Dashboard captureOn={captureOn} onToggle={toggleCapture} liveSnapshot={liveSnapshot} liveMode={liveMode} />
        </div>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;