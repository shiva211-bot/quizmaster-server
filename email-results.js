const fs=require('fs');
const serverPath='server.js';
let s=fs.readFileSync(serverPath,'utf8');
const classLine='await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS class_level INTEGER");';
const emailAlter='await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT");';
if(!s.includes(emailAlter)){if(!s.includes(classLine))throw new Error('email patch: class_level marker not found');s=s.replace(classLine,classLine+emailAlter,1)}
const regOld='const {username,password,name,roll,phone,classLevel}=req.body,u=cleanText(username).toLowerCase(),n=cleanText(name),r=cleanText(roll),ph=cleanText(phone),cl=validClass(classLevel);';
const regNew='const {username,password,name,roll,phone,email,classLevel}=req.body,u=cleanText(username).toLowerCase(),n=cleanText(name),r=cleanText(roll),ph=cleanText(phone),em=cleanText(email).toLowerCase(),cl=validClass(classLevel);';
if(s.includes(regOld))s=s.replace(regOld,regNew,1);
const reqOld='if(!n||!ph)return res.status(400).json({error:"Name and phone number are required"});if(!/^\\d{10}$/.test(ph))return res.status(400).json({error:"Phone number must be exactly 10 digits"});';
const reqNew='if(!n||!ph||!em)return res.status(400).json({error:"Name, phone number and email are required"});if(!/^\\d{10}$/.test(ph))return res.status(400).json({error:"Phone number must be exactly 10 digits"});if(!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(em))return res.status(400).json({error:"Enter a valid email address"});';
if(s.includes(reqOld))s=s.replace(reqOld,reqNew,1);
const insOld="INSERT INTO users(username,password_hash,role,name,roll,phone,class_level) VALUES($1,$2,'student',$3,$4,$5,$6) RETURNING id,username,role,name,roll,phone,class_level";
const insNew="INSERT INTO users(username,password_hash,role,name,roll,phone,email,class_level) VALUES($1,$2,'student',$3,$4,$5,$6,$7) RETURNING id,username,role,name,roll,phone,email,class_level";
if(s.includes(insOld))s=s.replace(insOld,insNew,1);
const argsOld='[u,await hashPassword(password),n,r,ph,cl]';
const argsNew='[u,await hashPassword(password),n,r,ph,em,cl]';
if(s.includes(argsOld))s=s.replace(argsOld,argsNew,1);
s=s.replace('SELECT id,username,password_hash,role,name,roll,phone,class_level FROM users WHERE username=$1','SELECT id,username,password_hash,role,name,roll,phone,email,class_level FROM users WHERE username=$1',1);
s=s.replace('SELECT u.id,u.username,u.role,u.name,u.roll,u.phone,u.class_level,s.expires_at','SELECT u.id,u.username,u.role,u.name,u.roll,u.phone,u.email,u.class_level,s.expires_at',1);
s=s.replace('name:req.user.name,roll:req.user.roll,phone:req.user.phone,class_level:req.user.class_level','name:req.user.name,roll:req.user.roll,phone:req.user.phone,email:req.user.email,class_level:req.user.class_level',1);
if(!s.includes('async function sendResultEmail(')){
 const marker='app.get("*",(req,res,next)=>';
 const fn='async function sendResultEmail(to,body){try{const url=process.env.EMAIL_API_URL,key=process.env.EMAIL_API_KEY,from=process.env.EMAIL_FROM;if(!url||!key||!from||!to)return {sent:false,reason:"Email provider is not configured"};const r=await fetch(url,{method:"POST",headers:{Authorization:"Bearer "+key,"Content-Type":"application/json"},body:JSON.stringify({from,to,subject:"QuizMaster Test Result",text:body})});if(!r.ok){const t=await r.text();console.error("Email send failed:",r.status,t);return {sent:false,reason:"Email provider rejected the message"}}return {sent:true}}catch(e){console.error("Email send error:",e);return {sent:false,reason:"Email send failed"}}}'+String.fromCharCode(10);
 if(!s.includes(marker))throw new Error('email patch: catch-all marker not found');
 s=s.replace(marker,fn+marker,1);
}
fs.writeFileSync(serverPath,s);
const fpPath='feature-pack.js';
let f=fs.readFileSync(fpPath,'utf8');
if(!f.includes('emailSent:Boolean(email.sent)')){
 const re=/const sms=await sendResultSms\(req\.user\.phone,([\s\S]*?)\);res\.json\(\{resultId,score,total,percentage,smsSent:Boolean\(sms\.sent\)\}\)/;
 if(!re.test(f))throw new Error('email patch: result submission block not found');
 const emailBody='"QuizMaster result "+String.fromCharCode(10,10)+"Quiz: "+exam.title+String.fromCharCode(10)+"Score: "+score+"/"+total+String.fromCharCode(10)+"Percentage: "+percentage+"%"+String.fromCharCode(10,10)+"Open QuizMaster to view the full result and corrections."';
 f=f.replace(re,(full,args)=>'const sms=await sendResultSms(req.user.phone,'+args+');const email=await sendResultEmail(req.user.email,'+emailBody+');res.json({resultId,score,total,percentage,smsSent:Boolean(sms.sent),emailSent:Boolean(email.sent)})');
 fs.writeFileSync(fpPath,f);
}
console.log('QuizMaster email result delivery patch applied');
