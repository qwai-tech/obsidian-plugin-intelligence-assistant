/* Standalone real read-only CLI measurement of saved test-vault notes. No model output substitutes. */
const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');
const root=fs.realpathSync(process.argv[2]);const target=process.argv[3];const minimum=Number(process.argv[4]);const expected=Number(process.argv[5]);
if(!Number.isFinite(minimum)||minimum<1)throw Error('Invalid minimum word count');
const measure=name=>{const file=fs.realpathSync(path.resolve(root,name));if(!file.startsWith(root+path.sep)||!file.endsWith('.md'))throw Error('Outside scoped Markdown files');const content=fs.readFileSync(file,'utf8');const words=(content.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu)||[]).length;return {path:path.relative(root,file),words,minimum,meetsMinimum:words>=minimum,sha256:crypto.createHash('sha256').update(content).digest('hex')};};
if(target==='*'){
 if(!Number.isInteger(expected)||expected<1)throw Error('Invalid expected note count');
 const names=fs.readdirSync(root).filter(n=>/^note_\d+\.md$/.test(n));const files=names.map(measure);const shortages=files.filter(f=>!f.meetsMinimum);const missingArticles=[];const missingLinks=[];const index=fs.existsSync(path.join(root,'index.md'))?fs.readFileSync(path.join(root,'index.md'),'utf8'):'';
 for(let i=1;i<=expected;i++){const stem='note_'+String(i).padStart(3,'0');if(!names.includes(stem+'.md'))missingArticles.push(stem+'.md');if(!new RegExp('\\[\\['+stem+'(?:\\.md)?(?:\\|[^\\]]*)?\\]\\]').test(index))missingLinks.push(stem);}
 process.stdout.write(JSON.stringify({kind:'aggregate',expectedNotes:expected,fileCount:files.length,passing:files.length-shortages.length,minimum,totalWords:files.reduce((n,f)=>n+f.words,0),shortages,missingArticles,missingLinks,indexExists:!!index,complete:files.length===expected&&!shortages.length&&!missingArticles.length&&!missingLinks.length&&!!index}));
}else process.stdout.write(JSON.stringify(measure(target)));
