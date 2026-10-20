const express=require('express');
const helmet=require('helmet');
const rateLimit=require('express-rate-limit');
const nodemailer=require('nodemailer');
const fs=require('fs');const path=require('path');const crypto=require('crypto');
const {attachPortfolioRoutes}=require('./portfolio');
require('dotenv').config({path:path.join(__dirname,'.env')});
const app=express(),PORT=Number(process.env.PORT||3000),ROOT=__dirname;
const DATA=path.join(ROOT,'data'),LEADS=path.join(DATA,'leads.json');
const ADMIN_AUTH=path.join(DATA,'admin-auth.json');
let adminUser=process.env.ADMIN_USERNAME||'admin',adminPass=process.env.ADMIN_PASSWORD,adminToken=process.env.ADMIN_TOKEN;
let adminPasswordHash=null,adminPasswordSalt=null;
fs.mkdirSync(DATA,{recursive:true});if(!fs.existsSync(LEADS))fs.writeFileSync(LEADS,'[]',{mode:0o600});
if(fs.existsSync(ADMIN_AUTH)){const saved=JSON.parse(fs.readFileSync(ADMIN_AUTH,'utf8'));if(typeof saved.username!=='string'||typeof saved.passwordHash!=='string'||typeof saved.passwordSalt!=='string'||typeof saved.token!=='string')throw new Error('Admin credential file is invalid. Remove data/admin-auth.json and configure admin credentials again.');adminUser=saved.username;adminPasswordHash=saved.passwordHash;adminPasswordSalt=saved.passwordSalt;adminToken=saved.token}
app.disable('x-powered-by');app.use(helmet({contentSecurityPolicy:{directives:{defaultSrc:["'self'"],scriptSrc:["'self'"],styleSrc:["'self'","'unsafe-inline'",'https://fonts.googleapis.com'],fontSrc:["'self'",'https://fonts.gstatic.com','data:'],imgSrc:["'self'","blob:",'data:','https:'],connectSrc:["'self'"],objectSrc:["'none'"],upgradeInsecureRequests:null}}}));
app.use('/api/admin/portfolio',express.json({limit:'2mb'}));app.use(express.json({limit:'20kb'}));app.use(express.urlencoded({extended:false,limit:'20kb'}));
const contactLimiter=rateLimit({windowMs:15*60*1000,limit:60,standardHeaders:true,legacyHeaders:false});
const adminLoginLimiter=rateLimit({windowMs:15*60*1000,limit:200,standardHeaders:true,legacyHeaders:false});
const passwordResetLimiter=rateLimit({windowMs:15*60*1000,limit:5,standardHeaders:true,legacyHeaders:false});
const clean=(v,n=500)=>String(v??'').trim().replace(/[<>]/g,'').slice(0,n);
const equal=(a,b)=>{const x=Buffer.from(String(a)),y=Buffer.from(String(b));return x.length===y.length&&crypto.timingSafeEqual(x,y)};
const read=()=>{try{let d=JSON.parse(fs.readFileSync(LEADS,'utf8'));return Array.isArray(d)?d:[]}catch{return[]}};
const write=d=>fs.writeFileSync(LEADS,JSON.stringify(d,null,2),{mode:0o600});
function verifyAdminPassword(candidate){if(adminPasswordHash){const hash=crypto.scryptSync(String(candidate),adminPasswordSalt,64).toString('hex');return equal(hash,adminPasswordHash)}return Boolean(adminPass)&&equal(candidate,adminPass)}
function persistAdminCredentials(username,password){const salt=crypto.randomBytes(16).toString('hex'),passwordHash=crypto.scryptSync(password,salt,64).toString('hex'),token=crypto.randomBytes(32).toString('hex'),temporary=`${ADMIN_AUTH}.${process.pid}.tmp`;fs.writeFileSync(temporary,JSON.stringify({username,passwordSalt:salt,passwordHash,token}),{mode:0o600});fs.renameSync(temporary,ADMIN_AUTH);adminUser=username;adminPasswordHash=passwordHash;adminPasswordSalt=salt;adminPass=undefined;adminToken=token}
const resetTokens=new Map();
const mailConfig={host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT||587),secure:process.env.SMTP_SECURE==='true',user:process.env.SMTP_USER,password:process.env.SMTP_PASSWORD,from:process.env.SMTP_FROM,to:process.env.ADMIN_RESET_EMAIL,appUrl:process.env.APP_URL};
const mailReady=Boolean(mailConfig.host&&mailConfig.port&&mailConfig.user&&mailConfig.password&&mailConfig.from&&mailConfig.to&&mailConfig.appUrl);
const mailer=mailReady?nodemailer.createTransport({host:mailConfig.host,port:mailConfig.port,secure:mailConfig.secure,auth:{user:mailConfig.user,pass:mailConfig.password}}):null;
function auth(req,res,next){const header=req.get('authorization')||'',token=header.startsWith('Bearer ')?header.slice(7):'';if(!adminToken)return res.status(503).json({error:'Admin is not configured. Set ADMIN_TOKEN in your environment.'});if(!token||!equal(token,adminToken))return res.status(401).json({error:'Unauthorized'});next()}
app.use(express.static(path.join(ROOT,'public'),{extensions:['html']}));app.use(express.static(path.join(ROOT,'admin')));app.use('/admin',express.static(path.join(ROOT,'admin'),{extensions:['html']}));
app.post('/api/contact',contactLimiter,(req,res)=>{if(req.body.website)return res.json({ok:true,message:'Thanks! Your message has been received.'});let name=clean(req.body.name,100),email=clean(req.body.email,160),phone=clean(req.body.phone,40),service=clean(req.body.service,100),message=clean(req.body.message,2000);if(name.length<2||!/^\S+@\S+\.\S+$/.test(email)||message.length<10)return res.status(400).json({error:'Please enter your name, a valid email, and a message of at least 10 characters.'});let leads=read();leads.unshift({id:crypto.randomUUID(),name,email,phone,service,message,createdAt:new Date().toISOString(),status:'New'});write(leads.slice(0,5000));res.json({ok:true,message:'Thanks! Your enquiry has been sent successfully.'})});
app.post('/api/admin/login',adminLoginLimiter,(req,res)=>{if((!adminPass&&!adminPasswordHash)||!adminToken)return res.status(503).json({error:'Admin is not configured. Set ADMIN_PASSWORD and ADMIN_TOKEN in hosting environment.'});if(!equal(clean(req.body.username,100),adminUser)||!verifyAdminPassword(req.body.password))return res.status(401).json({error:'Invalid username or password.'});res.json({ok:true,token:adminToken})});
app.use('/api/admin/reset-password',(req,res,next)=>{for(const [tokenHash,expires] of resetTokens)if(expires<=Date.now())resetTokens.delete(tokenHash);next()});
app.post('/api/admin/forgot-password',passwordResetLimiter,async(req,res)=>{
  if((!adminPass&&!adminPasswordHash)||!adminToken)return res.status(503).json({error:'Admin is not configured. Set ADMIN_PASSWORD and ADMIN_TOKEN in the server environment.'});
  if(!mailReady){console.error('Password reset requested, but SMTP and reset email settings are incomplete.');return res.status(503).json({error:'Password reset email is not configured on the server yet.'})}
  const username=clean(req.body.username,100);
  if(!equal(username,adminUser))return res.json({ok:true,message:'If the username matches, a password reset link will be emailed.'});
  const rawToken=crypto.randomBytes(32).toString('hex'),tokenHash=crypto.createHash('sha256').update(rawToken).digest('hex');
  resetTokens.clear();resetTokens.set(tokenHash,Date.now()+15*60*1000);
  const appUrl=mailConfig.appUrl.endsWith('/')?mailConfig.appUrl.slice(0,-1):mailConfig.appUrl,resetUrl=`${appUrl}/admin/?reset=${rawToken}`;
  try{
    await mailer.sendMail({from:mailConfig.from,to:mailConfig.to,subject:'Admin password reset',text:['A password reset was requested for your admin account. This link expires in 15 minutes and can be used once:','',resetUrl,'','If you did not request this, ignore this email.'].join('\n')});
    res.json({ok:true,message:'If the username matches, a password reset link will be emailed.'})
  }catch(error){
    resetTokens.clear();console.error('Could not send admin password reset email:',error.message);
    res.status(503).json({error:'Could not send the reset email. Check the server email configuration and try again.'})
  }
});
app.post('/api/admin/reset-password',(req,res)=>{const token=String(req.body.token||''),password=String(req.body.password||''),tokenHash=crypto.createHash('sha256').update(token).digest('hex'),expires=resetTokens.get(tokenHash);if(!/^[a-f0-9]{64}$/.test(token)||!expires||expires<Date.now()){resetTokens.delete(tokenHash);return res.status(400).json({error:'This reset link is invalid or expired. Request a new one.'})}if(password.length<12)return res.status(400).json({error:'Choose a password with at least 12 characters.'});try{persistAdminCredentials(adminUser,password);resetTokens.clear();res.json({ok:true,message:'Password reset. Sign in with your new password.'})}catch(error){console.error('Could not save admin credentials:',error.message);res.status(500).json({error:'Could not save the new password. Please try again or contact the server administrator.'})}});
app.get('/api/admin/leads',auth,(req,res)=>{res.set('Cache-Control','no-store');res.json(read())});
app.patch('/api/admin/leads/:id',auth,(req,res)=>{let status=clean(req.body.status,30);if(!['New','Contacted','Qualified','Closed'].includes(status))return res.status(400).json({error:'Invalid status'});let leads=read(),lead=leads.find(x=>x.id===req.params.id);if(!lead)return res.status(404).json({error:'Lead not found'});lead.status=status;write(leads);res.json({ok:true})});
app.get('/case-study/:slug',(_req,res)=>res.sendFile(path.join(ROOT,'public','health-wellness-case-study.html')));
attachPortfolioRoutes(app,{auth,root:ROOT});
app.get('/api/health',(_,res)=>res.json({ok:true}));app.listen(PORT,()=>console.log(`Portfolio running at http://localhost:${PORT}`));
