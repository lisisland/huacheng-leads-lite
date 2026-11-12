import assert from 'node:assert/strict';
import { collectMarketplace, parseMarketplace, parsePastedText, platformUrl, platforms } from './marketplace-research.js';
const [takealot,jumia,konga]=platforms;
const url=takealot.origin+'/test-interactive-display/PLID123456';
const structured=JSON.stringify({'@context':'https://schema.org','@type':'Product',name:'Fixture 65 inch meeting display',url,sku:'TEST-65',offers:{price:19999,priceCurrency:'ZAR',seller:{name:'Fixture store'}},aggregateRating:{ratingValue:4.3,reviewCount:12},additionalProperty:[{name:'Resolution',value:'3840 x 2160'}],review:[{reviewBody:'Fixture review',reviewRating:{ratingValue:4}}]});
const rows=parseMarketplace(`<script type="application/ld+json">${structured}</script>`,takealot,url,'uploaded_html');
assert.equal(rows.length,1);assert.equal(rows[0].price,'19999');assert.equal(rows[0].currency,'ZAR');assert.equal(rows[0].sales,null);assert.equal(rows[0].reviewCount,'12');assert.equal(rows[0].seller,'Fixture store');assert.equal(rows[0].specifications[0].value,'3840 x 2160');assert.equal(rows[0].reviews[0].text,'Fixture review');
const cards=parseMarketplace('<article class="prd"><a class="core" href="/test-whiteboard.html"><h3 class="name">Fixture whiteboard</h3><div class="prc">KSh 300,000</div><div class="rev"><span class="stars">4 out of 5</span> (3)</div></a></article>',jumia,jumia.origin+'/catalog/?q=whiteboard');
assert.equal(cards[0].currency,'KES');assert.equal(cards[0].reviewCount,'3');assert.equal(cards[0].sales,null);
assert.equal(parseMarketplace('<title>Search results</title><h1>Whiteboards</h1>',konga,konga.origin+'/search?search=whiteboard').length,0);
assert.throws(()=>platformUrl('http://127.0.0.1/',takealot));assert.throws(()=>platformUrl('https://www.takealot.com.evil.example/a',takealot));assert.throws(()=>platformUrl('https://a:b@www.takealot.com/a',takealot));
const pasted=parsePastedText('Fixture 82 inch board\n₦450,000\nProduct Code: TEST-82',konga,konga.origin+'/product/test-board-123456');
assert.equal(pasted[0].price,'₦450,000');assert.equal(pasted[0].method,'pasted_text');assert.equal(pasted[0].sku,'TEST-82');assert.equal(pasted[0].rating,'');
assert.throws(()=>parsePastedText('Search query',jumia,jumia.origin+'/catalog/?q=display'));
const originalFetch=globalThis.fetch;let calls=0;
try {
  globalThis.fetch=async()=>{calls++;return new Response('User-agent: *\nDisallow: /all',{status:200});};
  const blocked=await collectMarketplace(takealot,'meeting display');assert.equal(blocked.status,'robots_blocked');assert.equal(calls,1);
  globalThis.fetch=async()=>{throw new TypeError('fetch failed',{cause:{code:'ECONNRESET'}})};
  const failure=await collectMarketplace(jumia,'meeting display');assert.equal(failure.status,'failed');assert.match(failure.message,/ECONNRESET/);assert.equal(failure.products.length,0);
} finally {globalThis.fetch=originalFetch;}
console.log('Marketplace parser, field provenance, URL boundaries, robots and network failure checks passed (fixtures, no external requests)');
