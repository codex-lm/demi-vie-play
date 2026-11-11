import {TAU,hash,clamp} from './palette.js';
import {ellipse,line,gradient} from './primitives.js';

function local(c,r,cell,o,draw){
  if(!c||!r||![r.x,r.y,r.w,r.h,cell].every(Number.isFinite)||r.w<=0||r.h<=0||cell<=0)return;
  c.save();c.beginPath();c.rect(r.x,r.y,r.w,r.h);c.clip();c.translate(r.x,r.y);c.scale(cell,cell);
  draw(r.w/cell,r.h/cell,{...o,t:Number.isFinite(o.t)?o.t:0,seed:o.seed??1});c.restore();
}
function colors(o){return o.contaminated?['rgba(118,149,94,.38)','rgba(43,83,61,.70)','#c3d6a5']:o.dirty?['rgba(139,127,85,.48)','rgba(69,58,39,.77)','#e1cba0']:['rgba(103,172,171,.38)','rgba(29,79,91,.68)','#c4e2d5'];}
function wave(x,t){return Math.sin(x*2.1+t*1.6)*.024+Math.sin(x*4.7-t*.9)*.011;}

/** Paint a supplied simulation contour in pixel coordinates. This variant keeps
 * every fractional cell level; it never replaces an irregular pool by a tank. */
function drawWaterContour(c,r,cellPx,o){
  const [top,bottom]=o.bodyTint ? (o.contaminated?['rgba(114,159,143,.55)','rgba(19,55,56,.76)']:o.dirty?['rgba(144,145,111,.55)','rgba(49,60,48,.76)']:['rgba(108,177,179,.51)','rgba(19,64,76,.73)']) : colors(o);
  c.save();o.contour(c);
  const g=c.createLinearGradient(0,r.y,0,r.y+r.h);
  g.addColorStop(0,top);g.addColorStop(1,bottom);c.fillStyle=g;c.fill();c.clip();
  for(let i=0;i<4;i++){
    const y=r.y+r.h*(i+.45)/4,drift=Math.sin((o.t??0)*.55+i*1.7)*cellPx*.12;
    c.beginPath();c.moveTo(r.x+cellPx*.1,y);
    c.bezierCurveTo(r.x+r.w*.3,y-cellPx*.1+drift,r.x+r.w*.65,y+cellPx*.1-drift,r.x+r.w-cellPx*.1,y);
    c.strokeStyle=i%2?'rgba(185,218,195,.09)':'rgba(163,202,189,.14)';c.lineWidth=cellPx*.027;c.stroke();
  }
  c.restore();
}

/** Pixel rect, normalized level (or flood alias). Optional contour(ctx) supplies
 * a closed pixel path for cellular water; its geometry is owned by the caller. */
export function drawWaterBody(c,r,cellPx,o={}){
  if(typeof o.contour==='function'){
    if(c&&r&&[r.x,r.y,r.w,r.h,cellPx].every(Number.isFinite)&&r.w>0&&r.h>0&&cellPx>0)drawWaterContour(c,r,cellPx,o);
    return;
  }
  local(c,r,cellPx,o,(w,h,p)=>{
  const level=clamp(Number(p.level??p.flood??0)||0);if(!level)return;
  const y=h*(1-level),a=Math.min(1,h*level*5),[top,bottom,shine]=colors(p);
  c.beginPath();c.moveTo(0,h);
  const steps=Math.max(12,Math.min(160,Math.ceil(w*7)));
  for(let i=0;i<=steps;i++){const x=i*w/steps;c.lineTo(x,y+wave(x,p.t)*a);}
  c.lineTo(w,h);c.closePath();c.save();c.clip();
  c.fillStyle=gradient(c,0,y,0,h-y,top,bottom);c.fillRect(0,y-.05,w,h-y+.05);
  // A broad translucent surface band separates the flood from warm furnishings.
  c.fillStyle=gradient(c,0,y,0,.22,shine+'50',shine+'00');c.fillRect(0,y-.04,w,.27);
  // Broad caustics remain transparent enough to read submerged objects.
  for(let i=0;i<4;i++){
    const yy=y+(h-y)*(i+.45)/4,drift=Math.sin(p.t*.55+i*1.7)*.12;
    c.beginPath();c.moveTo(.1,yy);c.bezierCurveTo(w*.3,yy-.10+drift,w*.65,yy+.10-drift,w-.1,yy);
    c.strokeStyle=i%2?'rgba(185,218,195,.09)':'rgba(163,202,189,.14)';c.lineWidth=.027;c.stroke();
  }
  if(p.contaminated)for(let i=0;i<Math.min(22,Math.ceil(w*2));i++){
    const x=hash(p.seed,i)*w,yy=y+hash(p.seed,i+60)*(h-y),pulse=Math.pow(Math.max(0,Math.sin(p.t*1.3+hash(p.seed,i+90)*TAU)),10);
    ellipse(c,x,yy,.012+pulse*.018,.012+pulse*.018,`rgba(205,211,140,${.08+pulse*.22})`);
  }
  c.restore();const points=[];for(let i=0;i<=steps;i++){const x=i*w/steps;points.push(x,y+wave(x,p.t)*a);}
  line(c,points,'#172f34a0',.105);line(c,points,shine+'dd',.047);
  for(let i=0;i<Math.min(16,Math.ceil(w));i++){
    const x=(hash(p.seed,i+100)*w+p.t*.05)%w,yy=y+wave(x,p.t)*a+.07;
    line(c,[x,yy,Math.min(w,x+.16+hash(p.seed,i+120)*.3),yy],shine+'88',.018);
  }
});}

export function drawDrip(c,r,cellPx,o={}){local(c,r,cellPx,o,(w,h,p)=>{
  const count=Math.max(1,Math.min(12,Math.ceil(w*.7))),col=colors(p)[2];
  for(let i=0;i<count;i++){
    const x=(.1+hash(p.seed,i)*.8)*w,phase=((p.t*(.45+hash(p.seed,i+20)*.3)+hash(p.seed,i+40))%1+1)%1;
    if(phase<.83){const yy=Math.min(h-.06,phase*phase/(.83*.83)*h);ellipse(c,x,yy,.023,.04+phase*.045,col+'b0');}
    else {const q=(phase-.83)/.17;c.globalAlpha=(1-q)*.6;c.beginPath();c.ellipse(x,h-.025,.03+q*.24,.012+q*.025,0,0,TAU);c.strokeStyle=col;c.lineWidth=.018;c.stroke();c.globalAlpha=1;}
  }
});}

export function drawSeep(c,r,cellPx,o={}){local(c,r,cellPx,o,(w,h,p)=>{
  const [top,bottom,col]=colors(p);
  for(let i=0;i<Math.max(3,Math.min(16,Math.ceil(w*2)));i++){
    const x=hash(p.seed,i+4)*w,len=h*(.25+hash(p.seed,i+12)*.68),wide=.03+hash(p.seed,i+22)*.09;
    c.beginPath();c.moveTo(x-wide,0);c.bezierCurveTo(x+wide*2,len*.3,x-wide,len*.7,x,len);c.bezierCurveTo(x+wide,len*.5,x+wide*3,len*.2,x+wide,0);c.closePath();
    c.fillStyle=gradient(c,0,0,0,len,bottom,'rgba(75,120,112,0)');c.fill();
    const y=((p.t*.14+hash(p.seed,i+32))%1)*len;line(c,[x,y,x,y+.08],col+'66',.017);
  }
});}

export function drawPuddle(c,r,cellPx,o={}){local(c,r,cellPx,o,(w,h,p)=>{
  const [top,bottom,col]=colors(p),cx=w*.5,cy=h*.62,rx=w*.45,ry=h*.32;
  ellipse(c,cx,cy,rx,ry,bottom);ellipse(c,cx,cy-h*.025,rx*.91,ry*.83,top);
  for(let i=0;i<2;i++){const q=((p.t*.55+i*.5)%1+1)%1;c.globalAlpha=(1-q)*.42;c.beginPath();c.ellipse(cx+Math.sin(i*3)*rx*.3,cy,rx*q*.85,ry*q*.7,0,0,TAU);c.strokeStyle=col;c.lineWidth=.018;c.stroke();}
});}

/** Transparent aquifer overlay, after sand and before excavated rooms. level is
 * the saturated fraction of rect height: 0 = dry, 1 = table at the top. The game
 * controls the spring rise through level; t animates only seepage, never level. */
export function drawWaterTable(c,r,cellPx,o={}){local(c,r,cellPx,o,(w,h,p)=>{
  const level=clamp(Number(p.level)||0);if(!level)return;
  const y=h*(1-level),capillary=Math.min(.7,h*.18),amplitude=Math.min(.018,h*level*.15);
  const lineY=x=>y+Math.sin(x*1.7+p.t*.55)*amplitude+Math.sin(x*3.9-p.t*.31)*amplitude*.4;
  // Saturated sand stays visible through broad cool washes, not a free-water tank.
  const damp=gradient(c,0,y-capillary,0,h-y+capillary,'rgba(46,98,101,0)','rgba(29,78,88,.52)');
  c.fillStyle=damp;c.fillRect(0,y-capillary,w,h-y+capillary);
  c.fillStyle=gradient(c,0,y-capillary,0,capillary,'rgba(84,137,133,0)','rgba(80,144,142,.26)');c.fillRect(0,y-capillary,w,capillary);
  // Branched wet fissures climb above the rising boundary. Motion seeks from t.
  const count=Math.min(24,Math.max(4,Math.ceil(w*.8)));
  for(let i=0;i<count;i++){
    const x=hash(61,i+12)*w,reach=capillary*(.32+hash(61,i+42)*.68),top=y-reach;
    const bend=(hash(61,i+62)-.5)*.40,phase=((p.t*.17+hash(61,i+92))%1+1)%1;
    line(c,[x,y+.04,x+bend*.45,y-reach*.45,x+bend,top],'rgba(26,67,73,.30)',.065);
    line(c,[x,y+.04,x+bend*.45,y-reach*.45,x+bend,top],'rgba(143,193,183,.33)',.022);
    if(i%3===0)line(c,[x+bend*.45,y-reach*.45,x+bend+.13,top+.08],'rgba(97,156,153,.43)',.019);
    const py=y-phase*reach,px=x+bend*phase;
    ellipse(c,px,py,.018,.029,'rgba(185,219,206,.47)');
  }
  // One continuous, modestly bright meniscus makes the height legible at zoom 1.
  const points=[],steps=Math.max(12,Math.min(160,Math.ceil(w*6)));
  for(let i=0;i<=steps;i++){const x=i*w/steps;points.push(x,lineY(x));}
  line(c,points,'rgba(19,56,66,.72)',.105);
  line(c,points,'rgba(173,214,205,.82)',.042);
  for(let i=0;i<Math.min(45,Math.ceil(w*(h-y)*.65));i++){
    const x=hash(61,i+152)*w,py=y+hash(61,i+172)*(h-y),pulse=.15+.10*Math.sin(p.t*.8+i*2.3);
    ellipse(c,x,py,.018,.012,`rgba(185,212,192,${pulse})`);
  }
});}
