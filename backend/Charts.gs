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
