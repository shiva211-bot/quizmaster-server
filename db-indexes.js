const {Pool}=require('pg');

async function ensureIndexes(){
  if(!process.env.DATABASE_URL)return;
  const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false},max:1,connectionTimeoutMillis:5000});
  try{
    await pool.query('CREATE INDEX IF NOT EXISTS idx_sessions_user_expires ON sessions(user_id,expires_at)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_quizzes_class_published ON quizzes(class_level,published,id DESC)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_questions_quiz ON questions(quiz_id,id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_results_user_submitted ON results(user_id,submitted_at DESC)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_results_quiz_submitted ON results(quiz_id,submitted_at DESC)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_notifications_class_created ON notifications(class_level,created_at DESC,id DESC)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_notification_reads_user ON notification_reads(user_id,notification_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_result_answers_result ON result_answers(result_id,id)');
    await pool.query('ANALYZE sessions,quizzes,questions,results,notifications,notification_reads,result_answers');
    console.log('QuizMaster performance indexes and planner statistics ready');
  }catch(e){
    console.error('Performance index migration skipped:',e.message);
  }finally{
    await pool.end();
  }
}

setTimeout(()=>ensureIndexes(),2000);
