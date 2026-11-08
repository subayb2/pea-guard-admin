/** Standalone Admin API — no patrol writes or triggers. */
const CONFIG = Object.freeze({
  SOURCE_ID: '1ANodghoPjOoyYHMe0d7M6DVNyBpvkQUie2kkHSwDfi8',
  SOURCE_TAB: 'Data',
  LOG_SPREADSHEET_ID: '1JRAQ9WhZ1Ew5ibAnX5NsRVURPHA1HFSYQ7bfGIeDYOQ',
  STATION_RADIUS_KM: 5,
  CHECKPOINT_RADIUS_METERS: 200,
  MAX_ACCURACY_METERS: 100,
  MAX_GPS_AGE_MS: 120000,
  TIMEZONE: 'Asia/Bangkok',
  GRACE_MINUTES: 15,
  ROUND_HOURS: [1,2,3,4,5,7,10,14,17,19,21,23],
  ROUND_WINDOW_MINUTES: 30,
  REQUIRE_VERIFIED_EMAIL: false,
});
const LOG_HEADERS = ['LogID','RequestID','ReceivedAt','PatrolDate','ScheduledDateTime','Round','TimeStatus','StationCode','StationName','GuardID','GuardName','CheckpointID','Latitude','Longitude','AccuracyMeters','GPSTimestamp','StationDistanceKm','CheckpointDistanceMeters','ReportedGoogleEmail','IdentityMethod'];
const ROUND_HEADERS=['RoundKey','ScheduledDateTime','PatrolDate','StationCode','StationName','Status','CheckinCount','CheckedAt','WindowStart','WindowEnd'];


function isAdmin_(){
  const email=String(Session.getActiveUser().getEmail()||'').toLowerCase();if(!email)return false;
  const owner=String(Session.getEffectiveUser().getEmail()||'').toLowerCase();
  const allowed=String(PropertiesService.getScriptProperties().getProperty('ADMIN_EMAILS')||'').split(/[;,\s]+/).map(s=>s.trim().toLowerCase()).filter(Boolean);
  return email===owner||allowed.includes(email);
}

function assertAdmin_(){if(!isAdmin_())throw new Error('เฉพาะ Admin ที่ลงชื่อด้วยบัญชี Google ที่ได้รับอนุญาตเท่านั้น');}

function adminNow_(){return Date.now();}

function adminCredential_(){
  const props=PropertiesService.getScriptProperties();
  const salt=props.getProperty('ADMIN_PASSWORD_SALT'),hash=props.getProperty('ADMIN_PASSWORD_HASH');
  if(salt&&hash)return {salt:salt,hash:hash};
  throw new Error('ให้ผู้ดูแลกำหนด ADMIN_PASSWORD_SALT และ ADMIN_PASSWORD_HASH ใน Script Properties');
}

function adminPasswordHash_(password,salt){return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,salt+'\u0000'+password,Utilities.Charset.UTF_8).map(b=>('0'+(b&255).toString(16)).slice(-2)).join('');}

function constantEqual_(a,b){let diff=a.length^b.length;for(let i=0;i<Math.max(a.length,b.length);i++)diff|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return diff===0;}

function loginAdmin(input){
  assertAdmin_();const password=input&&input.password;
  if(typeof password!=='string'||!password||password.length>256)throw new Error('กรุณากรอกรหัสผ่าน Dashboard');
  const lock=LockService.getScriptLock();lock.waitLock(30000);
  try{
    const cache=CacheService.getScriptCache(),email=Session.getActiveUser().getEmail().toLowerCase(),key='admin_fail_'+email;
    const attempts=JSON.parse(cache.get(key)||'{"count":0,"until":0}'),now=adminNow_();
    if(attempts.count>=5&&attempts.until>now)throw new Error('กรอกรหัสผิดหลายครั้ง กรุณารอ 15 นาทีแล้วลองใหม่');
    const credential=adminCredential_(),hash=adminPasswordHash_(password,credential.salt);
    if(!constantEqual_(hash,credential.hash)){
      cache.put(key,JSON.stringify({count:(attempts.until>now?attempts.count:0)+1,until:now+900000}),900);
      throw new Error('รหัสผ่านไม่ถูกต้อง');
    }
    cache.remove(key);const token=(Utilities.getUuid()+Utilities.getUuid()).replace(/-/g,''),expiresAt=now+1800000;
    cache.put('admin_session_'+token,JSON.stringify({email:email,expiresAt:expiresAt,fingerprint:credential.hash}),1800);
    return {adminSessionToken:token,expiresAt:expiresAt};
  }finally{lock.releaseLock();}
}

function assertAdminSession_(input){
  assertAdmin_();const token=input&&input.adminSessionToken;
  if(typeof token!=='string'||!/^[a-f0-9]{64}$/i.test(token))throw new Error('ADMIN_SESSION_REQUIRED: กรุณากรอกรหัสผ่าน Dashboard');
  const raw=CacheService.getScriptCache().get('admin_session_'+token),session=raw?JSON.parse(raw):null;
  if(!session||session.expiresAt<=adminNow_()||session.email!==Session.getActiveUser().getEmail().toLowerCase()||session.fingerprint!==adminCredential_().hash)
    throw new Error('ADMIN_SESSION_REQUIRED: หมดเวลาเข้าใช้งาน กรุณากรอกรหัสผ่านอีกครั้ง');
}

function logoutAdmin(input){assertAdmin_();const token=input&&input.adminSessionToken;if(typeof token==='string'&&/^[a-f0-9]{64}$/i.test(token))CacheService.getScriptCache().remove('admin_session_'+token);return {loggedOut:true};}

function getAdminOptions(input){
  assertAdminSession_(input);assertReady_();const props=PropertiesService.getScriptProperties();
  const book=readBook_((props.getProperty('LOG_SPREADSHEET_ID')||CONFIG.LOG_SPREADSHEET_ID));
  return {stations:readStations_().map(s=>({code:s.code,name:s.name,unit:s.unit})),today:Utilities.formatDate(new Date(Date.now()-6*3600000),CONFIG.TIMEZONE,'yyyy-MM-dd'),
    patrolUrl:webAppUrl_(''),monitoringEnabled:null};
}

function adminFilters_(input){
  if(!input||typeof input!=='object')throw new Error('ตัวกรองไม่ถูกต้อง');
  const date=s=>{
    if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s))throw new Error('กรุณาระบุวันเริ่มต้นและสิ้นสุด');
    const d=new Date(s+'T00:00:00+07:00');
    if(!Number.isFinite(d.getTime())||Utilities.formatDate(d,CONFIG.TIMEZONE,'yyyy-MM-dd')!==s)throw new Error('วันที่ไม่ถูกต้อง');
    return d;
  };
  const from=date(input.startDate),to=date(input.endDate),days=(to.getTime()-from.getTime())/86400000+1;
  if(days<1||days>31)throw new Error('เลือกช่วงวันที่ตั้งแต่ 1 ถึง 31 วัน');
  if(input.round&&!/^(?:[01]\d|2[0-3]):00$/.test(String(input.round)))throw new Error('รอบเวลาไม่ถูกต้อง');
  const page=v=>{const n=v===undefined?1:Number(v);if(!Number.isInteger(n)||n<1||n>1000000)throw new Error('หมายเลขหน้าไม่ถูกต้อง');return n;};
  return {startDate:input.startDate,endDate:input.endDate,unit:String(input.unit||''),round:String(input.round||''),stationCode:String(input.stationCode||''),logPage:page(input.logPage),roundPage:page(input.roundPage),pageSize:25};
}

function readAdminDashboard_(input){
  assertAdminSession_(input);assertReady_();const filters=adminFilters_(input),stations=readStations_();
  if(filters.stationCode&&!stations.some(s=>s.code===filters.stationCode))throw new Error('ไม่พบสถานีที่เลือก');
  const props=PropertiesService.getScriptProperties(),book=readBook_((props.getProperty('LOG_SPREADSHEET_ID')||CONFIG.LOG_SPREADSHEET_ID));
  const logs=logSheet_(),rounds=book.getSheetByName('StationRounds');
  // Thin indexes support all-scope totals. Full GPS-bearing records are read only for the current page.
  const logIndex=logs.getLastRow()>1?logs.getRange(2,3,logs.getLastRow()-1,10).getValues().map((r,i)=>({row:i+2,receivedAt:r[0],patrolDate:sheetDate_(r[1]),scheduledAt:r[2],round:r[3],status:r[4],stationCode:String(r[5]),stationName:r[6],guardId:r[7],guardName:r[8],checkpointId:r[9]})):[];
  const roundIndex=rounds&&rounds.getLastRow()>1?rounds.getRange(2,1,rounds.getLastRow()-1,8).getValues().map(r=>({key:String(r[0]),scheduledAt:r[1],patrolDate:sheetDate_(r[2]),stationCode:String(r[3]),stationName:r[4],status:r[5],checkinCount:Number(r[6]),checkedAt:r[7]})):[];
  const result=buildAdminDashboard_(stations,logIndex,roundIndex,filters,new Date());
  result.logs.items=result.logs.items.map(item=>{
    const row=logs.getRange(item.row,1,1,LOG_HEADERS.length).getValues()[0];
    return {logId:row[0],receivedAt:row[2] instanceof Date?row[2].toISOString():null,patrolDate:sheetDate_(row[3]),round:sheetRound_(row[5],row[4]),status:String(row[6]),stationCode:String(row[7]),stationName:String(row[8]),guardName:String(row[10]),checkpointId:String(row[11]),accuracyMeters:Number(row[14]),checkpointDistanceMeters:Number(row[17])};
  });
  result.monitoringEnabled=null;
  return result;
}

function buildAdminDashboard_(stations,logs,rounds,f,now){
  const selected=stations.filter(s=>(!f.unit||s.unit===f.unit)&&(!f.stationCode||s.code===f.stationCode)),codes=new Set(selected.map(s=>s.code));
  const matches=r=>codes.has(r.stationCode)&&r.patrolDate>=f.startDate&&r.patrolDate<=f.endDate&&(!f.round||chartRound_(r)===f.round);
  const filteredLogs=logs.filter(matches).sort((a,b)=>(b.receivedAt instanceof Date?b.receivedAt.getTime():0)-(a.receivedAt instanceof Date?a.receivedAt.getTime():0));
  const filteredRounds=rounds.filter(r=>matches(r)&&['IDEL','PATROLLED'].includes(r.status)).sort((a,b)=>(b.scheduledAt instanceof Date?b.scheduledAt.getTime():0)-(a.scheduledAt instanceof Date?a.scheduledAt.getTime():0));
  const summary={stationCount:selected.length,checkins:filteredLogs.length,closedRounds:filteredRounds.length,patrolledRounds:0,idelRounds:0,earlyCheckins:0,onTimeCheckins:0,lateCheckins:0,unknownTimeCheckins:0};
  const groups=new Map(selected.map(s=>[s.code,{code:s.code,name:s.name,unit:s.unit,checkins:0,earlyCheckins:0,onTimeCheckins:0,lateCheckins:0,unknownTimeCheckins:0,closedRounds:0,patrolledRounds:0,idelRounds:0,lastCheckin:null}]));
  const daily=new Map();
  for(let d=new Date(f.startDate+'T00:00:00+07:00');Utilities.formatDate(d,CONFIG.TIMEZONE,'yyyy-MM-dd')<=f.endDate;d=new Date(d.getTime()+86400000)){
    const day=Utilities.formatDate(d,CONFIG.TIMEZONE,'yyyy-MM-dd');daily.set(day,{date:day,patrolled:0,idel:0});
  }
  for(const row of filteredLogs){const g=groups.get(row.stationCode);g.checkins++;const timing=({'Early':'earlyCheckins','On Time':'onTimeCheckins','Late':'lateCheckins'})[row.status]||'unknownTimeCheckins';summary[timing]++;g[timing]++;if(!g.lastCheckin&&row.receivedAt instanceof Date)g.lastCheckin=row.receivedAt.toISOString();}
  for(const row of filteredRounds){const g=groups.get(row.stationCode),d=daily.get(row.patrolDate);g.closedRounds++;
    if(row.status==='IDEL'){summary.idelRounds++;g.idelRounds++;d.idel++;}else{summary.patrolledRounds++;g.patrolledRounds++;d.patrolled++;}}
  const paginate=(rows,page)=>{const pages=Math.max(1,Math.ceil(rows.length/f.pageSize)),p=Math.min(page,pages);return {total:rows.length,page:p,pages:pages,pageSize:f.pageSize,items:rows.slice((p-1)*f.pageSize,p*f.pageSize)};};
  const result={filters:f,asOf:now.toISOString(),summary:summary,daily:Array.from(daily.values()),stations:Array.from(groups.values()).sort((a,b)=>b.idelRounds-a.idelRounds||a.name.localeCompare(b.name,'th')),
    logs:paginate(filteredLogs,f.logPage),rounds:paginate(filteredRounds.map(r=>({...r,scheduledAt:r.scheduledAt instanceof Date?r.scheduledAt.toISOString():null,checkedAt:r.checkedAt instanceof Date?r.checkedAt.toISOString():null})),f.roundPage)};
  return chartAggregates_(result,filteredLogs,filteredRounds);
}

function readStations_() {
  const tab=readBook_(CONFIG.SOURCE_ID).getSheetByName(CONFIG.SOURCE_TAB);
  if(!tab) throw new Error('ไม่พบแท็บ Data ในชีตข้อมูลสถานี');
  const last=tab.getLastRow(); if(last<2) throw new Error('ยังไม่มีข้อมูลสถานี');
  const rows=tab.getRange(1,1,last,20).getDisplayValues();
  const clean=v=>String(v||'').replace(/\s+/g,' ').trim();
  const headers=rows[0].map(clean);
  const col=label=>{const i=headers.indexOf(label);if(i<0) throw new Error('ชีตขาดคอลัมน์ '+label);return i;};
  const idx={name:col('สถานีไฟฟ้า'),code:col('รหัส'),unit:col('หน่วย Unmanned'),lat:col('Lat'),lng:col('Long'),
    id1:col('รหัสประจำตัว คนที่1'),name1:col('ชื่อ - สกุล คนที่ 1'),id2:col('รหัสประจำตัว คนที่ 2'),name2:col('ชื่อ - สกุล คนที่ 2')};
  const pcols=[1,2,3,4,5].map(n=>col('จุดตรวจ ที่ '+n));
  const seen=new Set(), stations=[];
  rows.slice(1).forEach((row,i)=>{
    if(!clean(row[idx.name])) return;
    const roster=[[idx.id1,idx.name1],[idx.id2,idx.name2]];
    // Blank/"ไม่มี" roster entries do not make a station staffed.
    if(!roster.some(pair=>hasRosterValue_(row[pair[1]])))return;
    const code=clean(row[idx.code]); if(!code) throw new Error('สถานีแถว '+(i+2)+' ไม่มีรหัส');
    if(seen.has(code)) throw new Error('รหัสสถานีซ้ำ '+code+' กรุณาให้ผู้ดูแลแก้ไข');
    seen.add(code);
    const lat=coordinate_(row[idx.lat],90),lng=coordinate_(row[idx.lng],180);
    if(lat===null||lng===null) return; // invalid coordinates must never make a selectable station
    const guards=[];
    roster.forEach((pair,slot)=>{
      const id=clean(row[pair[0]]),name=clean(row[pair[1]]);
      if(!hasRosterValue_(name))return;
      const key=hasRosterValue_(id)&&!guards.some(g=>g.id===id)?id:'ROSTER:'+code+':'+(slot+1);
      guards.push({id:key,name:name,employeeId:hasRosterValue_(id)?id:null});
    });
    // A station-scoped relief entry is available alongside its regular roster.
    guards.push({id:'RELIEF:'+code,name:'แทนเวร',isRelief:true});
    const checkpoints=[];
    pcols.forEach((c,n)=>{
      const parts=clean(row[c]).replace(/^\(\s*/,'').replace(/\s*\)$/,'').split(',');
      if(parts.length!==2) return;
      const plat=coordinate_(parts[0],90),plng=coordinate_(parts[1],180);
      if(plat!==null&&plng!==null) checkpoints.push({id:'CP'+(n+1),name:'จุดตรวจที่ '+(n+1),lat:plat,lng:plng});
    });
    stations.push({code:code,name:clean(row[idx.name]),unit:clean(row[idx.unit]),lat:lat,lng:lng,guards:guards,checkpoints:checkpoints});
  });
  return stations;
}

function hasRosterValue_(value){
  const text=String(value===null||value===undefined?'':value).replace(/\s+/g,' ').trim();
  return !!text&&!/^(?:ไม่มี(?:\s*รปภ\.?)?|-|–|—|n\/?a|null|none)$/i.test(text);
}

function coordinate_(v,limit){
  if(v===null||v===undefined||String(v).trim()==='') return null;
  const n=Number(String(v).trim()); return Number.isFinite(n)&&Math.abs(n)<=limit?n:null;
}

function assertReady_(){if(!CONFIG.LOG_SPREADSHEET_ID)throw new Error('ยังไม่ได้ตั้งค่าชีตประวัติ');}

function logSheet_(){
  const id=PropertiesService.getScriptProperties().getProperty('LOG_SPREADSHEET_ID')||CONFIG.LOG_SPREADSHEET_ID;
  if(!id) throw new Error('ผู้ดูแลยังไม่ได้ติดตั้งระบบ');
  const s=readBook_(id).getSheetByName('PatrolLogs');
  if(!s||s.getRange(1,1,1,LOG_HEADERS.length).getDisplayValues()[0].join('|')!==LOG_HEADERS.join('|')) throw new Error('โครงสร้างไฟล์ประวัติไม่ตรง กรุณาแจ้งผู้ดูแล');
  return s;
}

function sheetDate_(value){return value instanceof Date?Utilities.formatDate(value,CONFIG.TIMEZONE,'yyyy-MM-dd'):String(value||'');}

function sheetRound_(value,scheduled){return value instanceof Date?Utilities.formatDate(scheduled instanceof Date?scheduled:value,CONFIG.TIMEZONE,'HH:mm'):String(value||'');}

// This source is appended to Code.gs by build-backend.mjs. Upload Code.gs and Bridge.html only.
function webAppUrl_(){return 'https://script.google.com/macros/s/AKfycbypqL6MePFB--u1dKG5AJaNeG_00I35KZ2t5QxJExhx16ccZCsFuE9tW115hX5rb6-W/exec';}
function doGet(e){
  const params=e&&e.parameter||{};
  if(!params.origin)return HtmlService.createHtmlOutput('<h1>Guard Tour Admin API</h1><p>เปิด Dashboard จากเว็บไซต์ที่ตั้งค่าไว้ และลงชื่อ Google ด้วยบัญชี Admin</p>');
  const allowed=String(PropertiesService.getScriptProperties().getProperty('DASHBOARD_ORIGINS')||'').split(/[\s,;]+/).filter(Boolean);
  if(!allowed.includes(params.origin)||!/^https?:\/\/[a-zA-Z0-9.\-]+(?::\d+)?$/.test(params.origin)||!/^[a-f0-9]{32}$/.test(params.channel||''))throw new Error('ไม่ได้อนุญาตเว็บไซต์ Dashboard นี้');
  const template=HtmlService.createTemplateFromFile('Bridge');
  template.originJson=JSON.stringify(params.origin);template.channelJson=JSON.stringify(params.channel);
  return template.evaluate().setTitle('Guard Tour Admin API').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
function dashboardCall(input){
  if(!input||typeof input!=='object')throw new Error('คำขอไม่ถูกต้อง');
  const methods={loginAdmin:loginAdmin,getAdminOptions:getAdminOptions,getAdminDashboard:getAdminDashboard,logoutAdmin:logoutAdmin};
  if(!Object.prototype.hasOwnProperty.call(methods,input.method))throw new Error('ไม่อนุญาตคำสั่งนี้');
  return methods[input.method](input.args||{});
}
function getAdminDashboard(input){
  assertAdminSession_(input);assertReady_();const filters=adminFilters_(input);
  const key='report-v3-'+adminPasswordHash_(JSON.stringify(filters),'filter');const cache=CacheService.getScriptCache();
  if(input.forceRefresh!==true){const saved=cache.get(key);if(saved)return JSON.parse(saved);}
  const result=readAdminDashboard_(input),json=JSON.stringify(result);
  // Cache data only after authorization; responses retain their actual asOf time.
  if(json.length<30000)cache.put(key,json,30);
  return result;
}


// Read-only adapter. SpreadsheetApp.openById requires a write scope; Sheets API does not.
const readBooks_={};
function readBook_(id){
  if(readBooks_[id])return readBooks_[id];const tabs={};
  return readBooks_[id]={getSheetByName:function(name){
    if(Object.prototype.hasOwnProperty.call(tabs,name))return tabs[name];
    const columns={Data:'T',PatrolLogs:'T',StationRounds:'J'};
    if(!columns[name])return null;
    const range="'"+name+"'!A:"+columns[name];
    const display=Sheets.Spreadsheets.Values.get(id,range,{valueRenderOption:'FORMATTED_VALUE'}).values||[];
    const raw=name==='Data'?display:(Sheets.Spreadsheets.Values.get(id,range,{valueRenderOption:'UNFORMATTED_VALUE',dateTimeRenderOption:'SERIAL_NUMBER'}).values||[]);
    const dateColumns=name==='PatrolLogs'?[2,3,4,5]:name==='StationRounds'?[1,2,7,8,9]:[];
    const values=raw.map((row,i)=>row.map((v,j)=>{
      if(i===0)return v;
      if(dateColumns.includes(j)&&typeof v==='number'&&Number.isFinite(v))return new Date(Math.round((v-25569)*86400000)-7*3600000);
      // Preserve displayed IDs, names, labels, and operational-day strings.
      return display[i]&&display[i][j]!==undefined?display[i][j]:v;
    }));
    return tabs[name]={getLastRow:function(){return values.length;},getRange:function(r,c,n,m){
      n=n||1;m=m||1;
      const slice=matrix=>Array.from({length:n},(_,i)=>Array.from({length:m},(_,j)=>matrix[r+i-1]&&matrix[r+i-1][c+j-1]!==undefined?matrix[r+i-1][c+j-1]:''));
      return {getValues:function(){return slice(values);},getDisplayValues:function(){return slice(display).map(row=>row.map(String));}};
    }};
  }};
}


// Aggregates are computed before pagination, using the same scope as the report.
function chartRound_(row){
  return row.scheduledAt instanceof Date&&Number.isFinite(row.scheduledAt.getTime())
    ?Utilities.formatDate(row.scheduledAt,CONFIG.TIMEZONE,'HH:mm'):sheetRound_(row.round,row.scheduledAt);
}
function chartAggregates_(result,logs,rounds){
  const hours=new Map(),daily=new Map(result.daily.map(d=>[d.date,d]));
  const getHour=value=>{if(!hours.has(value))hours.set(value,{round:value,patrolled:0,idel:0,checkins:0});return hours.get(value);};
  for(const d of result.daily){d.checkins=0;d.early=0;d.onTime=0;d.late=0;d.unknown=0;}
  for(const row of logs){
    const d=daily.get(row.patrolDate);d.checkins++;
    d[({'Early':'early','On Time':'onTime','Late':'late'})[row.status]||'unknown']++;
    getHour(chartRound_(row)).checkins++;
  }
  for(const row of rounds)getHour(chartRound_(row))[row.status==='IDEL'?'idel':'patrolled']++;
  result.roundsByHour=Array.from(hours.values()).sort((a,b)=>((parseInt(a.round)+18)%24)-((parseInt(b.round)+18)%24));
  result.chartSchema=1;
  return result;
}
