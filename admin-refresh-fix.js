(()=>{
  const originalFetch=window.fetch.bind(window);
  window.fetch=function(input,init={}){
    try{
      const method=String(init.method||'GET').toUpperCase();
      const url=typeof input==='string'?input:(input&&input.url)||'';
      if((method==='GET'||method==='HEAD')&&url.includes('/api/')){
        const u=new URL(url,window.location.href);
        u.searchParams.set('_refresh',Date.now().toString());
        init={...init,cache:'no-store',headers:{...(init.headers||{}),'Cache-Control':'no-cache','Pragma':'no-cache'}};
        input=u.toString();
      }
    }catch{}
    return originalFetch(input,init);
  };
})();
