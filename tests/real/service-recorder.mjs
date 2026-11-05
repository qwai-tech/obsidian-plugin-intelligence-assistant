/** Transparent real-service recorder. Bodies/responses are forwarded unchanged; no canned replies. */
import http from 'node:http';
import {createHash,randomUUID} from 'node:crypto';
import {appendFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
const port=Number(process.env.IA_RECORDER_PORT||18616);
const target=new URL(process.env.IA_RECORDER_TARGET||'http://127.0.0.1:17680');
if(target.protocol!=='http:')throw Error('This local recorder expects the explicitly configured local HTTP service');
const file=path.resolve(process.env.IA_RECORDER_FILE||'test-results/release-prep-0.0.23-2026-11-05/service-audit.jsonl');await mkdir(path.dirname(file),{recursive:true});
let writing=Promise.resolve();const record=value=>{writing=writing.then(()=>appendFile(file,JSON.stringify(value)+'\n'));};
const server=http.createServer((request,response)=>{
 const chunks=[];request.on('data',c=>chunks.push(c));request.on('end',()=>{
  const body=Buffer.concat(chunks),id=randomUUID(),started=Date.now();let parsed={};try{parsed=JSON.parse(body.toString());}catch{}
  const requestInfo={id,startedAt:started,method:request.method,path:request.url,requestSha256:createHash('sha256').update(body).digest('hex'),requestBytes:body.length,model:parsed.model,thinkingOverridePresent:Object.hasOwn(parsed,'thinking'),reasoningEffortOverridePresent:Object.hasOwn(parsed,'reasoning_effort'),stream:parsed.stream,toolChoice:parsed.tool_choice,toolNames:parsed.tools?.map(t=>t.function?.name)};
  const upstream=http.request({hostname:target.hostname,port:target.port,method:request.method,path:request.url,headers:{...request.headers,host:target.host}},res=>{
   response.writeHead(res.statusCode||502,res.headers);let bytes=0,tail=Buffer.alloc(0),done=false;const hash=createHash('sha256');
   res.on('data',c=>{bytes+=c.length;hash.update(c);tail=Buffer.concat([tail,c]).subarray(-131072);});
   const finish=aborted=>{if(done)return;done=true;const text=tail.toString();const events=[];for(const line of text.split('\n')){if(!line.startsWith('data:'))continue;try{events.push(JSON.parse(line.slice(5).trim()));}catch{}}
    record({...requestInfo,status:res.statusCode,endedAt:Date.now(),durationMs:Date.now()-started,responseBytes:bytes,responseSha256:hash.digest('hex'),aborted,finishReasons:events.flatMap(e=>(e.choices||[]).map(c=>c.finish_reason)).filter(Boolean),usage:events.findLast(e=>e.usage)?.usage});};
   res.on('end',()=>finish(false));res.on('aborted',()=>finish(true));res.pipe(response);
  });
  upstream.on('error',error=>{record({...requestInfo,status:0,error:error.code||error.message,durationMs:Date.now()-started});if(!response.headersSent)response.writeHead(502);response.end('Real upstream connection failed');});
  response.on('close',()=>{if(!response.writableEnded)upstream.destroy();});upstream.end(body);
 });
});
server.listen(port,'127.0.0.1',()=>console.log(JSON.stringify({recorder:'transparent-forwarding',port,target:target.origin,file,storesCredentials:false})));
process.on('SIGTERM',()=>server.close(async()=>{await writing;process.exit(0);}));
