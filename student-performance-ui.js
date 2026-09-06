const fs=require('fs');
const p='index.html';
let s=fs.readFileSync(p,'utf8');
const start=s.indexOf('function renderPerformance(){');
if(start>=0&&!s.includes('Password: Protected')){
  let depth=0,end=-1,inStr=null,esc=false;
  for(let i=start;i<s.length;i++){
    const c=s[i];
    if(inStr){if(esc)esc=false;else if(c==='\\\\')esc=true;else if(c===inStr)inStr=null;continue}
    if(c==='"'||c==="'"||c==='`'){inStr=c;continue}
    if(c==='{')depth++;
    else if(c==='}'&&--depth===0){end=i+1;break}
  }
  if(end>0){
    const fn=`function renderPerformance(){const el=$('performanceList');if(!report.length){el.innerHTML='<div class="empty">No registered students.</div>';return}el.innerHTML=report.map((s,i)=>{const tests=s.tests||[];const avg=tests.length?Math.round(tests.reduce((a,x)=>a+Number(x.percentage||0),0)/tests.length):0;return '<div class="student-row"><div class="q-head"><div><div class="q-title">'+esc(s.name||'Unnamed Student')+'</div><div class="muted small">Username: '+esc(s.username||'-')+' · Roll No. '+esc(s.roll||'-')+'</div></div><span class="badge">Class '+esc(String(s.class_level||'-'))+'</span></div><div class="grid" style="margin-top:12px"><div><div class="muted small">FULL NAME</div><strong>'+esc(s.name||'-')+'</strong></div><div><div class="muted small">PHONE NUMBER</div><strong>'+esc(s.phone||'Not provided')+'</strong></div><div><div class="muted small">CLASS</div><strong>Class '+esc(String(s.class_level||'-'))+'</strong></div><div><div class="muted small">PASSWORD</div><strong>Password: Protected</strong><div class="muted small">Passwords are securely hashed and cannot be viewed.</div></div></div><div style="margin-top:12px" class="muted small">Tests taken: '+tests.length+' · Average: '+avg+'%</div></div>'}).join('')}`;
    s=s.slice(0,start)+fn+s.slice(end);
  }
}
fs.writeFileSync(p,s);
