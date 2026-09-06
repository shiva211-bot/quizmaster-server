const fs=require('fs');
const p='server.js';
let s=fs.readFileSync(p,'utf8');

const marker='app.get("/api/health",async(req,res)=>';
const patch=`app.post("/api/security/events",auth,studentOnly,async(req,res)=>{const allowed={quiz_app_backgrounded:{severity:"alert",details:"Student left the quiz app or switched to another app/tab during an active quiz"},quiz_app_resumed:{severity:"info",details:"Student returned to the quiz app after leaving it"},quiz_exit:{severity:"warning",details:"Student exited an active quiz without submitting"}};const type=String(req.body?.eventType||"");if(!allowed[type])return res.status(400).json({error:"Unsupported security event"});const quizId=Number(req.body?.quizId||0);if(!Number.isInteger(quizId)||quizId<=0)return res.status(400).json({error:"Invalid quiz id"});try{const q=(await pool.query("SELECT id,title,class_level FROM quizzes WHERE id=$1",[quizId])).rows[0];if(!q)return res.status(404).json({error:"Quiz not found"});await securityLog({severity:allowed[type].severity,eventType:type,actorUserId:req.user.id,targetUserId:req.user.id,username:req.user.username,ip:requestIp(req),userAgent:requestAgent(req),details:allowed[type].details+"; quiz_id="+quizId+"; quiz_title="+String(q.title||"").slice(0,160)});res.json({ok:true})}catch(e){console.error(e);res.status(500).json({error:"Failed to record security event"})}});
`+marker;
if(s.includes(marker)&&!s.includes('app.post("/api/security/events"'))s=s.replace(marker,patch);
fs.writeFileSync(p,s);
