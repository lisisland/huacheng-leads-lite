import {spawn} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.dirname(fileURLToPath(import.meta.url));
const env=Object.fromEntries(readFileSync(path.join(root,'.env'),'utf8').split(/\r?\n/).filter(l=>l&&!l.startsWith('#')&&l.includes('=')).map(l=>{let i=l.indexOf('=');return [l.slice(0,i),l.slice(i+1)]}));
const services=[['CRM API',['node_modules/tsx/dist/cli.mjs','backend/src/server.ts'],root,{...env,GOODJOB_ENV_FILE:path.join(root,'.env')}],['CRM Web',['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','15188'],path.join(root,'frontend'),{}],['WhatsApp API',['node_modules/tsx/dist/cli.mjs','src/server/index.ts'],path.join(root,'whatsapp-plugin'),{}],['WhatsApp Web',['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','15193'],path.join(root,'whatsapp-plugin'),{}]];
const children=services.map(([name,args,cwd,vars])=>{
 if(cwd===path.join(root,'frontend'))args[0]=path.join(root,'node_modules/vite/bin/vite.js');
 const child=spawn(process.execPath,args,{cwd,env:{...process.env,...vars},stdio:'inherit',windowsHide:true});
 child.on('exit',code=>console.log(name+' stopped: '+code));return child;
});
process.on('SIGINT',()=>{children.forEach(c=>c.kill());process.exit(0)});
console.log('GoodJob: http://127.0.0.1:15188  / local login details: 本地登录信息.txt');
