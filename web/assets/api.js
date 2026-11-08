export function validateBackendUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.hostname !== 'script.google.com' || !/^\/macros\/s\/[\w-]+\/exec$/.test(url.pathname) || url.search || url.hash)
    throw new Error('ใช้ URL ของ Apps Script ที่ลงท้ายด้วย /exec');
  return url.href;
}
export class DashboardApi {
  constructor(url) { this.url=validateBackendUrl(url);this.pending=new Map();this.channel=crypto.randomUUID().replaceAll('-','');this.onMessage=this.onMessage.bind(this); }
  async connect() {
    if(this.ready)return;
    if(this.connecting)return this.connecting;
    this.connecting=new Promise((resolve,reject)=>{
      this.resolveReady=resolve;this.rejectReady=reject;
      this.connectTimer=setTimeout(()=>{this.rejectReady?.(new Error('เชื่อมต่อ API ไม่สำเร็จ ตรวจ URL, origin ที่อนุญาต และบัญชี Google Admin'));this.rejectReady=null;},25000);
      window.addEventListener('message',this.onMessage);
      this.frame=document.createElement('iframe');this.frame.title='การเชื่อมต่อข้อมูล Admin';this.frame.hidden=true;this.frame.referrerPolicy='no-referrer';
      const url=new URL(this.url);url.searchParams.set('origin',location.origin);url.searchParams.set('channel',this.channel);this.frame.src=url.href;document.body.append(this.frame);
    });
    return this.connecting;
  }
  onMessage(event) {
    const m=event.data;
    if(!m||m.channel!==this.channel||m.protocol!=='pea-admin-v1'||!/^https:\/\/[a-z0-9-]+\.googleusercontent\.com$/.test(event.origin))return;
    if(m.type==='ready'&&!this.ready&&this.rejectReady){this.peer=event.source;this.peerOrigin=event.origin;this.ready=true;clearTimeout(this.connectTimer);this.resolveReady();this.resolveReady=null;this.rejectReady=null;return;}
    if(!this.ready||event.source!==this.peer||event.origin!==this.peerOrigin)return;
    const request=this.pending.get(m.id);if(!request)return;clearTimeout(request.timer);this.pending.delete(m.id);
    if(m.error)request.reject(new Error(m.error));else if(m.result==null)request.reject(new Error('API ไม่ได้ส่งข้อมูลกลับมา กรุณาลองใหม่'));else request.resolve(m.result);
  }
  async call(method,args={}) {
    await this.connect();
    return new Promise((resolve,reject)=>{
      const id=crypto.randomUUID();const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error('โหลดข้อมูลนานเกินไป กรุณาลองใหม่'));},45000);
      this.pending.set(id,{resolve,reject,timer});this.peer.postMessage({protocol:'pea-admin-v1',channel:this.channel,type:'request',id,method,args},this.peerOrigin);
    });
  }
  destroy(){clearTimeout(this.connectTimer);this.rejectReady?.(new Error('ยกเลิกการเชื่อมต่อ'));this.rejectReady=null;window.removeEventListener('message',this.onMessage);this.frame?.remove();for(const request of this.pending.values()){clearTimeout(request.timer);request.reject(new Error('ยกเลิกการเชื่อมต่อ'));}this.pending.clear();this.ready=false;}
}
