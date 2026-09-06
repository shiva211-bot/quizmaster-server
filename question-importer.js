const fs=require('fs');
const multer=require('multer');
const pdfParse=require('pdf-parse');
const mammoth=require('mammoth');
const p='server.js';
let s=fs.readFileSync(p,'utf8');
const marker='/* QUIZMASTER_QUESTION_IMPORTER_V1 */';
if(s.includes(marker)) process.exit(0);
const code=`
${marker}
const __qmUpload=multer({storage:multer.memoryStorage(),limits:{fileSize:10*1024*1024,files:1}});
function __qmLine(v){return String(v||'').replace(/\\u00a0/g,' ').replace(/[ \\t]+/g,' ').trim()}
function __qmQ(v){return v.match(/^\\s*(?:Q(?:uestion)?\\s*)?(\\d{1,4})[.)]\\s*(.*)$/i)}
function __qmO(v){let m=v.match(/^\\s*\\(?([A-Da-d])\\)?[.)]?(?:\\s+|$)(.*)$/);if(m)return [m[1].toUpperCase(),m[2]||''];m=v.match(/^\\s*([1-4])[.)]\\s+(.*)$/);return m?[String.fromCharCode(64+Number(m[1])),m[2]]:null}
function __qmKey(v){const out=[];const r=/(?:Q(?:uestion)?\\s*)?(\\d{1,4})\\s*(?:[-:.)]|=>)?\\s*([A-Da-d])\\b/gi;let m;while((m=r.exec(v||'')))out.push([Number(m[1]),m[2].toUpperCase()]);return out}
function __qmParse(raw){
 const lines=String(raw||'').replace(/\\r/g,'').split('\\n').map(__qmLine).filter(Boolean), qs=[];let q=null,key=false,keyText='';
 for(const line of lines){
  if(/^answer\\s*key|^correct\\s*answers?\\b|^answers?\\s*[:=-]?\\s*$/i.test(line)){key=true;continue}
  if(key){keyText+=' '+line;continue}
  const a=__qmQ(line);if(a){if(q)qs.push(q);q={number:+a[1],text:a[2]||'',o:{A:'',B:'',C:'',D:''}};continue}
  if(!q)continue;const o=__qmO(line);if(o){q.o[o[0]]=__qmLine((q.o[o[0]]?q.o[o[0]]+' ':'')+o[1]);continue}
  const last=['A','B','C','D'].filter(k=>q.o[k]).pop();if(last)q.o[last]=__qmLine(q.o[last]+' '+line);else q.text=__qmLine(q.text+' '+line);
 }
 if(q)qs.push(q);
 const pairs=__qmKey(keyText), amap=new Map(), dup=new Set();for(const [n,a] of pairs){if(amap.has(n)&&amap.get(n)!==a)dup.add(n);amap.set(n,a)}
 const errors=[],warnings=[],nums=new Set();
 for(const x of qs){if(nums.has(x.number))errors.push('Duplicate question number '+x.number);nums.add(x.number);const miss=['A','B','C','D'].filter(k=>!x.o[k]);if(!x.text)errors.push('Question '+x.number+' has no question text');if(miss.length)errors.push('Question '+x.number+' is missing option(s): '+miss.join(', '));const a=amap.get(x.number);if(a&&!x.o[a])errors.push('Question '+x.number+' answer key points to missing option '+a);if(!a)warnings.push('Question '+x.number+' has no answer-key entry')}
 for(const [n] of pairs)if(!nums.has(n))warnings.push('Answer key contains question '+n+' which was not detected');for(const n of dup)errors.push('Conflicting answer-key entries for question '+n);
 const good=qs.filter(x=>x.text&&['A','B','C','D'].every(k=>x.o[k]));
 return {questions:good.map(x=>({number:x.number,text:x.text,type:'mcq',options:[x.o.A,x.o.B,x.o.C,x.o.D],correct:amap.has(x.number)?['A','B','C','D'].indexOf(amap.get(x.number)):null})),totalQuestions:qs.length,answersDetected:pairs.length,answerKeyDetected:pairs.length>0,errors,warnings};
}
app.post('/api/teacher/import-questions',auth,teacherOnly,__qmUpload.single('file'),async(req,res)=>{try{if(!req.file)return res.status(400).json({error:'A PDF, DOCX, or TXT file is required'});const n=String(req.file.originalname||'').toLowerCase();let text='';if(n.endsWith('.pdf')){if(req.file.buffer.slice(0,4).toString()!=='%PDF')return res.status(400).json({error:'Invalid PDF file'});text=(await pdfParse(req.file.buffer)).text||''}else if(n.endsWith('.docx')){if(req.file.buffer.slice(0,2).toString()!=='PK')return res.status(400).json({error:'Invalid DOCX file'});text=(await mammoth.extractRawText({buffer:req.file.buffer})).value||''}else if(n.endsWith('.txt'))text=req.file.buffer.toString('utf8');else return res.status(400).json({error:'Unsupported file type. Use PDF, DOCX, or TXT'});if(!text.trim())return res.status(422).json({error:'No readable text found. Scanned PDFs need OCR.'});const r=__qmParse(text);r.filename=req.file.originalname;r.fileType=n.endsWith('.pdf')?'pdf':n.endsWith('.docx')?'docx':'txt';r.extractedCharacters=text.length;if(!r.totalQuestions)return res.status(422).json({error:'No numbered questions with options were detected',result:r});res.json(r)}catch(e){console.error('Question import:',e);if(e instanceof multer.MulterError&&e.code==='LIMIT_FILE_SIZE')return res.status(413).json({error:'File too large. Maximum size is 10 MB.'});res.status(422).json({error:'Could not read the file'})}});
`;
s+=code;
fs.writeFileSync(p,s);
