const originalNow=Date.now.bind(Date);
let currentTime=originalNow();

Date.now=()=>currentTime;

process.on('message',message=>{
  if(message?.type!=='advance-clock')return;
  currentTime+=message.milliseconds;
  process.send({type:'clock-advanced',id:message.id});
});
