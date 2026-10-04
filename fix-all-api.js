const fs = require('fs');
const path = require('path');
const srcDir = 'artifacts/ticket-system/src';

fs.writeFileSync(path.join(srcDir,'lib/api.ts'), `export const API_BASE = (import.meta.env.VITE_API_URL || "").replace(/\\/$/, "");
export function getApiUrl(p){ const path = p.startsWith("/")?p:\`/\${p}\`; return API_BASE ? \`\${API_BASE}\${path}\` : path; }
`);

let count=0;
function walk(dir){
 for(const e of fs.readdirSync(dir,{withFileTypes:true})){
  const full=path.join(dir,e.name);
  if(e.isDirectory()) walk(full);
  else if(full.endsWith('.ts')||full.endsWith('.tsx')){
   let c=fs.readFileSync(full,'utf8');
   let orig=c;
   c=c.replace(/fetch\(\s*\"\/api/g,'fetch(getApiUrl("/api');
   c=c.replace(/fetch\(\s*'\/api/g,"fetch(getApiUrl('/api");
   c=c.replace(/fetch\(\s*`\/api/g,'fetch(getApiUrl(`/api');
   // add missing ) if needed -> getApiUrl("/api/xxx")  should have )) before comma
   // Fix double )) case from previous run
   c=c.replace(/getApiUrl\("\/api([^"]*)""\)/g,'getApiUrl("/api$1")');
   c=c.replace(/getApiUrl\('\/api([^']*)''\)/g,"getApiUrl('/api$1')");
   if(c!==orig){
    if(!c.includes('@/lib/api')) c=`import { getApiUrl } from "@/lib/api";\n`+c;
    fs.writeFileSync(full,c,'utf8');
    console.log('FIXED',full);
    count++;
   }
  }
 }
}
walk(srcDir);
console.log('TOTAL FIXED:',count);