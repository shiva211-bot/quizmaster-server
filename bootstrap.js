const fs=require('fs');
const p='index.html';
let h=fs.readFileSync(p,'utf8');
const tag='<script src="/question-importer-ui.js"></script>';
if(!h.includes(tag)){h=h.replace('</body>',tag+'</body>');fs.writeFileSync(p,h)}
require('./exam-security-events.js');
require('./start.js');
