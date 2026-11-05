/** Actual disk/CPU workload for live agent acceptance. No service or response emulation. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const [root,op,id='0',token='']=process.argv.slice(2);const n=Number(id);
const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
const audit=(event)=>fs.appendFileSync(path.join(root,'tool-audit.jsonl'),JSON.stringify({at:Date.now(),pid:process.pid,op,id:n,...event})+'\n');
const input=i=>path.join(root,'inputs',`batch-${String(i).padStart(3,'0')}.json`);
const output=i=>path.join(root,'checkpoints',`batch-${String(i).padStart(3,'0')}.json`);
const hash=text=>crypto.createHash('sha256').update(text).digest('hex');
const completed=()=>fs.readdirSync(path.join(root,'checkpoints')).filter(x=>/^batch-\d+\.json$/.test(x)).map(x=>Number(x.match(/\d+/)[0])).sort((a,b)=>a-b);
audit({event:'started'});
if(op==='status')console.log(JSON.stringify({task:manifest.task,batches:manifest.batches,rowsPerBatch:manifest.rows,completed:completed(),pending:Array.from({length:manifest.batches},(_,i)=>i+1).filter(i=>!completed().includes(i)),invariant:manifest.invariant}));
else if(op==='inspect'||op==='process'){
 if(!Number.isInteger(n)||n<1||n>manifest.batches)throw Error('Invalid batch');
 const raw=fs.readFileSync(input(n),'utf8'),data=JSON.parse(raw);
 if(op==='inspect')console.log(raw);
 else{
  if(token!==data.token)throw Error('Read the source and provide its exact token');
  if(fs.existsSync(output(n))){const saved=JSON.parse(fs.readFileSync(output(n),'utf8'));if(saved.sourceSha256!==hash(raw))throw Error('Source changed after checkpoint');console.log(JSON.stringify({...saved,workDigests:undefined,reused:true}));audit({event:'reused'});process.exit(0);}
  fs.writeFileSync(path.join(root,'inflight.json'),JSON.stringify({pid:process.pid,id:n,startedAt:Date.now()}));
  const digests=data.records.map(row=>crypto.pbkdf2Sync(row.payload,row.id,manifest.iterations,32,'sha256').toString('hex'));
  const result={batch:n,records:data.records.length,total:data.records.reduce((s,x)=>s+x.amount,0),sourceSha256:hash(raw),workSha256:hash(digests.join('\n')),workDigests:digests,task:manifest.task};
  const tmp=output(n)+'.'+process.pid+'.tmp';fs.writeFileSync(tmp,JSON.stringify(result));fs.renameSync(tmp,output(n));audit({event:'committed',sourceSha256:result.sourceSha256});fs.unlinkSync(path.join(root,'inflight.json'));console.log(JSON.stringify({...result,workDigests:undefined}));
 }
}else if(op==='summary'){
 // Read-only source/artifact aggregation, not a fabricated model/tool result.
 const ids=completed();if(ids.length!==manifest.batches)throw Error('Summary requires all batches committed');
 const initial=id==='0'||id===''?[]:id.split(',').map(Number);
 if(initial.some(i=>!Number.isInteger(i)||i<1||i>manifest.batches)||new Set(initial).size!==initial.length)throw Error('Invalid pre-existing IDs');
 const totals=ids.map(i=>{const raw=fs.readFileSync(input(i),'utf8'),data=JSON.parse(raw),cp=JSON.parse(fs.readFileSync(output(i),'utf8'));const sum=data.records.reduce((s,r)=>s+r.amount,0);if(cp.sourceSha256!==hash(raw)||cp.total!==sum||cp.records!==data.records.length||cp.task!==manifest.task)throw Error('Summary artifact validation failed');return sum;});
 const last=ids.slice(-3),total=totals.reduce((s,x)=>s+x,0),preexistingTotal=initial.reduce((s,i)=>s+totals[i-1],0);
 console.log(JSON.stringify({scope:'All committed batches; arithmetic from actual source records. Pre-existing scope is the caller-supplied ID set, which must match the first status.',task:manifest.task,completedIds:ids,preexistingBatchIds:initial,perBatchTotals:last.map(i=>({batch:i,batchTotal:totals[i-1]})),cumulativeTotals:last.map(i=>({throughBatch:i,cumulativeTotal:totals.slice(0,i).reduce((s,x)=>s+x,0)})),total,preexistingTotal,newlyCompletedTotal:total-preexistingTotal}));audit({event:'summarized',preexistingIds:initial});
}else if(op==='verify'){
 const ids=completed();if(ids.length!==manifest.batches)throw Error(`Only ${ids.length}/${manifest.batches} batches committed`);
 let total=0,records=0;for(const i of ids){const raw=fs.readFileSync(input(i),'utf8'),data=JSON.parse(raw),saved=JSON.parse(fs.readFileSync(output(i),'utf8'));if(saved.sourceSha256!==hash(raw)||saved.total!==data.records.reduce((s,x)=>s+x.amount,0)||saved.records!==data.records.length||saved.task!==manifest.task)throw Error('Artifact validation failed');total+=saved.total;records+=saved.records;}
 const result={task:manifest.task,batches:ids.length,records,total,invariant:manifest.invariant,checkpointSha256:hash(ids.map(i=>fs.readFileSync(output(i),'utf8')).join('\n'))};const tmp=path.join(root,'verified.json.tmp');fs.writeFileSync(tmp,JSON.stringify(result));fs.renameSync(tmp,path.join(root,'verified.json'));console.log(JSON.stringify(result));audit({event:'verified'});
}else throw Error('Unknown operation');
audit({event:'finished'});
