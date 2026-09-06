const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const crypto = require("crypto");
const { promisify } = require("util");

const scryptAsync = promisify(crypto.scrypt);
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}
let databaseUrl = process.env.DATABASE_URL;
try {
  const parsed = new URL(databaseUrl);
  parsed.searchParams.delete("sslmode");
  parsed.searchParams.delete("uselibpqcompat");
  databaseUrl = parsed.toString();
} catch (err) {
  console.error("Invalid DATABASE_URL:", err.message);
  process.exit(1);
}
const pool = new Pool({
  connectionString: databaseUrl,
  ssl: { rejectUnauthorized: false },
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = await scryptAsync(String(password), salt, 64);
  return `${salt}:${derived.toString("hex")}`;
}
async function verifyPassword(password, stored) {
  const [salt, hash] = String(stored || "").split(":");
  if (!salt || !hash) return false;
  const derived = await scryptAsync(String(password), salt, 64);
  const expected = Buffer.from(hash, "hex");
  return expected.length === derived.length && crypto.timingSafeEqual(expected, derived);
}
function makeToken() { return crypto.randomBytes(32).toString("hex"); }
function tokenHash(token) { return crypto.createHash("sha256").update(token).digest("hex"); }
function validClass(v) { return Number(v) === 11 || Number(v) === 12 ? Number(v) : null; }
function validType(v) { return ["mcq", "fill", "integer"].includes(String(v || "").toLowerCase()) ? String(v).toLowerCase() : "mcq"; }
function cleanText(v) { return String(v ?? "").trim(); }
function normalizeFill(v) { return cleanText(v).toLowerCase().replace(/\s+/g, " "); }

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users(
      id SERIAL PRIMARY KEY, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('student','teacher')), name TEXT NOT NULL, roll TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS sessions(
      id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT UNIQUE NOT NULL, expires_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS quizzes(
      id SERIAL PRIMARY KEY, title TEXT NOT NULL, description TEXT, duration INTEGER NOT NULL,
      published BOOLEAN DEFAULT FALSE
    );
    CREATE TABLE IF NOT EXISTS questions(
      id SERIAL PRIMARY KEY, quiz_id INTEGER NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
      text TEXT NOT NULL, a TEXT NOT NULL DEFAULT '', b TEXT NOT NULL DEFAULT '',
      c TEXT NOT NULL DEFAULT '', d TEXT NOT NULL DEFAULT '', correct INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS results(
      id SERIAL PRIMARY KEY, quiz_id INTEGER REFERENCES quizzes(id) ON DELETE CASCADE,
      student TEXT, roll TEXT, score INTEGER, total INTEGER, percentage INTEGER, submitted_at TIMESTAMPTZ
    );
  `);
  await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS class_level INTEGER");
  await pool.query("ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS class_level INTEGER");
  await pool.query("ALTER TABLE results ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE SET NULL");
  await pool.query("ALTER TABLE questions ADD COLUMN IF NOT EXISTS question_type TEXT NOT NULL DEFAULT 'mcq'");
  await pool.query("ALTER TABLE questions ADD COLUMN IF NOT EXISTS answer TEXT NOT NULL DEFAULT ''");
  await pool.query("ALTER TABLE questions ALTER COLUMN a SET DEFAULT ''");
  await pool.query("ALTER TABLE questions ALTER COLUMN b SET DEFAULT ''");
  await pool.query("ALTER TABLE questions ALTER COLUMN c SET DEFAULT ''");
  await pool.query("ALTER TABLE questions ALTER COLUMN d SET DEFAULT ''");
  if (process.env.TEACHER_USERNAME && process.env.TEACHER_PASSWORD) {
    const username = process.env.TEACHER_USERNAME.trim().toLowerCase();
    const existing = await pool.query("SELECT id FROM users WHERE username=$1", [username]);
    if (existing.rows.length === 0) {
      const passwordHash = await hashPassword(process.env.TEACHER_PASSWORD);
      await pool.query("INSERT INTO users(username,password_hash,role,name) VALUES($1,$2,'teacher',$3)", [username, passwordHash, username]);
    }
  }
}

async function auth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    if (!token) return res.status(401).json({ error: "Authentication required" });
    const result = await pool.query(`
      SELECT u.id,u.username,u.role,u.name,u.roll,u.class_level,s.expires_at
      FROM sessions s JOIN users u ON u.id=s.user_id
      WHERE s.token_hash=$1 AND s.expires_at>NOW()
    `, [tokenHash(token)]);
    if (!result.rows.length) return res.status(401).json({ error: "Invalid or expired session" });
    req.user = result.rows[0];
    next();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Authentication failed" });
  }
}
function teacherOnly(req,res,next){ if(req.user?.role!=="teacher") return res.status(403).json({error:"Teacher access required"}); next(); }
function studentOnly(req,res,next){ if(req.user?.role!=="student") return res.status(403).json({error:"Student access required"}); next(); }

function questionForClient(row, includeAnswer=false) {
  const q = {
    id: row.id,
    text: row.text,
    type: validType(row.question_type),
    a: row.a || "", b: row.b || "", c: row.c || "", d: row.d || ""
  };
  if (includeAnswer) {
    q.correct = Number(row.correct || 0);
    q.answer = row.answer || "";
  }
  return q;
}
function validateQuestion(q) {
  const type = validType(q?.type || q?.question_type);
  const text = cleanText(q?.text);
  if (!text) throw new Error("Question text is required");
  if (type === "mcq") {
    const options = Array.isArray(q.options) ? q.options.map(cleanText) : [q.a,q.b,q.c,q.d].map(cleanText);
    if (options.length !== 4 || options.some(x => !x)) throw new Error("MCQ questions require four options");
    const correct = Number(q.correct);
    if (![0,1,2,3].includes(correct)) throw new Error("MCQ correct option is required");
    return { text, type, a:options[0], b:options[1], c:options[2], d:options[3], correct, answer:"" };
  }
  const answer = cleanText(q.answer ?? q.correctAnswer ?? "");
  if (!answer) throw new Error(type === "integer" ? "Integer answer is required" : "Fill in the blank answer is required");
  if (type === "integer" && !/^-?\d+$/.test(answer)) throw new Error("Integer answer must be a whole number");
  return { text, type, a:"", b:"", c:"", d:"", correct:0, answer };
}

app.get("/api/health", async (req,res)=>{
  try { await pool.query("SELECT 1"); res.json({ok:true,database:"postgresql"}); }
  catch(err){ res.status(500).json({ok:false,error:"Database unavailable"}); }
});

app.post("/api/auth/register",async(req,res)=>{
  const {username,password,name,roll,classLevel}=req.body;
  const cleanUsername=cleanText(username).toLowerCase();
  const cleanName=cleanText(name); const cleanRoll=cleanText(roll); const class_level=validClass(classLevel);
  if(cleanUsername.length<3)return res.status(400).json({error:"Username must be at least 3 characters"});
  if(String(password||"").length<6)return res.status(400).json({error:"Password must be at least 6 characters"});
  if(!cleanName||!cleanRoll)return res.status(400).json({error:"Name and roll number are required"});
  if(!class_level)return res.status(400).json({error:"Class 11 or Class 12 is required"});
  try{
    const passwordHash=await hashPassword(password);
    const result=await pool.query("INSERT INTO users(username,password_hash,role,name,roll,class_level) VALUES($1,$2,'student',$3,$4,$5) RETURNING id,username,role,name,roll,class_level",[cleanUsername,passwordHash,cleanName,cleanRoll,class_level]);
    res.status(201).json({user:result.rows[0]});
  }catch(err){ if(err.code==="23505")return res.status(409).json({error:"Username already exists"}); console.error(err); res.status(500).json({error:"Registration failed"}); }
});
app.post("/api/auth/login",async(req,res)=>{
  const cleanUsername=cleanText(req.body.username).toLowerCase(); const password=String(req.body.password||"");
  if(!cleanUsername||!password)return res.status(400).json({error:"Username and password are required"});
  try{
    const result=await pool.query("SELECT id,username,password_hash,role,name,roll,class_level FROM users WHERE username=$1",[cleanUsername]);
    if(!result.rows.length||!(await verifyPassword(password,result.rows[0].password_hash)))return res.status(401).json({error:"Invalid username or password"});
    const user=result.rows[0]; const token=makeToken();
    await pool.query("INSERT INTO sessions(user_id,token_hash,expires_at) VALUES($1,$2,NOW()+INTERVAL '30 days')",[user.id,tokenHash(token)]);
    delete user.password_hash; res.json({token,user});
  }catch(err){console.error(err);res.status(500).json({error:"Login failed"});}
});
app.get("/api/auth/me",auth,(req,res)=>res.json({user:{id:req.user.id,username:req.user.username,role:req.user.role,name:req.user.name,roll:req.user.roll,class_level:req.user.class_level}}));
app.patch("/api/auth/class",auth,studentOnly,async(req,res)=>{
  const class_level=validClass(req.body.classLevel); if(!class_level)return res.status(400).json({error:"Class must be 11 or 12"});
  try{
    if(req.user.class_level===11||req.user.class_level===12)return res.status(409).json({error:"Class has already been selected and cannot be changed."});
    const result=await pool.query("UPDATE users SET class_level=$1 WHERE id=$2 AND class_level IS NULL RETURNING id,username,role,name,roll,class_level",[class_level,req.user.id]);
    if(!result.rows.length)return res.status(409).json({error:"Class has already been selected and cannot be changed."});
    res.json({user:result.rows[0]});
  }catch(err){console.error(err);res.status(500).json({error:"Failed to save class"});}
});
app.post("/api/auth/logout",auth,async(req,res)=>{try{const token=(req.headers.authorization||"").slice(7).trim();await pool.query("DELETE FROM sessions WHERE token_hash=$1",[tokenHash(token)]);res.json({ok:true});}catch(err){res.status(500).json({error:"Logout failed"});}});

app.get("/api/quizzes",async(req,res)=>{
  try{
    const header=req.headers.authorization||""; const token=header.startsWith("Bearer ")?header.slice(7).trim():""; let user=null;
    if(token){const who=await pool.query(`SELECT u.role,u.class_level FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>NOW()`,[tokenHash(token)]);user=who.rows[0]||null;}
    let result;
    if(user?.role==="teacher")result=await pool.query("SELECT * FROM quizzes ORDER BY id DESC");
    else if(user?.role==="student"&&user.class_level)result=await pool.query("SELECT * FROM quizzes WHERE published=TRUE AND class_level=$1 ORDER BY id DESC",[user.class_level]);
    else result=await pool.query("SELECT * FROM quizzes WHERE published=TRUE AND class_level IS NOT NULL ORDER BY id DESC");
    res.json(result.rows);
  }catch(err){console.error(err);res.status(500).json({error:"Failed to load quizzes"});}
});
app.get("/api/quizzes/:id",auth,async(req,res)=>{
  try{
    const quizResult=req.user.role==="teacher"
      ? await pool.query("SELECT * FROM quizzes WHERE id=$1",[req.params.id])
      : await pool.query("SELECT * FROM quizzes WHERE id=$1 AND published=TRUE AND class_level=$2",[req.params.id,req.user.class_level]);
    if(!quizResult.rows.length)return res.status(404).json({error:"Quiz not found or not available for your class"});
    const quiz=quizResult.rows[0];
    const questions=await pool.query("SELECT id,text,a,b,c,d,correct,question_type,answer FROM questions WHERE quiz_id=$1 ORDER BY id",[quiz.id]);
    quiz.questions=questions.rows.map(r=>questionForClient(r,req.user.role==="teacher"));
    res.json(quiz);
  }catch(err){console.error(err);res.status(500).json({error:"Failed to load quiz"});}
});

async function saveQuiz(req,res,isUpdate){
  const id=isUpdate?Number(req.params.id):null; const {title,description,duration,classLevel,questions=[]}=req.body; const class_level=validClass(classLevel);
  if(isUpdate&&!Number.isInteger(id))return res.status(400).json({error:"Invalid quiz id"});
  if(!cleanText(title))return res.status(400).json({error:"Title is required"});
  if(!class_level)return res.status(400).json({error:"Quiz class must be 11 or 12"});
  if(!Array.isArray(questions)||!questions.length)return res.status(400).json({error:"At least one question is required"});
  let normalized; try{normalized=questions.map(validateQuestion);}catch(err){return res.status(400).json({error:err.message});}
  const db=await pool.connect();
  try{
    await db.query("BEGIN"); let quizId=id;
    if(isUpdate){const exists=await db.query("SELECT id FROM quizzes WHERE id=$1",[id]);if(!exists.rows.length){await db.query("ROLLBACK");return res.status(404).json({error:"Quiz not found"});}await db.query("UPDATE quizzes SET title=$1,description=$2,duration=$3,class_level=$4 WHERE id=$5",[cleanText(title),description||"",Number(duration)||10,class_level,id]);await db.query("DELETE FROM questions WHERE quiz_id=$1",[id]);}
    else{const r=await db.query("INSERT INTO quizzes(title,description,duration,class_level,published) VALUES($1,$2,$3,$4,FALSE) RETURNING id",[cleanText(title),description||"",Number(duration)||10,class_level]);quizId=r.rows[0].id;}
    for(const q of normalized){await db.query("INSERT INTO questions(quiz_id,text,a,b,c,d,correct,question_type,answer) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",[quizId,q.text,q.a,q.b,q.c,q.d,q.correct,q.type,q.answer]);}
    await db.query("COMMIT"); res.json({id:quizId,ok:true});
  }catch(err){await db.query("ROLLBACK");console.error(err);res.status(400).json({error:err.message||"Failed to save quiz"});}finally{db.release();}
}
app.post("/api/quizzes",auth,teacherOnly,(req,res)=>saveQuiz(req,res,false));
app.put("/api/quizzes/:id",auth,teacherOnly,(req,res)=>saveQuiz(req,res,true));
app.delete("/api/quizzes/:id",auth,teacherOnly,async(req,res)=>{try{const r=await pool.query("DELETE FROM quizzes WHERE id=$1 RETURNING id",[req.params.id]);if(!r.rows.length)return res.status(404).json({error:"Quiz not found"});res.json({ok:true});}catch(err){res.status(500).json({error:"Failed to delete quiz"});}});
app.patch("/api/quizzes/:id/publish",auth,teacherOnly,async(req,res)=>{try{const r=await pool.query("UPDATE quizzes SET published=$1 WHERE id=$2 RETURNING id,published",[Boolean(req.body.published),req.params.id]);if(!r.rows.length)return res.status(404).json({error:"Quiz not found"});res.json({ok:true,published:r.rows[0].published});}catch(err){res.status(500).json({error:"Failed to change quiz status"});}});

app.get("/api/results",auth,teacherOnly,async(req,res)=>{try{const r=await pool.query("SELECT r.*,q.title,q.class_level FROM results r LEFT JOIN quizzes q ON q.id=r.quiz_id ORDER BY r.id DESC");res.json(r.rows);}catch(err){res.status(500).json({error:"Failed to load results"});}});
app.get("/api/students/report",auth,teacherOnly,async(req,res)=>{
  try{
    const students=await pool.query(`SELECT u.id,u.name,u.roll,u.username,u.class_level,u.created_at,COUNT(r.id)::int AS tests_taken,COALESCE(SUM(r.score),0)::int AS total_correct,COALESCE(SUM(r.total),0)::int AS total_questions,COALESCE(ROUND(AVG(r.percentage)),0)::int AS average_percentage,MAX(r.submitted_at) AS last_test_at FROM users u LEFT JOIN results r ON r.user_id=u.id WHERE u.role='student' GROUP BY u.id ORDER BY u.class_level,u.roll,u.name`);
    const tests=await pool.query(`SELECT r.id,r.user_id,r.quiz_id,r.student,r.roll,r.score,r.total,r.percentage,r.submitted_at,q.title,q.description,q.duration,q.class_level FROM results r LEFT JOIN quizzes q ON q.id=r.quiz_id ORDER BY r.submitted_at DESC NULLS LAST,r.id DESC`);
    const byStudent={}; for(const t of tests.rows){if(!byStudent[t.user_id])byStudent[t.user_id]=[];byStudent[t.user_id].push(t);}
    res.json({students:students.rows.map(s=>({...s,tests:byStudent[s.id]||[]}))});
  }catch(err){console.error(err);res.status(500).json({error:"Failed to load student report"});}
});

app.post("/api/results",auth,studentOnly,async(req,res)=>{
  const {quizId,answers={}}=req.body;
  try{
    const quiz=await pool.query("SELECT id FROM quizzes WHERE id=$1 AND published=TRUE AND class_level=$2",[quizId,req.user.class_level]);
    if(!quiz.rows.length)return res.status(404).json({error:"Quiz not found or not available for your class"});
    const questions=await pool.query("SELECT id,correct,question_type,answer FROM questions WHERE quiz_id=$1 ORDER BY id",[quizId]);
    const total=questions.rows.length; if(!total)return res.status(400).json({error:"Quiz has no questions"});
    let score=0;
    for(const q of questions.rows){
      const given=answers[q.id]; const type=validType(q.question_type);
      if(type==="mcq" && Number(given)===Number(q.correct))score++;
      else if(type==="integer" && /^-?\d+$/.test(String(given??"").trim()) && Number(given)===Number(q.answer))score++;
      else if(type==="fill" && normalizeFill(given)===normalizeFill(q.answer))score++;
    }
    const percentage=Math.round(score*100/total);
    await pool.query("INSERT INTO results(quiz_id,user_id,student,roll,score,total,percentage,submitted_at) VALUES($1,$2,$3,$4,$5,$6,$7,NOW())",[quizId,req.user.id,req.user.name,req.user.roll||"",score,total,percentage]);
    res.json({score,total,percentage});
  }catch(err){console.error(err);res.status(500).json({error:"Failed to submit result"});}
});

app.get("*",(req,res,next)=>{ if(req.path.startsWith("/api/"))return next(); res.sendFile(require("path").join(__dirname,"index.html")); });

const port=process.env.PORT||3000;
initDb().then(()=>app.listen(port,()=>console.log(`QuizMaster server listening on ${port}`))).catch(err=>{console.error("Database initialization failed:",err);process.exit(1);});
