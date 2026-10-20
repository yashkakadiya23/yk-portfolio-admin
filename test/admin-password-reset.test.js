const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {once}=require('node:events');
const fs=require('node:fs');
const net=require('node:net');
const path=require('node:path');
const {test}=require('node:test');

const root=path.resolve(__dirname,'..');
const credentialsFile=path.join(root,'data','admin-auth.json');
const sleep=milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds));

async function reservePort(){
  const server=net.createServer();
  await new Promise((resolve,reject)=>server.listen(0,'127.0.0.1',error=>error?reject(error):resolve()));
  const {port}=server.address();
  await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  return port;
}

function createSmtpServer(){
  const messages=[];
  const sockets=new Set();
  const server=net.createServer(socket=>{
    sockets.add(socket);
    socket.setEncoding('utf8');
    socket.write('220 localhost ESMTP\r\n');
    let buffer='',message='',readingMessage=false,loginStep=0;
    socket.on('close',()=>sockets.delete(socket));
    socket.on('data',chunk=>{
      buffer+=chunk;
      while(true){
        const end=buffer.indexOf('\r\n');
        if(end<0)break;
        const line=buffer.slice(0,end);
        buffer=buffer.slice(end+2);
        if(readingMessage){
          if(line==='.'){
            readingMessage=false;
            messages.push(message);
            message='';
            socket.write('250 Message accepted\r\n');
          }else message+=line+'\n';
        }else if(loginStep){
          if(loginStep===1){loginStep=2;socket.write('334 UGFzc3dvcmQ6\r\n')}
          else{loginStep=0;socket.write('235 Authentication successful\r\n')}
        }else if(/^(EHLO|HELO)/i.test(line))socket.write('250-localhost\r\n250-AUTH PLAIN LOGIN\r\n250 SIZE 1048576\r\n');
        else if(/^AUTH PLAIN/i.test(line))socket.write('235 Authentication successful\r\n');
        else if(/^AUTH LOGIN/i.test(line)){loginStep=1;socket.write('334 VXNlcm5hbWU6\r\n')}
        else if(/^(MAIL FROM|RCPT TO)/i.test(line))socket.write('250 OK\r\n');
        else if(/^DATA/i.test(line)){readingMessage=true;socket.write('354 Send message\r\n')}
        else if(/^QUIT/i.test(line))socket.write('221 Bye\r\n');
        else socket.write('250 OK\r\n');
      }
    });
  });
  return {server,messages,sockets};
}

function decodeQuotedPrintable(value){
  return value.replace(/=\r?\n/g,'').replace(/=([A-Fa-f0-9]{2})/g,(_,hex)=>String.fromCharCode(parseInt(hex,16)));
}

async function post(base,url,body){
  const response=await fetch(base+url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  return {status:response.status,body:await response.json()};
}

test('admin password reset email, expiry, one-time use, and persistence',async t=>{
  assert.equal(fs.existsSync(credentialsFile),false,'test requires an unused admin credential file');

  const smtp=createSmtpServer();
  await new Promise((resolve,reject)=>smtp.server.listen(0,'127.0.0.1',error=>error?reject(error):resolve()));
  const appPort=await reservePort();
  const appUrl=`http://127.0.0.1:${appPort}`;
  const environment={
    ...process.env,
    PORT:String(appPort),
    ADMIN_USERNAME:'admin',
    ADMIN_PASSWORD:'Initial-Test-Password-123!',
    ADMIN_TOKEN:'test-initial-token',
    SMTP_HOST:'127.0.0.1',
    SMTP_PORT:String(smtp.server.address().port),
    SMTP_SECURE:'false',
    SMTP_USER:'smtp-test-user',
    SMTP_PASSWORD:'smtp-test-password',
    SMTP_FROM:'Portfolio Admin <admin@example.test>',
    ADMIN_RESET_EMAIL:'yashkakadiya71@gmail.com',
    APP_URL:appUrl
  };
  let child;
  let childOutput='';
  let messageId=0;
  const clockWaiters=new Map();

  function startServer(){
    child=spawn(process.execPath,['--require',path.join(root,'test-support','fake-clock.cjs'),'server.js'],{
      cwd:root,
      env:environment,
      stdio:['ignore','pipe','pipe','ipc']
    });
    child.stdout.on('data',chunk=>childOutput+=chunk);
    child.stderr.on('data',chunk=>childOutput+=chunk);
    child.on('message',message=>{
      if(message?.type!=='clock-advanced')return;
      clockWaiters.get(message.id)?.();
      clockWaiters.delete(message.id);
    });
  }

  async function waitForServer(){
    for(let attempt=0;attempt<100;attempt++){
      if(child.exitCode!==null)throw new Error(`Server exited early:\n${childOutput}`);
      try{
        const response=await fetch(`${appUrl}/api/health`);
        if(response.ok)return;
      }catch{}
      await sleep(50);
    }
    throw new Error(`Server did not start:\n${childOutput}`);
  }

  async function advanceClock(milliseconds){
    const id=++messageId;
    const advanced=new Promise(resolve=>clockWaiters.set(id,resolve));
    child.send({type:'advance-clock',milliseconds,id});
    await advanced;
  }

  async function resetTokenFromLatestEmail(){
    const message=smtp.messages.at(-1);
    assert.ok(message,'reset email was not received by the test SMTP server');
    assert.match(message,/To: yashkakadiya71@gmail\.com/i);
    const decoded=decodeQuotedPrintable(message);
    const match=decoded.match(/reset=([a-f0-9]{64})/);
    assert.ok(match,'reset email did not include a secure reset token');
    return match[1];
  }

  async function stopServer(){
    if(!child)return;
    if(child.exitCode===null){
      const exited=once(child,'exit');
      child.kill();
      await Promise.race([exited,sleep(3000)]);
    }
    child=null;
  }

  t.after(async()=>{
    await stopServer();
    for(const socket of smtp.sockets)socket.destroy();
    await new Promise(resolve=>smtp.server.close(()=>resolve()));
    if(fs.existsSync(credentialsFile))fs.unlinkSync(credentialsFile);
    for(const name of fs.readdirSync(path.dirname(credentialsFile))){
      if(name.startsWith('admin-auth.json.')&&name.endsWith('.tmp'))fs.unlinkSync(path.join(path.dirname(credentialsFile),name));
    }
  });

  startServer();
  await waitForServer();

  const initialLogin=await post(appUrl,'/api/admin/login',{username:'admin',password:environment.ADMIN_PASSWORD});
  assert.equal(initialLogin.status,200);
  assert.equal((await post(appUrl,'/api/admin/login',{username:'admin',password:'wrong'})).status,401);

  const unknownUser=await post(appUrl,'/api/admin/forgot-password',{username:'not-admin'});
  assert.equal(unknownUser.status,200);
  assert.equal(smtp.messages.length,0,'unknown username should not trigger an email');

  const firstRequest=await post(appUrl,'/api/admin/forgot-password',{username:'admin'});
  assert.equal(firstRequest.status,200);
  assert.equal(smtp.messages.length,1,'Nodemailer should deliver the reset message to SMTP');
  const firstToken=await resetTokenFromLatestEmail();
  assert.equal((await post(appUrl,'/api/admin/reset-password',{token:'not-a-token',password:'A-New-Password-123!'})).status,400);
  assert.equal((await post(appUrl,'/api/admin/reset-password',{token:'a'.repeat(64),password:'A-New-Password-123!'})).status,400);

  await advanceClock(15*60*1000);
  assert.equal((await post(appUrl,'/api/admin/reset-password',{token:firstToken,password:'A-New-Password-123!'})).status,400,'expired links must be rejected');

  const secondRequest=await post(appUrl,'/api/admin/forgot-password',{username:'admin'});
  assert.equal(secondRequest.status,200);
  assert.equal(smtp.messages.length,2);
  const secondToken=await resetTokenFromLatestEmail();
  const newPassword='A-New-Password-123!';
  const reset=await post(appUrl,'/api/admin/reset-password',{token:secondToken,password:newPassword});
  assert.equal(reset.status,200);
  assert.equal((await post(appUrl,'/api/admin/reset-password',{token:secondToken,password:newPassword})).status,400,'reset links must be single-use');
  assert.equal((await fetch(`${appUrl}/api/admin/leads`,{headers:{Authorization:`Bearer ${initialLogin.body.token}`}})).status,401,'password reset must rotate the admin API token');

  const updatedLogin=await post(appUrl,'/api/admin/login',{username:'admin',password:newPassword});
  assert.equal(updatedLogin.status,200);
  assert.equal((await fetch(`${appUrl}/api/admin/leads`,{headers:{Authorization:`Bearer ${updatedLogin.body.token}`}})).status,200);

  const saved=JSON.parse(fs.readFileSync(credentialsFile,'utf8'));
  assert.notEqual(saved.passwordHash,newPassword,'credentials must be stored as a hash');
  assert.equal(saved.token,updatedLogin.body.token);
  assert.ok(!JSON.stringify(saved).includes(secondToken),'raw reset tokens must not be stored');

  await stopServer();
  startServer();
  await waitForServer();
  const loginAfterRestart=await post(appUrl,'/api/admin/login',{username:'admin',password:newPassword});
  assert.equal(loginAfterRestart.status,200,'the changed password must survive a server restart');
  assert.equal((await fetch(`${appUrl}/api/admin/leads`,{headers:{Authorization:`Bearer ${loginAfterRestart.body.token}`}})).status,200);

  assert.equal((await post(appUrl,'/api/admin/forgot-password',{username:'admin'})).status,200);
  const thirdToken=await resetTokenFromLatestEmail();
  const nextPassword='Another-Test-Password-456!';
  assert.equal((await post(appUrl,'/api/admin/reset-password',{token:thirdToken,password:nextPassword})).status,200,'a later reset must replace persisted credentials');
  assert.equal((await post(appUrl,'/api/admin/login',{username:'admin',password:nextPassword})).status,200);
});
