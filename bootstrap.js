const fs=require('fs');
const p='index.html';
let h=fs.readFileSync(p,'utf8');
const tag='<script src="/question-importer-ui.js"></script>';
const resetTag='<script src="/reset-system-ui.js"></script>';
const passwordRowTag='<script src="/student-password-reset-row-ui.js"></script>';
const refreshFixTag='<script src="/admin-refresh-fix.js"></script>';
const neededTags=( !h.includes(tag)?tag:'' )+( !h.includes(resetTag)?resetTag:'' )+( !h.includes(passwordRowTag)?passwordRowTag:'' )+( !h.includes(refreshFixTag)?refreshFixTag:'' );
if(neededTags)h=h.replace('</body>',neededTags+'</body>');
fs.writeFileSync(p,h);
require('./intruder-security-v2.js');
require('./exam-security-events.js');
require('./student-phone.js');
require('./student-report.js');
require('./student-performance-ui.js');
// feature-pack.js contains generated server-side templates that must preserve
// runtime placeholders such as ${exam.title}, ${score}, ${total}, ${percentage},
// and ${questionOrder}. Seed literal placeholders while the feature pack is evaluated.
global.exam={title:'${exam.title}'};
global.score='${score}';
global.total='${total}';
global.percentage='${percentage}';
global.questionOrder='${questionOrder}';
try{require('./feature-pack.js')}finally{delete global.exam;delete global.score;delete global.total;delete global.percentage;delete global.questionOrder}
require('./start.js');
require('./db-indexes.js');
