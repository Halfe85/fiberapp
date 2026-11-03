import {cp,rm,mkdir,readdir,stat} from 'node:fs/promises';
import {join} from 'node:path';
const from=join(process.cwd(),'dist','fiberapp','browser');
if(!(await stat(join(from,'index.html')).catch(()=>null)))throw Error('Mangler dist/fiberapp/browser/index.html – kjør Angular build først.');
const root=process.cwd();
for(const name of await readdir(root)){
 if(name==='index.html'||/^(?:main|polyfills|styles|chunk|runtime)-[\w-]+\.(?:js|css|map)$/.test(name)){
  await rm(join(root,name),{force:true});
 }
}
for(const name of await readdir(from)){
 const src=join(from,name),dst=join(root,name);
 if(name==='assets')await rm(dst,{recursive:true,force:true});
 await cp(src,dst,{recursive:true,force:true});
}
console.log('Angular build copied to repository root. Review and commit changed files manually; no Actions.');
