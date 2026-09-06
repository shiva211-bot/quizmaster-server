const fs=require('fs');
const p='server.js';
let s=fs.readFileSync(p,'utf8');

const notificationMarker=`CREATE TABLE IF NOT EXISTS notification_reads(notification_id INTEGER NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,read_at TIMESTAMPTZ DEFAULT NOW(),PRIMARY KEY(notification_id,user_id));`;
const notificationPatched=`CREATE TABLE IF NOT EXISTS notification_reads(notification_id INTEGER NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,read_at TIMESTAMPTZ DEFAULT NOW(),PRIMARY KEY(notification_id,user_id));CREATE TABLE IF NOT EXISTS exam_attempts(id SERIAL PRIMARY KEY,quiz_id INTEGER NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,started_at TIMESTAMPTZ DEFAULT NOW());`;
if(s.includes(notificationMarker) && !s.includes('CREATE TABLE IF NOT EXISTS exam_attempts')) s=s.replace(notificationMarker,notificationPatched);

const questionMarker=`await pool.query("ALTER TABLE questions ADD COLUMN IF NOT EXISTS answer TEXT NOT NULL DEFAULT ''");`;
const questionPatched=`await pool.query("ALTER TABLE questions ADD COLUMN IF NOT EXISTS answer TEXT NOT NULL DEFAULT ''");await pool.query("ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS attempt_limit INTEGER NOT NULL DEFAULT 0");await pool.query("ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS start_at TIMESTAMPTZ");await pool.query("ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS end_at TIMESTAMPTZ");`;
if(s.includes(questionMarker) && !s.includes('ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS attempt_limit')) s=s.replace(questionMarker,questionPatched);

const oldCreate=`const id=update?Number(req.params.id):null,{title,description,duration,classLevel,questions=[]}=req.body,cl=validClass(classLevel);`;
const newCreate=`const id=update?Number(req.params.id):null,{title,description,duration,classLevel,attemptLimit=0,startAt=null,endAt=null,questions=[]}=req.body,cl=validClass(classLevel),limit=Math.max(0,Number(attemptLimit)||0),start=startAt?new Date(startAt):null,end=endAt?new Date(endAt):null;`;
if(s.includes(oldCreate)) s=s.replace(oldCreate,newCreate);

const validation=`if(!cl)return res.status(400).json({error:"Quiz class must be 11 or 12"});if(!Array.isArray(questions)||!questions.length)`;
const validationPatched=`if(!cl)return res.status(400).json({error:"Quiz class must be 11 or 12"});if(start&&Number.isNaN(start.getTime()))return res.status(400).json({error:"Invalid exam start time"});if(end&&Number.isNaN(end.getTime()))return res.status(400).json({error:"Invalid exam end time"});if(start&&end&&end<=start)return res.status(400).json({error:"Exam end time must be after start time"});if(!Array.isArray(questions)||!questions.length)`;
if(s.includes(validation) && !s.includes('Invalid exam start time')) s=s.replace(validation,validationPatched);

s=s.replace('UPDATE quizzes SET title=$1,description=$2,duration=$3,class_level=$4 WHERE id=$5','UPDATE quizzes SET title=$1,description=$2,duration=$3,class_level=$4,attempt_limit=$5,start_at=$6,end_at=$7 WHERE id=$8');
s=s.replace('[cleanText(title),description||"",Number(duration)||10,cl,id]);','[cleanText(title),description||"",Number(duration)||10,cl,limit,start,end,id]);');
s=s.replace('INSERT INTO quizzes(title,description,duration,class_level,published) VALUES($1,$2,$3,$4,FALSE) RETURNING id','INSERT INTO quizzes(title,description,duration,class_level,attempt_limit,start_at,end_at,published) VALUES($1,$2,$3,$4,$5,$6,$7,FALSE) RETURNING id');
s=s.replace('[cleanText(title),description||"",Number(duration)||10,cl]);','[cleanText(title),description||"",Number(duration)||10,cl,limit,start,end]);');

const marker='app.get("/api/notifications",auth,studentOnly';
const access='app.get("/api/quizzes/:id/access",auth,studentOnly,async(req,res)=>{try{const q=(await pool.query("SELECT id,title,attempt_limit,start_at,end_at FROM quizzes WHERE id=$1 AND published=TRUE AND class_level=$2",[req.params.id,req.user.class_level])).rows[0];if(!q)return res.status(404).json({error:"Quiz not found or not available for your class"});const now=Date.now(),start=q.start_at?new Date(q.start_at).getTime():null,end=q.end_at?new Date(q.end_at).getTime():null;if(start&&now<start)return res.json({allowed:false,status:"scheduled",startAt:q.start_at,endAt:q.end_at,attemptLimit:q.attempt_limit,attemptsUsed:0,attemptsRemaining:q.attempt_limit||0});if(end&&now>=end)return res.json({allowed:false,status:"expired",startAt:q.start_at,endAt:q.end_at,attemptLimit:q.attempt_limit,attemptsUsed:0,attemptsRemaining:0});const c=(await pool.query("SELECT COUNT(*)::int AS n FROM results WHERE quiz_id=$1 AND user_id=$2",[q.id,req.user.id])).rows[0].n,remaining=q.attempt_limit>0?Math.max(0,q.attempt_limit-c):null;res.json({allowed:remaining===null||remaining>0,status:"open",startAt:q.start_at,endAt:q.end_at,attemptLimit:q.attempt_limit,attemptsUsed:c,attemptsRemaining:remaining})}catch(e){console.error(e);res.status(500).json({error:"Failed to check exam access"})}});'+marker;
if(s.includes(marker) && !s.includes('api/quizzes/:id/access')) s=s.replace(marker,access);

s=s.replace('const q=qr.rows[0],qs=await pool.query','const q=qr.rows[0];if(req.user.role==="student"){const now=Date.now(),st=q.start_at?new Date(q.start_at).getTime():null,en=q.end_at?new Date(q.end_at).getTime():null;if(st&&now<st)return res.status(403).json({error:"Exam has not started yet",status:"scheduled",startAt:q.start_at,endAt:q.end_at});if(en&&now>=en)return res.status(403).json({error:"Exam has ended",status:"expired",startAt:q.start_at,endAt:q.end_at});const c=(await pool.query("SELECT COUNT(*)::int AS n FROM results WHERE quiz_id=$1 AND user_id=$2",[q.id,req.user.id])).rows[0].n;if(q.attempt_limit>0&&c>=q.attempt_limit)return res.status(403).json({error:"Attempt limit reached",status:"limit",attemptLimit:q.attempt_limit,attemptsUsed:c})}const qs=await pool.query');
s=s.replace('const q=await pool.query("SELECT id FROM quizzes WHERE id=$1 AND published=TRUE AND class_level=$2",[quizId,req.user.class_level]);if(!q.rows.length)','const q=await pool.query("SELECT id,attempt_limit,start_at,end_at FROM quizzes WHERE id=$1 AND published=TRUE AND class_level=$2",[quizId,req.user.class_level]);if(!q.rows.length)');
s=s.replace('if(!q.rows.length)return res.status(404).json({error:"Quiz not found or not available for your class"});const qs=await pool.query("SELECT id,correct,question_type,answer FROM questions WHERE quiz_id=$1 ORDER BY id",[quizId]);','if(!q.rows.length)return res.status(404).json({error:"Quiz not found or not available for your class"});const exam=q.rows[0],now=Date.now(),st=exam.start_at?new Date(exam.start_at).getTime():null,en=exam.end_at?new Date(exam.end_at).getTime():null;if(st&&now<st)return res.status(403).json({error:"Exam has not started yet"});if(en&&now>=en)return res.status(403).json({error:"Exam has ended"});const used=(await pool.query("SELECT COUNT(*)::int AS n FROM results WHERE quiz_id=$1 AND user_id=$2",[quizId,req.user.id])).rows[0].n;if(exam.attempt_limit>0&&used>=exam.attempt_limit)return res.status(403).json({error:"Attempt limit reached"});const qs=await pool.query("SELECT id,correct,question_type,answer FROM questions WHERE quiz_id=$1 ORDER BY id",[quizId]);',1);

const resetMarker='app.get("/api/health",async(req,res)=>';
const resetRoute=`app.post("/api/admin/reset-system",auth,teacherOnly,async(req,res)=>{const db=await pool.connect();try{await db.query("BEGIN");await db.query("TRUNCATE TABLE security_events,notification_reads,notifications,result_answers,exam_attempts,results,questions,quizzes RESTART IDENTITY CASCADE");await db.query("DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE role='student')");await db.query("DELETE FROM users WHERE role='student'");await db.query("UPDATE users SET status='active',locked_until=NULL,failed_login_count=0,last_failed_login_at=NULL WHERE role='teacher'");await db.query("COMMIT");res.json({ok:true,message:"System reset completed. All student accounts, quizzes, questions, results, rankings, notifications, attempts, and security-event data were deleted. Teacher accounts were preserved."})}catch(e){await db.query("ROLLBACK");console.error(e);res.status(500).json({error:"System reset failed. No reset was committed."})}finally{db.release()}});`+resetMarker;
if(s.includes(resetMarker)&&!s.includes('api/admin/reset-system'))s=s.replace(resetMarker,resetRoute);

let h=fs.readFileSync('index.html','utf8');
const tag='<script src="/exam-controls-ui.js"></script>';
const securityTag='<script src="/intruder-security-ui.js"></script>';
if(!h.includes(tag)||!h.includes(securityTag)){h=h.replace('</body>',(!h.includes(tag)?tag:'')+(!h.includes(securityTag)?securityTag:'')+'</body>');fs.writeFileSync('index.html',h)}
fs.writeFileSync(p,'// Step 7 exam controls patched at startup.\n'+s);
require('./intruder-security-v2.js');
require('./production-security.js');
require('./password-reset.js');
require('./question-importer.js');
require('./server.js');
