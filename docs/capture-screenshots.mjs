import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir,mkdtemp} from 'node:fs/promises';
import {resolve,extname,join} from 'node:path';
import {tmpdir} from 'node:os';
import {deflateSync,inflateSync} from 'node:zlib';

// Real browser screenshots only. No storage shim, account, or existing user data.
const live='https://vibecoding-calendar-website-cgue4q819-hasti-intern.vercel.app/';
const root=resolve('.'),output=resolve('docs/screenshots');
const chrome=process.env.CHROME_PATH||(process.platform==='win32'?'C:/Program Files/Google/Chrome/Application/chrome.exe':'google-chrome');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
await mkdir(output,{recursive:true});
const profile=await mkdtemp(join(tmpdir(),'dayflow-docs-'));
const server=createServer(async(req,res)=>{try{
 const path=resolve(req.url==='/'?'index.html':decodeURIComponent(req.url.split('?')[0].slice(1)));
 if(!path.startsWith(root+'/')&&!path.startsWith(root+'\\')){res.writeHead(403);res.end();return;}
 const file=await readFile(path);res.setHeader('Content-Type',{'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.png':'image/png'}[extname(path)]||'application/octet-stream');res.end(file);
}catch{res.writeHead(404);res.end();}}).listen(8046,'127.0.0.1');
const browser=spawn(chrome,['--headless=new','--no-sandbox','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=9286','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
function optimizePng(buffer){
 const crc32=data=>{let crc=0xffffffff;for(const byte of data){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^(0xedb88320&-(crc&1));}return(crc^0xffffffff)>>>0;};
 const chunk=(type,data)=>{const value=Buffer.alloc(data.length+12);value.writeUInt32BE(data.length);value.write(type,4,4,'ascii');data.copy(value,8);value.writeUInt32BE(crc32(value.subarray(4,-4)),value.length-4);return value;};
 const chunks=[],pixels=[];for(let offset=8;offset<buffer.length;){const length=buffer.readUInt32BE(offset),type=buffer.toString('ascii',offset+4,offset+8);if(type==='IDAT')pixels.push(buffer.subarray(offset+8,offset+8+length));else chunks.push({type,data:buffer.subarray(offset,offset+length+12)});offset+=length+12;}
 const smaller=Buffer.concat([buffer.subarray(0,8),...chunks.filter(c=>c.type!=='IEND').map(c=>c.data),chunk('IDAT',deflateSync(inflateSync(Buffer.concat(pixels)),{level:9})),chunks.find(c=>c.type==='IEND').data]);return smaller.length<buffer.length?smaller:buffer;
}
let ws;
try{
 let tabs;for(let i=0;i<40;i++){try{tabs=await(await fetch('http://127.0.0.1:9286/json',{signal:AbortSignal.timeout(500)})).json();break;}catch{await wait(200);}}
 if(!tabs)throw Error('Chrome did not start. Set CHROME_PATH to its executable.');
 ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}));let id=0;const pending=new Map(),errors=[],warnings=[];
 ws.addEventListener('message',event=>{const message=JSON.parse(event.data);if(message.id){pending.get(message.id)?.(message);pending.delete(message.id);}if(message.method==='Runtime.exceptionThrown')errors.push(message.params.exceptionDetails.text);if(message.method==='Runtime.consoleAPICalled'&&message.params.type==='warning')warnings.push(message.params.args[0]?.value||'Warning');});
 const call=(method,params={})=>new Promise((resolveCall,reject)=>{const n=++id;const timeout=setTimeout(()=>{pending.delete(n);reject(Error(method+' timed out'));},30000);pending.set(n,message=>{clearTimeout(timeout);message.error?reject(Error(JSON.stringify(message.error))):resolveCall(message.result);});ws.send(JSON.stringify({id:n,method,params}));});
 const evaluate=async expression=>{const result=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result.value;};
 const navigate=async url=>{await call('Page.navigate',{url});for(let i=0;i<100;i++){if(await evaluate("document.readyState==='complete'"))break;await wait(100);}await wait(300);};
 const assert=(condition,message)=>{if(!condition)throw Error(message);};
 await call('Page.enable');await call('Runtime.enable');await call('Emulation.setTimezoneOverride',{timezoneId:'Asia/Kuala_Lumpur'});
 await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 await navigate(live);
 const deployment=await evaluate("({origin:location.origin,title:document.title,hasCalendar:!!document.getElementById('calBody')})");
 // The supplied deployment currently resolves to Vercel authentication. Always label local output.
 await navigate('http://127.0.0.1:8046/');
 await evaluate('Promise.all([document.fonts.load("400 16px Fraunces"),document.fonts.load("400 16px IBM Plex Mono")]).then(()=>document.fonts.ready)');
 const fonts=await evaluate("({fraunces:document.fonts.check('16px Fraunces'),mono:document.fonts.check('16px \"IBM Plex Mono\"')})");
 assert(fonts.fraunces&&fonts.mono,'External fonts did not load');
 const checks={};checks.storageApiMissing=await evaluate("typeof window.storage==='undefined'");
 checks.currentMonth=await evaluate("document.getElementById('calTitle').textContent.includes(String(new Date().getFullYear()))");
 const files=[];
 async function capture(name){await wait(200);const screenshot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});const original=Buffer.from(screenshot.data,'base64');const png=optimizePng(original);await writeFile(join(output,name+'.png'),png);files.push({file:name+'.png',bytes:png.length});}
 await capture('dashboard');
 const initialMonth=await evaluate("document.getElementById('calTitle').textContent");
 await evaluate("document.getElementById('nextMonth').click();document.querySelector('[data-theme=midnight].swatch').click()");
 assert(await evaluate("document.getElementById('calTitle').textContent")!==initialMonth,'Month navigation failed');
 await capture('calendar');
 await evaluate("document.getElementById('prevMonth').click();document.querySelector('[data-theme=paper].swatch').click();document.querySelector('.day-cell:not(.out)').click()");
 await wait(100);
 await call('Input.insertText',{text:'A little plan for the day\nReview this week’s coursework.\nMake time for reading and a short walk.'});
 await wait(650);
 assert(await evaluate("document.getElementById('noteArea').innerText.includes('coursework')"),'Note input failed');
 await evaluate("document.getElementById('insertTableBtn').click();document.getElementById('tableRows').value='3';document.getElementById('tableCols').value='2';document.getElementById('createTableBtn').click()");
 assert(await evaluate("document.querySelectorAll('.note-table tr').length===3"),'Table insertion failed');
 await wait(650);await capture('note-editor');
 await evaluate("document.getElementById('backBtn').click();document.querySelector('.day-cell:not(.out)').click()");await wait(100);
 checks.memoryNoteRecovery=await evaluate("document.getElementById('noteArea').innerText.includes('coursework')");
 checks.noteMarkerWithoutProvider=await evaluate("document.querySelectorAll('.has-note').length");
 await call('Page.reload');await wait(500);await evaluate("document.querySelector('.day-cell:not(.out)').click()");await wait(100);
 checks.noteLostOnReload=await evaluate("!document.getElementById('noteArea').innerText.includes('coursework')");
 await evaluate("document.getElementById('backBtn').click()");
 await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
 checks.mobileNoOverflow=await evaluate('document.documentElement.scrollWidth<=innerWidth');
 await capture('mobile');
 checks.runtimeErrors=errors;checks.storageWarnings=[...new Set(warnings.filter(warning=>!warning.startsWith('[GSI_LOGGER]')))];
 const metadata={capturedAt:new Date().toISOString(),source:'Unmodified local application; supplied deployment redirects to Vercel sign-in.',localOrigin:'http://127.0.0.1:8046/',deploymentUrl:live,deploymentCheck:deployment,viewports:{desktop:{width:1440,height:1000},mobile:{width:390,height:844}},fonts,data:'Generic sample text and an editable table in a fresh disposable browser profile. No storage adapter injected; no existing user data, real location, or personal images used.',checks,files};
 await writeFile(join(output,'source.json'),JSON.stringify(metadata,null,2)+'\n');console.log(JSON.stringify(metadata,null,2));
}finally{ws?.close();browser.kill();server.close();}
