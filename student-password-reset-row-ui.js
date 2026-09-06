(function(){
  function esc(v){
    return String(v==null?'':v)
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;')
      .replace(/'/g,'&#39;');
  }
  function removeStandaloneResetCard(){
    const card=document.getElementById('adminPasswordResetCard');
    if(card)card.remove();
  }

  window.renderPerformance=function(){
    const el=document.getElementById('performanceList');
    if(!el)return;
    removeStandaloneResetCard();
    const rows=Array.isArray(window.report)?window.report:[];
    if(!rows.length){
      el.innerHTML='<div class="empty">No registered students.</div>';
      return;
    }
    el.innerHTML=rows.map(s=>{
      const id=Number(s.id);
      const name=esc(s.name||'Student');
      const username=esc(s.username||'');
      const phone=esc(s.phone||'Not provided');
      const cls=esc(s.class_level||'-');
      const avg=Number(s.average_percentage||0);
      const tests=Number(s.tests_taken||0);
      return `<div class="student-row">
        <div class="q-head">
          <div>
            <div class="q-title">${name}</div>
            <div class="muted small">${username?('Username: '+username+' · '):''}Class ${cls}</div>
          </div>
          <span class="badge">${avg}% avg</span>
        </div>
        <div class="row small" style="margin-top:9px">
          <span>Tests: <b>${tests}</b></span>
          <span>Phone: <b>${phone}</b></span>
        </div>
        <div class="row" style="margin-top:11px;justify-content:flex-end">
          <button class="btn outline" type="button" onclick="resetStudentPasswordFromRow(${id})">Reset Password</button>
        </div>
      </div>`;
    }).join('');
  };

  window.resetStudentPasswordFromRow=async function(id){
    if(!Number.isInteger(Number(id))||Number(id)<=0)return;
    const student=(Array.isArray(window.report)?window.report:[]).find(x=>Number(x.id)===Number(id));
    const name=student&&student.name?student.name:'this student';
    if(!confirm('Reset the password for '+name+'?\n\nThe current password will not be shown. A new temporary password will be generated and all existing student sessions will be signed out.'))return;
    try{
      const d=await api('/api/students/'+encodeURIComponent(id)+'/password-reset',{method:'GET'});
      alert('Temporary password for '+(d.student&&d.student.name?d.student.name:name)+':\n\n'+d.temporaryPassword+'\n\nGive this temporary password to the student.');
    }catch(e){
      alert(e.message||'Password reset failed');
    }
  };

  const oldLoad=window.loadPerformance;
  if(typeof oldLoad==='function'){
    window.loadPerformance=async function(){
      try{
        const d=await api('/api/students/report');
        window.report=d.students||[];
        window.leaderStudents=window.report;
        window.renderPerformance();
      }catch(e){
        console.log(e.message||e);
      }
    };
  }

  removeStandaloneResetCard();
  new MutationObserver(removeStandaloneResetCard).observe(document.body,{childList:true,subtree:true});
})();
