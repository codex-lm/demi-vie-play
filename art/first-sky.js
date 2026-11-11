import {hash} from './palette.js';
import {ellipse, line, poly, gradient} from './primitives.js';
import {snowCover} from './surface.js';
import {colonistFeatures, colonistOutfit} from './colonist.js';

const DEFAULT_PEOPLE = Object.freeze([
  {seed:3,age:'adult',job:'farmer'}, {seed:19,age:'child',job:'none'},
  {seed:42,age:'adult',job:'digger'}, {seed:5,age:'elder',job:'medic'},
  {seed:11,age:'child',job:'none'},
].map(Object.freeze));
const ageOf = age => typeof age === 'number' ? age < 16 ? 'child' : age >= 65 ? 'elder' : 'adult' : ['child','elder'].includes(age) ? age : 'adult';
const finite = (n,fallback=0) => Number.isFinite(n) ? n : fallback;

function hill(c,w,y,height,color,seed) {
  const points=Array.from({length:19},(_,i)=>[i*w/16-20,y+Math.sin(i*.51+seed)*height*.35+hash(seed,i)*height*.3]);
  c.beginPath();c.moveTo(...points[0]);
  for(let i=1;i<points.length-1;i++){
    const a=points[i],b=points[i+1];c.quadraticCurveTo(a[0],a[1],(a[0]+b[0])/2,(a[1]+b[1])/2);
  }
  c.lineTo(w+20,20000);c.lineTo(-20,20000);c.closePath();c.fillStyle=color;c.fill();
}

function cloud(c,x,y,w,alpha) {
  // Overlapping, feathered wisps rather than a single hard triangular cloud.
  c.save();c.globalAlpha*=alpha;
  for(let i=0;i<9;i++){
    c.save();c.translate(x+(i-4)*w*.084,y+Math.sin(i*.75)*4-i*.55);
    c.scale(w*(.13+hash(12,i)*.11),3+hash(7,i)*6);
    const mist=c.createRadialGradient(0,0,0,0,0,1);
    mist.addColorStop(0,'rgba(255,249,228,.72)');mist.addColorStop(.46,'rgba(255,249,228,.24)');mist.addColorStop(1,'rgba(255,249,228,0)');
    ellipse(c,0,0,1,1,mist);c.restore();
  }
  c.restore();
}

function ruins(c,w,horizon) {
  // The lost city stays at the edges. Nothing interrupts the child's open sky.
  for(const side of [-1,1]) {
    c.save();if(side===1){c.translate(w,0);c.scale(-1,1);}
    for(let i=0;i<10;i++) {
      const x=i*24-12,hh=16+hash(97,i)*49;
      const color=i<5?'#a7b2a4':'#b4bcaa';
      poly(c,[x,horizon+8,x,horizon-hh,x+8,horizon-hh,x+8,horizon-hh+10,x+17,horizon-hh+4,x+21,horizon-hh+17,x+21,horizon+8],color,null);
      if(i<6)for(let j=0;j<3;j++) {
        c.fillStyle='#c9cdb7';c.fillRect(x+4,horizon-hh+22+j*9,4,5);
      }
    }
    line(c,[34,horizon-38,41,horizon-50,41,horizon-76,44,horizon-76,44,horizon-47,53,horizon-37],'#9da99d',2);
    c.restore();
  }
}

function grass(c,x,y,height,seed,t,season) {
  const sway=Math.sin(t*.55+seed)*height*.07;
  const color=season==='autumn'?'#8e8860':season==='winter'?'#8b9488':'#758366';
  c.beginPath();c.moveTo(x,y);c.quadraticCurveTo(x-2+sway,y-height*.7,x-5+sway,y-height);c.strokeStyle=color;c.lineWidth=1.15;c.stroke();
  c.beginPath();c.moveTo(x,y);c.quadraticCurveTo(x+2+sway,y-height*.5,x+7+sway,y-height*.62);c.lineWidth=.95;c.stroke();
  if(seed%5===0){ellipse(c,x-5+sway,y-height,1.5,3.7,season==='spring'?'#e3d9ac':'#b6aa73');}
}

// Back view drawn in its own body coordinates. No front-facing facial marks.
function person(c,p,x,y,height,t,gesture='rest',joinedHand=null) {
  const age=ageOf(p.age),f=colonistFeatures(finite(p.seed,1),age),dress=colonistOutfit(p.job);
  const child=age==='child',elder=age==='elder',wide=f.width;
  const sway=Math.sin(t*.62+finite(p.seed))*0.75,stance=hash(finite(p.seed,1),17)*5;
  c.save();c.translate(x,y);c.scale(height/200,height/200);
  ellipse(c,8,2,32,5,'rgba(36,49,43,.22)');
  // Broad legs, cuffed trousers and weighted shoes anchor the figure to the earth.
  poly(c,[-21,-81,0,-80,1,-15,-5,-3,-23,-3,-22,-38], '#394a47','#2d3935',1.2);
  poly(c,[0,-81,22,-81,19,-42,25,-7-stance,18,-2-stance,6,-3-stance,4,-40], '#45524a','#2d3935',1.2);
  poly(c,[-24,-10,-7,-9,-5,-1,-10,3,-30,2,-31,-3], '#313c37',null);
  poly(c,[8,-10-stance,24,-10-stance,32,-2-stance,29,3-stance,9,3-stance,5,-1-stance], '#303b36',null);
  line(c,[-22,-14,-7,-13],'#858878',1.4);line(c,[8,-14-stance,23,-13-stance],'#858878',1.3);
  c.translate(sway,0);c.scale(wide,1);
  // Coat or cardigan: uneven hem and panel seams, subdued in the backlight.
  c.beginPath();c.moveTo(-13,-157);c.quadraticCurveTo(-27,-155,-32,-140);
  c.lineTo(-27,-106);c.lineTo(-31,-76);c.quadraticCurveTo(-7,-70,0,-76);
  c.quadraticCurveTo(17,-70,30,-78);c.lineTo(25,-116);c.lineTo(29,-143);
  c.quadraticCurveTo(19,-159-stance,11,-158);c.closePath();
  c.fillStyle=gradient(c,-30,-160,65,88,dress[2],dress[0]);c.fill();
  c.strokeStyle='#35423c';c.lineWidth=1.6;c.stroke();
  c.save();c.globalAlpha*=.35;c.fillStyle='#243c3c';c.fillRect(-23,-142,47,63);c.restore();
  line(c,[-26,-145,-24,-151,-14,-156],'#e6d6ad',1.25);
  line(c,[-11,-151,-16,-119,-12,-85],'#a8a58a',1);
  line(c,[20,-143,14,-111,18,-81],'rgba(32,44,38,.5)',1.5);
  line(c,[-25,-82,-6,-79,0,-82,20,-79],'#b3ab8a',.8);
  if(p.job==='hauler'||p.job==='tech'||p.job==='digger') {
    line(c,[-18,-154,16,-85],'#504b3d',5);
    poly(c,[8,-114,29,-111,31,-87,10,-89], '#786e50','#3d4438',1.3);
    line(c,[12,-107,27,-105],'#b4ab83',1.2);
  }
  // Arms: the child's palm faces the sky, the parent's hand meets a small hand.
  let left=[-24,-146,-34,-119,-36,-96],right=[24,-145,34,-120,35,-100];
  if(gesture==='hold')right=[24,-145,39,-111,48,-79];
  if(gesture==='wonder'){
    left=[-24,-145,-35,-124,-45,-118];
    right=[23,-145,40,-179,48,-230];
  }
  if(gesture==='climb'){left=[-23,-145,-47,-132,-52,-151];right=[23,-145,38,-170,36,-187];}
  if(gesture==='emerge'){left=[-23,-145,-46,-112,-39,-89];right=[23,-145,46,-122,41,-105];}
  if(joinedHand){const tip=[((joinedHand.x-x)/(height/200)-sway)/wide,(joinedHand.y-y)/(height/200)];
    if(gesture==='hold'){right[4]=tip[0];right[5]=tip[1];}else if(gesture==='wonder'){left[4]=tip[0];left[5]=tip[1];}}
  line(c,left,'#35433c',13);line(c,left,dress[2],9);
  line(c,right,'#35433c',13);line(c,right,dress[2],9);
  ellipse(c,left[4],left[5],4,5,f.skin);ellipse(c,right[4],right[5],4,5,f.skin);
  if(gesture==='wonder') {
    line(c,[48,-229,48,-241],f.skin,2.4);line(c,[48,-231,54,-236],f.skin,2.1);
  }
  // Narrow nape and ears; upward tipped hair crown, no eyes or face.
  poly(c,[-8,-171,9,-171,9,-155,1,-151,-9,-157],f.skin,null);
  c.save();c.translate(0,-171);c.rotate(gesture==='wonder'?.13:elder?-.06:.015);c.translate(0,171);
  ellipse(c,-15,-178,3,5,f.skin);ellipse(c,15,-178,3,5,f.skin);
  c.beginPath();c.moveTo(-15,-177);c.bezierCurveTo(-23,-200,-7,-209,8,-205);
  c.bezierCurveTo(24,-202,20,-181,14,-170);c.quadraticCurveTo(2,-165,-10,-172);c.closePath();
  c.fillStyle=f.hair;c.fill();c.strokeStyle='#3a4238';c.lineWidth=1;c.stroke();
  if(f.style===4&&!child)ellipse(c,-13,-185,8,8,f.hair);
  if(f.style===3){poly(c,[-14,-186,-12,-161,-5,-158,4,-170,-3,-193],f.hair,null);}
  line(c,[-16,-186,-14,-197,-6,-202,5,-203],'#e9d9b1',1.5);c.restore();
  // A scarf lifts a little in air the child has never felt before.
  poly(c,[-14,-159,2,-153,13,-160,16,-153,0,-145,-16,-153],f.scarf,null);
  if(child) {
    const lift=Math.sin(t*.7+finite(p.seed)) * 2;
    poly(c,[7,-151,18,-149,33,-147+lift,27,-141+lift,13,-143],f.scarf,null);
    line(c,[13,-149,28,-145+lift],'#dfcaa0',.8);
  }
  if(elder){line(c,[-37,-95,-42,-5],'#665e49',3);line(c,[-37,-95,-32,-99],'#aaa284',2);}
  c.restore();
}

function hatch(c,x,y,s) {
  c.save();c.translate(x,y);c.scale(s,s);
  // Open lid leans backward; inner rim retains a trace of the underground amber.
  poly(c,[-105,-27,-132,-130,-44,-145,-13,-51], '#58645c','#384a42',3);
  poly(c,[-99,-40,-120,-122,-50,-133,-25,-56], '#788174','#a5ac93',1.6);
  line(c,[-100,-116,-45,-126],'#bcc2a6',2);
  line(c,[-103,-85,-36,-96],'#58665c',5);
  ellipse(c,-78,-86,12,16,'#6e7a6c','#46594d',3);
  line(c,[-88,-88,-68,-84],'#aab69a',2);
  poly(c,[-108,-28,8,-52,95,-2,-31,28], '#939a7d','#46584c',3);
  poly(c,[-88,-22,6,-41,73,-2,-30,18], '#202d29',null);
  poly(c,[-84,-20,-31,12,-32,-2,-77,-28], '#4c4a34',null);
  line(c,[-37,8,-4,-34],'#b19d64',4);line(c,[-11,12,22,-24],'#897f54',4);
  for(let i=0;i<4;i++)line(c,[-32+i*7,2-i*9,-7+i*7,6-i*8],'#c9b77b',2);
  line(c,[-106,-25,-30,25,92,-3],'#b1b59a',2);
  poly(c,[-107,-25,-30,24,-31,37,-109,-10], '#4c5b49',null);
  poly(c,[-30,24,93,-3,91,8,-31,37], '#5e6a54',null);
  c.restore();
}

/** The first sky, in caller pixels. t is seconds; the caller owns the animation clock.
 * people omitted: a five-person illustration. An explicit [] remains an empty scene.
 * age accepts child/adult/elder or years. At most 16 supplied survivors are pictured;
 * children are placed in front, without inventing residents or changing the input.
 * The whole canvas is an image: UI captions belong to the integrating interface.
 */
export function drawFirstSky(c,w,h,options={}) {
  if(!c||![w,h].every(Number.isFinite)||w<=0||h<=0)return;
  const opts=options&&typeof options==='object'?options:{};
  const t=finite(opts.t),season=['winter','spring','summer','autumn'].includes(opts.season)?opts.season:'spring';
  const temperature=Number.isFinite(opts.surfaceTemperature)?opts.surfaceTemperature:null;
  const source=Array.isArray(opts.people)?opts.people:DEFAULT_PEOPLE;
  const people=source.filter(p=>p&&typeof p==='object').slice(0,16);
  const scale=Math.min(w/1200,h/720),W=w/scale,H=h/scale,horizon=H*.615;
  c.save();c.setLineDash([]);c.beginPath();c.rect(0,0,w,h);c.clip();c.scale(scale,scale);
  const sky=c.createLinearGradient(0,0,0,horizon+50);
  sky.addColorStop(0,'#9abfcf');sky.addColorStop(.52,'#ccded5');sky.addColorStop(1,'#eee6c5');
  c.fillStyle=sky;c.fillRect(0,0,W,H);
  const light=c.createRadialGradient(W*.67,H*.32,8,W*.67,H*.32,W*.48);
  light.addColorStop(0,'rgba(255,249,218,.50)');light.addColorStop(.45,'rgba(250,242,214,.16)');light.addColorStop(1,'rgba(250,242,214,0)');
  c.fillStyle=light;c.fillRect(0,0,W,horizon+50);
  cloud(c,W*.18+Math.sin(t*.017)*12,H*.19,220,.26);
  cloud(c,W*.78+Math.sin(t*.013)*15,H*.26,300,.28);
  cloud(c,W*.52+Math.sin(t*.019)*8,H*.46,160,.20);
  cloud(c,W*.10,H*.46,210,.16);
  // Very distant birds give a scale to the discovery, with no text inside the image.
  const birdX=W*.64+Math.sin(t*.04)*9,birdY=H*.34+Math.sin(t*.21)*1.5;
  for(let i=0;i<3;i++){
    const x=birdX+i*22,y=birdY+i*9,flap=Math.sin(t*1.1+i)*1.2;
    line(c,[x-4,y-1-flap,x,y+1,x+5,y-2-flap],'#899e94',.85);
  }
  ruins(c,W,horizon-2);
  hill(c,W,horizon+3,34,'#b7bda1',2);
  hill(c,W,horizon+24,42,'#a3ad8b',7);
  hill(c,W,horizon+73,58,season==='winter'?'#a9b3a1':season==='autumn'?'#8f9670':'#8c9a77',4);
  hill(c,W,horizon+132,65,season==='winter'?'#7f9383':'#718363',9);
  // A pale earth track opens towards the horizon; it is not an intact road.
  c.beginPath();c.moveTo(W*.52,horizon+18);c.bezierCurveTo(W*.44,horizon+90,W*.45,H*.87,W*.34,H+20);
  c.lineTo(W*.69,H+20);c.bezierCurveTo(W*.58,H*.84,W*.55,horizon+84,W*.52,horizon+18);
  c.fillStyle='#b7b391';c.fill();
  for(let i=0;i<170;i++){
    const x=hash(214,i)*W,y=horizon+35+hash(453,i)*(H-horizon-35),depth=(y-horizon)/(H-horizon);
    if(x>W*.41&&x<W*.65&&y>horizon+60)continue;
    grass(c,x,y,3+depth*20,i,t,season);
  }
  for(let i=0;i<40;i++){
    const x=hash(172,i)*W,y=horizon+80+hash(91,i)*(H-horizon-80);
    if(x>W*.3&&x<W*.68&&y>H*.78)continue;
    const r=1+hash(33,i)*5;
    poly(c,[x-r,y,x-r*.4,y-r*.5,x+r*.8,y-r*.3,x+r,y+2,x-r*.6,y+3],i%2?'#7c896f':'#a8ad8c',null);
  }
  // Ground snow follows the real surface temperature when the caller knows it;
  // the winter tint of the hills remains a season cue, like the grass colour.
  const patches=temperature===null?(season==='winter'?17:0):Math.round(17*snowCover(temperature)/.85);
  for(let i=0;i<patches;i++){
    const x=hash(34,i)*W,y=horizon+48+hash(72,i)*(H-horizon-48);
    ellipse(c,x,y,9+hash(11,i)*30,1.5+hash(15,i)*5,'#c4cbbc');
  }
  const baseline=H*.86,anchor=W*.53;
  // The opening is large enough to read as a hatch even at 800 x 600.
  const hatchX=anchor-170,hatchY=baseline+33,hatchScale=.85;
  hatch(c,hatchX,hatchY,hatchScale);
  const childIndex=people.findIndex(p=>ageOf(p.age)==='child'),adultIndex=people.findIndex(p=>ageOf(p.age)!=='child');
  const emergingIndex=people.findIndex((p,i)=>i!==adultIndex&&ageOf(p.age)!=='child');
  const leadChild=people[childIndex],leadAdult=people[adultIndex],emerging=people[emergingIndex];
  const selected=new Set([childIndex,adultIndex,emergingIndex]);
  const rest=people.filter((_,i)=>!selected.has(i));
  // A supplied survivor is still waist-deep in the shaft. The foreground lip
  // occludes the lower body; this is one resident, not a decorative extra person.
  if(emerging){
    c.save();c.beginPath();c.moveTo(0,0);c.lineTo(W,0);c.lineTo(W,hatchY-2*hatchScale);
    c.lineTo(hatchX+73*hatchScale,hatchY-2*hatchScale);c.lineTo(hatchX-30*hatchScale,hatchY+18*hatchScale);
    c.lineTo(hatchX-88*hatchScale,hatchY-22*hatchScale);c.lineTo(0,hatchY-22*hatchScale);c.closePath();c.clip();
    person(c,emerging,hatchX+5,hatchY+78,160,t,'emerge');c.restore();
    c.save();c.translate(hatchX,hatchY);c.scale(hatchScale,hatchScale);
    poly(c,[-107,-25,-30,24,-31,37,-109,-10], '#4c5b49',null);
    poly(c,[-30,24,93,-3,91,8,-31,37], '#5e6a54',null);
    line(c,[-106,-25,-30,25,92,-3],'#b1b59a',2);c.restore();
  }
  // Uneven spacing and depth leave a small, spontaneous group instead of a lineup.
  for(let i=rest.length-1;i>=0;i--) {
    const p=rest[i],side=i%2?1:-1,row=Math.floor(i/4),offset=109+Math.floor(i/2)*49;
    const py=baseline-26-row*22-(i%3)*16,ph=ageOf(p.age)==='child'?116:ageOf(p.age)==='elder'?164:174;
    person(c,p,anchor+side*offset+(side>0?40:0),py,ph*(1-row*.035),t,'rest');
  }
  const joinedHand=leadAdult&&leadChild?{x:anchor+24,y:baseline-79}:null;
  if(leadAdult)person(c,leadAdult,anchor-24,baseline,207,t,leadChild?'hold':'rest',joinedHand);
  if(leadChild)person(c,leadChild,anchor+55,baseline+3,139,t,'wonder',joinedHand);
  // Individual grasses at the near edge; the warm earth still remembers the bunker.
  hill(c,W,H-14,20,'#536b52',4);
  for(let i=0;i<62;i++)grass(c,hash(51,i)*W,H+3,7+hash(88,i)*27,i,t,season);
  c.restore();
}
