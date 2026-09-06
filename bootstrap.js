const fs=require('fs');
const p='index.html';
let h=fs.readFileSync(p,'utf8');
const tag='<script src="/question-importer-ui.js"></script>';
const resetTag='<script src="/reset-system-ui.js"></script>';
if(!h.includes(tag)||!h.includes(resetTag)){h=h.replace('</body>',(!h.includes(tag)?tag:'')+(!h.includes(resetTag)?resetTag:'')+'</body>');fs.writeFileSync(p,h)}
require('./intruder-security-v2.js');
require('./exam-security-events.js');
require('./student-phone.js');
require('./student-report.js');
require('./student-performance-ui.js');
// feature-pack.js contains a generated server-side template that must preserve
// ${exam.title} for the runtime result handler. Seed a literal placeholder while
// the feature pack is evaluated, then remove it immediately after loading.
global.exam={title:'${exam.title}'};
try{require('./feature-pack.js')}finally{delete global.exam}
require('./start.js');
