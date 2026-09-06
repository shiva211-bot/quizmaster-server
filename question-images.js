const fs=require('fs');
const serverPath='server.js';
let s=fs.readFileSync(serverPath,'utf8');

s=s.replace('app.use(express.json());','app.use(express.json({limit:"4mb"}));');
const qcol='await pool.query("ALTER TABLE questions ADD COLUMN IF NOT EXISTS answer TEXT NOT NULL DEFAULT \'\'");';
const qcol2=qcol+'await pool.query("ALTER TABLE questions ADD COLUMN IF NOT EXISTS image_data TEXT NOT NULL DEFAULT \'\'");';
if(s.includes(qcol)&&!s.includes('ALTER TABLE questions ADD COLUMN IF NOT EXISTS image_data'))s=s.replace(qcol,qcol2);

const selectOld='SELECT id,text,a,b,c,d,correct,question_type,answer FROM questions WHERE quiz_id=$1 ORDER BY id';
const selectNew='SELECT id,text,a,b,c,d,correct,question_type,answer,image_data FROM questions WHERE quiz_id=$1 ORDER BY id';
if(s.includes(selectOld))s=s.replace(selectOld,selectNew);

const clientOld='const q={id:r.id,text:r.text,type:validType(r.question_type),a:r.a||"",b:r.b||"",c:r.c||"",d:r.d||""};';
const clientNew='const q={id:r.id,text:r.text,type:validType(r.question_type),a:r.a||"",b:r.b||"",c:r.c||"",d:r.d||"",imageData:r.image_data||""};';
if(s.includes(clientOld))s=s.replace(clientOld,clientNew);

const validateOld='const type=validType(q?.type||q?.question_type),text=cleanText(q?.text);';
const validateNew='const type=validType(q?.type||q?.question_type),text=cleanText(q?.text),imageData=String(q?.imageData||q?.image_data||"");if(imageData&&!/^data:image\\/(png|jpe?g|gif|webp);base64,/i.test(imageData))throw Error("Question image must be a PNG, JPG, GIF, or WebP image");if(imageData.length>3500000)throw Error("Question image is too large. Please use an image under about 2.5 MB");';
if(s.includes(validateOld)&&!s.includes('Question image must be a PNG'))s=s.replace(validateOld,validateNew);

s=s.replace('return{text,type,a:o[0],b:o[1],c:o[2],d:o[3],correct:c,answer:""}','return{text,type,a:o[0],b:o[1],c:o[2],d:o[3],correct:c,answer:"",imageData}');
s=s.replace('return{text,type,a:"",b:"",c:"",d:"",correct:0,answer}}','return{text,type,a:"",b:"",c:"",d:"",correct:0,answer,imageData}}');

const insertOld='INSERT INTO questions(quiz_id,text,a,b,c,d,correct,question_type,answer) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)';
const insertNew='INSERT INTO questions(quiz_id,text,a,b,c,d,correct,question_type,answer,image_data) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)';
if(s.includes(insertOld))s=s.replace(insertOld,insertNew);
s=s.replace('[qid,x.text,x.a,x.b,x.c,x.d,x.correct,x.type,x.answer]);','[qid,x.text,x.a,x.b,x.c,x.d,x.correct,x.type,x.answer,x.imageData]);');

fs.writeFileSync(serverPath,s);

let h=fs.readFileSync('index.html','utf8');
const tag='<script src="/question-image-ui.js"></script>';
if(!h.includes(tag)){h=h.replace('</body>',tag+'</body>');fs.writeFileSync('index.html',h)}

require('./start.js');
