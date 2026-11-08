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
