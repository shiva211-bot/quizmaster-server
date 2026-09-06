const fs=require('fs');
const p='server.js';
let s=fs.readFileSync(p,'utf8');
const tableLine='await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS class_level INTEGER");';
if(!s.includes('await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT")')){
  if(s.includes(tableLine))s=s.replace(tableLine,tableLine+'await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT");',1);
}
const old='const {username,password,name,roll,classLevel}=req.body,u=cleanText(username).toLowerCase(),n=cleanText(name),r=cleanText(roll),cl=validClass(classLevel);';
const neu='const {username,password,name,roll,phone,classLevel}=req.body,u=cleanText(username).toLowerCase(),n=cleanText(name),r=cleanText(roll),ph=cleanText(phone),cl=validClass(classLevel);';
if(s.includes(old))s=s.replace(old,neu,1);
const oldReq='if(!n||!r)return res.status(400).json({error:"Name and roll number are required"});';
const neuReq='if(!n||!r||!ph)return res.status(400).json({error:"Name, roll number and phone number are required"});if(!/^\\d{10}$/.test(ph))return res.status(400).json({error:"Phone number must be exactly 10 digits"});';
if(s.includes(oldReq))s=s.replace(oldReq,neuReq,1);
const oldInsert='INSERT INTO users(username,password_hash,role,name,roll,class_level) VALUES($1,$2,\'student\',$3,$4,$5) RETURNING id,username,role,name,roll,class_level';
const newInsert='INSERT INTO users(username,password_hash,role,name,roll,phone,class_level) VALUES($1,$2,\'student\',$3,$4,$5,$6) RETURNING id,username,role,name,roll,phone,class_level';
if(s.includes(oldInsert))s=s.replace(oldInsert,newInsert,1);
const oldArgs='[u,await hashPassword(password),n,r,cl]';
const newArgs='[u,await hashPassword(password),n,r,ph,cl]';
if(s.includes(oldArgs))s=s.replace(oldArgs,newArgs,1);
const oldLogin='SELECT id,username,password_hash,role,name,roll,class_level FROM users WHERE username=$1';
const newLogin='SELECT id,username,password_hash,role,name,roll,phone,class_level FROM users WHERE username=$1';
if(s.includes(oldLogin))s=s.replace(oldLogin,newLogin,1);
const oldAuth='SELECT u.id,u.username,u.role,u.name,u.roll,u.class_level,s.expires_at';
const newAuth='SELECT u.id,u.username,u.role,u.name,u.roll,u.phone,u.class_level,s.expires_at';
if(s.includes(oldAuth))s=s.replace(oldAuth,newAuth,1);
const oldMe='res.json({user:{id:req.user.id,username:req.user.username,role:req.user.role,name:req.user.name,roll:req.user.roll,class_level:req.user.class_level}})';
const newMe='res.json({user:{id:req.user.id,username:req.user.username,role:req.user.role,name:req.user.name,roll:req.user.roll,phone:req.user.phone,class_level:req.user.class_level}})';
if(s.includes(oldMe))s=s.replace(oldMe,newMe,1);
fs.writeFileSync(p,s);
