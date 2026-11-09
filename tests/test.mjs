import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import harness,{password} from './harness.mjs';
const root=new URL('../',import.meta.url),read=p=>fs.readFileSync(new URL(p,root),'utf8');
let passed=0;function test(name,fn){fn();console.log('PASS '+name);passed++;}
const backend=read('backend/Code.gs'),html=read('web/dashboard.html'),app=read('web/assets/app.js');
test('backend compiles, has no write endpoints, and requests read-only Sheets access',()=>{
  new vm.Script(backend);for(const name of ['checkIn','setupGuardTour','setupIdleMonitoring','sweepMissedRounds_'])assert.ok(!backend.includes('function '+name+'('));
  assert.ok(!/\.setValues\(|\.appendRow\(|\.insertSheet\(/.test(backend));assert.ok(!backend.includes('defaultAdminCredential_'));
  const scopes=JSON.parse(read('backend/appsscript.json')).oauthScopes;assert.ok(scopes.includes('https://www.googleapis.com/auth/spreadsheets.readonly'));assert.ok(!scopes.includes('https://www.googleapis.com/auth/spreadsheets'));
});
test('read-only Sheets API adapter preserves formatted IDs and converts Bangkok serial dates',()=>{
  const date=new Date('2026-11-06T09:00:00+07:00'),serial=(date.getTime()+7*3600000)/86400000+25569;
  const raw=[['ID','Request','ReceivedAt','PatrolDate','ScheduledDateTime','Round'],['001','req',serial,Math.floor(serial),serial,9/24]];
  const display=[raw[0],['001','req','06/11/2026 09:00','2026-11-06','06/11/2026 09:00','09:00']];
  let calls=0;const c=vm.createContext({Date,Sheets:{Spreadsheets:{Values:{get(id,range,args){calls++;return{values:args.valueRenderOption==='FORMATTED_VALUE'?display:raw};}}}}});
  vm.runInContext(read('backend/SheetsReader.gs'),c);const book=c.readBook_('test'),sheet=book.getSheetByName('PatrolLogs'),row=sheet.getRange(2,1,1,6).getValues()[0];
  assert.equal(row[0],'001');assert.equal(row[2].toISOString(),date.toISOString());assert.equal(row[3].toISOString(),'2026-11-05T17:00:00.000Z');assert.equal(sheet.getRange(2,6).getDisplayValues()[0][0],'09:00');
  assert.equal(book.getSheetByName('PatrolLogs'),sheet);assert.equal(calls,2);assert.equal(typeof sheet.appendRow,'undefined');
});
test('Admin identity and password are checked before all data and cached reads',()=>{
  const h=harness();assert.throws(()=>h.context.getAdminDashboard({}),/Admin/);h.context.Session.getActiveUser=()=>({getEmail:()=>'owner@example.test'});
  assert.throws(()=>h.context.getAdminOptions({}),/ADMIN_SESSION_REQUIRED/);assert.throws(()=>h.context.loginAdmin({password:'wrong'}),/ไม่ถูกต้อง/);
  const token=h.context.loginAdmin({password});assert.equal(h.context.getAdminOptions(token).stations.length,2);
  const input={...token,startDate:'2026-11-05',endDate:'2026-11-05'};const data=h.context.getAdminDashboard(input);assert.equal(data.summary.stationCount,2);
  h.context.logoutAdmin(token);assert.throws(()=>h.context.getAdminDashboard(input),/ADMIN_SESSION_REQUIRED/);
});
test('cached report expires and explicit refresh rereads the underlying records',()=>{
  const h=harness();h.context.Session.getActiveUser=()=>({getEmail:()=>'owner@example.test'});let reads=0;
  h.context.readAdminDashboard_=()=>({asOf:'first',count:++reads});const input={...h.context.loginAdmin({password}),startDate:'2026-11-05',endDate:'2026-11-05'};
  assert.equal(h.context.getAdminDashboard(input).count,1);assert.equal(h.context.getAdminDashboard(input).count,1);assert.equal(h.context.getAdminDashboard({...input,forceRefresh:true}).count,2);
  h.setClock('2026-11-05T23:00:31+07:00');assert.equal(h.context.getAdminDashboard(input).count,3);
});
test('allowed methods cannot invoke patrol writes or inherit object methods',()=>{
  const h=harness();for(const method of ['checkIn','setupProduction','constructor','toString','__proto__'])assert.throws(()=>h.context.dashboardCall({method,args:{}}),/ไม่อนุญาต/);
});
test('direct access denies non-admins before serving the password form and rejects the retired bridge',()=>{
  const h=harness();
  h.context.HtmlService={
    createHtmlOutput:body=>({body,setTitle(){return this;},addMetaTag(){return this;}}),
    createHtmlOutputFromFile:file=>({file,setTitle(){return this;},addMetaTag(){return this;}})
  };
  assert.match(h.context.doGet({}).body,/บัญชีนี้ยังเข้า Dashboard ไม่ได้/);
  h.context.Session.getActiveUser=()=>({getEmail:()=>'owner@example.test'});
  assert.equal(h.context.doGet({}).file,'Dashboard');
  assert.throws(()=>h.context.doGet({parameter:{origin:'https://subayb2.github.io'}}),/เปิด Dashboard โดยตรง/);
  assert.ok(!backend.includes('ALLOWALL'));
});
test('public entry has a fixed Google destination and no credential collection',()=>{
  const entry=read('web/index.html'),source=read('backend/Dashboard.html');
  assert.match(entry,/href="https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec"/);
  assert.doesNotMatch(entry,/<(?:input|form|iframe|script)\b/i);
  assert.doesNotMatch(source,/localStorage|postMessage|settingsDialog/);
  new vm.Script(source.match(/<script>\s*([\s\S]*?)<\/script>/)[1]);
});
test('filters reconcile station/day totals and Sheets date cells are normalized',()=>{
  const h=harness();h.context.Session.getActiveUser=()=>({getEmail:()=>'owner@example.test'});
  h.roundSheet.rows.push(['AAA|round',h.date('2026-11-05T09:00:00+07:00'),h.date('2026-11-05T00:00:00+07:00'),'AAA','สถานี A','IDEL',0,h.date('2026-11-05T09:30:00+07:00'),'','']);
  const input={...h.context.loginAdmin({password}),startDate:'2026-11-05',endDate:'2026-11-05',stationCode:'AAA'};
  const result=h.context.getAdminDashboard(input);assert.equal(result.summary.idelRounds,1);assert.equal(result.summary.closedRounds,1);assert.equal(result.daily[0].idel,1);assert.equal(result.rounds.items[0].patrolDate,'2026-11-05');
  assert.throws(()=>h.context.getAdminDashboard({...input,endDate:'2026-12-31'}),/31/);
});
test('Early, On Time and Late totals use every filtered check-in, not just the current page',()=>{
  const h=harness();h.context.Session.getActiveUser=()=>({getEmail:()=>'owner@example.test'});
  for(let i=0;i<31;i++)h.logSheet.rows.push(['log'+i,'request'+i,h.date('2026-11-05T09:00:00+07:00'),'2026-11-05',h.date('2026-11-05T09:00:00+07:00'),'09:00',i<10?'Early':i<20?'On Time':'Late','AAA','สถานี A','001','ตัวอย่าง','CP1',14,100,10,'',0,12,'','']);
  const input={...h.context.loginAdmin({password}),startDate:'2026-11-05',endDate:'2026-11-05',stationCode:'AAA',logPage:2};
  const result=h.context.getAdminDashboard(input);assert.equal(result.logs.items.length,6);assert.equal(result.summary.checkins,31);assert.equal(result.summary.earlyCheckins,10);assert.equal(result.summary.onTimeCheckins,10);assert.equal(result.summary.lateCheckins,11);assert.equal(result.summary.unknownTimeCheckins,0);assert.equal(result.stations[0].earlyCheckins,10);
  assert.equal(h.context.getAdminDashboard({...input,stationCode:'BBB'}).summary.earlyCheckins,0);
  h.logSheet.rows[1][6]='';const refreshed=h.context.getAdminDashboard({...input,forceRefresh:true});assert.equal(refreshed.summary.earlyCheckins,9);assert.equal(refreshed.summary.unknownTimeCheckins,1);
});
test('chart aggregates and unit/round filters reconcile all records including legacy hours and night rounds',()=>{
  const h=harness();h.context.Session.getActiveUser=()=>({getEmail:()=>'owner@example.test'});
  const token=h.context.loginAdmin({password}),input={...token,startDate:'2026-11-05',endDate:'2026-11-05'};
  for(const [code,hour,status] of [['AAA','09','IDEL'],['AAA','01','PATROLLED'],['BBB','10','IDEL']]){
    const day=hour==='01'?'2026-11-06':'2026-11-05';
    h.roundSheet.rows.push([code+hour,h.date(day+'T'+hour+':00:00+07:00'),'2026-11-05',code,code,status,status==='IDEL'?0:31,'','','']);
  }
  for(let i=0;i<31;i++)h.logSheet.rows.push(['log'+i,'r'+i,h.date('2026-11-06T00:55:00+07:00'),'2026-11-05',h.date('2026-11-06T01:00:00+07:00'),'01:00',i<30?'On Time':'','AAA','A','001','ตัวอย่าง','CP1',14,100,10,'',0,12,'','']);
  const result=h.context.getAdminDashboard({...input,unit:'หน่วยทดสอบ',round:'01:00',logPage:2});
  assert.equal(result.summary.checkins,31);assert.equal(result.logs.items.length,6);assert.equal(result.daily[0].checkins,31);assert.equal(result.daily[0].unknown,1);
  assert.equal(result.roundsByHour.length,1);assert.equal(result.roundsByHour[0].round,'01:00');assert.equal(result.roundsByHour[0].checkins,31);assert.equal(result.roundsByHour[0].patrolled,1);
  const all=h.context.getAdminDashboard(input);assert.deepEqual(Array.from(all.roundsByHour,x=>x.round),['09:00','10:00','01:00']);
  assert.equal(all.roundsByHour.reduce((sum,x)=>sum+x.idel+x.patrolled,0),all.summary.closedRounds);
  assert.equal(h.context.getAdminDashboard({...input,unit:'ไม่มีหน่วยนี้'}).summary.stationCount,0);
  assert.equal(h.context.getAdminDashboard({...input,round:'09:00'}).summary.idelRounds,1);
  assert.throws(()=>h.context.getAdminDashboard({...input,round:'25:00'}),/รอบเวลา/);
});
test('UI has labels, consistent IDs, safe DOM rendering and honest unloaded state',()=>{
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(ids.length,new Set(ids).size);
  for(const m of app.matchAll(/\$\('([^']+)'\)/g))assert.ok(ids.includes(m[1]),'Missing UI '+m[1]);
  assert.ok(!app.includes('.innerHTML'));assert.ok(html.includes('ยังไม่ได้โหลดข้อมูล'));assert.ok(html.includes('ส่งออกหน้านี้'));assert.ok(app.includes('s.patrolledRounds/s.closedRounds*100'));
  assert.ok(app.includes('ArrowLeft'));assert.ok(app.includes('role')||html.includes('role="tab"'));assert.ok(!read('web/config.js').includes('Ayb'));
});
{
  const nodes=new Map();const element=()=>({style:{},dataset:{},children:[],value:'',hidden:false,textContent:'',setAttribute(k,v){this[k]=v;},getAttribute(k){return this[k];},append(...children){this.children.push(...children);},replaceChildren(...children){this.children=children;},querySelectorAll(){return [];},focus(){}});
  const document={getElementById(id){if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);},querySelectorAll(){return [];},createElement:element};
  const c=vm.createContext({document,console,Intl,Date,URL,Error,clearTimeout,google:{script:{run:{}}},Option:class{constructor(text,value){this.text=text;this.value=value;}},config:{patrolUrl:'https://example.test'},DashboardApi:class{}});
  vm.runInContext(app.replace(/^import .*;$/gm,''),c);
  vm.runInContext("state.options={stations:[{code:'AAA',name:'สถานี A'}]};state.token='test-token';rpc=async()=>({filters:{startDate:'2026-11-05',endDate:'2026-11-05',stationCode:'',roundPage:1,logPage:1},asOf:'2026-11-05T10:00:00Z',summary:{stationCount:1,checkins:2,earlyCheckins:1,onTimeCheckins:1,lateCheckins:0,unknownTimeCheckins:0,patrolledRounds:1,idelRounds:3,closedRounds:4},daily:[{date:'2026-11-05',patrolled:1,idel:3}],stations:[{code:'AAA',name:'สถานี A',patrolledRounds:1,idelRounds:3}],logs:{total:2,page:1,pages:1,items:[{receivedAt:'2026-11-05T09:00:00Z',stationName:'สถานี A',guardName:'ตัวอย่าง',checkpointId:'CP1',round:'16:00',status:'On Time',checkpointDistanceMeters:12}]},rounds:{total:4,page:1,pages:1,items:[{patrolDate:'2026-11-05',scheduledAt:'2026-11-05T09:00:00Z',stationName:'สถานี A',status:'IDEL',checkinCount:0}]},monitoringEnabled:null});",c);
  await vm.runInContext("load({startDate:'2026-11-05',endDate:'2026-11-05'})",c);
  assert.ok(nodes.has('roundRows'),nodes.get('message').textContent);assert.equal(nodes.get('kpiRate').textContent,'25%');assert.equal(nodes.get('kpiCheckins').textContent,'2');assert.equal(nodes.get('earlyCheckins').textContent,'1');assert.equal(nodes.get('lateCheckins').textContent,'0');assert.equal(nodes.get('roundRows').children.length,1);assert.equal(nodes.get('message').hidden,true);
  vm.runInContext("tab('log');",c);assert.equal(nodes.get('logPanel').hidden,false);assert.match(nodes.get('recordPage').textContent,/2 รายการ/);
  assert.equal(nodes.get('trendGraph').children.length,1);assert.equal(nodes.get('timingGraph').children.length,3);assert.equal(nodes.get('stationGraph').children.length,1);
  vm.runInContext("$('startDate').value='2026-11-05';$('endDate').value='2026-11-06';$('unitFilter').value='หน่วย A';$('roundFilter').value='01:00';",c);
  assert.equal(vm.runInContext('filters().round',c),'01:00');assert.equal(vm.runInContext('filters().unit',c),'หน่วย A');
  nodes.get('trendGraph').children[0].onclick();assert.equal(nodes.get('startDate').value,'2026-11-05');assert.equal(nodes.get('endDate').value,'2026-11-05');
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(vm.runInContext("csvCell('=SUM(A1)')",c),'"\'=SUM(A1)"');
  vm.runInContext("rpc=async()=>{throw new Error('ADMIN_SESSION_REQUIRED: หมดเวลา');}",c);
  await vm.runInContext("load({startDate:'2026-11-05',endDate:'2026-11-05'})",c);
  assert.equal(nodes.get('loginPanel').hidden,false);assert.equal(nodes.get('kpiCheckins').textContent,'—');assert.equal(nodes.get('filterFields').disabled,true);assert.equal(vm.runInContext('state.data',c),null);
  assert.match(nodes.get('stationGraph').children[0].textContent,/เข้าสู่ระบบ/);
  console.log('PASS UI renders filtered metrics, tabs and scoped CSV, and clears private data on expired sessions');passed++;
}
console.log(`${passed} tests passed. No live Google write or authentication was performed.`);
