// Step 7 exam-control helpers. Loaded by server.js.
function examSettingsFromRow(q){return {attempt_limit:q.attempt_limit||0,start_at:q.start_at||null,end_at:q.end_at||null};}
function examWindowState(q){const now=Date.now(),start=q.start_at?new Date(q.start_at).getTime():null,end=q.end_at?new Date(q.end_at).getTime():null;if(start&&now<start)return 'scheduled';if(end&&now>=end)return 'expired';return 'open';}
module.exports={examSettingsFromRow,examWindowState};
