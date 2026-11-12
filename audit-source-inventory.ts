import {writeFileSync} from 'node:fs';
import {LEAD_PROVIDERS} from './backend/src/lead-providers.js';
import {TRADE_PROVIDERS} from './backend/src/trade-providers.js';
const rows=[...LEAD_PROVIDERS,...TRADE_PROVIDERS].map(p=>({id:p.id,name:p.name,category:p.category,tier:p.tier,accessMode:p.accessMode,requiresKey:p.requiresKey,optionalKey:p.optionalKey,capabilities:p.capabilities,docsUrl:p.docsUrl,costNote:p.costNote,search:typeof p.search==='function',trade:typeof (p as any).trade==='function',enrich:typeof (p as any).enrich==='function'}));
writeFileSync('../work/goodjob-source-inventory.json',JSON.stringify(rows,null,2));
console.log(JSON.stringify(rows.map(({id,accessMode,requiresKey,search,trade,enrich})=>({id,accessMode,requiresKey,search,trade,enrich})),null,2));
