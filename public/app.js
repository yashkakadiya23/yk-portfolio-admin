const menu=document.getElementById('menu'),nav=document.getElementById('nav');menu.addEventListener('click',()=>nav.classList.toggle('open'));nav.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>nav.classList.remove('open')));document.getElementById('year').textContent=new Date().getFullYear();
const loadingScreen=document.getElementById('loadingScreen');if(loadingScreen){window.addEventListener('load',()=>{window.setTimeout(()=>{requestAnimationFrame(()=>{loadingScreen.classList.add('hidden');setTimeout(()=>loadingScreen.remove(),800);});},800);});}
const modal=document.getElementById('thankYouModal');const modalClose=document.getElementById('thankYouClose');const showThankYou=()=>{if(!modal)return;modal.classList.add('show');modal.setAttribute('aria-hidden','false');document.body.classList.add('modal-open');};const hideThankYou=()=>{if(!modal)return;modal.classList.remove('show');modal.setAttribute('aria-hidden','true');document.body.classList.remove('modal-open');};if(modalClose)modalClose.addEventListener('click',hideThankYou);if(modal)modal.addEventListener('click',e=>{if(e.target===modal||e.target.dataset.close==='true')hideThankYou();});
const form=document.getElementById('contactForm'),status=document.getElementById('status');form.addEventListener('submit',async e=>{e.preventDefault();const btn=form.querySelector('button');if(btn){btn.disabled=true;btn.textContent='Sending…';}status.textContent='Sending your enquiry…';status.className='formnote';try{const response=await fetch('/api/contact',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.fromEntries(new FormData(form).entries()))});const data=await response.json();if(!response.ok)throw new Error(data.error||'Could not send enquiry.');status.textContent=data.message;status.className='formnote success';form.reset();showThankYou();}catch(err){status.textContent=err.message;status.className='formnote error';}finally{if(btn){btn.disabled=false;btn.textContent='Send Message ↗';}}});

const orbitScene=document.querySelector('.orbit-scene');
if(orbitScene){
  const orbitSvg=orbitScene.querySelector('.orbit-svg');
  const orbitNetwork=orbitScene.querySelector('.orbit-network');
  const brand=orbitScene.querySelector('.orbit-brand');
  const motionPreference=window.matchMedia('(prefers-reduced-motion: reduce)');
  const autoSpeed=18;
  const maximumPointerSpeed=240;
  let angle=0;
  let traveled=0;
  let pointerAngle=null;
  let pointerInside=false;
  let velocity=autoSpeed;
  let lastPointerMove=0;
  let previousFrame=performance.now();

  if(brand){
    brand.classList.add('orbit-brand-fixed');
    brand.textContent='YK';
    brand.setAttribute('role','img');
    brand.setAttribute('aria-label','YK monogram');
  }
  const orbitArt=orbitScene.closest('.orbit-art');
  if(orbitArt){
    orbitArt.removeAttribute('role');
    orbitArt.setAttribute('aria-label','Five marketing services orbiting the YK monogram');
  }
  orbitScene.setAttribute('role','group');
  orbitScene.setAttribute('aria-label','Interactive digital marketing orbit. Move the pointer around the circle to rotate five marketing services.');
  orbitScene.style.setProperty('--orbit-angle','0deg');

  const pointerPosition=(event)=>{
    const rect=orbitScene.getBoundingClientRect();
    const x=event.clientX-(rect.left+rect.width/2);
    const y=event.clientY-(rect.top+rect.height/2);
    return {radius:Math.hypot(x,y),angle:Math.atan2(y,x)*180/Math.PI};
  };
  const setOrbitAngle=(value,delta=0)=>{
    angle=((value%360)+360)%360;
    orbitScene.style.setProperty('--orbit-angle',`${angle}deg`);
    orbitScene.style.setProperty('--orbit-counter-angle',`${-angle}deg`);
    traveled+=Math.abs(delta);
    const progress=(traveled%1080)/1080;
    const converge=Math.max(0,Math.min(1,(progress-.72)/.08));
    const separate=Math.max(0,Math.min(1,(progress-.91)/.09));
    const easedConverge=converge*converge*(3-2*converge);
    const easedSeparate=separate*separate*(3-2*separate);
    const merge=easedConverge*(1-easedSeparate);
    orbitNetwork.style.transform=`scale(${1-.32*merge})`;
    orbitNetwork.style.opacity=String(.78+.22*merge);
    if(orbitSvg&&typeof orbitSvg.setCurrentTime==='function'){
      orbitSvg.setCurrentTime((angle%360+360)%360/360*6);
    }
  };
  const onPointerMove=(event)=>{
    const position=pointerPosition(event);
    const rect=orbitScene.getBoundingClientRect();
    if(position.radius<rect.width*.2||position.radius>rect.width*.48){
      pointerAngle=null;
      pointerInside=false;
      return;
    }
    const now=performance.now();
    if(pointerAngle===null){
      pointerAngle=position.angle;
      pointerInside=true;
      lastPointerMove=now;
      return;
    }
    let delta=position.angle-pointerAngle;
    if(delta>180)delta-=360;
    if(delta<-180)delta+=360;
    const elapsed=Math.max((now-lastPointerMove)/1000,.001);
    pointerAngle=position.angle;
    pointerInside=true;
    velocity=Math.max(-maximumPointerSpeed,Math.min(maximumPointerSpeed,delta/elapsed));
    lastPointerMove=now;
    setOrbitAngle(angle+delta,delta);
  };
  const onPointerLeave=()=>{
    pointerInside=false;
    pointerAngle=null;
  };
  const onPointerEnd=(event)=>{
    if(event.pointerType==='touch')onPointerLeave();
  };
  const onPointerEnter=(event)=>{
    const position=pointerPosition(event);
    const rect=orbitScene.getBoundingClientRect();
    if(position.radius>=rect.width*.2&&position.radius<=rect.width*.48){
      pointerInside=true;
      pointerAngle=position.angle;
      lastPointerMove=performance.now();
    }
  };

  orbitScene.addEventListener('pointermove',onPointerMove);
  orbitScene.addEventListener('pointerenter',onPointerEnter);
  orbitScene.addEventListener('pointerleave',onPointerLeave);
  orbitScene.addEventListener('pointerup',onPointerEnd);
  orbitScene.addEventListener('pointercancel',onPointerEnd);
  if(orbitSvg&&typeof orbitSvg.pauseAnimations==='function')orbitSvg.pauseAnimations();

  const animateOrbit=(now)=>{
    const elapsed=Math.min((now-previousFrame)/1000,.05);
    previousFrame=now;
    if(!motionPreference.matches){
      if(pointerInside){
        velocity*=Math.exp(-2.2*elapsed);
        if(now-lastPointerMove>120){
          const delta=velocity*elapsed;
          setOrbitAngle(angle+delta,delta);
        }
      }else{
        const blend=1-Math.exp(-1.8*elapsed);
        velocity+=(autoSpeed-velocity)*blend;
        const delta=velocity*elapsed;
        setOrbitAngle(angle+delta,delta);
      }
    }
    requestAnimationFrame(animateOrbit);
  };
  setOrbitAngle(0);
  requestAnimationFrame(animateOrbit);
}
