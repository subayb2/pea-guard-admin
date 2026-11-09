export class DashboardApi {
  call(method, args = {}) {
    return new Promise((resolve, reject) => {
      if (typeof google === 'undefined' || !google.script?.run) {
        reject(new Error('กรุณาเปิด Dashboard ผ่าน Google Apps Script'));
        return;
      }
      const timer = setTimeout(() => {
        reject(new Error('เซิร์ฟเวอร์ตอบช้า กรุณาตรวจอินเทอร์เน็ตแล้วลองอีกครั้ง'));
      }, 45000);
      google.script.run
        .withSuccessHandler(result => {
          clearTimeout(timer);
          if (result == null) reject(new Error('เซิร์ฟเวอร์ยังไม่ส่งข้อมูล กรุณาลองอีกครั้ง'));
          else resolve(result);
        })
        .withFailureHandler(error => {
          clearTimeout(timer);
          reject(new Error(error?.message || 'เชื่อมต่อไม่สำเร็จ กรุณาลองอีกครั้ง'));
        })
        .dashboardCall({method, args});
    });
  }
}
