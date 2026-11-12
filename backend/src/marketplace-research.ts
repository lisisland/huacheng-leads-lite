import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { load } from 'cheerio';
import robotsParser from 'robots-parser';
import { z } from 'zod';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';

export const platforms = [
  { id: 'takealot', name: 'Takealot', country: '南非', origin: 'https://www.takealot.com', currency: 'ZAR', searchPath: '/all?search=' },
  { id: 'jumia_ke', name: 'Jumia Kenya', country: '肯尼亚', origin: 'https://www.jumia.co.ke', currency: 'KES', searchPath: '/catalog/?q=' },
  { id: 'konga', name: 'Konga', country: '尼日利亚', origin: 'https://www.konga.com', currency: 'NGN', searchPath: '/search?search=' }
] as const;
type Platform = typeof platforms[number];
export interface MarketProduct {
  id: string; platformId: string; title: string; url: string; sku: string; brand: string;
  price: string; currency: string; rating: string; reviewCount: string; seller: string;
  description: string; specifications: { name: string; value: string }[];
  reviews: { text: string; rating: string }[]; sales: null;
  observedAt: string; method: 'public_page' | 'uploaded_html' | 'pasted_text';
  evidenceUrl: string; priceEvidence: string; parser: string;
}
const clean = (s: unknown, max = 2000): string => typeof s === 'string' || typeof s === 'number' ? String(s).replace(/\s+/g, ' ').trim().slice(0, max) : '';
export function platformUrl(raw: string, p: Platform): string {
  const u = new URL(raw, p.origin);
  if (u.origin !== p.origin || u.username || u.password || u.port || u.protocol !== 'https:') throw Error('只允许所选平台的 HTTPS 公开页面');
  u.hash = ''; return u.href;
}
function baseProduct(p: Platform, title: unknown, rawUrl: string, sourceUrl: string, method: MarketProduct['method']): MarketProduct {
  const url = platformUrl(rawUrl, p);
  return { id: createHash('sha256').update(p.id + url).digest('hex').slice(0,24), platformId: p.id, title: clean(title, 400), url, sku: '', brand: '', price: '', currency: '', rating: '', reviewCount: '', seller: '', description: '', specifications: [], reviews: [], sales: null, observedAt: new Date().toISOString(), method, evidenceUrl: sourceUrl, priceEvidence: '', parser: '' };
}
export function parseMarketplace(html: string, p: Platform, sourceUrl: string, method: MarketProduct['method'] = 'public_page'): MarketProduct[] {
  platformUrl(sourceUrl, p);
  const $ = load(html); const products: MarketProduct[] = [];
  const add = (row: MarketProduct) => { if (row.title && !products.some(x => x.url === row.url)) products.push(row); };
  const walk = (node: any, depth = 0): void => {
    if (!node || depth > 15 || products.length >= 50) return;
    if (Array.isArray(node)) { node.slice(0,100).forEach(x => walk(x, depth+1)); return; }
    if (typeof node !== 'object') return;
    const types = [node['@type']].flat();
    if (types.includes('Product')) {
      try {
        const offer = [node.offers].flat().find(Boolean) || {};
        const row = baseProduct(p, node.name, node.url || offer.url || sourceUrl, sourceUrl, method);
        row.sku = clean(node.sku || node.productID); row.brand = clean(node.brand?.name || node.brand);
        row.price = clean(offer.price ?? offer.lowPrice); row.currency = clean(offer.priceCurrency);
        row.priceEvidence = row.price ? '页面 JSON-LD offers' : '';
        row.rating = clean(node.aggregateRating?.ratingValue); row.reviewCount = clean(node.aggregateRating?.reviewCount ?? node.aggregateRating?.ratingCount);
        row.seller = clean(offer.seller?.name); row.description = clean(node.description);
        row.specifications = [node.additionalProperty || []].flat().slice(0,30).map((x: any) => ({name: clean(x.name), value: clean(x.value)})).filter(x=>x.name && x.value);
        row.reviews = [node.review || []].flat().slice(0,10).map((x: any) => ({text: clean(x.reviewBody),rating: clean(x.reviewRating?.ratingValue)})).filter(x=>x.text);
        row.parser = 'schema.org/Product'; add(row);
      } catch { /* Off-platform recommendations cannot become products. */ }
    }
    for (const key of ['@graph','itemListElement','item','mainEntity','hasVariant']) if (node[key]) walk(node[key], depth+1);
  };
  $('script[type="application/ld+json"]').each((_, el) => { try {walk(JSON.parse($(el).text()));} catch { /* Invalid structured data is ignored. */ } });
  // Jumia's public result cards: preserve visible price text and local currency.
  $('article.prd').slice(0,30).each((_, el) => {
    const card = $(el), link = card.find('a.core').first().attr('href'); if (!link) return;
    try {
      const row = baseProduct(p, card.find('.name').first().text(), link, sourceUrl, method);
      row.price = clean(card.find('.prc').first().text()); row.currency = row.price ? p.currency : '';
      row.priceEvidence = row.price ? '搜索结果卡片展示价格（含页面币种文本）' : '';
      row.rating = clean(card.find('.stars').first().text());
      const text = clean(card.find('.rev').first().text()); row.reviewCount = text.match(/\((\d[\d,]*)\)/)?.[1] || '';
      row.parser = 'Jumia article.prd'; add(row);
    } catch { /* Invalid links are skipped. */ }
  });
  // Only use document-level metadata on a confirmed product path, not on search pages.
  const productPath = /\/PLID\d+|\/product\//i.test(sourceUrl) || /\.html(?:\?|$)/i.test(sourceUrl);
  if (!products.length && productPath) {
    const title = $('meta[property="og:title"]').attr('content') || $('h1').first().text();
    if (title) { const row = baseProduct(p,title,sourceUrl,sourceUrl,method); row.price = clean($('meta[property="product:price:amount"]').attr('content')); row.currency = clean($('meta[property="product:price:currency"]').attr('content')); row.priceEvidence = row.price ? '商品页价格 meta 标签' : ''; row.description = clean($('meta[property="og:description"]').attr('content')); row.parser = 'product meta'; add(row); }
  }
  return products.slice(0,30);
}

// Optional plain text import when the user can open a page but the local service cannot.
// Only explicit labelled values are extracted; no model infers missing sales or profit.
export function parsePastedText(text: string, p: Platform, sourceUrl: string): MarketProduct[] {
  platformUrl(sourceUrl,p);
  if (!/\/PLID\d+|\/product\/|\.html(?:\?|$)/i.test(sourceUrl)) throw Error('文本导入需填写具体商品页地址；搜索页请导入 HTML');
  const lines = text.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  const row = baseProduct(p, lines[0], sourceUrl, sourceUrl, 'pasted_text');
  const price = lines.find(x=>/^(?:Price\s*:?\s*)?(?:KSh|KES|ZAR|R\s?\d|₦|NGN)/i.test(x));
  row.price = clean(price); row.currency = price ? p.currency : ''; row.priceEvidence = price ? '用户复制的页面价格行，未在线复核' : '';
  row.sku = clean(lines.find(x=>/^(SKU|Product Code)\s*:/i.test(x))?.split(':').slice(1).join(':'));
  row.description = clean(text); row.parser = '用户复制文本（未在线复核）';
  return row.title ? [row] : [];
}

const agent = 'GoodJobResearch/0.1';
const parseRobots = robotsParser as unknown as (url: string, text: string) => { isAllowed: (url: string, agent: string) => boolean | undefined };
const recent = new Map<string, number>();
async function download(url: string, p: Platform, redirects = 0): Promise<string> {
  platformUrl(url,p);
  const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(15000), headers: { 'User-Agent':agent, Accept:'text/html,text/plain' } });
  if ([301,302,303,307,308].includes(response.status)) { if (redirects >= 3) throw Error('重定向次数过多'); return download(platformUrl(response.headers.get('location') || '', p),p,redirects+1); }
  if ([401,403,429].includes(response.status)) { await response.body?.cancel(); throw Error(`平台限制访问（HTTP ${response.status}），未尝试绕过`); }
  if (!response.ok) { await response.body?.cancel(); throw Error(`页面返回 HTTP ${response.status}`); }
  const reader = response.body?.getReader(); if (!reader) return '';
  const decoder = new TextDecoder(); let result='',size=0;
  try { for (;;) { const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>3_000_000)throw Error('页面超过 3 MB 限制');result+=decoder.decode(value,{stream:true}); } return result+decoder.decode(); } finally { await reader.cancel().catch(()=>{}); }
}
export async function collectMarketplace(p: Platform, query: string) {
  const url = p.origin+p.searchPath+encodeURIComponent(query); const fetchedAt = new Date().toISOString();
  try {
    if (Date.now()-(recent.get(p.id)||0)<10000) throw Error('此平台刚刚请求过，请 10 秒后重试');
    recent.set(p.id,Date.now());
    const robotsUrl=p.origin+'/robots.txt';
    const robots=await download(robotsUrl,p);
    if (!parseRobots(robotsUrl,robots).isAllowed(url,agent)) return {platformId:p.id,url,status:'robots_blocked',message:'网站 robots 规则未允许此搜索路径，未读取搜索页',products:[],fetchedAt};
    const html=await download(url,p);
    if (/captcha|verify you are human|access denied|checking your browser/i.test(load(html)('title').text())) return {platformId:p.id,url,status:'access_blocked',message:'页面要求访问验证，未尝试绕过',products:[],fetchedAt};
    const products=parseMarketplace(html,p,url);
    const $=load(html); const noResults=/no (?:products|results) found|0 products found/i.test($('main,body').text());
    return {platformId:p.id,url,status:products.length?'collected':noResults?'empty':'unparsed',message:products.length?`从公开页面提取 ${products.length} 条商品`:noResults?'页面明确显示无商品':'已读取 HTML，但未识别商品；可能需要脚本渲染或更新解析规则，不能判断为无结果',products,fetchedAt};
  } catch (e: any) {
    const code=e.cause?.code || e.code || '';
    return {platformId:p.id,url,status:'failed',message:code==='ECONNRESET'?'本机 HTTPS 连接被重置（ECONNRESET），尚未读取到网站内容':`读取失败：${clean(e.message,200)}${code?`（${code}）`:''}`,products:[],fetchedAt};
  }
}
const input=z.object({query:z.string().trim().min(2).max(160),platformIds:z.array(z.enum(['takealot','jumia_ke','konga'])).min(1).max(3)});
const importInput=z.object({platformId:z.enum(['takealot','jumia_ke','konga']),url:z.string().url().max(1800),format:z.enum(['html','text']),content:z.string().min(1).max(2_000_000)});
export const marketplaceRouter=Router();
const limit=rateLimit({windowMs:60000,limit:6,standardHeaders:'draft-7',legacyHeaders:false,message:{message:'请求较频繁，请稍后再试'}});
const root=path.resolve('.local-runtime/marketplace-research');
function filename(user: {id:string;teamId:string}) {return path.join(root,createHash('sha256').update(user.teamId+'|'+user.id).digest('hex')+'.json');}
async function history(user: {id:string;teamId:string}) {try{return JSON.parse(await readFile(filename(user),'utf8')) as any[];}catch(e:any){if(e.code==='ENOENT')return [];throw e;}}
let persistence=Promise.resolve();
async function persist(user:{id:string;teamId:string},record:any) {
  const work=persistence.then(async()=>{const old=await history(user);await mkdir(root,{recursive:true});const target=filename(user),tmp=target+'.tmp';await writeFile(tmp,JSON.stringify([record,...old].slice(0,50),null,2),'utf8');await rename(tmp,target);});persistence=work.catch(()=>{});await work;
}
marketplaceRouter.get('/platforms',(_req,res)=>res.json({platforms}));
marketplaceRouter.get('/history',async(req,res,next)=>{try{res.setHeader('Cache-Control','no-store');res.json({records:await history(req.user!)});}catch(e){next(e);}});
marketplaceRouter.post('/search',limit,async(req,res,next)=>{try{const body=input.parse(req.body);const results=await Promise.all([...new Set(body.platformIds)].map(id=>collectMarketplace(platforms.find(p=>p.id===id)!,body.query)));const record={id:randomUUID(),kind:'search',query:body.query,createdAt:new Date().toISOString(),results};await persist(req.user!,record);res.json({record});}catch(e){next(e);}});
marketplaceRouter.post('/import',limit,async(req,res,next)=>{try{const body=importInput.parse(req.body);const p=platforms.find(x=>x.id===body.platformId)!;const url=platformUrl(body.url,p);const products=body.format==='html'?parseMarketplace(body.content,p,url,'uploaded_html'):parsePastedText(body.content,p,url);if(!products.length){res.status(422).json({message:'没有解析出商品。请确认保存的是实际商品页或搜索结果 HTML，而不是登录、验证页面。'});return;}const record={id:randomUUID(),kind:'import',query:'用户导入页面',createdAt:new Date().toISOString(),results:[{platformId:p.id,url,status:'imported',message:`导入 ${products.length} 条；来源时间和真实性仍需核实`,products,fetchedAt:new Date().toISOString()}]};await persist(req.user!,record);res.json({record});}catch(e){if(e instanceof z.ZodError){res.status(400).json({message:e.errors[0]?.message||'参数错误'});return;}if(e instanceof Error && /只允许|文本导入/.test(e.message)){res.status(400).json({message:e.message});return;}next(e);}});
