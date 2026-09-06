(function(){
  function addResetButton(){
    const nav=document.querySelector('.nav');
    if(!nav||document.getElementById('resetSystemButton')) return;
    const b=document.createElement('button');
    b.id='resetSystemButton';
    b.textContent='⚠ Reset Entire System';
    b.style.background='#8b1e1e';
    b.style.color='#fff';
    b.style.marginTop='18px';
    b.onclick=async function(){
      const first=confirm('DANGER: This will permanently delete ALL student accounts, quizzes, questions, results, rankings, notifications, attempts, and security-event data. The teacher/admin account will be preserved. Continue?');
      if(!first)return;
      const typed=prompt('Type RESET SYSTEM exactly to confirm the permanent reset:');
      if(typed!=='RESET SYSTEM'){alert('Reset cancelled. The confirmation text did not match.');return}
      const password=prompt('Enter your teacher/admin password for final confirmation:');
      if(!password)return;
      b.disabled=true;b.textContent='Resetting…';
      try{
        const r=await fetch('/api/admin/reset-system',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+(window.token||localStorage.getItem('quizmaster_teacher_token')||'')},body:JSON.stringify({confirmPassword:password})});
        const d=await r.json().catch(()=>({}));
        if(!r.ok)throw Error(d.error||'System reset failed');
        alert('System reset completed. All student accounts, quizzes, questions, results and rankings were deleted. The teacher/admin account was preserved.');
        location.reload();
      }catch(e){alert(e.message||'System reset failed');b.disabled=false;b.textContent='⚠ Reset Entire System'}
    };
    nav.appendChild(b);
  }
  const oldShow=window.showApp;
  if(typeof oldShow==='function'){
    window.showApp=function(){oldShow();setTimeout(addResetButton,50)};
  }
  document.addEventListener('DOMContentLoaded',function(){setTimeout(addResetButton,100)});
  setInterval(addResetButton,1000);
})();
