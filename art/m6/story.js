import { P, hash, seedOf, frame } from './common.js';
import { line, ellipse, box, poly, gradient, halo } from '../primitives.js';
import { drawColonist } from '../colonist.js';

export const STORY_KINDS = Object.freeze(['longLaw','coldAvoided','birth','radioSaved','radioSilent','fire','flood','collapse','famine','epidemic','cruelChoice','generousChoice','earlyDeparture','timelyDeparture','heirloomPassed','noLoss']);
const ln = (c,p,color=P.woodLight,w=1) => line(c,p,color,w);
const bx = (c,x,y,w,h,color,r=2,stroke=P.ink,lw=1) => box(c,x,y,w,h,color,r,stroke,lw);
const pl = (c,p,color,stroke=null,w=1) => poly(c,p,color,stroke,w);
const el = (c,x,y,rx,ry,color,stroke=null,w=1) => ellipse(c,x,y,rx,ry,color,stroke,w);

function room(c,seed,cool=false) {
  c.fillStyle=gradient(c,0,0,320,180,cool?'#293b3f':'#3c3630','#151f22');c.fillRect(0,0,320,180);
  for(let i=0;i<38;i++) {
    const x=hash(seed,i)*320,y=hash(seed,i+60)*142;
    ln(c,[x,y,x+12+hash(seed,i+90)*34,y-1,x+50,y+3],i%4?'#4e4c403e':'#8e785c40',.65);
  }
  pl(c,[0,144,320,144,320,180,0,180],'#34372e');
  for(let i=0;i<7;i++)ln(c,[i*55-50,180,i*35+33,144],'#82735344',.7);
  ln(c,[0,144,320,144],'#95815a',1);
}
function lamp(c,x=260,y=26) {
  ln(c,[x,0,x,y],'#1b2425',2); halo(c,x,y+8,90,.23);
  bx(c,x-7,y,14,20,'#c2a368',2,'#5c5e4b',2);bx(c,x-3,y+3,6,12,'#f2d9a0',1,null);
  ln(c,[x-10,y,x+10,y],'#817654',3);
}
function person(c,x,y,seed,pose='idle',age='adult',facing=1,job='none',scale=42) {
  drawColonist(c,x,y,scale,{seed,pose,age,facing,job,t:.7,mood:62});
}
function table(c,x=94,y=117,w=130) {
  bx(c,x,y,w,7,'#a18a5b',2);ln(c,[x+9,y+8,x+7,153],'#62533f',5);ln(c,[x+w-9,y+8,x+w-6,153],'#62533f',5);
  ln(c,[x+4,y+2,x+w-5,y+2],'#ceb180',1);
}
function bowl(c,x,y,full=false) {
  el(c,x,y+5,13,4,'#1c2424');pl(c,[x-13,y-2,x-9,y+7,x+8,y+7,x+13,y-2],'#7f9588','#283836',1);
  el(c,x,y-2,13,3,full?'#c4a26c':'#34413d','#a8b39c',.8);
}
function radio(c,x=86,y=68,on=true) {
  bx(c,x,y,150,62,'#896d47',5,'#b9a175',1.5);bx(c,x+7,y+6,136,48,'#354843',3);
  for(let i=0;i<13;i++)ln(c,[x+14+i*3,y+12,x+14+i*3,y+47],'#899680',1);
  bx(c,x+60,y+10,74,18,on?'#d2b971':'#68756b',1);
  for(let i=0;i<13;i++)ln(c,[x+64+i*5,y+13,x+64+i*5,y+19+(i%3)*2],'#65694d',.7);
  el(c,x+72,y+41,8,8,'#597061','#bcb58d',1.4);el(c,x+121,y+41,10,10,'#43594e','#bcb58d',1.4);
  ln(c,[x+22,y,x+19,y-19,x+2,y-42],'#879e92',2);
  if(on) {
    el(c,x+95,y+41,2.2,2.2,'#f9dda0');
    for(let i=0;i<3;i++){c.beginPath();c.arc(x+29,y-18,15+i*9,-.9,.4);c.strokeStyle=`rgba(199,181,128,${.65-i*.17})`;c.lineWidth=1.2;c.stroke();}
  } else ln(c,[x+57,y+22,x+135,y+22],'#263831',1);
}
function landscape(c,seed,winter=false) {
  c.fillStyle=gradient(c,0,0,0,180,winter?'#73858a':'#9ebec4',winter?'#c2c4b1':'#e9dfbb');c.fillRect(0,0,320,180);
  for(let i=0;i<15;i++){
    const x=i*25-9,h=17+hash(seed,i)*30;
    pl(c,[x,108,x,108-h,x+8,101-h,x+12,108-h,x+21,117-h,x+21,108],winter?'#727e76':'#a0ac94');
    if(i%2)bx(c,x+3,114-h,4,7,'#bec4b0',0,null);
  }
  pl(c,[0,106,67,114,151,101,242,112,320,102,320,180,0,180],winter?'#a7afa1':'#849573');
  pl(c,[161,105,151,139,109,180,221,180,176,130],winter?'#c4c8b5':'#c5bd99');
  for(let i=0;i<34;i++) {
    const x=hash(seed,i+30)*320,y=121+hash(seed,i+70)*59;
    ln(c,[x-3,y,x,y-7,x+1,y-2,x+4,y-5],winter?'#7c8a7b':'#566e51',.7);
  }
  if(winter)for(let i=0;i<55;i++){const x=hash(seed,i+120)*320,y=hash(seed,i+200)*180;ln(c,[x,y,x+3,y+2],'#e0e2cfaa',1);}
}
function blanket(c,x,y,w=66) {
  c.beginPath();c.moveTo(x,y+5);c.bezierCurveTo(x+w*.2,y-2,x+w*.45,y+3,x+w*.65,y);c.quadraticCurveTo(x+w,y-3,x+w,y+9);c.lineTo(x+w-3,y+20);c.quadraticCurveTo(x+w*.5,y+16,x+3,y+21);c.closePath();c.fillStyle=gradient(c,x,y,w,19,'#9caca0','#617e76');c.fill();c.strokeStyle='#3a4945';c.lineWidth=1;c.stroke();
  for(let i=0;i<5;i++)ln(c,[x+12+i*9,y+4,x+8+i*9,y+15],'#b8c2a080',.8);
}
function drawing(c,kind,seed) {
  if(['earlyDeparture','timelyDeparture','noLoss'].includes(kind))landscape(c,seed,kind==='earlyDeparture');
  else {room(c,seed,['coldAvoided','radioSilent','flood','epidemic'].includes(kind));lamp(c,kind==='birth'?151:260);}
  switch(kind) {
    case 'longLaw': {
      bx(c,38,28,65,80,'#c8b88f',2,'#6c614b',2);ln(c,[50,46,87,46],'#5b614e',2);
      for(let row=0;row<5;row++)for(let col=0;col<5;col++)ln(c,[50+col*8,57+row*8,55+col*8,52+row*8],'#736447',.9);
      el(c,188,42,18,18,'#cabf9c','#766c52',3);ln(c,[188,31,188,42,199,47],'#414d45',2);
      person(c,151,155,35,'dig','adult',1,'digger');person(c,236,155,19,'sit','adult',-1,'tech');break;
    }
    case 'coldAvoided': {
      bx(c,25,20,53,65,'#587274',2,'#9da68e',3);
      for(let i=0;i<6;i++)ln(c,[27+i*8,24,35+i*8,43,29+i*8,52],'#d6ddc580',1);
      bx(c,198,94,57,47,'#686a58',4,'#aba177',2);bx(c,207,108,34,22,'#b8693f',2);
      halo(c,219,121,85,.25);for(let i=0;i<5;i++)ln(c,[210+i*6,109,210+i*6,131],'#3a4139',2);
      person(c,113,149,18,'sit','adult',1);person(c,160,153,31,'sit','child',-1);blanket(c,95,118,84);break;
    }
    case 'birth': {
      person(c,90,153,34,'sit','adult',1);person(c,229,151,8,'idle','adult',-1,'medic');
      bx(c,125,124,72,18,'#8b704c',3);ln(c,[126,123,130,157,192,157,195,123],'#b6a074',3);
      blanket(c,126,112,68);el(c,138,116,7,6,'#dfba8e');ln(c,[133,116,138,117,141,115],'#8c7052',.6);
      ln(c,[121,160,147,165,185,164,204,158],'#bda274',3);break;
    }
    case 'radioSaved': case 'radioSilent': {
      table(c,66,131,197);radio(c,84,63,kind==='radioSaved');
      bx(c,243,112,18,18,'#94a89a',2);if(kind==='radioSaved')halo(c,163,85,56,.09);
      else {bx(c,31,143,22,8,'#8a7f61',0);ln(c,[36,141,40,134,46,144],'#b9aa7c',1);}break;
    }
    case 'fire': {
      bx(c,201,48,75,93,'#62533c',0);ln(c,[213,50,213,138,265,138,265,51],'#a68753',3);
      for(let i=0;i<13;i++) {
        const x=185+i*7,h=22+hash(seed,i)*62;
        c.beginPath();c.moveTo(x,151);c.bezierCurveTo(x-14,136,x+5,125,x+2,151-h);c.bezierCurveTo(x+18,120,x+9,127,x+14,147);c.closePath();c.fillStyle=i%3?'#c38042':'#e0ab5a';c.fill();
        pl(c,[x+2,149,x+3,133-h*.25,x+9,150],'#edd590');
      }
      for(let i=0;i<7;i++)el(c,209+Math.sin(i)*18,60-i*12,23+i*3,11,'#1f272a88');
      person(c,103,159,9,'carry','adult',1,'tech');halo(c,226,112,100,.22);break;
    }
    case 'flood': {
      bx(c,200,92,60,45,'#8b734d',2);ln(c,[208,94,249,134],'#b5a177',2);
      person(c,118,161,23,'carry','adult',-1,'hauler');
      c.fillStyle=gradient(c,0,128,0,52,'#739f9b9c','#22434dc9');c.fillRect(0,128,320,52);
      for(let i=0;i<21;i++){const x=hash(seed,i)*300,y=131+hash(seed,i+44)*43;ln(c,[x,y,x+17,y+1,x+26,y],'#b2c5b07a',.7);}
      ln(c,[38,0,39,64,48,96,44,128],'#aad6cb',2);break;
    }
    case 'collapse': {
      ln(c,[36,20,54,32,62,28,73,49,98,58,114,88],'#111c20',4);
      for(let i=0;i<18;i++){
        const x=116+hash(seed,i)*143,y=109+hash(seed,i+20)*54,r=10+hash(seed,i+40)*19;
        pl(c,[x-r,y,x-r*.6,y-r,x+r*.5,y-r*.7,x+r,y+3,x,y+r*.4],i%2?'#727565':'#565e56','#323e3b',1);
      }
      person(c,68,159,11,'crisis','adult',1,'digger');
      for(let i=0;i<34;i++)el(c,110+hash(seed,i)*155,35+hash(seed,i+14)*100,1,1,'#b5a48180');break;
    }
    case 'famine': {
      person(c,62,153,17,'sit','adult',1);person(c,261,153,5,'sit','child',-1);table(c,81,113,155);
      bowl(c,116,111);bowl(c,202,111);bx(c,150,100,15,12,'#927a54',1);
      for(let row=0;row<3;row++)bx(c,115,29+row*23,95,4,'#6d634d',0);break;
    }
    case 'epidemic': {
      bx(c,43,125,148,7,'#8e967f',2);ln(c,[51,128,51,157,184,157,184,128],'#778b7b',3);
      person(c,119,128,28,'sleep','adult',1,'none',64);person(c,230,153,8,'work','adult',-1,'medic');
      ln(c,[32,51,32,147,24,153,42,153],'#a6b29b',2);bx(c,25,58,15,27,'#a2bcaa',3);
      ln(c,[32,85,42,105,71,113],'#bfcbb7',1);break;
    }
    case 'cruelChoice': case 'generousChoice': {
      const generous=kind==='generousChoice';
      bx(c,135,14,65,133,'#6b7262',2,'#abb297',2);bx(c,144,23,46,117,'#263939',1);
      if(!generous){bx(c,139,17,58,124,'#5b685f',0);ln(c,[146,97,188,97],'#b59b6c',5);el(c,184,86,3,3,'#cab681');}
      person(c,generous?120:96,157,21,'idle','adult',1,'hauler');person(c,generous?207:247,155,16,'idle','adult',-1);person(c,278,154,9,'idle','child',-1);
      if(generous){ln(c,[125,115,143,126,157,123],'#6f8e85',7);ln(c,[204,115,188,125,179,123],'#8d7970',7);bx(c,150,115,36,19,'#a58c60',2);el(c,166,115,12,5,'#d4b676');ln(c,[156,116,174,111],'#a2824f',1);el(c,151,125,4,3,'#b3956d');el(c,184,125,4,3,'#c3a582');}
      else {pl(c,[201,0,320,0,320,180,201,180],'#111b252e');bowl(c,238,153);}
      break;
    }
    case 'earlyDeparture': case 'timelyDeparture': {
      const cold=kind==='earlyDeparture';
      person(c,87,157,35,cold?'crisis':'walk','adult',1,'hauler',46);person(c,131,165,12,'walk','child',1,'none',46);
      person(c,205,137,21,'walk','adult',1,'farmer',34);
      if(!cold){halo(c,250,38,103,.18);ln(c,[266,136,269,111],'#405f47',2);el(c,264,121,7,3,'#b6c38c');el(c,274,113,6,3,'#bbcb94');}
      break;
    }
    case 'heirloomPassed': {
      person(c,101,158,5,'sit','elder',1,'none',48);person(c,212,158,31,'idle','child',-1,'none',54);table(c,129,122,52);
      pl(c,[129,103,151,106,175,100,177,121,154,127,131,123],'#d0bc8e','#755f47',1.2);ln(c,[152,106,154,125],'#806b4b',1);
      for(let i=0;i<3;i++){ln(c,[134,109+i*4,146,111+i*4],'#9c875d',.7);ln(c,[158,111+i*4,170,108+i*4],'#9c875d',.7);}
      ln(c,[119,123,133,115],'#cea97e',3);ln(c,[202,120,176,115],'#c09d77',3);halo(c,151,111,56,.12);break;
    }
    case 'noLoss': {
      for(let i=0;i<7;i++)person(c,41+i*40,145+(i%2)*12,12+i*9,i%2?'talk':'idle',i===2||i===5?'child':i===0?'elder':'adult',i<4?1:-1,'none',35+(i%2)*3);
      halo(c,176,25,110,.12);break;
    }
  }
  // Warm, worn edge: the same illustrated card language as the existing pack.
  const shade=c.createLinearGradient(0,144,0,180);shade.addColorStop(0,'#14202300');shade.addColorStop(1,'#14202399');
  c.fillStyle=shade;c.fillRect(0,144,320,36);
  ln(c,[1,25,1,1,37,1],'#b3a17966',1);ln(c,[283,179,319,179,319,156],'#b3a17966',1);
}
/** A quiet narrative painting, without text or gameplay inference. */
export function drawStoryVignette(ctx,kind,x,y,w,h,seed=1) {
  if(!STORY_KINDS.includes(kind))return;
  frame(ctx,x,y,w,h,c=>{c.scale(w/320,h/180);drawing(c,kind,seedOf(seed));});
}
