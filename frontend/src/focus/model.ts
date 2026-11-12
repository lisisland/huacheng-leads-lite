export type Source = {
  id: string; code?: string; name: string; category: string; accessMode: string;
  ready?: boolean; enabled?: boolean; status?: string; lastTestStatus?: string;
  lastTestAt?: string; lastTestMessage?: string; docsUrl?: string; officialDocsUrl?: string;
  sourceLevel?: string; requiresKey?: boolean; capabilities?: string[];
};
export type Evidence = { sourceUrl?: string; url?: string; title?: string; sourceName?: string; providerId?: string; fetchedAt?: string; observedAt?: string; finding?: string; evidenceSummary?: string };
export type Contact = { name: string; title?: string; emails: string[]; phones: string[]; whatsapp: string[]; evidenceUrl: string; observedAt?: string; verificationStatus?: string; sourceLabel?: string };
export type Company = {
  id: string; company: string; country: string; website: string; business: string;
  contact: string; contactInfo: string; description: string; source: string; sourceLabel: string;
  status: string; createdAt: string; shortlistedAt?: string; verifiedAt?: string;
  sourceEvidence?: Evidence[]; extractedContacts?: Contact[];
  researchRunning?: boolean;
  verificationReport?: { levelLabel: string; conclusion: string; checks: { label: string; status: string; summary: string }[] };
  searchReport?: { summary: string; checkedSources?: Evidence[]; contactFinding?: { status: string; value: string; sourceUrl: string } };
};
export type Run = { id: string; campaignId: string; status: string; createdAt: string };
export const sourceGroups: Record<string, string> = {
  anysearch: '网页与地图', serper: '网页与地图', brave: '网页与地图', serpapi: '网页与地图', google_places: '网页与地图', ai_search: 'AI 搜索',
  gleif: '企业登记与身份', wikidata: '企业登记与身份', companies_house: '企业登记与身份', opencorporates: '企业登记与身份', sec_edgar: '企业登记与身份', fr_company_search: '企业登记与身份', ror: '企业登记与身份', nppes: '企业登记与身份', openfda_510k: '企业登记与身份', mexico_denue: '企业登记与身份', fmcsa_qcmobile: '企业登记与身份',
  eu_ted: '采购与公告', world_bank_procurement: '采购与公告', uk_contracts_finder: '采购与公告', usaspending_awards: '采购与公告', uk_find_a_tender: '采购与公告', sam_opportunities: '采购与公告', brazil_pncp: '采购与公告', singapore_gebiz: '采购与公告', canadabuys_open_data: '采购与公告', koneps: '采购与公告', sbir_awards: '采购与公告',
  un_comtrade: '贸易统计', us_census_trade: '贸易统计', eurostat_comext: '贸易统计', china_customs_statistics: '贸易统计', importyeti: '贸易明细入口',
  apollo: '企业与联系资料', pdl: '企业与联系资料', hunter: '企业与联系资料', eprel: '产品目录', eu_ecolabel: '产品目录'
};
export const group = (s: Source) => sourceGroups[s.code || s.id] || '其他资料';
export const safeUrl = (input?: string): string => {
  if (!input?.trim()) return '';
  try { const url = new URL(/^[a-z][a-z\d+.-]*:/i.test(input) ? input : `https://${input}`); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : ''; } catch { return ''; }
};
export const host = (input?: string) => { try { return new URL(safeUrl(input)).hostname.replace(/^www\./, ''); } catch { return '未登记官网'; } };
export const date = (input?: string) => { const value = input && new Date(input); return value && !Number.isNaN(value.getTime()) ? value.toLocaleDateString('zh-CN') : '未知'; };
export const runnable = (s: Source) => s.accessMode === 'api' && s.enabled === true && s.ready === true;
export function mergeSources(catalog: Source[], runtime: Source[]) {
  const statuses = new Map(runtime.map(s => [s.id, s]));
  return catalog.map(s => { const id = s.code || s.id; return { ...s, id, ...statuses.get(id) }; });
}
export function contactAge(c: Company, now = Date.now()) {
  const times = (c.extractedContacts || []).map(x => new Date(x.observedAt || '').getTime()).filter(Number.isFinite);
  if (!times.length) return { label: '更新时间未知', stale: false, known: false };
  // Mixed records keep their own timestamps in the drawer; label conservatively.
  const oldest = Math.min(...times); const age = Math.floor((now - oldest) / 86400000);
  return { label: age > 90 ? '存在超过 90 天的资料' : '近 90 天有资料记录', stale: age > 90, known: true };
}
export const statusText = (s: string) => ({ succeeded: '已完成', succeeded_empty: '无结果', partial_success: '部分完成', failed: '失败', cancelled: '已取消', running: '执行中', queued: '排队中', paused: '已暂停', excluded: '已排除', synced: '已转线索' }[s] || '待核验');
export class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const csrf = document.cookie.split('; ').find(c => c.startsWith('gj_csrf='))?.slice(8);
  const response = await fetch(path, { ...init, credentials: 'same-origin', headers: { 'content-type': 'application/json', ...(csrf ? { 'x-csrf-token': decodeURIComponent(csrf) } : {}), ...init.headers } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(body.message || `请求失败（${response.status}）`, response.status);
  return body;
}
