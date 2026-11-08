import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const TEST_PASSWORD='Unit-test-password!42';
const source=fs.readFileSync(new URL('../backend/Code.gs',import.meta.url),'utf8');
export const password=TEST_PASSWORD;
export default function harness(){
  let clock=Date.parse('2026-11-05T23:00:00+07:00');
  class ClockDate extends Date{constructor(...args){super(...(args.length?args:[clock]));}static now(){return clock;}}
  const props={LOG_SPREADSHEET_ID:'logs',ADMIN_PASSWORD_SALT:'unit-test-salt',ADMIN_PASSWORD_HASH:crypto.createHash('sha256').update('unit-test-salt\u0000'+TEST_PASSWORD).digest('hex')},stats={sourceWrites:0,locks:0};
  class Sheet{
    constructor(rows,isSource=false){this.rows=rows;this.isSource=isSource;this.capacity=1000;}
    getLastRow(){return this.rows.length;}
    getMaxRows(){return this.capacity;}
    insertRowsAfter(index,count){assert.equal(index,this.capacity);this.capacity+=count;}
    getRange(r,c,n=1,m=1){const self=this;return {
      getValues(){return Array.from({length:n},(_,i)=>Array.from({length:m},(_,j)=>self.rows[r+i-1]?.[c+j-1]??''));},
      getDisplayValues(){return this.getValues().map(row=>row.map(String));},
      setValues(values){if(self.isSource)stats.sourceWrites++;values.forEach((row,i)=>{self.rows[r+i-1]??=[];row.forEach((v,j)=>self.rows[r+i-1][c+j-1]=v);});return this;},
      createTextFinder(text){const matches=[];for(let i=0;i<n;i++)if(String(self.rows[r+i-1]?.[c-1]??'')===text)matches.push({getRow:()=>r+i});return {matchEntireCell(){return this;},findNext(){return matches[0]??null;},findAll(){return matches;}};},
    };}
  }
  const headers=['แผนก','Cluster','หน่วย Unmanned','สถานีไฟฟ้า','รหัส','รูปแบบ','ประเภท','Lat','Long','พิกัด','วันจ่ายไฟ','รหัสประจำตัว คนที่1','ชื่อ - สกุล คนที่ 1','รหัสประจำตัว คนที่ 2','ชื่อ - สกุล คนที่ 2 ','จุดตรวจ ที่ 1','จุดตรวจ ที่ 2','จุดตรวจ ที่ 3','จุดตรวจ ที่ 4','จุดตรวจ ที่ 5'];
  const sourceSheet=new Sheet([headers,['A','1','หน่วยทดสอบ','สถานีตัวอย่าง A','AAA','','','14','100','','','001','เจ้าหน้าที่ตัวอย่าง 1','002','เจ้าหน้าที่ตัวอย่าง 2','14.0001, 100.0001','','','',''],['A','1','หน่วยทดสอบ','สถานีตัวอย่าง B','BBB','','','15','100','','','003','เจ้าหน้าที่ตัวอย่าง 3','','','15,100','','','','']],true);
  const logSheet=new Sheet([]),testSheet=new Sheet([]),roundSheet=new Sheet([]),testRounds=new Sheet([]);
  const cacheItems=new Map();
  const context=vm.createContext({Date:ClockDate,console,Set,Math,Number,String,Object,Error,
    Session:{getActiveUser:()=>({getEmail:()=>''}),getEffectiveUser:()=>({getEmail:()=>'owner@example.test'})},
    PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k],setProperty:(k,v)=>props[k]=v})},
    LockService:{getScriptLock:()=>({waitLock(){stats.locks++;},releaseLock(){stats.locks--;}})},
    CacheService:{getScriptCache:()=>({get(k){const r=cacheItems.get(k);return r&&r.until>ClockDate.now()?r.value:null;},put(k,v,seconds){cacheItems.set(k,{value:v,until:ClockDate.now()+seconds*1000});},remove(k){cacheItems.delete(k);}})},
    Utilities:{getUuid:()=>crypto.randomUUID(),DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},computeDigest:(algorithm,value)=>Array.from(crypto.createHash(algorithm).update(value,'utf8').digest()),formatDate(date,tz,pattern){const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date).map(x=>[x.type,x.value]));return pattern==='HH:mm'?parts.hour+':'+parts.minute:`${parts.year}-${parts.month}-${parts.day}`;}},
    SpreadsheetApp:{openById:id=>({getSheetByName:name=>id==='logs'?({PatrolLogs:logSheet,TestPatrolLogs:testSheet,StationRounds:roundSheet,TestStationRounds:testRounds}[name]||null):sourceSheet}),flush(){}},
  });
  vm.runInContext(source,context);context.readBook_=id=>context.SpreadsheetApp.openById(id);logSheet.rows.push(vm.runInContext('LOG_HEADERS.slice()',context));testSheet.rows.push(vm.runInContext('LOG_HEADERS.slice()',context));
  roundSheet.rows.push(vm.runInContext('ROUND_HEADERS.slice()',context));testRounds.rows.push(vm.runInContext('ROUND_HEADERS.slice()',context));
  const gps=()=>({lat:14,lng:100,accuracy:10,timestamp:clock});
  const input=()=>({requestId:'abcdef0123456789abcdef',stationCode:'AAA',guardId:'001',checkpointId:'CP1',gps:gps()});
  return {context,stats,props,sourceSheet,logSheet,testSheet,roundSheet,testRounds,gps,input,setClock(v){clock=Date.parse(v);},date:v=>new ClockDate(v)};
}
