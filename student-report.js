const fs=require('fs');
const p='server.js';
let s=fs.readFileSync(p,'utf8');
const marker='app.get("/api/quizzes",async(req,res)=>';
const route='app.get("/api/students/report",auth,teacherOnly,async(req,res)=>{try{const r=await pool.query(`SELECT u.id,u.username,u.name,u.roll,u.class_level,u.phone,u.created_at,COALESCE(json_agg(json_build_object(\'quiz_id\',x.quiz_id,\'student\',x.student,\'roll\',x.roll,\'score\',x.score,\'total\',x.total,\'percentage\',x.percentage,\'submitted_at\',x.submitted_at) ORDER BY x.submitted_at DESC) FILTER (WHERE x.id IS NOT NULL),\'[]\') AS tests FROM users u LEFT JOIN results x ON x.user_id=u.id WHERE u.role=\'student\' GROUP BY u.id ORDER BY u.created_at DESC`);res.json({students:r.rows})}catch(e){console.error(e);res.status(500).json({error:"Failed to load student report"})}});'+marker;
if(s.includes(marker)&&!s.includes('SELECT u.id,u.username,u.name,u.roll,u.class_level,u.phone,u.created_at'))s=s.replace(marker,route,1);
fs.writeFileSync(p,s);
