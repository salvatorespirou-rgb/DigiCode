(() => {
'use strict';
const canvas=document.querySelector('#core'),ctx=canvas.getContext('2d');
const preference=matchMedia('(prefers-reduced-motion: reduce)');
let paused=preference.matches,w=0,h=0,dpr=1,frame=0,rotation=0,scroll=0,px=0,py=0,visible=true;
const toggle=document.querySelector('#motion');
function label(){toggle.setAttribute('aria-pressed',String(paused));toggle.innerHTML=paused?'Resume motion <span>▶</span>':'Pause motion <span>Ⅱ</span>';}
function resize(){const r=canvas.getBoundingClientRect();w=r.width;h=r.height;dpr=Math.min(devicePixelRatio||1,1.75);canvas.width=w*dpr;canvas.height=h*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);draw();}
function project(x,y,z,ax,ay){let Y=y*Math.cos(ax)-z*Math.sin(ax),Z=y*Math.sin(ax)+z*Math.cos(ax),X=x*Math.cos(ay)+Z*Math.sin(ay);Z=-x*Math.sin(ay)+Z*Math.cos(ay);const p=5/(5-Z);return [w*.58+X*p*Math.min(w*.25,h*.31),h*.47+Y*p*Math.min(w*.25,h*.31),Z];}
function draw(){if(!ctx)return;ctx.clearRect(0,0,w,h);drawMatrix();const ax=.6+py*.1+scroll*.4,ay=rotation+px*.16+scroll*.85;const rings=[];
for(let i=0;i<60;i++){const u=i/60*Math.PI*2,points=[];for(let j=0;j<=100;j++){const v=j/100*Math.PI*2;const r=1.16+.43*Math.cos(v);points.push(project(r*Math.cos(u),r*Math.sin(u),.43*Math.sin(v),ax,ay));}rings.push({points,z:points.reduce((n,p)=>n+p[2],0)/points.length});}
rings.sort((a,b)=>a.z-b.z);ctx.lineWidth=.8;for(const ring of rings){const light=(ring.z+1.7)/3.4;ctx.strokeStyle=`rgba(${Math.round(115+light*87)},${Math.round(162+light*90)},${Math.round(140-light*20)},${.12+light*.62})`;ctx.beginPath();ring.points.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));ctx.stroke();}
for(let j=0;j<18;j++){const v=j/18*Math.PI*2;ctx.beginPath();for(let i=0;i<=160;i++){const u=i/160*Math.PI*2,r=1.16+.43*Math.cos(v),p=project(r*Math.cos(u),r*Math.sin(u),.43*Math.sin(v),ax,ay);i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]);}ctx.strokeStyle='rgba(184,224,178,.2)';ctx.stroke();}
}
function drawMatrix(){
ctx.save();ctx.font='12px monospace';
const columns=Math.ceil(w/25),travel=rotation*220;
for(let column=0;column<columns;column++){
 const seed=Math.sin(column*127.1)*43758.5453,fraction=seed-Math.floor(seed);
 const head=(fraction*h+travel*(.45+fraction))%(h+260)-40;
 for(let row=0;row<17;row++){
  const y=head-row*18;if(y<0||y>h)continue;
  const char=((column*7+row*13+Math.floor(rotation*9))%5===0)?'アイウエオカキクケコ'[Math.abs(column+row)%10]:String((column+row*3)%2);
  ctx.fillStyle=row===0?'rgba(218,255,187,.55)':`rgba(199,255,120,${(1-row/17)*.18})`;
  ctx.fillText(char,column*25,y);
 }
}
ctx.strokeStyle='rgba(199,255,120,.045)';ctx.lineWidth=1;
for(let x=0;x<w;x+=75){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke();}
for(let y=0;y<h;y+=75){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}
ctx.restore();
}
let last=0;function animate(time){frame=0;if(paused||!visible||document.hidden)return;if(time-last>30){rotation+=.003;draw();last=time;}frame=requestAnimationFrame(animate);}
function start(){if(!frame&&!paused&&visible&&!document.hidden)frame=requestAnimationFrame(animate);}
toggle.addEventListener('click',()=>{paused=!paused;label();if(paused){cancelAnimationFrame(frame);frame=0;}else start();});
preference.addEventListener('change',e=>{paused=e.matches;label();if(paused){cancelAnimationFrame(frame);frame=0;draw();}else start();});
window.addEventListener('pointermove',e=>{if(paused)return;px=e.clientX/innerWidth-.5;py=e.clientY/innerHeight-.5;},{passive:true});
function updateScroll(){scroll=scrollY/innerHeight;const max=document.documentElement.scrollHeight-innerHeight;document.querySelector('.progress').style.width=(max>0?scrollY/max*100:0)+'%';if(!paused&&visible)draw();}
window.addEventListener('scroll',updateScroll,{passive:true});window.addEventListener('resize',resize);document.addEventListener('visibilitychange',start);
new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;if(visible)start();},{threshold:0}).observe(canvas);
const observer=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting){e.target.classList.add('visible');observer.unobserve(e.target);}}),{threshold:.08});
if(!preference.matches)document.querySelectorAll('.section-head,.manifesto h2,.manifesto-bottom,.project,.service,.studio-grid').forEach(el=>{el.classList.add('reveal');observer.observe(el);});
label();resize();updateScroll();start();
})();
