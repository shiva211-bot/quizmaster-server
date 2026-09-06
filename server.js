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
  console.error("DATABASE_URL is not set. Configure the Aiven PostgreSQL connection URL in the Render service environment.");
  process.exit(1);
}

let databaseUrl = process.env.DATABASE_URL;
try {
  const parsedUrl = new URL(databaseUrl);
  parsedUrl.searchParams.delete("sslmode");
  parsedUrl.searchParams.delete("uselibpqcompat");
  databaseUrl = parsedUrl.toString();
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

function makeToken() {
  return crypto.randomBytes(32).toString("hex");
}

function tokenHash(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('student','teacher')),
      name TEXT NOT NULL,
      roll TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT UNIQUE NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS quizzes (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      duration INTEGER NOT NULL,
      published BOOLEAN DEFAULT FALSE
    );

    CREATE TABLE IF NOT EXISTS questions (
      id SERIAL PRIMARY KEY,
      quiz_id INTEGER NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
      text TEXT NOT NULL,
      a TEXT NOT NULL,
      b TEXT NOT NULL,
      c TEXT NOT NULL,
      d TEXT NOT NULL,
      correct INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS results (
      id SERIAL PRIMARY KEY,
      quiz_id INTEGER REFERENCES quizzes(id) ON DELETE CASCADE,
      student TEXT,
      roll TEXT,
      score INTEGER,
      total INTEGER,
      percentage INTEGER,
      submitted_at TIMESTAMPTZ
    );
  `);

  await pool.query(`ALTER TABLE results ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE SET NULL`);

  // Optional first teacher account. Set TEACHER_USERNAME and TEACHER_PASSWORD in Render.
  if (process.env.TEACHER_USERNAME && process.env.TEACHER_PASSWORD) {
    const username = process.env.TEACHER_USERNAME.trim();
    const existing = await pool.query("SELECT id FROM users WHERE username=$1", [username]);
    if (existing.rows.length === 0) {
      const passwordHash = await hashPassword(process.env.TEACHER_PASSWORD);
      await pool.query(
        "INSERT INTO users(username,password_hash,role,name) VALUES($1,$2,'teacher',$3)",
        [username, passwordHash, username]
      );
      console.log(`Initial teacher account created for ${username}.`);
    }
  }
}

async function auth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    if (!token) return res.status(401).json({ error: "Authentication required" });

    const result = await pool.query(
      `SELECT u.id,u.username,u.role,u.name,u.roll,s.expires_at
       FROM sessions s JOIN users u ON u.id=s.user_id
       WHERE s.token_hash=$1 AND s.expires_at>NOW()`,
      [tokenHash(token)]
    );
    if (result.rows.length === 0) return res.status(401).json({ error: "Invalid or expired session" });
    req.user = result.rows[0];
    next();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Authentication failed" });
  }
}

function teacherOnly(req, res, next) {
  if (req.user?.role !== "teacher") return res.status(403).json({ error: "Teacher access required" });
  next();
}

function studentOnly(req, res, next) {
  if (req.user?.role !== "student") return res.status(403).json({ error: "Student access required" });
  next();
}

app.post("/api/auth/register", async (req, res) => {
  const { username, password, name, roll } = req.body;
  const cleanUsername = String(username || "").trim().toLowerCase();
  const cleanName = String(name || "").trim();
  const cleanRoll = String(roll || "").trim();

  if (cleanUsername.length < 3) return res.status(400).json({ error: "Username must be at least 3 characters" });
  if (String(password || "").length < 6) return res.status(400).json({ error: "Password must be at least 6 characters" });
  if (!cleanName || !cleanRoll) return res.status(400).json({ error: "Name and roll number are required" });

  try {
    const passwordHash = await hashPassword(password);
    const result = await pool.query(
      "INSERT INTO users(username,password_hash,role,name,roll) VALUES($1,$2,'student',$3,$4) RETURNING id,username,role,name,roll",
      [cleanUsername, passwordHash, cleanName, cleanRoll]
    );
    res.status(201).json({ user: result.rows[0] });
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ error: "Username already exists" });
    console.error(err);
    res.status(500).json({ error: "Registration failed" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  const cleanUsername = String(req.body.username || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  if (!cleanUsername || !password) return res.status(400).json({ error: "Username and password are required" });

  try {
    const result = await pool.query("SELECT id,username,password_hash,role,name,roll FROM users WHERE username=$1", [cleanUsername]);
    if (result.rows.length === 0 || !(await verifyPassword(password, result.rows[0].password_hash))) {
      return res.status(401).json({ error: "Invalid username or password" });
    }

    const user = result.rows[0];
    const token = makeToken();
    await pool.query(
      "INSERT INTO sessions(user_id,token_hash,expires_at) VALUES($1,$2,NOW()+INTERVAL '30 days')",
      [user.id, tokenHash(token)]
    );

    delete user.password_hash;
    res.json({ token, user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Login failed" });
  }
});

app.get("/api/auth/me", auth, (req, res) => {
  res.json({ user: { id: req.user.id, username: req.user.username, role: req.user.role, name: req.user.name, roll: req.user.roll } });
});

app.post("/api/auth/logout", auth, async (req, res) => {
  try {
    const token = (req.headers.authorization || "").slice(7).trim();
    await pool.query("DELETE FROM sessions WHERE token_hash=$1", [tokenHash(token)]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Logout failed" });
  }
});

app.get("/api/quizzes", async (req, res) => {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    let role = null;
    if (token) {
      const who = await pool.query(
        `SELECT u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>NOW()`,
        [tokenHash(token)]
      );
      role = who.rows[0]?.role || null;
    }
    const result = role === "teacher"
      ? await pool.query("SELECT * FROM quizzes ORDER BY id DESC")
      : await pool.query("SELECT * FROM quizzes WHERE published=TRUE ORDER BY id DESC");
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load quizzes" });
  }
});

app.get("/api/quizzes/:id", auth, async (req, res) => {
  try {
    const quizResult = req.user.role === "teacher"
      ? await pool.query("SELECT * FROM quizzes WHERE id=$1", [req.params.id])
      : await pool.query("SELECT * FROM quizzes WHERE id=$1 AND published=TRUE", [req.params.id]);
    if (quizResult.rows.length === 0) return res.status(404).json({ error: "Quiz not found" });
    const quiz = quizResult.rows[0];
    const questionsResult = await pool.query(
      "SELECT id,text,a,b,c,d,correct FROM questions WHERE quiz_id=$1 ORDER BY id",
      [quiz.id]
    );
    quiz.questions = questionsResult.rows;
    res.json(quiz);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load quiz" });
  }
});

app.post("/api/quizzes", auth, teacherOnly, async (req, res) => {
  const { title, description, duration, questions = [] } = req.body;
  if (!title || !String(title).trim()) return res.status(400).json({ error: "Title is required" });
  if (!Array.isArray(questions) || questions.length === 0) return res.status(400).json({ error: "At least one question is required" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const quizResult = await client.query(
      "INSERT INTO quizzes(title,description,duration,published) VALUES($1,$2,$3,FALSE) RETURNING id",
      [String(title).trim(), description || "", Number(duration) || 10]
    );
    const quizId = quizResult.rows[0].id;
    for (const q of questions) {
      const options = Array.isArray(q.options) ? q.options : [];
      if (!q.text || options.length < 4) throw new Error("Each question must have text and four options");
      await client.query(
        "INSERT INTO questions(quiz_id,text,a,b,c,d,correct) VALUES($1,$2,$3,$4,$5,$6,$7)",
        [quizId, q.text, options[0], options[1], options[2], options[3], Number(q.correct) || 0]
      );
    }
    await client.query("COMMIT");
    res.json({ id: quizId });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(400).json({ error: err.message || "Failed to create quiz" });
  } finally { client.release(); }
});

app.put("/api/quizzes/:id", auth, teacherOnly, async (req, res) => {
  const id = Number(req.params.id);
  const { title, description, duration, questions = [] } = req.body;
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid quiz id" });
  if (!title || !String(title).trim()) return res.status(400).json({ error: "Title is required" });
  if (!Array.isArray(questions) || questions.length === 0) return res.status(400).json({ error: "At least one question is required" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const existing = await client.query("SELECT id FROM quizzes WHERE id=$1", [id]);
    if (existing.rows.length === 0) { await client.query("ROLLBACK"); return res.status(404).json({ error: "Quiz not found" }); }
    await client.query("UPDATE quizzes SET title=$1,description=$2,duration=$3 WHERE id=$4", [String(title).trim(), description || "", Number(duration) || 10, id]);
    await client.query("DELETE FROM questions WHERE quiz_id=$1", [id]);
    for (const q of questions) {
      const options = Array.isArray(q.options) ? q.options : [];
      if (!q.text || options.length < 4) throw new Error("Each question must have text and four options");
      await client.query("INSERT INTO questions(quiz_id,text,a,b,c,d,correct) VALUES($1,$2,$3,$4,$5,$6,$7)", [id, q.text, options[0], options[1], options[2], options[3], Number(q.correct) || 0]);
    }
    await client.query("COMMIT");
    res.json({ ok: true });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(400).json({ error: err.message || "Failed to update quiz" });
  } finally { client.release(); }
});

app.delete("/api/quizzes/:id", auth, teacherOnly, async (req, res) => {
  try {
    const result = await pool.query("DELETE FROM quizzes WHERE id=$1 RETURNING id", [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: "Quiz not found" });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete quiz" });
  }
});

app.patch("/api/quizzes/:id/publish", auth, teacherOnly, async (req, res) => {
  try {
    const result = await pool.query("UPDATE quizzes SET published=$1 WHERE id=$2 RETURNING id,published", [Boolean(req.body.published), req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: "Quiz not found" });
    res.json({ ok: true, published: result.rows[0].published });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to change quiz status" });
  }
});

app.get("/api/results", auth, teacherOnly, async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM results ORDER BY id DESC");
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load results" });
  }
});

app.post("/api/results", auth, studentOnly, async (req, res) => {
  const { quizId, answers = {} } = req.body;
  try {
    const quizResult = await pool.query("SELECT id FROM quizzes WHERE id=$1 AND published=TRUE", [quizId]);
    if (quizResult.rows.length === 0) return res.status(404).json({ error: "Quiz not found" });
    const questionsResult = await pool.query("SELECT id,correct FROM questions WHERE quiz_id=$1 ORDER BY id", [quizId]);
    const questions = questionsResult.rows;
    if (questions.length === 0) return res.status(400).json({ error: "Quiz has no questions" });

    const score = questions.reduce((n, q) => n + (Number(answers[q.id]) === q.correct ? 1 : 0), 0);
    const total = questions.length;
    const percentage = Math.round((score * 100) / total);

    await pool.query(
      "INSERT INTO results(quiz_id,user_id,student,roll,score,total,percentage,submitted_at) VALUES($1,$2,$3,$4,$5,$6,$7,NOW())",
      [quizId, req.user.id, req.user.name, req.user.roll || "", score, total, percentage]
    );
    res.json({ score, total, percentage });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to submit result" });
  }
});

app.get("/api/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true, database: "postgresql" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, database: "postgresql" });
  }
});

const port = process.env.PORT || 10000;
initDb()
  .then(() => app.listen(port, "0.0.0.0", () => console.log(`QuizMaster API running on port ${port}`)))
  .catch((err) => { console.error("Failed to initialize PostgreSQL database:", err); process.exit(1); });

process.on("SIGTERM", async () => { await pool.end(); process.exit(0); });
