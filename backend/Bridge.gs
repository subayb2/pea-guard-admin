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
