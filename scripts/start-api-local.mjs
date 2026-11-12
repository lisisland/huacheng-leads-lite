import { readFileSync } from 'node:fs';
import path from 'node:path';
const envFile=path.resolve('.env');
for(const line of readFileSync(envFile,'utf8').split(/\r?\n/)){if(!line||line.startsWith('#')||!line.includes('='))continue;const i=line.indexOf('=');process.env[line.slice(0,i)]=line.slice(i+1);}
process.env.GOODJOB_ENV_FILE=envFile;
await import('../backend/src/server.ts');
