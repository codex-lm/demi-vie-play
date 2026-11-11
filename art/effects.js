import {TAU,hash,clamp} from './palette.js';
import {ellipse,line,poly,gradient} from './primitives.js';
import {EFFECT_IDS} from './data/world-catalog.js';
export {EFFECT_IDS};
const phase=(t,speed,offset)=>((t*speed+offset)%1+1)%1;
function local(c,r,cell,o,draw){
  if(!c||!r||![r.x,r.y,r.w,r.h,cell].every(Number.isFinite)||r.w<=0||r.h<=0||cell<=0)return;
  if(clamp(Number(o.intensity??1)||0)===0)return;
  c.save();c.beginPath();c.rect(r.x,r.y,r.w,r.h);c.clip();c.translate(r.x,r.y);c.scale(cell,cell);
  draw(c,r.w/cell,r.h/cell,{...o,t:Number.isFinite(o.t)?o.t:0,seed:o.seed??1,damage:clamp(Number(o.damage??.65)||0),intensity:clamp(Number(o.intensity??1)||0)});c.restore();
}
function cloud(c,x,y,rx,ry,color,alpha){
  if(rx<=0||ry<=0||alpha<=0)return;c.save();c.translate(x,y);c.scale(rx,ry);
  const g=c.createRadialGradient(0,0,.05,0,0,1);g.addColorStop(0,`rgba(${color},${alpha})`);g.addColorStop(.5,`rgba(${color},${alpha*.52})`);g.addColorStop(1,`rgba(${color},0)`);ellipse(c,0,0,1,1,g);c.restore();
}
// Each tongue bends twice: the inner hot front follows the same moving silhouette.
function tongue(c,x,y,width,height,bend,fill){
  c.beginPath();c.moveTo(x-width,y);
  c.bezierCurveTo(x-width*1.1,y-height*.16,x-bend*.5-width*.95,y-height*.24,x-bend*.5-width*.62,y-height*.38);
  c.bezierCurveTo(x-bend*.5-width*.2,y-height*.52,x+bend*.9-width*.5,y-height*.58,x+bend*.8-width*.22,y-height*.72);
  c.bezierCurveTo(x+bend*.9-width*.08,y-height*.84,x-bend*.18,y-height*.91,x-bend*.3,y-height);
  c.bezierCurveTo(x+bend*.5+width*.16,y-height*.90,x+bend*.9+width*.24,y-height*.82,x+bend*.8+width*.22,y-height*.72);
  c.bezierCurveTo(x+bend*.6+width*.35,y-height*.55,x-bend*.5+width*.55,y-height*.52,x-bend*.5+width*.62,y-height*.38);
  c.bezierCurveTo(x-bend*.2+width*1.03,y-height*.22,x+width*1.1,y-height*.12,x+width,y);
  c.closePath();c.fillStyle=fill;c.fill();
}
const painters={
  cracks(c,w,h,o){
    if(!o.damage)return;
    for(let i=0;i<5;i++){
      const delay=i*.105,extent=clamp((o.damage-delay)/(1-delay));if(!extent)continue;
      const x=w*(.1+hash(o.seed,i)*.8),length=h*(.45+hash(o.seed,i+10)*.5),steps=8;
      const points=[x,0];for(let j=1;j<=steps;j++){
        const q=Math.min(j/steps,extent);points.push(x+(hash(o.seed,i*20+j)-.5)*.32+Math.sin(q*5+i)*.12,q*length);if(q===extent)break;
      }
      line(c,points,'#141e22',.022+o.damage*.028);line(c,points.map((v,j)=>j%2?v:v+.035),'#b3aa8777',.012);
      if(extent>.38)line(c,[x+.04,length*.33,x-.20,length*.43,x-.36,length*.51],'#172126',.022);
    }
  },
  fallingDust(c,w,h,o){
    for(let i=0;i<Math.round(30*o.intensity);i++){
      const p=phase(o.t,.18+hash(o.seed,i+60)*.2,hash(o.seed,i)),x=hash(o.seed,i+10)*w+Math.sin(p*5+i)*.07,y=p*p*h;
      ellipse(c,x,y,.014+hash(o.seed,i+20)*.026,.012+hash(o.seed,i+30)*.03,`rgba(183,159,119,${Math.sin(p*Math.PI)*.67})`);
      if(i<5)cloud(c,x,y,.18+p*.13,.08+p*.1,'165,146,115',Math.sin(p*Math.PI)*.08);
    }
  },
  collapse(c,w,h,o){
    const p=Number.isFinite(o.progress)?clamp(o.progress):phase(o.t,.22,0);
    for(let i=0;i<16;i++){
      const x=w*(.15+hash(o.seed,i)*.7)+(hash(o.seed,i+20)-.5)*w*p*.5,y=h*(.16+p*p*.78),fade=Math.sin(p*Math.PI);
      cloud(c,x,y,.15+p*w*.15,.10+p*h*.20,'157,137,106',fade*.26*o.intensity);
      if(i<9){const r=.04+hash(o.seed,i+40)*.11;poly(c,[x-r,y,x-r*.4,y-r,x+r,y-r*.6,x+r*.7,y+r*.4],'#6f6e5c','#353f3e',.018);}
    }
  },
  steam(c,w,h,o){
    for(let i=0;i<10;i++){const p=phase(o.t,.19,hash(o.seed,i)),x=w*.5+Math.sin(p*6+i)*w*.12;cloud(c,x,h*(1-p),w*(.08+p*.12),h*(.05+p*.10),'210,224,207',Math.sin(p*Math.PI)*.20*o.intensity);}
  },
  smoke(c,w,h,o){
    c.globalAlpha*=o.intensity;
    // The rising plume feeds a continuous, dark ceiling bank with a rolling edge.
    for(let i=0;i<11;i++){
      const p=phase(o.t,.16,hash(o.seed,i)),x=w*(.5+Math.sin(p*5+i)*(.035+p*.11));
      cloud(c,x,h*(1-p),Math.min(w*.32,.25+p*1.65),h*(.07+p*.12),'35,37,33',Math.sin(p*Math.PI)*.63);
    }
    const bank=c.createLinearGradient(0,0,0,h*.42);
    bank.addColorStop(0,'rgba(24,29,27,.82)');bank.addColorStop(.54,'rgba(33,37,32,.69)');bank.addColorStop(1,'rgba(45,47,38,0)');
    c.fillStyle=bank;c.fillRect(0,0,w,h*.42);
    for(let i=0;i<8;i++){
      const x=w*(i+.5)/8+Math.sin(o.t*.3+i)*w*.018,y=h*(.14+Math.sin(o.t*.43+i*1.7)*.025);
      cloud(c,x,y,w*.21,h*.19,'32,36,31',.53);
    }
  },
  flames(c,w,h,o){
    c.globalAlpha*=o.intensity;
    const flicker=.92+Math.sin(o.t*8.1)*.055+Math.sin(o.t*13.7)*.025;
    // Light reaches the wall well above the fuel, and pools along the floor.
    c.save();c.globalCompositeOperation='screen';
    cloud(c,w*.51,h*.76,w*.48,h*.88,'255,119,35',.42*flicker);
    cloud(c,w*.51,h-.06,w*.44,Math.min(.47,h*.13),'255,171,54',.66*flicker);c.restore();
    // A ragged common firebed connects three unequal groups instead of candles.
    const left=w*.14,right=w*.86,baseHeight=Math.min(h*.13,.48);
    c.beginPath();c.moveTo(left,h);
    for(let i=1;i<=22;i++){
      const q=i/22,x=left+(right-left)*q,
        rise=Math.sin(q*Math.PI)*baseHeight*(.4+hash(o.seed,i+150)*.5+Math.sin(o.t*6+i*.9)*.16);
      c.quadraticCurveTo(x-(right-left)/44,h-rise-baseHeight*.14,x,h-rise);
    }
    c.lineTo(right,h);c.closePath();c.fillStyle=gradient(c,0,h-baseHeight,0,baseHeight,'#e9712e','#ffbd55');c.fill();
    const groups=Math.max(1,Math.min(3,Math.ceil(w/4))),spread=Math.min(1,w*.1);
    for(let i=0;i<groups*3;i++){
      const group=Math.floor(i/3),slot=i%3,jitter=hash(o.seed,i),
        center=w*(.21+.58*(group+.5)/groups)+(hash(o.seed,group+190)-.5)*spread*.35,
        x=center+(slot-1)*spread*(.42+jitter*.24),
        breath=.82+Math.sin(o.t*(5.4+jitter*1.8)+jitter*TAU)*.12+Math.sin(o.t*10.7+i)*.055,
        hh=Math.min(h*.88,2.9)*(slot===1?.77+hash(o.seed,i+7)*.23:.35+hash(o.seed,i+7)*.37)*breath,
        ww=Math.min(w*.16,slot===1?.47+hash(o.seed,i+30)*.22:.20+hash(o.seed,i+30)*.26),
        bend=(i%2?1:-1)*ww*(.9+Math.sin(o.t*4.7+i*2.2)*.62);
      const outer=c.createLinearGradient(0,h-hh,0,h);
      outer.addColorStop(0,'#ca492e');outer.addColorStop(.29,'#ed6b29');outer.addColorStop(.78,'#f49a36');outer.addColorStop(1,'#f7bc55');
      tongue(c,x,h,ww,hh,bend,outer);
      tongue(c,x-ww*.06,h,ww*.67,hh*.73,bend*.66,gradient(c,0,h-hh*.73,0,hh*.73,'#ffb640','#ffd772'));
      tongue(c,x-ww*.12,h,ww*.34,hh*(.38+jitter*.13),bend*.35,'#fff0ad');
    }
    for(let i=0;i<15;i++){
      const p=phase(o.t,.31+hash(o.seed,i+80)*.20,hash(o.seed,i+100)),
        x=w*(.23+hash(o.seed,i+120)*.54)+Math.sin(p*7+i)*.17,y=h*(1-p*.91),a=Math.sin(p*Math.PI);
      if(a<.04)continue;
      line(c,[x-.025,y+.12,x,y],`rgba(239,112,38,${a*.8})`,.032);
      ellipse(c,x,y,.029,.042,`rgba(255,218,127,${a})`);
    }
  },
  sparks(c,w,h,o){
    // A sustained shower with a short rest: visible through most of the cycle.
    const cycle=phase(o.t,.8,hash(o.seed,2)+.17);if(cycle>.84)return;
    c.globalAlpha*=o.intensity;
    const p=cycle/.84,reach=Math.min(w*.42,h*.63,2.1),ox=w*.5,oy=h*.35;
    cloud(c,ox,oy,.22,.22,'255,206,113',(1-p)*.45);
    for(let i=0;i<23;i++){
      const q=.10+((p*1.35+hash(o.seed,i+70)*.55)%.90);
      const a=-Math.PI+hash(o.seed,i)*Math.PI*1.35,speed=reach*(.5+hash(o.seed,i+20)*.65),
        x=ox+Math.cos(a)*q*speed,y=oy+Math.sin(a)*q*speed+q*q*.8,
        trail=.065+q*.17,alpha=1-q*.63;
      line(c,[x-Math.cos(a)*trail,y-Math.sin(a)*trail-q*.10,x,y],`rgba(255,172,64,${alpha})`,.065);
      ellipse(c,x,y,.044,.044,`rgba(255,246,197,${alpha})`);
    }
  },
  gas(c,w,h,o){
    c.globalAlpha*=o.intensity;
    // A connected bank avoids both the invisible haze and a row of cloud icons.
    const left=w*.05,right=w*.95,mid=h*.61,thickness=Math.min(h*.23,.9),n=12,
      edge=(i,lower=false)=>{
        const q=i/n,envelope=Math.pow(Math.max(0,Math.sin(q*Math.PI)),.45),
          swell=.40+.76*Math.pow(Math.sin(q*5.8+hash(o.seed,91)*2+o.t*.23),2),
          drift=Math.sin(q*6+o.t*.43)*thickness*.24;
        return mid+drift+(lower?1:-1)*thickness*envelope*(swell+hash(o.seed,i+(lower?30:0))*.19);
      };
    c.beginPath();c.moveTo(left,mid);
    for(let i=0;i<n;i++){
      const x=left+(right-left)*i/n,next=left+(right-left)*(i+1)/n;
      c.quadraticCurveTo((x+next)*.5,edge(i)-thickness*.22,next,i===n-1?mid:edge(i+1));
    }
    for(let i=n-1;i>=0;i--){
      const x=left+(right-left)*i/n,next=left+(right-left)*(i+1)/n;
      c.quadraticCurveTo((x+next)*.5,edge(i,true)+thickness*.13,x,i===0?mid:edge(i,true));
    }
    c.closePath();
    const g=c.createLinearGradient(0,mid-thickness,0,mid+thickness);
    g.addColorStop(0,'rgba(186,195,91,.20)');g.addColorStop(.40,'rgba(166,181,69,.37)');g.addColorStop(1,'rgba(122,143,53,.17)');
    c.fillStyle=g;c.fill();c.strokeStyle='rgba(194,204,108,.28)';c.lineWidth=.026;c.stroke();
    for(let i=0;i<7;i++){
      const x=w*(.16+i*.11)+Math.sin(o.t*.38+i)*w*.025,y=mid+Math.sin(o.t*.65+i*1.7)*thickness*.39;
      cloud(c,x,y,w*.18,thickness*.80,'185,193,84',.24);
    }
  },
  radioactiveDust(c,w,h,o){
    c.globalAlpha*=o.intensity;
    for(let i=0;i<28;i++){
      const x=phase(o.t,.003,hash(o.seed,i))*w+Math.sin(o.t*.23+i)*.08,
        y=phase(o.t,.009,hash(o.seed,i+30))*h,
        p=Math.pow(Math.max(0,Math.sin(o.t*1.7+hash(o.seed,i+60)*TAU)),8),r=.022+p*.025;
      ellipse(c,x,y,r,r,`rgba(224,223,135,${.26+p*.67})`);
      if(p>.45){
        cloud(c,x,y,.15,.15,'196,203,98',p*.16);
        line(c,[x-.08*p,y,x+.08*p,y],`rgba(246,241,174,${p*.8})`,.027);
        line(c,[x,y-.085*p,x,y+.085*p],`rgba(246,241,174,${p*.8})`,.025);
      }
    }
  },
  ash(c,w,h,o){
    for(let i=0;i<35;i++){const p=phase(o.t,.04+hash(o.seed,i)*.04,hash(o.seed,i+40)),x=(hash(o.seed,i+20)*w+o.t*.16+Math.sin(p*6+i)*.2)%w,y=p*h;
      ellipse(c,x,y,.018+hash(o.seed,i+70)*.025,.012,'rgba(190,181,157,.48)');}
  },
};
export function drawEffect(c,id,rect,cellPx,opts={}){const draw=painters[id];if(draw)local(c,rect,cellPx,opts,draw);}
export const drawFallingDust=(...a)=>local(...a.slice(0,3),a[3]??{},painters.fallingDust);
export const drawCracks=(...a)=>local(...a.slice(0,3),a[3]??{},painters.cracks);
export const drawCollapse=(...a)=>local(...a.slice(0,3),a[3]??{},painters.collapse);
export const drawSteam=(...a)=>local(...a.slice(0,3),a[3]??{},painters.steam);
export const drawSmoke=(...a)=>local(...a.slice(0,3),a[3]??{},painters.smoke);
export const drawFlames=(...a)=>local(...a.slice(0,3),a[3]??{},painters.flames);
export const drawSparks=(...a)=>local(...a.slice(0,3),a[3]??{},painters.sparks);
export const drawGas=(...a)=>local(...a.slice(0,3),a[3]??{},painters.gas);
export const drawRadioactiveDust=(...a)=>local(...a.slice(0,3),a[3]??{},painters.radioactiveDust);
export const drawAsh=(...a)=>local(...a.slice(0,3),a[3]??{},painters.ash);
