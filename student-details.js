const fs=require('fs');
const p='server.js';
let s=fs.readFileSync(p,'utf8');

// Add phone storage without exposing or storing plaintext passwords.
const dbMarker='await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS class_level INTEGER");';
if(s.includes(dbMarker)&&!s.includes('ALTER TABLE users ADD COLUMN IF NOT EXISTS phone')){
  s=s.replace(dbMarker,dbMarker+'await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT");',1);
}

// Accept and validate phone number during student registration.
const regMarker='const {username,password,name,roll,classLevel}=req.body';
if(s.includes(regMarker)&&!s.includes('req.body.phone')){
  s=s.replace(regMarker,'const {username,password,name,roll,classLevel,phone}=req.body',1);
  s=s.replace('const u=cleanText(username).toLowerCase(),n=cleanText(name),r=cleanText(roll),cl=validClass(classLevel);','const u=cleanText(username).toLowerCase(),n=cleanText(name),r=cleanText(roll),ph=cleanText(phone),cl=validClass(classLevel);',1);
  s=s.replace('if(!n||!r)return res.status(400).json({error:"Name and roll number are required"});','if(!n||!r)return res.status(400).json({error:"Name and roll number are required"});if(!/^\\d{10}$/.test(ph))return res.status(400).json({error:"Valid 10-digit phone number is required"});',1);
  s=s.replace('INSERT INTO users(username,password_hash,role,name,roll,class_level) VALUES($1,$2,\'student\',$3,$4,$5) RETURNING id,username,role,name,roll,class_level','INSERT INTO users(username,password_hash,role,name,roll,class_level,phone) VALUES($1,$2,\'student\',$3,$4,$5,$6) RETURNING id,username,role,name,roll,class_level,phone',1);
  s=s.replace('[u,await hashPassword(password),n,r,cl]);res.status(201)', '[u,await hashPassword(password),n,r,cl,ph]);res.status(201)',1);
}

// Ensure authenticated user data includes phone.
s=s.replace('SELECT u.id,u.username,u.role,u.name,u.roll,u.class_level,s.expires_at FROM sessions', 'SELECT u.id,u.username,u.role,u.name,u.roll,u.class_level,u.phone,s.expires_at FROM sessions',1);
s=s.replace('SELECT id,username,password_hash,role,name,roll,class_level FROM users WHERE username=$1', 'SELECT id,username,password_hash,role,name,roll,class_level,phone FROM users WHERE username=$1',1);
s=s.replace('user:{id:req.user.id,username:req.user.username,role:req.user.role,name:req.user.name,roll:req.user.roll,class_level:req.user.class_level}', 'user:{id:req.user.id,username:req.user.username,role:req.user.role,name:req.user.name,roll:req.user.roll,class_level:req.user.class_level,phone:req.user.phone}',1);

// Put a teacher-only student report route before the normal route. This returns safe account details;
// passwords are never returned because only password hashes are stored.
const marker='app.get("/api/quizzes",async(req,res)=>';
const route='app.get("/api/students/report",auth,teacherOnly,async(req,res)=>{try{const students=await pool.query(`SELECT u.id,u.username,u.name,u.roll,u.class_level,u.phone,u.created_at,COALESCE(json_agg(json_build_object(\'quiz_id\',r.quiz_id,\'student\',r.student,\'roll\',r.roll,\'score\',r.score,\'total\',r.total,\'percentage\',r.percentage,\'submitted_at\',r.submitted_at) ORDER BY r.submitted_at DESC) FILTER (WHERE r.id IS NOT NULL),\'[]\') AS tests FROM users u LEFT JOIN results r ON r.user_id=u.id WHERE u.role=\'student\' GROUP BY u.id ORDER BY u.created_at DESC`);res.json({students:students.rows})}catch(e){console.error(e);res.status(500).json({error:"Failed to load student report"})}});'+marker;
if(s.includes(marker)&&!s.includes('SELECT u.id,u.username,u.name,u.roll,u.class_level,u.phone,u.created_at'))s=s.replace(marker,route,1);

fs.writeFileSync(p,s);
