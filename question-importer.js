const fs=require('fs');
const p='server.js';
let s=fs.readFileSync(p,'utf8');
const marker='/* QUIZMASTER_QUESTION_IMPORTER_V6 */';
const oldMarkers=['/* QUIZMASTER_QUESTION_IMPORTER_V5 */','/* QUIZMASTER_QUESTION_IMPORTER_V4 */','/* QUIZMASTER_QUESTION_IMPORTER_V3 */','/* QUIZMASTER_QUESTION_IMPORTER_V2 */','/* QUIZMASTER_QUESTION_IMPORTER_V1 */'];
for(const m of oldMarkers)if(s.includes(m)){s=s.slice(0,s.indexOf(m));break}
if(s.includes(marker))process.exit(0);
const oldValidation='const o=Array.isArray(q.options)?q.options.map(cleanText):[q.a,q.b,q.c,q.d].map(cleanText),c=Number(q.correct);if(o.length!==4||o.some(x=>!x))throw Error("MCQ questions require four options");if(![0,1,2,3].includes(c))throw Error("MCQ correct option is required");return{text,type,a:o[0],b:o[1],c:o[2],d:o[3],correct:c,answer:""}'
const newValidation='let o=Array.isArray(q.options)?q.options.map(cleanText):[q.a,q.b,q.c,q.d].map(cleanText);while(o.length&&o[o.length-1]==="")o.pop();const c=Number(q.correct);if(o.length<2||o.length>4||o.some(x=>!x))throw Error("MCQ questions require two to four options");if(c<0||c>=o.length)throw Error("MCQ correct option is required");return{text,type,a:o[0]||"",b:o[1]||"",c:o[2]||"",d:o[3]||"",correct:c,answer:""}'
if(s.includes(oldValidation))s=s.replace(oldValidation,newValidation);
const code=`
${marker}
const multer=require("multer");const pdfParse=require("pdf-parse");const mammoth=require("mammoth");
const __qmUpload=multer({storage:multer.memoryStorage(),limits:{fileSize:10*1024*1024,files:1}});
function __qmLine(v){return String(v||'').replace(/\\u00a0/g,' ').replace(/[ \\t]+/g,' ').trim()}
function __qmQ(v){return v.match(/^\\s*(?:Q(?:uestion)?\\s*)?(\\d{1,4})[.)]\\s*(.*)$/i)}
function __qmO(v){let m=v.match(/^\\s*\\(?([A-Da-d])\\)?[.)]\\s*(.*)$/);if(m)return [m[1].toUpperCase(),m[2]||''];m=v.match(/^\\s*([A-Da-d])\\s+(.*)$/);if(m)return [m[1].toUpperCase(),m[2]||''];m=v.match(/^\\s*([1-4])[.)]\\s*(.*)$/);return m?[String.fromCharCode(64+Number(m[1])),m[2]]:null}
function __qmInlineAnswer(v){const m=v.match(/^\\s*(?:answer|ans)\\s*[:=-]\\s*([A-Da-d])\\b/i);return m?m[1].toUpperCase():null}
function __qmBareAnswer(v){const m=v.match(/^\\s*([A-Da-d])\\s*[.)]?\\s*$/);return m?m[1].toUpperCase():null}
function __qmKey(v){const out=[];const r=/(?:Q(?:uestion)?\\s*)?(\\d{1,4})\\s*(?:[-:.)]|=>)\\s*([A-Da-d])\\b/gi;let m;while((m=r.exec(v||'')))out.push([Number(m[1]),m[2].toUpperCase()]);return out}
function __qmParse(raw){
 const lines=String(raw||'').replace(/\\r/g,'').split('\\n').map(__qmLine).filter(Boolean);const qs=[];let q=null,explicitKey=false,keyText='';
 const push=()=>{if(q){q.text=__qmLine(q.text);for(const k of ['A','B','C','D'])q.o[k]=__qmLine(q.o[k]);qs.push(q)}q=null};
 for(const line of lines){
  if(/^\\s*(?:MCQ\\b|MCQ-|Unit-\\d|Reengineering$|Data Modeling analysis$)/i.test(line)){push();continue}
  if(/^\\s*(?:answer\\s*key|correct\\s*answers?)\\s*[:=-]?\\s*$/i.test(line)||/^\\s*key\\s*[:=-]\\s*$/i.test(line)){push();explicitKey=true;continue}
  if(explicitKey){keyText+=' '+line;continue}
  if(/^\\s*view\\s+answer\\s*$/i.test(line))continue;
  const qa=__qmQ(line);if(qa){push();let txt=qa[2]||'',ans=null;const ta=txt.match(/\\s([A-Da-d])\\s*$/);if(ta){ans=ta[1].toUpperCase();txt=txt.slice(0,ta.index).trim()}q={number:Number(qa[1]),text:txt,o:{A:'',B:'',C:'',D:''},answer:ans};continue}
  if(!q)continue;
  const ia=__qmInlineAnswer(line);if(ia){q.answer=ia;continue}
  const ba=!Object.values(q.o).some(Boolean)?__qmBareAnswer(line):null;if(ba){q.answer=ba;continue}
  const o=__qmO(line);if(o){q.o[o[0]]=__qmLine((q.o[o[0]]?q.o[o[0]]+' ':'')+o[1]);continue}
  const last=['D','C','B','A'].find(k=>q.o[k]);if(last)q.o[last]=__qmLine(q.o[last]+' '+line);else q.text=__qmLine(q.text+' '+line);
 }
 push();
 const pairs=__qmKey(keyText),uniqueKeys=new Map();for(const [n,a] of pairs){if(!uniqueKeys.has(n))uniqueKeys.set(n,a)}
 const errors=[],warnings=[],good=[];
 qs.forEach((x,i)=>{const miss=['A','B','C','D'].filter(k=>!x.o[k]);if(!x.text)errors.push('Question '+(i+1)+' has no question text');const multi=/select\\s+all\\s+possible\\s+options?/i.test(x.text);if(multi)errors.push('Question '+(i+1)+' is a multi-select question; single-answer import is required.');const two=miss.length===2&&x.o.A&&x.o.B&&/^True$|^False$/i.test(x.o.A)&&/^True$|^False$/i.test(x.o.B);if(miss.length>0&&!two&&!multi)errors.push('Question '+(i+1)+' is missing option(s): '+miss.join(', '));if(!x.answer&&uniqueKeys.has(x.number))x.answer=uniqueKeys.get(x.number);if(!x.answer)warnings.push('Question '+(i+1)+' has no answer-key entry');if(x.answer&&!x.o[x.answer])errors.push('Question '+(i+1)+' answer key points to missing option '+x.answer);if(x.text&&!miss.length)good.push(x);else if(x.text&&two&&x.answer)good.push(x)});
 for(const [n] of uniqueKeys)if(!qs.some(x=>x.number===n))warnings.push('Answer key contains question '+n+' which was not detected');
 return {questions:good.filter(x=>!/select\\s+all\\s+possible\\s+options?/i.test(x.text)).map((x,i)=>({number:i+1,text:x.text,type:'mcq',options:[x.o.A,x.o.B,x.o.C,x.o.D].filter(Boolean),correct:x.answer?['A','B','C','D'].indexOf(x.answer):null})),totalQuestions:qs.length,answersDetected:qs.filter(x=>x.answer).length,answerKeyDetected:qs.some(x=>x.answer)||uniqueKeys.size>0,errors,warnings};
}
app.post('/api/teacher/import-questions',auth,teacherOnly,__qmUpload.single('file'),async(req,res)=>{try{if(!req.file)return res.status(400).json({error:'A PDF, DOCX, or TXT file is required'});const n=String(req.file.originalname||'').toLowerCase();let text='';if(n.endsWith('.pdf')){if(req.file.buffer.slice(0,4).toString()!=='%PDF')return res.status(400).json({error:'Invalid PDF file'});text=(await pdfParse(req.file.buffer)).text||''}else if(n.endsWith('.docx')){if(req.file.buffer.slice(0,2).toString()!=='PK')return res.status(400).json({error:'Invalid DOCX file'});text=(await mammoth.extractRawText({buffer:req.file.buffer})).value||''}else if(n.endsWith('.txt'))text=req.file.buffer.toString('utf8');else return res.status(400).json({error:'Unsupported file type. Use PDF, DOCX, or TXT'});if(!text.trim())return res.status(422).json({error:'No readable text found. Scanned PDFs need OCR.'});const r=__qmParse(text);r.filename=req.file.originalname;r.fileType=n.endsWith('.pdf')?'pdf':n.endsWith('.docx')?'docx':'txt';r.extractedCharacters=text.length;if(!r.totalQuestions)return res.status(422).json({error:'No numbered questions with options were detected',result:r});res.json(r)}catch(e){console.error('Question import:',e);if(e instanceof multer.MulterError&&e.code==='LIMIT_FILE_SIZE')return res.status(413).json({error:'File too large. Maximum size is 10 MB.'});res.status(422).json({error:'Could not read the file'})}});
`;
s+=code;fs.writeFileSync(p,s);