const express=require("express"),cors=require("cors"),Database=require("better-sqlite3");
const app=express();app.use(cors());app.use(express.json());
const db=new Database("quizmaster.db");
db.exec(`CREATE TABLE IF NOT EXISTS quizzes(id INTEGER PRIMARY KEY AUTOINCREMENT,title TEXT NOT NULL,description TEXT,duration INTEGER NOT NULL,published INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS questions(id INTEGER PRIMARY KEY AUTOINCREMENT,quiz_id INTEGER NOT NULL,text TEXT NOT NULL,a TEXT NOT NULL,b TEXT NOT NULL,c TEXT NOT NULL,d TEXT NOT NULL,correct INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS results(id INTEGER PRIMARY KEY AUTOINCREMENT,quiz_id INTEGER,student TEXT,roll TEXT,score INTEGER,total INTEGER,percentage INTEGER,submitted_at TEXT);`);
app.get("/api/quizzes",(req,res)=>res.json(db.prepare("SELECT * FROM quizzes ORDER BY id DESC").all()));
app.get("/api/quizzes/:id",(req,res)=>{let q=db.prepare("SELECT * FROM quizzes WHERE id=?").get(req.params.id);if(!q)return res.status(404).json({error:"Quiz not found"});q.questions=db.prepare("SELECT id,text,a,b,c,d,correct FROM questions WHERE quiz_id=?").all(q.id);res.json(q)});
app.post("/api/quizzes",(req,res)=>{let {title,description,duration,questions=[]}=req.body;let tx=db.transaction(()=>{let x=db.prepare("INSERT INTO quizzes(title,description,duration,published) VALUES(?,?,?,0)").run(title,description,duration||10);for(const q of questions)db.prepare("INSERT INTO questions(quiz_id,text,a,b,c,d,correct) VALUES(?,?,?,?,?,?,?)").run(x.lastInsertRowid,q.text,...q.options,q.correct);return x.lastInsertRowid});res.json({id:tx()})});
app.patch("/api/quizzes/:id/publish",(req,res)=>{db.prepare("UPDATE quizzes SET published=? WHERE id=?").run(req.body.published?1:0,req.params.id);res.json({ok:true})});
app.get("/api/results",(req,res)=>res.json(db.prepare("SELECT * FROM results ORDER BY id DESC").all()));
app.post("/api/results",(req,res)=>{let {quizId,student,roll,answers={}}=req.body,q=db.prepare("SELECT * FROM quizzes WHERE id=?").get(quizId),qs=db.prepare("SELECT * FROM questions WHERE quiz_id=?").all(quizId);if(!q)return res.status(404).json({error:"Quiz not found"});let score=qs.reduce((n,x)=>n+(Number(answers[x.id])===x.correct?1:0),0),total=qs.length;db.prepare("INSERT INTO results(quiz_id,student,roll,score,total,percentage,submitted_at) VALUES(?,?,?,?,?,?,?)").run(quizId,student,roll,score,total,Math.round(score*100/total),new Date().toISOString());res.json({score,total,percentage:Math.round(score*100/total)})});
app.get("/api/health",(req,res)=>res.json({ok:true}));
const port = process.env.PORT || 10000;
app.listen(port, "0.0.0.0", () => {
  console.log(`QuizMaster API running on port ${port}`);
});
