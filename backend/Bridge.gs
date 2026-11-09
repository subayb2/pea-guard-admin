// This source is appended to Code.gs by build-backend.mjs.
function webAppUrl_(){return 'https://script.google.com/macros/s/AKfycbypqL6MePFB--u1dKG5AJaNeG_00I35KZ2t5QxJExhx16ccZCsFuE9tW115hX5rb6-W/exec';}
function doGet(e){
  if(e?.parameter?.origin)throw new Error('กรุณาเปิด Dashboard โดยตรงบน Google Apps Script');
  if(!isAdmin_()){
    return HtmlService.createHtmlOutput(
      '<main style="max-width:38rem;margin:3rem auto;padding:1.25rem;font:16px/1.7 system-ui;color:#350d3e">' +
      '<h1>บัญชีนี้ยังเข้า Dashboard ไม่ได้</h1>' +
      '<p>เปิด Dashboard ในโปรไฟล์เบราว์เซอร์ที่ลงชื่อ Google ด้วยบัญชี Admin ที่ได้รับอนุญาต หากเปิดจากแอปแชต ให้เปิดลิงก์ในเบราว์เซอร์หลัก</p>' +
      '<a target="_top" href="https://accounts.google.com/AccountChooser?continue=' + encodeURIComponent(webAppUrl_()) + '">เลือกบัญชี Google</a></main>'
    ).setTitle('Guard Tour · ตรวจสอบบัญชี Google')
      .addMetaTag('viewport','width=device-width, initial-scale=1');
  }
  return HtmlService.createHtmlOutputFromFile('Dashboard')
    .setTitle('Guard Tour — Admin Dashboard')
    .addMetaTag('viewport','width=device-width, initial-scale=1');
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
