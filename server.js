const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Configure the Aiven PostgreSQL connection URL in the Render service environment.");
  process.exit(1);
}

// Aiven Free PostgreSQL allows up to 20 database connections.
// Keep the application pool small so the service stays well within that limit.
// Aiven's connection URL may include sslmode=require. With newer pg versions,
// that can be interpreted as certificate verification and reject Aiven's chain.
// Remove sslmode from the URL and explicitly use TLS without certificate verification.
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

async function initDb() {
  await pool.query(`
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
}

app.get("/api/quizzes", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM quizzes ORDER BY id DESC");
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load quizzes" });
  }
});

app.get("/api/quizzes/:id", async (req, res) => {
  try {
    const quizResult = await pool.query("SELECT * FROM quizzes WHERE id=$1", [req.params.id]);
    if (quizResult.rows.length === 0) {
      return res.status(404).json({ error: "Quiz not found" });
    }

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

app.post("/api/quizzes", async (req, res) => {
  const { title, description, duration, questions = [] } = req.body;

  if (!title || !String(title).trim()) {
    return res.status(400).json({ error: "Title is required" });
  }
  if (!Array.isArray(questions) || questions.length === 0) {
    return res.status(400).json({ error: "At least one question is required" });
  }

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
      if (!q.text || options.length < 4) {
        throw new Error("Each question must have text and four options");
      }
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
  } finally {
    client.release();
  }
});

app.put("/api/quizzes/:id", async (req, res) => {
  const id = Number(req.params.id);
  const { title, description, duration, questions = [] } = req.body;

  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: "Invalid quiz id" });
  }
  if (!title || !String(title).trim()) {
    return res.status(400).json({ error: "Title is required" });
  }
  if (!Array.isArray(questions) || questions.length === 0) {
    return res.status(400).json({ error: "At least one question is required" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const existing = await client.query("SELECT id FROM quizzes WHERE id=$1", [id]);
    if (existing.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Quiz not found" });
    }

    await client.query(
      "UPDATE quizzes SET title=$1,description=$2,duration=$3 WHERE id=$4",
      [String(title).trim(), description || "", Number(duration) || 10, id]
    );

    await client.query("DELETE FROM questions WHERE quiz_id=$1", [id]);

    for (const q of questions) {
      const options = Array.isArray(q.options) ? q.options : [];
      if (!q.text || options.length < 4) {
        throw new Error("Each question must have text and four options");
      }
      await client.query(
        "INSERT INTO questions(quiz_id,text,a,b,c,d,correct) VALUES($1,$2,$3,$4,$5,$6,$7)",
        [id, q.text, options[0], options[1], options[2], options[3], Number(q.correct) || 0]
      );
    }

    await client.query("COMMIT");
    res.json({ ok: true });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(400).json({ error: err.message || "Failed to update quiz" });
  } finally {
    client.release();
  }
});

app.delete("/api/quizzes/:id", async (req, res) => {
  try {
    const result = await pool.query("DELETE FROM quizzes WHERE id=$1 RETURNING id", [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Quiz not found" });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete quiz" });
  }
});

app.patch("/api/quizzes/:id/publish", async (req, res) => {
  try {
    const result = await pool.query(
      "UPDATE quizzes SET published=$1 WHERE id=$2 RETURNING id,published",
      [Boolean(req.body.published), req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Quiz not found" });
    }
    res.json({ ok: true, published: result.rows[0].published });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to change quiz status" });
  }
});

app.get("/api/results", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM results ORDER BY id DESC");
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load results" });
  }
});

app.post("/api/results", async (req, res) => {
  const { quizId, student, roll, answers = {} } = req.body;

  try {
    const quizResult = await pool.query("SELECT id FROM quizzes WHERE id=$1", [quizId]);
    if (quizResult.rows.length === 0) {
      return res.status(404).json({ error: "Quiz not found" });
    }

    const questionsResult = await pool.query(
      "SELECT id,correct FROM questions WHERE quiz_id=$1 ORDER BY id",
      [quizId]
    );
    const questions = questionsResult.rows;

    if (questions.length === 0) {
      return res.status(400).json({ error: "Quiz has no questions" });
    }

    const score = questions.reduce(
      (n, q) => n + (Number(answers[q.id]) === q.correct ? 1 : 0),
      0
    );
    const total = questions.length;
    const percentage = Math.round((score * 100) / total);

    await pool.query(
      "INSERT INTO results(quiz_id,student,roll,score,total,percentage,submitted_at) VALUES($1,$2,$3,$4,$5,$6,NOW())",
      [quizId, student || "", roll || "", score, total, percentage]
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
  .then(() => {
    app.listen(port, "0.0.0.0", () => {
      console.log(`QuizMaster API running on port ${port}`);
    });
  })
  .catch((err) => {
    console.error("Failed to initialize PostgreSQL database:", err);
    process.exit(1);
  });

process.on("SIGTERM", async () => {
  await pool.end();
  process.exit(0);
});
