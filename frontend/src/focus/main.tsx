import React, { FormEvent, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { api, ApiError, Company, Contact, contactAge, date, group, host, mergeSources, Run, runnable, safeUrl, Source, statusText } from './model';
import './style.css';
import MarketplaceResearch from './MarketplaceResearch';

type View = 'companies' | 'saved' | 'sources' | 'tasks' | 'marketplace';
type User = { id: string; name: string; email: string };
type Research = { summary?: string; completedAt?: string; engine?: string; crmOnly?: boolean; facts?: { label?: string; value?: string; sourceUrl?: string; sourceTitle?: string }[]; sources?: { title?: string; url?: string; name?: string }[] };
type RunDetail = { run: Run; diagnostics?: { phases?: { id: string; name: string; result: string }[]; recommendedNextAction?: string }; events?: { id?: string; type?: string; message?: string; createdAt?: string }[]; shards?: { providerCode: string; status: string }[] };

function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, React.ReactNode> = {
    search: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/></>,
    company: <><rect x="4" y="4" width="11" height="17" rx="1"/><path d="M15 10h5v11H4M8 8h3m-3 4h3m-3 4h3m5-2h1m-1 3h1"/></>,
    bookmark: <path d="M6 3h12v18l-6-4-6 4z"/>,
    sources: <><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 4 16 4 16 0V5M4 12c0 4 16 4 16 0"/></>,
    tasks: <><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 3h6v4H9zM9 11h6m-6 4h6"/></>,
    arrow: <path d="M6 18 18 6M6 6h12v12"/>,
    refresh: <><path d="M20 9a8 8 0 1 0 0 7M20 3v6h-6"/></>,
    close: <path d="m6 6 12 12M6 18 18 6"/>,
    plus: <path d="M12 4v16M4 12h16"/>,
    check: <path d="m5 12 4 4L19 6"/>,
    link: <><path d="m10 14 4-4m-6 6-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 1 1-1a4 4 0 1 1 6 6l-4 4a4 4 0 0 1-6 0"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.company}</svg>;
}
function External({ url, children }: { url?: string; children: React.ReactNode }) {
  const href = safeUrl(url);
  return href ? <a href={href} target="_blank" rel="noopener noreferrer">{children}<Icon name="arrow" size={13}/></a> : <span className="muted">{children}</span>;
}
function Empty({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="empty"><Icon name="search" size={32}/><h3>{title}</h3><p>{children}</p></div>;
}
function Dialog({ title, children, onClose, wide = false }: { title: string; children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const el = ref.current!; el.showModal(); return () => el.close(); }, []);
  return <dialog ref={ref} className={wide ? 'modal wide' : 'modal'} onCancel={onClose} onClick={e => { if (e.target === e.currentTarget) onClose(); }}><div className="modal-head"><h2>{title}</h2><button type="button" className="icon-button" aria-label="关闭弹窗" onClick={onClose}><Icon name="close"/></button></div>{children}</dialog>;
}
function App() {
  const [auth, setAuth] = useState<'loading' | 'login' | 'ready'>('loading');
  const [user, setUser] = useState<User | null>(null);
  const [view, setView] = useState<View>('companies');
  const [companies, setCompanies] = useState<Company[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [campaigns, setCampaigns] = useState<Record<string, string>>({});
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [market, setMarket] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [query, filter, market, sourceFilter, view]);
  const [selected, setSelected] = useState<Company | null>(null);
  const [newSearch, setNewSearch] = useState(false);
  const [register, setRegister] = useState(false);
  const [toast, setToast] = useState('');
  const [runDetail, setRunDetail] = useState<RunDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const refreshing = useRef(false);
  function notify(message: string) { setToast(message); window.clearTimeout(timer.current); timer.current = window.setTimeout(() => setToast(''), 6000); }
  function fail(e: unknown) { if (e instanceof ApiError && e.status === 401) { setUser(null); setAuth('login'); } else notify(e instanceof Error ? e.message : '操作失败，请重试'); }

  async function refresh() {
    if (refreshing.current) return;
    refreshing.current = true; setBusy(true);
    const results = await Promise.allSettled([
      api<{ opportunities: Company[] }>('/api/tools/website-opportunities'),
      api<{ providers: Source[] }>('/api/lead-finder/providers'),
      api<{ providers: Source[] }>('/api/lead-finder/provider-catalog'),
      api<{ runs: Run[] }>('/api/prospect-runs?limit=100'),
      api<{ campaigns: { id: string; name: string }[] }>('/api/prospect-campaigns')
    ] as const);
    const [c, runtime, catalog, r, cam] = results;
    if (c.status === 'fulfilled') setCompanies(c.value.opportunities);
    if (runtime.status === 'fulfilled' && catalog.status === 'fulfilled') setSources(mergeSources(catalog.value.providers, runtime.value.providers));
    if (r.status === 'fulfilled') setRuns(r.value.runs);
    if (cam.status === 'fulfilled') setCampaigns(Object.fromEntries(cam.value.campaigns.map(x => [x.id, x.name])));
    const labels = ['企业资料', '来源连接状态', '来源目录', '任务记录', '项目名称'];
    const errors = results.flatMap((x, i) => x.status === 'rejected' ? [`${labels[i]}：${x.reason instanceof Error ? x.reason.message : '读取失败'}`] : []);
    setLoadError(errors.join('；'));
    if (results.some(x => x.status === 'rejected' && x.reason instanceof ApiError && x.reason.status === 401)) { setUser(null); setAuth('login'); }
    refreshing.current = false; setBusy(false);
  }
  useEffect(() => { void api<{ user: User }>('/api/auth/me').then(x => { setUser(x.user); setAuth('ready'); }).catch(e => { setAuth('login'); if (!(e instanceof ApiError && e.status === 401)) setLoadError('无法连接本地服务，请先使用桌面快捷方式启动 GoodJob。'); }); return () => window.clearTimeout(timer.current); }, []);
  useEffect(() => { if (auth === 'ready') void refresh(); }, [auth]);
  useEffect(() => {
    if (!runs.some(r => ['queued', 'running'].includes(r.status)) || auth !== 'ready') return;
    const id = window.setInterval(() => { if (!document.hidden) void refresh(); }, 6000);
    return () => clearInterval(id);
  }, [runs, auth]);
  const realContact = (c: Company) => !!c.extractedContacts?.some(x => x.emails?.length || x.phones?.length || x.whatsapp?.length) || !!c.contactInfo && !/^(未知|待维护|待确认|—|无公开)/.test(c.contactInfo);
  const listed = companies.filter(c => view !== 'saved' || !!c.shortlistedAt)
    .filter(c => filter === 'excluded' ? c.status === 'excluded' : c.status !== 'excluded')
    .filter(c => filter !== 'contacts' || realContact(c))
    .filter(c => filter !== 'missing' || !realContact(c))
    .filter(c => filter !== 'stale' || contactAge(c).stale)
    .filter(c => market === 'all' || c.country === market)
    .filter(c => sourceFilter === 'all' || c.source === sourceFilter)
    .filter(c => `${c.company} ${c.website} ${c.country} ${c.business} ${c.sourceLabel}`.toLowerCase().includes(query.toLowerCase()));
  const pages = Math.max(1, Math.ceil(listed.length / 12));
  const currentPage = Math.min(page, pages);
  const visibleCompanies = listed.slice((currentPage - 1) * 12, currentPage * 12);
  const markets = [...new Set(companies.map(x => x.country).filter(Boolean))].sort();
  const sourceNames = new Map(companies.map(c => [c.source, c.sourceLabel || c.source]));
  async function save(c: Company) {
    try { await api('/api/prospect-list/batch', { method: 'PATCH', body: JSON.stringify({ ids: [c.id], action: 'shortlist', requestId: `focus:${crypto.randomUUID()}` }) }); await refresh(); setSelected(s => s?.id === c.id ? { ...c, shortlistedAt: new Date().toISOString() } : s); notify('已加入研究清单，完整系统同步可见'); } catch (e) { fail(e); }
  }
  async function openRun(run: Run) {
    setDetailLoading(true);
    try { const detail = await api<RunDetail>(`/api/prospect-runs/${encodeURIComponent(run.id)}`); setRunDetail(detail); } catch (e) { fail(e); } finally { setDetailLoading(false); }
  }
  if (auth === 'loading') return <main className="login"><h2>正在连接 GoodJob…</h2><p>企业资料工作区</p></main>;
  if (auth === 'login') return <Login error={loadError} onLogin={u => { setUser(u); setAuth('ready'); }}/ >;
  const nav = [{ id: 'companies', icon: 'company', label: '企业发现' }, { id: 'saved', icon: 'bookmark', label: '研究清单' }, { id: 'sources', icon: 'sources', label: '数据来源' }, { id: 'tasks', icon: 'tasks', label: '搜索任务' }, { id: 'marketplace', icon: 'search', label: '电商资料' }] as const;
  const titles = { marketplace: ['电商资料', '研究非洲本地平台的公开商品，保留来源与资料时间。'], companies: ['企业发现', '整理企业资料，逐一核实来源与联系信息。'], saved: ['研究清单', '把值得继续核实的企业放在一起。'], sources: ['数据来源', '先看清来源提供什么，再决定是否使用。'], tasks: ['搜索任务', '保留每次搜索的条件、来源和执行结果。'] };
  return <div className="app-shell"><aside className="sidebar"><a className="brand" href="/focus.html"><span className="brand-mark">G<span>·</span></span><div>GoodJob<small>企业资料工作区</small></div></a><p className="nav-label">精简工作区</p><nav aria-label="工作区导航">{nav.map(n => <button key={n.id} className={view === n.id ? 'active' : ''} onClick={() => { setView(n.id); setQuery(''); setFilter('all'); }}><Icon name={n.icon}/>{n.label}{n.id === 'saved' && <small>{companies.filter(c => !!c.shortlistedAt).length}</small>}</button>)}</nav><div className="sidebar-bottom"><p>与你的 GoodJob 共用数据</p><a href="/" target="_blank" rel="noopener noreferrer">打开完整系统<Icon name="arrow" size={15}/></a><div className="user"><span>{(user?.name || 'G').slice(0, 1)}</span><div>{user?.name || '当前用户'}<small>当前登录账号</small></div><button className="icon-button" aria-label="退出登录" onClick={() => { void api('/api/auth/logout', { method: 'POST' }).then(() => { setUser(null); setAuth('login'); }).catch(fail); }}>退出</button></div></div></aside>
  <main className="workspace"><header className="topbar"><span><i className="status-dot"/>本地工作区</span><div><span className="quiet">保留来源，核实事实</span><button className="icon-button" onClick={() => void refresh()} aria-label="刷新数据" disabled={busy}><Icon name="refresh"/></button></div></header><div className="page"><div className="page-heading"><div><h1>{titles[view][0]}</h1><p>{titles[view][1]}</p></div>{view === 'companies' && <div className="actions"><button onClick={() => setRegister(true)}><Icon name="link" size={17}/>登记官网</button><button className="primary" onClick={() => setNewSearch(true)}><Icon name="plus" size={18}/>新建搜索</button></div>}</div>
  {loadError && <div className="error" role="alert">{loadError}<button onClick={() => void refresh()}>重新读取</button></div>}
  {(view === 'companies' || view === 'saved') && <>
    {view === 'companies' && <div className="guide"><div className="guide-emblem"><Icon name="search" size={23}/></div><div><strong>从企业名字，走到可核实的资料</strong><p>搜索命中只是候选。官网、联系人来源、资料时间，在详情里逐项确认。</p></div><button className="text-button" onClick={() => setView('sources')}>查看来源目录<Icon name="arrow" size={15}/></button></div>}
    <section className="list-panel"><div className="list-title"><h2>{view === 'saved' ? '我的研究清单' : '全部历史候选'}<span>{listed.length} 家</span></h2><span className="quiet">{busy ? '正在同步…' : '与原系统同步'}</span></div><div className="filters"><label className="search-field"><Icon name="search" size={18}/><input aria-label="搜索企业" placeholder="搜索企业、官网或业务关键词" value={query} onChange={e => setQuery(e.target.value)}/></label><select aria-label="目标市场" value={market} onChange={e => setMarket(e.target.value)}><option value="all">全部市场</option>{markets.map(x => <option key={x}>{x}</option>)}</select><select aria-label="结果数据源" value={sourceFilter} onChange={e => setSourceFilter(e.target.value)}><option value="all">全部来源</option>{[...sourceNames].filter(([id]) => !!id).map(([id, name]) => <option value={id} key={id}>{name}</option>)}</select></div><div className="tabs" aria-label="名单筛选">{[['all', '全部'], ['contacts', '有联系资料'], ['missing', '缺联系资料'], ['stale', '资料待更新'], ['excluded', '已排除']].map(([key, name]) => <button className={filter === key ? 'active' : ''} key={key} onClick={() => setFilter(key)}>{name}</button>)}</div>
    {listed.length ? <div className="table-scroll"><table><thead><tr><th>企业 / 官网</th><th>市场</th><th>发现来源</th><th>联系资料</th><th>核验状态</th><th aria-label="操作"></th></tr></thead><tbody>{visibleCompanies.map(c => <tr key={c.id}><td><button className="company-name" title={c.company} onClick={() => setSelected(c)}>{c.company || '待确认企业名称'}</button><small>{host(c.website)}</small></td><td>{c.country || '待确认'}</td><td><span className="source-tag">{c.sourceLabel || c.source || '来源待确认'}</span><small>记录于 {date(c.createdAt)}</small></td><td><span className={realContact(c) ? 'contact-present' : 'muted'}>{realContact(c) ? '已收集，待确认有效性' : '暂未收集'}</span><small className={contactAge(c).stale ? 'warning-text' : ''}>{contactAge(c).label}</small></td><td><span className="state-tag">{c.status === 'excluded' ? '已排除' : c.status === 'synced' ? '已转线索' : c.verificationReport?.levelLabel || '待核验'}</span></td><td><button className="row-action" onClick={() => setSelected(c)}>查看资料</button></td></tr>)}</tbody></table></div> : <Empty title={busy ? '正在读取企业资料' : '这里还没有企业'}>{view === 'saved' ? '在企业详情中选择“加入研究清单”，即可集中查看。' : '新建搜索或登记已有官网。如果已设置筛选条件，可以清空后再试。'}</Empty>}<footer className="list-footer"><span>筛选后 {listed.length} / {companies.length} 条 · 收集时间不代表资料仍有效</span><div><button aria-label="上一页企业" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>上一页</button><span>{currentPage} / {pages}</span><button aria-label="下一页企业" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}>下一页</button></div></footer></section>
  </>}
  {view === 'sources' && <SourceCatalog sources={sources}/>}
  {view === 'marketplace' && <MarketplaceResearch/>}
  {view === 'tasks' && <section className="list-panel"><div className="list-title"><h2>最近任务<span>最多 100 条</span></h2><span className="quiet">{runs.some(r => ['queued', 'running'].includes(r.status)) ? '执行中任务每 6 秒同步' : '按创建时间查看'}</span></div>{runs.length ? <div className="task-list">{runs.map(r => <button key={r.id} onClick={() => void openRun(r)} disabled={detailLoading}><span className="task-icon"><Icon name="tasks"/></span><div><strong>{campaigns[r.campaignId] || '未命名项目'}</strong><small>{date(r.createdAt)} · {r.id}</small></div><span className={['failed', 'partial_success'].includes(r.status) ? 'badge warn' : 'badge'}>{statusText(r.status)}</span><span className="quiet">查看记录</span></button>)}</div> : <Empty title="还没有搜索任务">从企业发现页面新建搜索，任务会在这里留档。</Empty>}</section>}
  </div><footer className="page-footer">GoodJob 精简工作区<span>企业资料与背景核验</span></footer></main>
  {selected && <CompanyDrawer company={companies.find(c => c.id === selected.id) || selected} onClose={() => setSelected(null)} onSave={save}/>}
  {newSearch && <SearchDialog sources={sources} onClose={() => setNewSearch(false)} onSuccess={() => { setNewSearch(false); setView('tasks'); void refresh(); notify('搜索任务已创建。结束后可在企业发现查看新增候选。'); }}/ >}
  {register && <RegisterDialog onClose={() => setRegister(false)} onSuccess={() => { setRegister(false); void refresh(); notify('官网已登记。登记不会自动抓取或确认联系方式。'); }}/ >}
  {runDetail && <Dialog title={campaigns[runDetail.run.campaignId] || '任务详情'} onClose={() => setRunDetail(null)}><div className="modal-body"><span className="badge">{statusText(runDetail.run.status)}</span><p className="quiet">{runDetail.run.id}</p><h3>执行概要</h3>{runDetail.diagnostics?.phases?.map(p => <div className="key-value" key={p.id}><span>{p.name}</span><strong>{p.result}</strong></div>)}<h3>本次来源</h3>{runDetail.shards?.map((s, i) => <div key={i} className="key-value"><span>{sources.find(x => x.id === s.providerCode)?.name || s.providerCode}</span><span>{statusText(s.status)}</span></div>)}<details><summary>展开原始执行记录</summary><pre>{JSON.stringify(runDetail.events || [], null, 2)}</pre></details><p className="notice">任务的原始命中、入池候选和合格客户是不同数量；没有结果时请结合来源状态和执行记录检查。</p></div></Dialog>}
  {toast && <div className="toast" role="status">{toast}<button aria-label="关闭提示" onClick={() => setToast('')}><Icon name="close" size={16}/></button></div>}
  </div>;
}

function Login({ error, onLogin }: { error: string; onLogin: (u: User) => void }) {
  const [message, setMessage] = useState(error), [busy, setBusy] = useState(false);
  async function login(e: FormEvent<HTMLFormElement>) { e.preventDefault(); setBusy(true); setMessage(''); const data = new FormData(e.currentTarget); try { const result = await api<{ user?: User }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: data.get('email'), password: data.get('password') }) }); if (!result.user) throw Error('此账号需要额外验证，请先在完整系统完成登录，再刷新此页。'); onLogin(result.user); } catch (err) { setMessage(err instanceof Error ? err.message : '登录失败'); } finally { setBusy(false); } }
  return <main className="login"><div className="login-panel"><a className="brand" href="/focus.html"><span className="brand-mark">G<span>·</span></span><div>GoodJob<small>企业资料工作区</small></div></a><h1>专注眼前的客户研究</h1><p>使用原 GoodJob 账号登录，企业资料与设置保持同步。</p><form onSubmit={login}><label>登录邮箱<input type="email" name="email" required autoComplete="username"/></label><label>密码<input type="password" name="password" required autoComplete="current-password"/></label>{message && <p className="error" role="alert">{message}</p>}<button className="primary" disabled={busy}>{busy ? '正在登录…' : '登录工作区'}</button></form><a className="login-return" href="/">打开完整系统</a></div></main>;
}

function SourceCatalog({ sources }: { sources: Source[] }) {
  const [category, setCategory] = useState('all'), [text, setText] = useState('');
  const categories = [...new Set(sources.map(group))];
  const visible = sources.filter(s => category === 'all' || group(s) === category).filter(s => `${s.name} ${s.id} ${group(s)}`.toLowerCase().includes(text.toLowerCase()));
  return <><div className="notice"><strong>企业身份、采购公告、贸易统计各有用途。</strong><p>贸易统计通常不能提供买家联系人；企业登记不能证明采购意向。连接已配置，也不等于刚刚通过外网测试。</p></div><div className="catalog-toolbar"><label className="search-field"><Icon name="search" size={18}/><input aria-label="搜索数据源" value={text} onChange={e => setText(e.target.value)} placeholder="搜索数据源名称"/></label><select aria-label="来源类别" value={category} onChange={e => setCategory(e.target.value)}><option value="all">全部类型（{sources.length}）</option>{categories.map(c => <option key={c}>{c}</option>)}</select><a href="/" target="_blank" rel="noopener noreferrer" className="button">在完整系统配置<Icon name="arrow" size={14}/></a></div><div className="source-grid">{visible.map(s => {
    const manual = s.accessMode !== 'api';
    const statistical = group(s) === '贸易统计';
    const mode = manual ? s.accessMode === 'bulk_file' ? '文件辅助' : '人工辅助入口' : statistical ? '独立统计接口' : '自动查询适配';
    const desc = statistical ? '按商品、国家和期间统计贸易规模，不提供企业联系人。' : group(s) === '企业登记与身份' ? '用于企业身份与经营登记核实，不代表采购需求或联系资料齐全。' : group(s) === '采购与公告' ? '用于发现采购或授标线索，需区分采购方、供应商及项目状态。' : group(s) === '贸易明细入口' ? '本地版本仅登记辅助入口，尚未接入该服务的自动查询。' : s.id === 'ai_search' ? '复用已配置模型，具体引证与可追溯性需逐条核实。' : group(s) === '产品目录' ? '用于核对产品登记或认证信息，不是电商销量库。' : group(s) === '企业与联系资料' ? '提供企业或联系方式补充，覆盖范围和额度取决于服务套餐。' : '提供公开网页或地点线索，结果需要进一步确认是否为目标企业。';
    return <article className="source-card" key={s.id}><header><span className="source-category">{group(s)}</span><span className={`badge ${manual ? '' : runnable(s) ? 'good' : 'neutral'}`}>{manual ? '人工辅助' : statistical ? '统计专用' : runnable(s) ? '已配置可选' : '待配置 / 未启用'}</span></header><h3>{s.name}</h3><p>{desc}</p><dl><div><dt>接入方式</dt><dd>{mode}</dd></div><div><dt>连接测试记录</dt><dd>{s.lastTestAt ? `${date(s.lastTestAt)} · ${s.lastTestStatus === 'passed' ? '通过' : s.lastTestStatus === 'failed' ? '失败' : '未测试'}` : '无带时间的测试记录'}</dd></div></dl><External url={s.docsUrl || s.officialDocsUrl}>查看官方说明</External></article>;
  })}</div>{!visible.length && <Empty title="没有匹配的数据源">试试其他名称，或清空类型筛选。</Empty>}<div className="roadmap"><h3>电商公开资料：独立研究模块</h3><p>左侧“电商资料”提供 Takealot、Jumia Kenya、Konga 的公开页面读取与网页导入。页面读取是否成功以实际执行状态为准；平台未展示的销量、利润不作推算。</p></div></>;
}

function CompanyDrawer({ company: c, onClose, onSave }: { company: Company; onClose: () => void; onSave: (c: Company) => Promise<void> }) {
  const [tab, setTab] = useState('profile'), [research, setResearch] = useState<Research | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState(''), [saving, setSaving] = useState(false);
  useEffect(() => { let active = true; setResearch(null); setLoading(true); setError(''); void api<{ research: Research | null; completedAt?: string; engine?: string }>(`/api/prospect-list/${encodeURIComponent(c.id)}/background-research`).then(r => { if (active) setResearch(r.research ? { ...r.research, completedAt: r.completedAt, engine: r.engine } : null); }).catch(e => { if (active) setError(e instanceof Error ? e.message : '读取失败'); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [c.id]);
  const evidence = [...(c.sourceEvidence || []), ...(c.searchReport?.checkedSources || [])];
  return <Dialog title="企业资料" onClose={onClose} wide><div className="drawer-title"><div className="company-avatar">{(c.company || '?').slice(0, 1)}</div><div><h2>{c.company}</h2><p>{c.country || '市场待确认'}<span> / </span><External url={c.website}>{host(c.website)}</External></p></div><button className={c.shortlistedAt ? '' : 'primary'} disabled={!!c.shortlistedAt || saving || c.status === 'excluded'} onClick={() => { setSaving(true); void onSave(c).finally(() => setSaving(false)); }}><Icon name="bookmark" size={17}/>{c.shortlistedAt ? '已在研究清单' : saving ? '正在保存…' : '加入研究清单'}</button></div><div className="tabs">{[['profile', '企业概况'], ['contacts', '联系资料'], ['evidence', '来源证据'], ['research', '背调档案']].map(([id, label]) => <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>{label}</button>)}</div><div className="drawer-body">
  {tab === 'profile' && <><div className="two-column"><section><h3>企业信息</h3><div className="key-value"><span>国家 / 地区</span><strong>{c.country || '待确认'}</strong></div><div className="key-value"><span>发现来源</span><strong>{c.sourceLabel || c.source || '待确认'}</strong></div><div className="key-value"><span>系统记录时间</span><strong>{date(c.createdAt)}</strong></div><div className="key-value"><span>业务描述</span><strong>{c.business || '待补充'}</strong></div></section><section className="verification"><h3>核验摘要</h3><span className="state-tag">{c.verificationReport?.levelLabel || '待核验'}</span><p>{c.verificationReport?.conclusion || c.searchReport?.summary || '当前资料不足，尚不能确认企业身份或采购需求。'}</p><small>来源命中和核验结论分别记录，不据此推断成交可能性。</small></section></div><section><h3>原始资料摘要</h3><p className="body-copy">{c.description || '暂无资料摘要。'}</p></section>{!!c.verificationReport?.checks?.length && <section><h3>检查记录</h3>{c.verificationReport.checks.map((x, i) => <div className="check-row" key={i}><span className={`badge ${x.status === 'passed' ? 'good' : 'neutral'}`}>{x.status === 'passed' ? '通过' : '待核实'}</span><div><strong>{x.label}</strong><p>{x.summary}</p></div></div>)}</section>}</>}
  {tab === 'contacts' && <><div className="notice">收集到邮箱或号码，只能说明资料存在。请结合原始来源、更新时间和实际联系记录确认有效性。</div>{c.extractedContacts?.length ? c.extractedContacts.map((x, i) => <ContactCard key={i} contact={x}/>) : <Empty title="暂无结构化联系资料">旧字段中的资料保留在下方；未知的来源和更新时间不会自动补成“已验证”。</Empty>}<section><h3>原始联系字段</h3><div className="key-value"><span>联系人</span><strong>{c.contact || '未登记'}</strong></div><div className="key-value"><span>联系资料原文</span><strong>{c.contactInfo || '未登记'}</strong></div><div className="key-value"><span>字段来源</span><strong>{c.searchReport?.contactFinding?.sourceUrl ? <External url={c.searchReport.contactFinding.sourceUrl}>查看来源</External> : '未知'}</strong></div><p className="quiet">企业记录创建时间不作为联系方式更新日期。</p></section></>}
  {tab === 'evidence' && <><div className="notice">保留事实的出处。AI 输出、搜索结果和官方登记的证据强度不同，需要逐项核实。</div>{evidence.length ? evidence.map((x, i) => <article className="evidence-item" key={i}><span className="source-tag">{x.sourceName || x.providerId || c.sourceLabel || '公开来源'}</span><h3><External url={x.sourceUrl || x.url}>{x.title || host(x.sourceUrl || x.url)}</External></h3><p>{x.finding || x.evidenceSummary || '未保存具体摘录，请打开原始页面核实。'}</p><small>采集 / 观察日期：{date(x.fetchedAt || x.observedAt)}</small></article>) : <Empty title="尚未保存可展示的来源证据">当前候选的来源标签不代表已经保存了支持每一项结论的原始页面。</Empty>}</>}
  {tab === 'research' && <>{loading ? <p>正在读取已留档背调…</p> : error ? <div className="error" role="alert">{error}</div> : research ? <><div className="research-meta"><span className="badge">已有背调档案</span><span>{date(research.completedAt)} · {research.engine || '引擎未记录'}</span></div><h3>资料摘要</h3><p className="body-copy">{research.summary || '档案未记录摘要。'}</p>{research.crmOnly && <div className="notice">此档案基于 CRM 内已有资料，不代表新增外部调研。</div>}{!!research.facts?.length && <section><h3>事实记录</h3>{research.facts.map((f, i) => <div className="key-value" key={i}><span>{f.label || '事实'}</span><strong>{f.value || '未记录'}{f.sourceUrl && <small className="fact-source"><External url={f.sourceUrl}>{f.sourceTitle || '事实来源'}</External></small>}</strong></div>)}</section>}{!!research.sources?.length && <section><h3>参考来源</h3>{research.sources.map((s, i) => <p key={i}><External url={s.url}>{s.title || s.name || host(s.url)}</External></p>)}</section>}</> : <Empty title="还没有背调档案">这里读取原系统已经保存的背调结果。新建背调目前仍在完整系统操作，完成后刷新此页即可查看。</Empty>}<div className="roadmap"><h3>下一步的资料模块</h3><p>店铺与产品证据、价格观察、评论摘录和记录时间，将作为独立字段加入。当前未接入电商平台，也不生成未经证实的销量或利润。</p></div></>}
  </div></Dialog>;
}

function ContactCard({ contact: c }: { contact: Contact }) {
  return <article className="contact-card"><header><h3>{c.name || '企业联系资料'}</h3><span className="badge">{c.verificationStatus === 'verified' ? '原记录标记已验证' : '有效性待核实'}</span></header>{c.title && <p>{c.title}</p>}<dl>{[['邮箱', c.emails], ['电话', c.phones], ['WhatsApp', c.whatsapp]].map(([label, values]) => (values as string[])?.length ? <div key={label as string}><dt>{label as string}</dt><dd>{(values as string[]).join(' / ')}</dd></div> : null)}<div><dt>资料记录时间</dt><dd>{date(c.observedAt)}</dd></div><div><dt>原始来源</dt><dd><External url={c.evidenceUrl}>{c.sourceLabel || (c.evidenceUrl ? host(c.evidenceUrl) : '未记录')}</External></dd></div></dl></article>;
}

function SearchDialog({ sources, onClose, onSuccess }: { sources: Source[]; onClose: () => void; onSuccess: () => void }) {
  const [selection, setSelection] = useState<string[]>([]), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const inFlight = useRef(false), key = useRef(`focus:${crypto.randomUUID()}`);
  const available = sources.filter(s => runnable(s) && group(s) !== '贸易统计');
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (inFlight.current) return; setError('');
    const f = new FormData(e.currentTarget); const split = (name: string) => String(f.get(name) || '').split(/[,，;；\n]/).map(s => s.trim()).filter(Boolean);
    const products = split('products'), markets = split('markets'), types = split('type');
    if (!products.length || !markets.length || !selection.length) { setError('请填写产品、市场，并主动选择至少一个数据源。'); return; }
    inFlight.current = true; setBusy(true);
    try {
      await api('/api/lead-finder/launch', { method: 'POST', headers: { 'Idempotency-Key': key.current }, body: JSON.stringify({ mode: 'standard', campaign: { name: String(f.get('name')).trim(), snapshot: { products, markets, customerTypes: types, sourceProviderIds: selection, goal: `Products: ${products.join(', ')}; Markets: ${markets.join(', ')}` } }, strategy: { name: '精简工作区搜索', query: { countryMode: 'campaign_markets', customerTypeMode: types.length ? 'campaign_customer_types' : 'all', exclusionKeywords: split('exclude') }, providerPlan: selection.map((id, i) => ({ providerId: id, priority: i + 1, pageLimit: 1, resultLimit: Number(f.get('limit')), budgetLimit: null, currency: '' })), reason: '由精简工作区创建，用户主动选择来源' } }) }); onSuccess();
    } catch (err) { setError(err instanceof Error ? err.message : '创建失败'); } finally { inFlight.current = false; setBusy(false); }
  }
  return <Dialog title="新建企业搜索" onClose={onClose}><form className="modal-body form-stack" onSubmit={e => void submit(e)}><label>任务名称<input name="name" required maxLength={160} placeholder="例如：德国工业配件经销商"/></label><div className="form-grid"><label>产品关键词<input name="products" required placeholder="例如：industrial fasteners"/><small>建议使用英文；多个词组用逗号分隔</small></label><label>国家 / 地区<input name="markets" required placeholder="例如：Germany"/><small>指定实际市场，避免无意搜索全球</small></label></div><div className="form-grid"><label>客户类型<input name="type" placeholder="例如：Distributor, Wholesaler"/></label><label>每个来源最多返回<select name="limit" defaultValue="20"><option value="10">10 条</option><option value="20">20 条</option><option value="50">50 条</option></select></label></div><label>排除关键词<input name="exclude" placeholder="例如：jobs, research paper"/></label><fieldset><legend>主动选择本次数据源</legend><p className="quiet">仅显示已配置、启用且有搜索接口的来源。登记与公告类覆盖范围不同，请先阅读数据来源目录。</p>{available.length ? <div className="source-picks">{available.map(s => <label key={s.id}><input type="checkbox" checked={selection.includes(s.id)} onChange={e => setSelection(e.target.checked ? [...selection, s.id] : selection.filter(x => x !== s.id))}/><span>{s.name}<small>{group(s)}</small></span></label>)}</div> : <p className="error">当前没有可选来源，请先在完整系统配置并启用。</p>}</fieldset><div className="notice">提交后会调用选定的外部服务，可能消耗已配置账号的额度。本次每来源最多请求一页，不保证返回数量，也不自动发送任何消息。</div>{error && <div role="alert" className="error">{error}</div>}<div className="modal-actions"><button type="button" onClick={onClose} disabled={busy}>取消</button><button className="primary" disabled={busy || !available.length}>{busy ? '正在提交…' : `启动搜索（${selection.length} 个来源）`}</button></div></form></Dialog>;
}

function RegisterDialog({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) { e.preventDefault(); setError(''); const f = new FormData(e.currentTarget); const raw = String(f.get('urls') || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean); if (!raw.length || raw.length > 12 || raw.some(x => !safeUrl(x))) { setError('请填写 1–12 个有效的 HTTP / HTTPS 官网地址，每行一个。'); return; } setBusy(true); try { await api('/api/tools/website-scrape/preview', { method: 'POST', body: JSON.stringify({ urls: raw.map(safeUrl), useAi: false }) }); onSuccess(); } catch (err) { setError(err instanceof Error ? err.message : '登记失败'); } finally { setBusy(false); } }
  return <Dialog title="登记已有官网" onClose={onClose}><form className="modal-body form-stack" onSubmit={e => void submit(e)}><p className="quiet">把已知企业官网加入候选，后续核实名称、业务与联系资料。</p><label>官网地址<textarea name="urls" rows={6} required placeholder="https://example.com"/></label><small>每行一个，最多 12 个。仅登记链接，不会自动抓取。</small>{error && <p className="error" role="alert">{error}</p>}<div className="modal-actions"><button type="button" disabled={busy} onClick={onClose}>取消</button><button className="primary" disabled={busy}>{busy ? '正在登记…' : '登记官网'}</button></div></form></Dialog>;
}

createRoot(document.getElementById('root')!).render(<App/>);
