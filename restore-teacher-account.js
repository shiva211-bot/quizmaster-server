const {Pool}=require('pg');
if(process.env.DATABASE_URL){
  (async()=>{
    const p=new URL(process.env.DATABASE_URL);
    p.searchParams.delete('sslmode');
    p.searchParams.delete('uselibpqcompat');
    const pool=new Pool({connectionString:p.toString(),ssl:{rejectUnauthorized:false},max:1});
    try{
      await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'");
      await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ");
      await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_count INTEGER NOT NULL DEFAULT 0");
      await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS last_failed_login_at TIMESTAMPTZ");
      await pool.query("UPDATE users SET status='active',locked_until=NULL,failed_login_count=0,last_failed_login_at=NULL WHERE role='teacher'");
      console.log('QuizMaster teacher accounts restored to active state.');
    }catch(e){ console.error('Teacher account restore failed:',e.message); process.exitCode=1; }
    finally{ await pool.end(); }
  })();
}
