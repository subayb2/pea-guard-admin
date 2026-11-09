import {config} from '../config.js';
import {DashboardApi} from './api.js';
const $=id=>document.getElementById(id);
const paths={grid:'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',list:'M9 5h12M9 12h12M9 19h12M3 5h1M3 12h1M3 19h1',external:'M14 3h7v7M21 3 10 14M10 3H3v18h18v-7',settings:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM9 3l-1 3-3 1-2 3 2 2-1 3 3 3 3-1 2 2 3-1 1-3 3-1 2-3-2-2 1-3-3-3-3 1-2-2Z',refresh:'M20 7v5h-5M4 17v-5h5M5 8a8 8 0 0 1 13-2l2 3M4 15l2 3a8 8 0 0 0 13-2',lock:'M6 10h12v11H6zM8 10V6a4 4 0 0 1 8 0v4M12 14v3',arrow:'M4 12h16M14 6l6 6-6 6',filter:'M3 4h18l-7 8v7l-4 2v-9Z',calendar:'M3 6h18v15H3zM7 3v6M17 3v6M3 11h18',pin:'M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0ZM12 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z',check:'m5 12 4 4L19 6',alert:'M12 3 2 21h20ZM12 9v5M12 17v1',chart:'M4 3v18h17M8 16v-4M13 16V8M18 16V5',left:'m15 5-7 7 7 7',right:'m9 5 7 7-7 7',download:'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5',close:'m5 5 14 14M19 5 5 19'};
function icons(root=document){root.querySelectorAll('[data-icon]').forEach(el=>{const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','1.6');svg.setAttribute('stroke-linecap','round');svg.setAttribute('stroke-linejoin','round');svg.setAttribute('aria-hidden','true');const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',paths[el.dataset.icon]||paths.grid);svg.append(path);el.replaceChildren(svg);});}
icons();
const n=v=>new Intl.NumberFormat('th-TH').format(v);
const dateLabel=v=>new Intl.DateTimeFormat('th-TH',{day:'numeric',month:'short',year:'numeric',timeZone:'Asia/Bangkok'}).format(new Date(v+'T00:00:00+07:00'));
const dateTime=v=>v&&Number.isFinite(new Date(v).getTime())?new Intl.DateTimeFormat('th-TH',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Bangkok'}).format(new Date(v)):'—';
const state={api:null,token:'',options:null,data:null,stationPage:1,tab:'round',busy:false,request:0};
const directAccess = typeof google !== 'undefined' && Boolean(google.script?.run);
let expiryTimer;
$('patrolLink').href=config.patrolUrl;
function notice(text='',error=false){$('message').textContent=text;$('message').hidden=!text;$('message').className='message'+(error?' error':state.busy?' busy':'');}
function showError(id,text){$(id).textContent=text;$(id).hidden=!text;}
function connection(){
  const active=Boolean(state.token);
  $('connection').textContent=active?'เชื่อมต่อข้อมูลแล้ว':'ยังไม่เข้าสู่ระบบ';
  $('connection').className='connection'+(active?' connected':'');
  $('reportWorkspace').hidden=!active;
  $('loginPanel').hidden=active;
  $('logout').hidden=!active;
}
function busy(value){
  state.busy=value;
  $('loginSubmit').disabled=value||!directAccess;
  $('loginSubmit').textContent=value&&!state.token?'กำลังตรวจสอบ…':'เข้าสู่ระบบ';
  $('password').disabled=value||!directAccess;
  $('filterFields').disabled=value||!state.token;
  $('refresh').disabled=value||!state.token;
  $('export').disabled=value||!state.data;
  $('logout').disabled=!state.token;
  renderPagers();
}
function emptyRows(id,colspan,text){const row=document.createElement('tr'),td=document.createElement('td');td.colSpan=colspan;td.className='empty-cell';td.textContent=text;row.append(td);$(id).replaceChildren(row);}
function clearData(){state.data=null;state.options=null;state.stationPage=1;for(const id of ['kpiCheckins','kpiPatrolled','kpiIdel','kpiRate','roundCount','logCount','earlyCheckins','onTimeCheckins','lateCheckins'])$(id).textContent='—';$('kpiDenominator').textContent='เทียบกับรอบที่ปิดผลทั้งหมด';$('timingNote').textContent='On Time = ก่อนหรือหลังเวลารอบไม่เกิน 15 นาที · Early / Late เป็นรายการที่บันทึกสำเร็จ ไม่ใช่ IDEL';$('scope').textContent='ยังไม่ได้โหลดข้อมูล';$('asOf').textContent='อ่านข้อมูลเมื่อเชื่อมต่อและเข้าสู่ระบบ';$('stationCount').textContent='— สถานี';$('stationFilter').replaceChildren(new Option('ทุกสถานีไฟฟ้า',''));emptyRows('stationRows',3,'เข้าสู่ระบบเพื่อดูสถานี');emptyRows('roundRows',5,'ยังไม่มีข้อมูลที่โหลด · กรุณาเข้าสู่ระบบ');emptyRows('logRows',7,'ยังไม่มีข้อมูลที่โหลด · กรุณาเข้าสู่ระบบ');$('dailyChart').replaceChildren();const el=document.createElement('div');el.className='empty-state';el.textContent='เข้าสู่ระบบเพื่อดูสถานะรอบตรวจ';$('dailyChart').append(el);clearGraphs();$('unitFilter').replaceChildren(new Option('ทุกหน่วยงาน',''));}
function lock(text=''){
  clearTimeout(expiryTimer);
  state.request++;
  state.token='';
  clearData();
  notice();
  $('password').value='';
  showError('loginError',text);
  $('accessStatus').textContent='';
  connection();
  busy(false);
}
async function rpc(method,args={}){
  if(!state.api)state.api=new DashboardApi();
  return state.api.call(method,{...args,adminSessionToken:state.token});
}
function filters(){const start=$('startDate').value,end=$('endDate').value;const days=(Date.parse(end)-Date.parse(start))/86400000+1;if(!start||!end||!Number.isFinite(days)||days<1||days>31)throw new Error('เลือกช่วงวันปฏิบัติงานตั้งแต่ 1 ถึง 31 วัน');return{startDate:start,endDate:end,unit:$('unitFilter').value,round:$('roundFilter').value,stationCode:$('stationFilter').value,roundPage:1,logPage:1};}
async function load(input,forceRefresh=false){if(state.busy)return;let f;try{f=input||filters();}catch(e){notice(e.message,true);return;}const request=++state.request;busy(true);notice('กำลังอ่านข้อมูลตามตัวกรอง…');try{const d=await rpc('getAdminDashboard',{...f,forceRefresh});if(request!==state.request)return;if(!d?.summary||!Array.isArray(d.daily)||!d.logs||!d.rounds)throw new Error('ข้อมูลจาก API ไม่ครบ กรุณาตรวจเวอร์ชัน API');state.data=d;state.stationPage=1;render();notice(d.monitoringEnabled===false?'ยังไม่ได้เปิดการตรวจ IDEL อัตโนมัติในระบบเดินตรวจ':'',d.monitoringEnabled===false);}catch(e){if(request!==state.request)return;if(/ADMIN_SESSION_REQUIRED|เฉพาะ Admin/.test(e.message)){lock(e.message.replace('ADMIN_SESSION_REQUIRED: ',''));}else notice(e.message+(state.data?' · ยังคงแสดงผลที่โหลดสำเร็จครั้งก่อน':''),true);}finally{if(request===state.request)busy(false);}}
function cell(row,value,cls=''){const td=document.createElement('td');td.textContent=value;td.className=cls;row.append(td);return td;}
function pill(text,cls=''){const el=document.createElement('span');el.className='pill '+cls;el.textContent=text;return el;}
function render(){const d=state.data,s=d.summary,f=d.filters;for(const key of ['earlyCheckins','onTimeCheckins','lateCheckins'])$(key).textContent=Number.isFinite(s[key])?n(s[key]):'—';$('timingNote').textContent='On Time = ก่อนหรือหลังเวลารอบไม่เกิน 15 นาที · Early / Late เป็นรายการที่บันทึกสำเร็จ ไม่ใช่ IDEL'+(s.unknownTimeCheckins?' · ไม่ทราบสถานะเวลา '+n(s.unknownTimeCheckins)+' รายการ':'');$('kpiCheckins').textContent=n(s.checkins);$('kpiPatrolled').textContent=n(s.patrolledRounds);$('kpiIdel').textContent=n(s.idelRounds);$('kpiRate').textContent=s.closedRounds?n(s.patrolledRounds/s.closedRounds*100)+'%':'—';$('kpiDenominator').textContent=s.closedRounds?'จาก '+n(s.closedRounds)+' รอบที่ปิดผลแล้ว':'ยังไม่มีรอบที่ปิดผล';$('roundCount').textContent=n(d.rounds.total);$('logCount').textContent=n(d.logs.total);const station=state.options.stations.find(x=>x.code===f.stationCode);$('scope').textContent=(station?station.name:n(s.stationCount)+' สถานี')+(f.unit?' · '+f.unit:'')+(f.round?' · รอบ '+f.round:'')+' · '+dateLabel(f.startDate)+(f.startDate!==f.endDate?' – '+dateLabel(f.endDate):'');$('asOf').textContent='ข้อมูล ณ '+dateTime(d.asOf);renderChart();renderStations();renderRecords();renderGraphs();}
function renderChart(){const d=state.data;$('dailyChart').replaceChildren();if(!d.summary.closedRounds){const el=document.createElement('div');el.className='empty-state';el.textContent='ไม่พบรอบที่ปิดผลแล้วในช่วงวันที่เลือก';$('dailyChart').append(el);return;}const max=Math.max(1,...d.daily.map(x=>x.patrolled+x.idel));for(const item of d.daily){const row=document.createElement('button');row.className='bar-row';row.setAttribute('aria-label',dateLabel(item.date)+' มีการตรวจ '+n(item.patrolled)+' รอบ IDEL '+n(item.idel)+' รอบ กดเพื่อดูวันนั้น');row.title=row.getAttribute('aria-label');const label=document.createElement('span');label.textContent=new Intl.DateTimeFormat('th-TH',{day:'numeric',month:'short',timeZone:'Asia/Bangkok'}).format(new Date(item.date+'T00:00:00+07:00'));const track=document.createElement('span');track.className='bar-track';for(const [key,cls] of [['patrolled',''],['idel','idel']]){const bar=document.createElement('span');bar.className='bar '+cls;bar.style.width=(item[key]/max*100)+'%';track.append(bar);}const values=document.createElement('span');values.className='bar-values';values.textContent=n(item.patrolled)+' / '+n(item.idel);row.append(label,track,values);row.onclick=()=>{if(state.busy)return;$('startDate').value=item.date;$('endDate').value=item.date;load();};$('dailyChart').append(row);}}
function renderStations(){const items=state.data.stations,pages=Math.max(1,Math.ceil(items.length/8));state.stationPage=Math.min(state.stationPage,pages);$('stationRows').replaceChildren();for(const s of items.slice((state.stationPage-1)*8,state.stationPage*8)){const row=document.createElement('tr'),td=cell(row,'');const button=document.createElement('button');button.className='station-button';button.textContent=s.name;button.onclick=()=>{if(state.busy)return;$('stationFilter').value=s.code;load();};const code=document.createElement('span');code.className='station-code';code.textContent=s.code;td.append(button,code);cell(row,n(s.patrolledRounds),'num');cell(row,n(s.idelRounds),'num');$('stationRows').append(row);}if(!items.length)emptyRows('stationRows',3,'ไม่พบสถานีตามตัวกรอง');$('stationCount').textContent=n(items.length)+' สถานี';renderPagers();}
function renderRecords(){const d=state.data;$('roundRows').replaceChildren();for(const r of d.rounds.items){const row=document.createElement('tr');cell(row,dateLabel(r.patrolDate));cell(row,dateTime(r.scheduledAt));cell(row,r.stationName);cell(row,'').append(pill(r.status==='IDEL'?'IDEL · ไม่มีการตรวจ':'มีการเดินตรวจ',r.status==='IDEL'?'idel':''));cell(row,n(r.checkinCount),'num');$('roundRows').append(row);}if(!d.rounds.items.length)emptyRows('roundRows',5,'ไม่พบผลปิดรอบตามตัวกรอง');$('logRows').replaceChildren();for(const r of d.logs.items){const row=document.createElement('tr');cell(row,dateTime(r.receivedAt));cell(row,r.stationName);cell(row,r.guardName);cell(row,r.checkpointId.replace(/^CP/,'จุดที่ '));cell(row,r.round+' น.');cell(row,'').append(pill(({'On Time':'On Time · ตรงเวลา',Early:'Early · ก่อนเวลา',Late:'Late · หลังเวลา'})[r.status]||r.status,r.status==='Late'?'late':r.status==='Early'?'early':''));cell(row,Number.isFinite(r.checkpointDistanceMeters)?r.checkpointDistanceMeters.toFixed(1):'—','num');$('logRows').append(row);}if(!d.logs.items.length)emptyRows('logRows',7,'ไม่พบรายการเช็กอินตามตัวกรอง');renderPagers();}
function renderPagers(){const d=state.data;const total=d?.stations.length||0,pages=Math.max(1,Math.ceil(total/8));$('stationPage').textContent=d?'หน้า '+state.stationPage+' / '+pages:'—';$('stationPrev').disabled=!d||state.busy||state.stationPage<=1;$('stationNext').disabled=!d||state.busy||state.stationPage>=pages;const records=d?.[state.tab==='round'?'rounds':'logs'];$('recordPage').textContent=records?n(records.total)+' รายการ · หน้า '+records.page+' / '+records.pages:'ครั้งละ 25 รายการ';$('recordPrev').disabled=!records||state.busy||records.page<=1;$('recordNext').disabled=!records||state.busy||records.page>=records.pages;}
function tab(name,focus=false){state.tab=name;for(const key of ['round','log']){$(key+'Panel').hidden=key!==name;$(key+'Tab').setAttribute('aria-selected',String(key===name));$(key+'Tab').tabIndex=key===name?0:-1;$(key+'Tab').className='tab'+(key===name?' active':'');}if(focus)$(name+'Tab').focus();renderPagers();}
for(const key of ['round','log']){$(key+'Tab').onclick=()=>tab(key);$(key+'Tab').onkeydown=e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();tab(e.key==='Home'?'round':e.key==='End'?'log':key==='round'?'log':'round',true);}};}
$('filterForm').onsubmit=e=>{e.preventDefault();load();};$('filterForm').onchange=()=>{if(state.data)notice('ตัวกรองเปลี่ยนแล้ว กด “แสดงข้อมูล” เพื่ออัปเดตผล');};$('refresh').onclick=()=>load(undefined,true);
$('stationPrev').onclick=()=>{state.stationPage--;renderStations();};$('stationNext').onclick=()=>{state.stationPage++;renderStations();};for(const [id,delta] of [['recordPrev',-1],['recordNext',1]])$(id).onclick=()=>{const key=state.tab==='round'?'round':'log',data=state.data[key==='round'?'rounds':'logs'];load({...state.data.filters,[key+'Page']:data.page+delta});};
$('loginForm').onsubmit=async event=>{
  event.preventDefault();
  if(!directAccess||state.busy)return;
  const password=$('password').value;
  $('password').value='';
  busy(true);
  showError('loginError','');
  $('accessStatus').textContent='กำลังตรวจสอบสิทธิ์ผู้ดูแล';
  try{
    const result=await rpc('loginAdmin',{password});
    state.token=result.adminSessionToken;
    state.options=await rpc('getAdminOptions');
    initializeFilters();
    $('startDate').value=state.options.today;
    $('endDate').value=state.options.today;
    expiryTimer=setTimeout(()=>lock('หมดเวลาเข้าใช้งาน กรุณาเข้าสู่ระบบอีกครั้ง'),Math.max(0,result.expiresAt-Date.now()));
    $('accessStatus').textContent='';
    connection();
    busy(false);
    await load();
  }catch(error){
    lock(error.message.replace(/^ADMIN_SESSION_REQUIRED: /,''));
    $('password').focus();
  }
};
$('logout').onclick=async()=>{
  const token=state.token;
  if(!token)return;
  lock();
  $('accessStatus').textContent='ออกจากระบบแล้ว';
  try{await state.api.call('logoutAdmin',{adminSessionToken:token});}
  catch{if(!state.token&&!state.busy)$('accessStatus').textContent='ปิดข้อมูลบนหน้านี้แล้ว เซสชันบนเซิร์ฟเวอร์จะหมดอายุตามเวลา';}
};



function csvCell(value){const text=String(value??'');return '"'+(/^[=+@\-\t\r]/.test(text)?"'"+text:text).replaceAll('"','""')+'"';}
$('export').onclick=()=>{if(!state.data)return;const rounds=state.tab==='round',items=state.data[rounds?'rounds':'logs'].items;const headers=rounds?['วันปฏิบัติงาน','รอบตรวจ','สถานี','สถานะ','เช็กอิน']:['เวลาบันทึก','สถานี','รปภ.','จุดตรวจ','รอบ','เวลา','ระยะห่างเมตร'];const rows=items.map(r=>rounds?[r.patrolDate,dateTime(r.scheduledAt),r.stationName,r.status,r.checkinCount]:[r.receivedAt,r.stationName,r.guardName,r.checkpointId,r.round,r.status,r.checkpointDistanceMeters]);const blob=new Blob(['\uFEFF'+[headers,...rows].map(r=>r.map(csvCell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='guard-tour-'+(rounds?'rounds':'checkins')+'-page-'+state.data[rounds?'rounds':'logs'].page+'.csv';a.click();URL.revokeObjectURL(url);};
const graphIds=['trendGraph','timingGraph','roundGraph','stationGraph'];
function clearGraphs(){for(const id of graphIds){const p=document.createElement('p');p.className='graph-empty';p.textContent='เข้าสู่ระบบเพื่อดูกราฟจากข้อมูลจริง';$(id).replaceChildren(p);}}
function initializeFilters(){
  const units=[...new Set(state.options.stations.map(s=>s.unit).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'th'));
  $('unitFilter').replaceChildren(new Option('ทุกหน่วยงาน',''),...units.map(x=>new Option(x,x)));
  const hours=[7,10,14,17,19,21,23,1,2,3,4,5];
  $('roundFilter').replaceChildren(new Option('ทุกรอบเวลา',''),...Array.from({length:24},(_,i)=>(i+6)%24).map(h=>{const value=String(h).padStart(2,'0')+':00';return new Option(value+(hours.includes(h)?'':' (ตารางเดิม)'),value);}));
  $('roundFilter').value='';updateStations();
}
function updateStations(){const previous=$('stationFilter').value;const list=(state.options?.stations||[]).filter(s=>!$('unitFilter').value||s.unit===$('unitFilter').value).sort((a,b)=>a.name.localeCompare(b.name,'th'));$('stationFilter').replaceChildren(new Option('ทุกสถานีไฟฟ้า',''),...list.map(s=>new Option(s.name+' ('+s.code+')',s.code)));$('stationFilter').value=list.some(s=>s.code===previous)?previous:'';}
$('unitFilter').onchange=updateStations;
function setPreset(days){if(state.busy||!state.options)return;const today=state.options.today;const offset=days==='yesterday'?1:0;const end=new Date(today+'T12:00:00+07:00');end.setUTCDate(end.getUTCDate()-offset);const start=new Date(end);start.setUTCDate(start.getUTCDate()-(offset?0:Number(days)-1));$('startDate').value=start.toISOString().slice(0,10);$('endDate').value=end.toISOString().slice(0,10);load();}
document.querySelectorAll('[data-days]').forEach(el=>el.onclick=()=>setPreset(el.dataset.days));
$('resetFilters').onclick=()=>{if(state.busy||!state.options)return;$('unitFilter').value='';updateStations();$('stationFilter').value='';$('roundFilter').value='';setPreset('1');};
function changeScope(values){if(state.busy)return;for(const [id,value] of Object.entries(values))$(id).value=value;load();}
function graphBars(id,items,series,onPick,emptyText='ไม่พบข้อมูลตามตัวกรองที่เลือก'){
  const root=$(id);root.replaceChildren();
  if(!items.length||!items.some(x=>series.some(s=>Number(x[s.key])>0))){const p=document.createElement('p');p.className='graph-empty';p.textContent=emptyText;root.append(p);return;}
  const max=Math.max(1,...items.map(x=>series.reduce((sum,s)=>sum+(Number(x[s.key])||0),0)));
  for(const item of items){const row=document.createElement(onPick?'button':'div');if(onPick){row.type='button';row.onclick=()=>onPick(item);}row.className='graph-row';
    const label=document.createElement('span');label.className='graph-label';label.textContent=item.label;
    const track=document.createElement('span');track.className='graph-track';
    for(const s of series){const bar=document.createElement('span');bar.className='graph-segment '+s.cls;bar.style.width=((Number(item[s.key])||0)/max*100)+'%';track.append(bar);}
    const value=document.createElement('span');value.className='graph-value';value.textContent=series.map(s=>n(Number(item[s.key])||0)).join(' / ')+(item.suffix||'');
    const description=item.label+' · '+series.map(s=>s.label+' '+n(Number(item[s.key])||0)).join(' · ')+(item.suffix||'');row.title=description;row.setAttribute('aria-label',description);row.append(label,track,value);root.append(row);
  }
}
function renderGraphs(){
  if(!state.data){clearGraphs();return;}
  const d=state.data,series=[{key:'patrolled',label:'มีการตรวจ',cls:'patrolled'},{key:'idel',label:'IDEL',cls:'idel'}];
  graphBars('trendGraph',d.daily.map(x=>({...x,label:dateLabel(x.date)})),series,x=>changeScope({startDate:x.date,endDate:x.date}));
  const timing=[['earlyCheckins','Early · ก่อนเวลา','early'],['onTimeCheckins','On Time · ตรงเวลา','patrolled'],['lateCheckins','Late · หลังเวลา','idel'],['unknownTimeCheckins','ไม่ทราบสถานะ','unknown']].filter(([key])=>key!=='unknownTimeCheckins'||d.summary[key]>0);
  graphBars('timingGraph',timing.map(([key,label,cls])=>({label,value:d.summary[key]||0,suffix:' · '+(d.summary.checkins?((d.summary[key]||0)/d.summary.checkins*100).toFixed(1):'0')+'%',cls})),[{key:'value',label:'รายการ',cls:'timing'}]);
  for(let i=0;i<$('timingGraph').children.length;i++){const segment=$('timingGraph').children[i].querySelector?.('.graph-segment');if(segment)segment.className='graph-segment '+timing[i][2];}
  if(Array.isArray(d.roundsByHour))graphBars('roundGraph',d.roundsByHour.filter(x=>x.patrolled+x.idel>0).map(x=>({...x,label:x.round+' น.'})),series,x=>changeScope({roundFilter:x.round}),'ยังไม่มีผลรอบที่ปิดแล้วตามตัวกรองนี้');
  else{const p=document.createElement('p');p.className='graph-empty';p.textContent='กราฟรอบเวลาต้องใช้ Admin API รุ่นกราฟ (อัปเดต Code.gs และ deployment)';$('roundGraph').replaceChildren(p);}
  const metric=$('stationMetric').value||'idelRounds',limit=Number($('stationLimit').value)||10;
  const label={idelRounds:'IDEL',patrolledRounds:'มีการตรวจ',checkins:'เช็กอิน'}[metric];
  const items=[...d.stations].sort((a,b)=>(b[metric]||0)-(a[metric]||0)||a.name.localeCompare(b.name,'th')).slice(0,limit).map(x=>({...x,label:x.name,value:x[metric]||0}));
  graphBars('stationGraph',items,[{key:'value',label,cls:metric==='idelRounds'?'idel':metric==='checkins'?'purple-bar':'patrolled'}],x=>changeScope({stationFilter:x.code}));
}
$('stationMetric').onchange=renderGraphs;$('stationLimit').onchange=renderGraphs;
function showPage(name='overview'){const titles={overview:'ภาพรวมการเดินตรวจ',charts:'กราฟการเดินตรวจ',details:'ประวัติและรอบตรวจ'};$('pageTitle').textContent=titles[name];$('breadcrumbPage').textContent=titles[name];$('overviewPanels').hidden=name!=='overview';$('chartsPage').hidden=name!=='charts';$('details').hidden=name!=='details';$('timingSection').hidden=name==='charts';document.querySelectorAll('.nav-link,.page-nav a').forEach(a=>{const active=a.getAttribute('href')==='#'+name;a.classList.toggle('active',active);if(active)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});}
document.querySelectorAll('.nav-link,.page-nav a,.brand').forEach(link=>{
  link.addEventListener('click',event=>{
    event.preventDefault();
    showPage(link.getAttribute('href').slice(1));
  });
});
clearGraphs();showPage();connection();busy(false);

if(!directAccess)showError('loginError','กรุณาเปิด Dashboard ผ่าน Google Apps Script');
