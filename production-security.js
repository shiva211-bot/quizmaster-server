const fs=require('fs');
const p='server.js';
let s=fs.readFileSync(p,'utf8');

const securityMarker='const app=express();';
const securityCode='const app=express();app.disable("x-powered-by");app.set("trust proxy",1);const helmet=require("helmet");const rateLimit=require("express-rate-limit");app.use(helmet({contentSecurityPolicy:false,crossOriginEmbedderPolicy:false}));const apiLimiter=rateLimit({windowMs:15*60*1000,max:300,standardHeaders:true,legacyHeaders:false,message:{error:"Too many requests. Please try again later."}});app.use("/api/",apiLimiter);';
if(s.includes(securityMarker)&&!s.includes('const helmet=require("helmet")'))s=s.replace(securityMarker,securityCode);

const corsMarker='app.use(cors());';
const corsReplacement='app.use(cors({origin:(origin,callback)=>{const allowed=String(process.env.CORS_ORIGIN||"").split(",").map(x=>x.trim()).filter(Boolean);if(!origin||!allowed.length||allowed.includes(origin))return callback(null,true);return callback(new Error("CORS origin not allowed"));},credentials:false}));';
if(s.includes(corsMarker)&&!s.includes('CORS_ORIGIN'))s=s.replace(corsMarker,corsReplacement);

const authMarker='app.post("/api/auth/login",async(req,res)=>';
const authRate='const loginLimiter=rateLimit({windowMs:15*60*1000,max:20,standardHeaders:true,legacyHeaders:false,message:{error:"Too many login attempts. Please try again later."}});app.use("/api/auth/login",loginLimiter);app.use("/api/auth/register",loginLimiter);';
if(s.includes(authMarker)&&!s.includes('const loginLimiter='))s=s.replace(authMarker,authRate+authMarker);

fs.writeFileSync(p,s);
