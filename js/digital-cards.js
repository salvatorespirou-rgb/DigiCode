(() => {
'use strict';

const cards=[...document.querySelectorAll('.dc-card')];const reduced=matchMedia('(prefers-reduced-motion: reduce)');let paused=false;
cards.forEach(card=>{const screen=document.createElement('span');screen.className='dc-screen-fx';screen.setAttribute('aria-hidden','true');card.prepend(screen)});
function selectCard(card){
 if(currentBurst)return;
 card.closest('.dc-deck').querySelectorAll('.dc-card').forEach(c=>{const chosen=c===card;c.setAttribute('data-selected',String(chosen));c.querySelector('.dc-state').textContent=chosen?'Selected':'Explore'});
}
const tiltControllers=[];
cards.forEach(card=>{
 let frame=0,point=null,bounds=null,touch=null,suppressClickUntil=0;
 const reset=()=>{cancelAnimationFrame(frame);frame=0;point=null;bounds=null;card.classList.remove('dc-touching');card.style.setProperty('--rx','0deg');card.style.setProperty('--ry','0deg')};
 tiltControllers.push(reset);
 card.addEventListener('pointerdown',e=>{
  if(e.pointerType!=='touch'||!e.isPrimary||reduced.matches||currentBurst)return;
  suppressClickUntil=0;touch={id:e.pointerId,x:e.clientX,y:e.clientY,dragged:false};
  bounds=card.parentElement.getBoundingClientRect();card.classList.add('dc-touching');
  card.setPointerCapture(e.pointerId);
 },{passive:true});
 card.addEventListener('pointermove',e=>{
  if(reduced.matches||paused||currentBurst)return;
  if(e.pointerType==='touch'){
   if(!touch||touch.id!==e.pointerId)return;
   if(Math.hypot(e.clientX-touch.x,e.clientY-touch.y)>8)touch.dragged=true;
  }
  point={x:e.clientX,y:e.clientY};if(frame)return;
  frame=requestAnimationFrame(()=>{
   frame=0;if(!point||paused||reduced.matches||currentBurst)return;
   const r=bounds||card.parentElement.getBoundingClientRect();
   const x=Math.max(0,Math.min(1,(point.x-r.left)/r.width)),y=Math.max(0,Math.min(1,(point.y-r.top)/r.height));
   card.style.setProperty('--rx',(0.5-y)*20+'deg');card.style.setProperty('--ry',(x-0.5)*26+'deg');
   if(!touch){card.style.setProperty('--mx',x*100+'%');card.style.setProperty('--my',y*100+'%')}
  });
 });
 const endTouch=e=>{if(touch&&touch.id===e.pointerId){if(touch.dragged||e.type==='pointercancel')suppressClickUntil=performance.now()+700;touch=null;if(card.hasPointerCapture(e.pointerId))card.releasePointerCapture(e.pointerId)}reset()};
 card.addEventListener('pointerup',endTouch);card.addEventListener('pointercancel',endTouch);
 card.addEventListener('pointerleave',()=>{if(!touch)reset()});
 card.addEventListener('click',e=>{if(e.detail!==0&&performance.now()<suppressClickUntil){e.preventDefault();e.stopImmediatePropagation()}},true);
});

reduced.addEventListener('change',()=>tiltControllers.forEach(reset=>reset()));
// Reserve the full text layout while revealing an accessible visual copy.
const visibleCards=new Set();
const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{entry.target.classList.toggle('dc-offscreen',!entry.isIntersecting);if(entry.isIntersecting)visibleCards.add(entry.target);else visibleCards.delete(entry.target)}));
cards.forEach(card=>observer.observe(card));
const typingTargets=[];
cards.forEach(card=>{
 card.querySelectorAll('h3,.dc-description,.dc-bottom > span:first-child').forEach((element,index)=>{
  const text=element.textContent;
  element.textContent='';element.classList.add('dc-type-text');
  const measure=document.createElement('span');measure.className='dc-type-measure';measure.textContent=text;measure.setAttribute('aria-hidden','true');
  const visual=document.createElement('span');visual.className='dc-type-visual';visual.textContent=text;visual.setAttribute('aria-hidden','true');
  const accessible=document.createElement('span');accessible.className='dc-type-accessible';accessible.textContent=text;
  element.append(measure,visual,accessible);
  typingTargets.push({card,visual,text,characters:Array.from(text),delay:index*180,duration:index===1?4800:2800});
 });
});
let typingFrame=0,typingTimer=0;
function finishTyping(){cancelAnimationFrame(typingFrame);typingFrame=0;typingTargets.forEach(({visual,text})=>{visual.textContent=text;visual.classList.remove('is-typing')})}
function playTyping(){
 if(paused||reduced.matches||document.hidden||currentBurst){finishTyping();return}
 cancelAnimationFrame(typingFrame);const start=performance.now();let lastPaint=0;
 function renderTyping(now){
  if(paused||reduced.matches||document.hidden||currentBurst){finishTyping();return}
  if(now-lastPaint<50){typingFrame=requestAnimationFrame(renderTyping);return}lastPaint=now;
  let pending=false;
  typingTargets.forEach(({card,visual,text,characters,delay,duration})=>{
   if(!visibleCards.has(card)){if(visual.textContent!==text)visual.textContent=text;visual.classList.remove("is-typing");return}
   const progress=Math.min(1,Math.max(0,(now-start-delay)/duration));
   const next=characters.slice(0,Math.floor(progress*characters.length)).join('');
   if(visual.textContent!==next)visual.textContent=next;
   visual.classList.toggle('is-typing',progress>0&&progress<1);
   if(progress<1)pending=true;
  });
  typingFrame=pending?requestAnimationFrame(renderTyping):0;
 }
 typingFrame=requestAnimationFrame(renderTyping);
}
function syncTyping(){clearInterval(typingTimer);finishTyping();if(!paused&&!reduced.matches&&!document.hidden){playTyping();typingTimer=setInterval(playTyping,8000)}}
reduced.addEventListener('change',syncTyping);document.addEventListener('visibilitychange',syncTyping);
cards.forEach(card=>card.addEventListener('click',finishTyping));
// A short, reversible block explosion uses a separate layer above the preview.
const burstStyle=document.createElement('style');burstStyle.textContent=`
.dc-block-burst{position:fixed;inset:0;pointer-events:none;z-index:100;overflow:hidden}
.dc-burst-particle{position:absolute;left:0;top:0;perspective:650px;will-change:transform}
.dc-burst-cube{position:absolute;inset:0;transform-style:preserve-3d;will-change:transform}
.dc-burst-face{position:absolute;inset:0;border:1px solid #d5eaff80;border-radius:3px;backface-visibility:hidden;background:linear-gradient(135deg,#ffffff35,transparent 48%,#00000030),var(--face);box-shadow:inset 2px 2px 0 #ffffff55,inset -3px -3px 0 #0005}
.dc-burst-face:after{content:'';position:absolute;inset:5px;border:1px solid #ffffff18;border-radius:1px}
`;document.head.append(burstStyle);
let currentBurst=null;
syncTyping();
function finishBurst(restore=true){if(!currentBurst)return;cancelAnimationFrame(currentBurst.frame);currentBurst.animation?.cancel();currentBurst.animations?.forEach(animation=>animation.cancel());currentBurst.layer.remove();if(restore)currentBurst.card.style.opacity='';currentBurst=null}
async function explodeCard(card){
 if(currentBurst)return;
 const destination=card.href;
 if(paused||reduced.matches){window.location.assign(destination);return}
 finishBurst();
 cards.forEach(c=>c.getAnimations().forEach(animation=>animation.cancel()));
 const deck=card.closest('.dc-deck'),stages=[...deck.children],chosen=card.parentElement;
 // Swap the actual slots before the spin, retaining each card's event handlers.
 if(innerWidth>800&&stages.indexOf(chosen)!==1){
 const oldPositions=new Map(stages.map(stage=>[stage,stage.getBoundingClientRect()]));
  const index=stages.indexOf(chosen),middle=stages[1];
  stages[1]=chosen;stages[index]=middle;stages.forEach(stage=>deck.append(stage));
  const swap={card,layer:document.createElement('div'),frame:0,animations:[]};currentBurst=swap;
  const newPositions=new Map([chosen,middle].map(stage=>[stage,stage.getBoundingClientRect()]));
  [chosen,middle].forEach(stage=>{
   const before=oldPositions.get(stage),after=newPositions.get(stage),dx=before.left-after.left,dy=before.top-after.top;
   swap.animations.push(stage.animate([
    {transform:`translate(${dx}px,${dy}px)`},
    {transform:`translate(${dx*.5}px,${stage===chosen?-26:26}px)`,offset:.5},
    {transform:'translate(0,0)'}
   ],{duration:440,easing:'cubic-bezier(.4,0,.2,1)'}));
  });
  await Promise.allSettled(swap.animations.map(animation=>animation.finished));
  if(currentBurst!==swap)return;
  finishBurst();
 }
 const start=card.getBoundingClientRect(),accent=getComputedStyle(card).getPropertyValue('--accent').trim();
 const introLayer=document.createElement('div');introLayer.className='dc-block-burst';introLayer.setAttribute('aria-hidden','true');introLayer.style.perspective='1200px';
 const ghost=card.cloneNode(true);ghost.tabIndex=-1;ghost.style.cssText+=`;position:absolute;left:0;top:0;width:${card.offsetWidth}px;height:${card.offsetHeight}px;margin:0;pointer-events:none;opacity:1;--rx:0deg;--ry:0deg;--accent:${accent};transition:none;`;
 introLayer.append(ghost);document.body.append(introLayer);card.style.opacity='0';
 const scale=Math.min(1,(innerWidth-80)/card.offsetWidth,(innerHeight-100)/card.offsetHeight);
 const slot=card.parentElement.getBoundingClientRect();
 const cx=innerWidth>800?slot.left+(slot.width-card.offsetWidth)/2:(innerWidth-card.offsetWidth)/2;
 const cy=innerWidth>800?slot.top+10:(innerHeight-card.offsetHeight)/2;
 const center=`translate3d(${cx}px,${cy}px,0) scale(${scale})`;
 const phase={layer:introLayer,card,frame:0,animation:null};currentBurst=phase;
 try{
  phase.animation=ghost.animate([
   {transform:`translate3d(${start.left}px,${start.top}px,0) rotateX(6deg) rotateY(-9deg) scale(1)`},
   {transform:center+' rotateX(0deg) rotateY(0deg)'}
  ],{duration:380,easing:'cubic-bezier(.22,1,.36,1)',fill:'forwards'});
  await phase.animation.finished;
  if(currentBurst!==phase)return;
 }catch{return}
 if(currentBurst!==phase)return;
 const rect=ghost.getBoundingClientRect();
 finishBurst(false);
 const layer=document.createElement('div');layer.className='dc-block-burst';layer.setAttribute('aria-hidden','true');
 const mobile=matchMedia('(max-width:800px), (pointer:coarse)').matches;
 const particles=[],columns=mobile?4:7,rows=mobile?6:8,cellW=rect.width/columns,cellH=rect.height/rows;
 const radius=Math.min(135,rect.width*.4,innerHeight*.22),count=columns*rows;
 const burst={layer,card,frame:0};currentBurst=burst;
 for(let row=0;row<rows;row++)for(let col=0;col<columns;col++){
  const size=Math.min(11,2*Math.PI*radius/count*.55),half=size/2,cube=document.createElement('div');cube.className='dc-burst-cube';
  const holder=document.createElement('div');holder.className='dc-burst-particle';holder.style.cssText=`width:${size}px;height:${size}px`;holder.append(cube);layer.append(holder);
  const front=(row===0||col===0||col===columns-1||row===rows-1||Math.random()<.15)?accent:'#242c40';
  const faces=[['translateZ('+half+'px)',front],['rotateY(180deg) translateZ('+half+'px)','#354768'],['rotateY(90deg) translateZ('+half+'px)',`color-mix(in srgb,${accent} 45%,#111a30)`],['rotateY(-90deg) translateZ('+half+'px)','#20324e'],['rotateX(90deg) translateZ('+half+'px)','#c3dafa'],['rotateX(-90deg) translateZ('+half+'px)','#0a1223']];
  faces.forEach(([transform,color])=>{const face=document.createElement('span');face.className='dc-burst-face';face.style.transform=transform;face.style.setProperty('--face',color);cube.append(face)});
  const angle=(row*columns+col)/count*Math.PI*2-Math.PI/2+(Math.random()-.5)*.35;
  const reach=.65+Math.random()*.5,x=rect.left+(col+.5)*cellW-size/2,y=rect.top+(row+.5)*cellH-size/2;
  const burstX=Math.cos(angle)*innerWidth*.65*reach;
  const burstY=Math.sin(angle)*innerHeight*.65*reach;
  particles.push({holder,cube,x,y,size,angle,ringRadius:radius*(.7+Math.random()*.6),wobble:Math.random()*Math.PI*2,depth:(Math.random()-.5)*100,tiltX:(Math.random()-.5)*150,tiltY:(Math.random()-.5)*150,dx:burstX,dy:burstY,z:550+Math.random()*20,sx:(Math.random()-.5)*100,sy:(Math.random()-.5)*130,delay:Math.random()*.07});
 }
 document.body.append(layer);
 card.style.opacity='0';
 const pivotX=rect.left+rect.width/2,pivotY=rect.top+rect.height/2;
 let startedAt;
 function tick(time){
  if(currentBurst!==burst)return;
  startedAt??=time;const elapsed=(time-startedAt)/1000;
    // Gather into a loose, tumbling circular swarm before the forward burst.
    const gather=Math.min(1,elapsed/.32),gatherEase=gather*gather*(3-2*gather);
    const orbit=Math.min(1,Math.max(0,(elapsed-.32)/.72)),orbitEase=orbit*orbit*(3-2*orbit);
    const flightTime=Math.max(0,elapsed-1.04),progress=Math.min(1,flightTime/.85);
  particles.forEach(p=>{
     const t=Math.min(1,Math.max(0,(flightTime-p.delay)/.72)),flight=t*t*(.65+.35*t);
     const fade=Math.min(1,Math.max(0,(t-.86)/.14));
     const wobble=Math.sin(orbitEase*Math.PI*4+p.wobble)-Math.sin(p.wobble);
     const ringAngle=p.angle+orbitEase*Math.PI*2+wobble*.12;
     const ringRadius=p.ringRadius+wobble*9;
     const ringX=pivotX+Math.cos(ringAngle)*ringRadius-p.size/2;
     const ringY=pivotY+Math.sin(ringAngle)*ringRadius-p.size/2;
     const x=p.x+(ringX-p.x)*gatherEase;
     const y=p.y+(ringY-p.y)*gatherEase;
     p.holder.style.transform=`translate3d(${x+p.dx*flight}px,${y+p.dy*flight}px,0)`;
     p.holder.style.opacity=String(1-fade*fade*(3-2*fade));
     p.cube.style.transform=`translateZ(${p.z*flight+p.depth*gatherEase*(1-flight)}px) rotateX(${-25+p.tiltX+orbitEase*360+p.sx*t}deg) rotateY(${35+p.tiltY+orbitEase*360+p.sy*t}deg) scale3d(${1+3*flight},${1+3*flight},${1+3*flight})`;
  });
    if(progress>=1){finishBurst(false);window.location.assign(destination);return}burst.frame=requestAnimationFrame(tick);
 }
 burst.frame=requestAnimationFrame(tick);
}
cards.forEach(card=>card.addEventListener('click',event=>{
 if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
 if(reduced.matches)return;
 event.preventDefault();if(currentBurst)return;selectCard(card);finishTyping();
 explodeCard(card).catch(()=>{finishBurst();window.location.assign(card.href)});
}));
reduced.addEventListener('change',()=>{if(reduced.matches)finishBurst()});
document.addEventListener('visibilitychange',()=>{if(document.hidden)finishBurst()});
addEventListener('resize',()=>finishBurst());
addEventListener('pageshow',()=>{finishBurst();cards.forEach(card=>card.style.opacity='');syncTyping()});
document.addEventListener('visibilitychange',()=>document.body.classList.toggle('dc-card-hidden',document.hidden));

})();
