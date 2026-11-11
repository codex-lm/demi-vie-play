import { P, hash, seedOf, frame } from './common.js';
import { box, ellipse, line, poly, gradient } from '../primitives.js';
import { MEMORY_TEXT } from './memory-strings.fr.js';

export const SOUVENIR_TYPES = Object.freeze(['recipes','minerJournal','songs','toolkit','photo','childDrawing','herbarium','watch']);
const ink = '#4b4034';
function stroke(c,p,width=1.5,color=ink) { line(c,p,color,width); }
function leaf(c,x,y,scale,angle,color=P.green) {
  c.save();c.translate(x,y);c.rotate(angle);c.scale(scale,scale);
  c.beginPath();c.moveTo(0,0);c.bezierCurveTo(-12,-3,-15,-15,-7,-22);c.bezierCurveTo(4,-17,8,-7,0,0);
  c.fillStyle=color;c.fill();stroke(c,[0,0,-7,-20],.75,'#536146');c.restore();
}
function note(c,x,y,scale=1) { c.save();c.translate(x,y);c.scale(scale,scale);ellipse(c,0,0,3.7,2.3,ink);stroke(c,[3,-1,3,-16,10,-13,10,-8],1.5);c.restore(); }
function book(c,open,detail) {
  if(open){
    poly(c,[12,24,39,19,49,24,60,19,87,24,84,74,60,70,49,75,37,70,15,74],P.woodDark,ink,1.8);
    poly(c,[15,22,37,17,49,22,49,70,38,66,17,70],gradient(c,16,0,34,0,P.ivory,'#c6b58d'),ink,1.2);
    poly(c,[49,22,62,18,84,22,82,69,62,65,49,70],gradient(c,49,0,35,0,'#b6a47e',P.cream),ink,1.2);
    stroke(c,[49,24,49,69],1.5,'#786346');
    if(detail)for(let i=0;i<6;i++){stroke(c,[21,45+i*3,40-i%3*3,42+i*3],.5,'#8c7d61');stroke(c,[58,44+i*3,77-i%2*4,46+i*3],.5,'#8c7d61');}
  } else {
    box(c,20,13,58,64,'#645647',3,ink,1.8);box(c,23,11,54,62,P.wood,2,ink,1.5);
    box(c,27,12,5,60,'#7b593a',1,null);box(c,37,21,32,36,'#b8aa85',1,ink,.7);
    stroke(c,[31,72,75,72],1.5,P.cream);if(detail)for(let i=0;i<3;i++)stroke(c,[32,74+i,75,74+i],.4,'#b6a47e');
  }
}
function object(c,type,detail,seed) {
  if(type==='recipes'){
    book(c,true,detail);
    ellipse(c,31,32,8,3,P.cream,ink,1.1);poly(c,[23,32,25,39,36,39,39,32],P.rust,ink,1.1);stroke(c,[28,29,27,26,29,23],.8,'#a27d54');
    stroke(c,[67,26,69,57],2.8,'#7d6243');ellipse(c,67,27,3.7,6,P.woodLight,ink,1);
    poly(c,[51,64,54,65,54,81,51,78,48,81,48,67],P.red,null);
    if(detail){
      ellipse(c,30,60,4,3,'#9e785227');stroke(c,[18,28,22,26],.6,'#c1a979');
      ellipse(c,72,55,5.4,6,'#97754e0a','#97754e23',.8);
      for(let i=0;i<4;i++)stroke(c,[15+i*.7,71,39,67+i*.6,46,70+i*.6],.35,'#a28c65');
      stroke(c,[50,24,52,27,50,30],.5,'#b9a57b');stroke(c,[19,39,21,38,19,36],.45,'#baa179');
      stroke(c,[72,27,70,49],.6,'#d7bb7e');ellipse(c,68,26,2,4,'#c9ab76');
    }
  }else if(type==='minerJournal'){
    book(c,false,detail);stroke(c,[41,51,63,28],3,P.woodDark);stroke(c,[41,51,63,28],1.2,P.woodLight);
    c.beginPath();c.moveTo(48,25);c.quadraticCurveTo(63,24,71,39);c.quadraticCurveTo(59,29,48,25);c.fillStyle=P.metal;c.fill();stroke(c,[48,25,59,27,69,36],1,ink);
    poly(c,[64,63,73,58,80,63,76,72,68,72],'#555c54',ink,1);if(detail){
      stroke(c,[64,63,73,64,76,71],.7,'#8b947e');stroke(c,[39,61,59,61],.6,'#807452');
      for(let i=0;i<9;i++)stroke(c,[29,17+i*5.8,29,18+i*5.8],.5,'#cbb082');
      stroke(c,[24,20,24,14,29,13],1,'#d5b37b');stroke(c,[70,12,75,13,75,18],.8,'#d5b37b');
      poly(c,[20,63,24,62,24,69,20,69],'#506d64',null);poly(c,[77,39,81,39,81,46,77,46],'#867453',null);
      ellipse(c,43,64,6,2.1,'#67513b13');stroke(c,[34,68,42,66],.55,'#d6b075');
    }
  }else if(type==='songs'){
    poly(c,[18,16,68,12,81,23,83,72,34,78,20,66],P.cream,ink,1.7);
    poly(c,[68,12,68,25,81,23],'#ae9c75',ink,1);stroke(c,[33,18,34,75],.6,'#b4a17a');
    for(let j=0;j<2;j++)for(let i=0;i<5;i++)stroke(c,[26,29+j*25+i*3,73,26+j*25+i*3],detail?.5:.7,'#9a8664');
    note(c,39,39,.9);note(c,60,33,.75);note(c,47,63,.8);note(c,66,59,.6);
    if(detail){
      ellipse(c,29,65,5,4,'#99775422');stroke(c,[21,59,24,64,22,68],.7,'#b3a17c');
      stroke(c,[34,18,37,40,34,75],.8,'#fff4d15c');stroke(c,[23,47,77,43],.5,'#9b86691c');
      for(let i=0;i<7;i++){const x=24+hash(seed,i+70)*51,y=21+hash(seed,i+80)*49;ellipse(c,x,y,.3+hash(seed,i)*.5,.4,'#97754e24');}
      stroke(c,[38,73,42,71,45,73,47,71],.5,'#9b8669');
    }
  }else if(type==='toolkit'){
    poly(c,[15,36,84,32,89,74,20,79,12,68],gradient(c,12,35,75,42,'#8a9473','#5e725f'),ink,1.7);
    stroke(c,[19,42,82,38],1.3,'#bac0a0');
    stroke(c,[30,60,28,18],7,'#3c4d4d');stroke(c,[30,60,28,18],4,P.metal);poly(c,[23,11,25,21,31,21,33,10,36,15,35,24,31,29,24,28,20,20],P.metal,ink,1.2);
    stroke(c,[51,62,48,19],5,P.woodDark);stroke(c,[51,62,48,19],2.2,P.woodLight);box(c,36,16,27,9,P.metal,2,ink,1.2);
    stroke(c,[68,60,72,14],2.5,P.metal);box(c,63,47,9,19,P.rust,3,ink,1.3);
    poly(c,[18,51,86,46,89,74,20,79],gradient(c,15,45,74,30,'#a5a47f','#6c8066'),ink,1.5);
    for(const x of [34,55,75])stroke(c,[x,53,x+2,73],1,'#596a53');
    if(detail){
      for(let i=0;i<12;i++)stroke(c,[23+i*5,72-i*.2,25+i*5,72-i*.2],.6,'#d4caa0');stroke(c,[45,73,46,79,51,80,53,73],1.3,P.woodDark);
      poly(c,[62,58,75,57,76,68,64,69],'#899577','#596b58',.6);
      for(let i=0;i<4;i++){stroke(c,[63+i*3,58,63.4+i*3,59],.55,'#c9c7a1');stroke(c,[65+i*3,67,65.4+i*3,69],.55,'#c9c7a1');}
      stroke(c,[29,31,30,47],.65,'#b7c2ad');stroke(c,[40,18,57,18],.6,'#b7c2ad');
      for(let i=0;i<6;i++)stroke(c,[20+i*10,55,22+i*10,65],.35,'#d5d1aa20');
      ellipse(c,45,63,5,3,'#3c51412c');
    }
  }else if(type==='photo'){
    c.save();c.translate(50,45);c.rotate(-.09);c.translate(-50,-45);
    box(c,18,12,64,66,'#e5d8b7',.7,ink,1.5);box(c,24,18,52,45,'#899887',.2,null);
    poly(c,[24,46,38,35,47,43,59,28,76,46,76,63,24,63],'#647a69',null);
    ellipse(c,38,35,6,7,'#c5b590');ellipse(c,57,34,5.8,7,'#b6a580');
    poly(c,[28,63,29,49,35,43,42,44,47,53,46,63],'#555c51',null);poly(c,[46,63,48,47,56,42,63,44,69,63],'#7c6952',null);
    ellipse(c,51,50,4,5,'#dbbe94');poly(c,[43,63,46,55,54,55,59,63],'#a18661',null);
    if(detail){
      // Tiny remembered faces and linked arms make this a family photograph.
      poly(c,[32,34,33,30,37,28,42,29,44,33,39,31,35,32],'#69634f',null);
      poly(c,[51,33,52,29,57,27,62,29,63,34,59,31,55,32],'#817150',null);
      for(const x of [36,40])ellipse(c,x,35,.5,.45,'#625e49');
      for(const x of [55,59])ellipse(c,x,34,.45,.45,'#625e49');
      stroke(c,[36,39,38,39.6,40,39],.45,'#8e7957');stroke(c,[55,38,57,38.6,59,38],.45,'#8e7957');
      stroke(c,[36,46,39,57,48,59],3,'#5f6557');stroke(c,[61,46,61,56,55,59],3,'#887457');
      ellipse(c,47,58.5,1.5,1,'#bfa986');ellipse(c,55,58.5,1.5,1,'#bfa986');
      poly(c,[47,49,48,46,51,45,54,47,55,50,52,48,49,48],'#aa9168',null);
      stroke(c,[26,21,29,21,27,43],.5,'#e2d3af55');stroke(c,[73,48,68,58],.6,'#e2d3af66');stroke(c,[29,70,49,70],.7,'#8a7556');stroke(c,[54,70,69,70],.7,'#8a7556');
      stroke(c,[19,14,23,15,24,12],.8,'#bdaa82');stroke(c,[79,68,78,74,75,76],.8,'#f7ebc9');
    }c.restore();
  }else if(type==='childDrawing'){
    poly(c,[16,14,76,18,83,71,23,77,19,53],P.ivory,ink,1.3);
    ellipse(c,63,32,7,7,'#d3b269');for(let i=0;i<8;i++){const a=i*Math.PI/4;stroke(c,[63+Math.cos(a)*9,32+Math.sin(a)*9,63+Math.cos(a)*12,32+Math.sin(a)*12],1.1,'#c4a366');}
    stroke(c,[28,53,40,40,51,52],2,P.red);stroke(c,[31,51,31,66,49,65,49,51],1.7,P.blue);stroke(c,[39,65,39,57,44,57,44,65],1.4,P.woodDark);
    for(const [x,y,s] of [[58,61,1],[70,62,.7]]){ellipse(c,x,y-11*s,2.7*s,2.7*s,'#e6c29c',ink,.8);stroke(c,[x,y-8*s,x,y,x-3*s,y+5*s,x,y,x+4*s,y+4*s],1.1,P.red);stroke(c,[x-5*s,y-4*s,x,y-7*s,x+5*s,y-3*s],1.1,P.red);}
    stroke(c,[27,68,54,67,76,69],1.5,'#789372');if(detail){
      poly(c,[17,15,30,16,31,22,18,21],'#d1bd8b88',null);stroke(c,[24,72,42,71],.6,'#839472');
      for(let i=0;i<5;i++)stroke(c,[25+i*.8,28+i*1.2,47+i*.4,27+i*1.1],.4,'#8296a829');
      stroke(c,[29,52,41,41,50,50],.4,'#e9b596');stroke(c,[28,69,39,68,53,69],.5,'#c4c196');
      ellipse(c,63,34,4,2,'#d5b972');
    }
  }else if(type==='herbarium'){
    poly(c,[23,11,80,18,75,78,18,69],P.woodDark,ink,1.6);poly(c,[27,13,78,20,73,74,22,68],P.cream,ink,1);
    stroke(c,[41,66,46,48,49,31,55,22],1.3,'#737b4e');
    leaf(c,46,48,.8,-.5,'#7c8d63');leaf(c,49,36,.65,.9,'#8c9265');leaf(c,43,58,.75,-.95,'#6b8058');leaf(c,52,29,.5,.2,'#9c9d6a');
    for(const [x,y] of [[46,47],[50,33],[44,59]])poly(c,[x-4,y-1,x+5,y,x+4,y+3,x-5,y+2],'#e8dcacbb',null);
    if(detail){
      box(c,54,61,15,7,'#e5d5ab',.5,'#a4916d',.5);stroke(c,[56,64,67,64],.5,'#8c7b5c');stroke(c,[57,67,63,67],.45,'#8c7b5c');
      stroke(c,[59,53,66,39,64,32],.55,'#85866c');
      for(const [x,y]of [[62,33],[65,32],[66,35],[63,36]])ellipse(c,x,y,1.8,2.2,'#a99775','#887c61',.35);
      ellipse(c,64,34,1.3,1.3,'#8d8556');stroke(c,[61,52,57,51,57,48],.5,'#92966e');
      for(let i=0;i<5;i++)stroke(c,[31+i*2,40+i,34+i*2,43+i],.35,'#c4c79c48');
      stroke(c,[28,17,27,22],.5,'#b2a27c');
    }
  }else if(type==='watch'){
    c.beginPath();c.moveTo(50,20);c.bezierCurveTo(72,7,92,13,78,29);c.bezierCurveTo(68,39,71,46,82,39);c.strokeStyle=P.woodLight;c.lineWidth=2.2;c.stroke();
    ellipse(c,48,23,5,7,'#6b6048',P.woodLight,2);box(c,43,24,10,6,P.wood,1,ink,1);
    ellipse(c,48,53,26,27,'#987447',ink,1.7);ellipse(c,48,52,22.5,23,P.woodLight,ink,1);ellipse(c,48,52,19.5,20,'#d9cda8',ink,1);
    for(let i=0;i<12;i++){const a=i*Math.PI/6;stroke(c,[48+Math.sin(a)*16,52-Math.cos(a)*17,48+Math.sin(a)*18,52-Math.cos(a)*19],i%3?1:1.7,ink);}
    stroke(c,[48,38,48,52,59,57],1.5,ink);ellipse(c,48,52,1.7,1.7,ink);
    if(detail){
      stroke(c,[41,34,44,43,39,49,46,58,45,70],.6,'#8e846855');stroke(c,[30,43,34,36],.8,'#f5e5bb');ellipse(c,53,65,4,2,'#ac98782a');
      for(let i=0;i<7;i++){const a=.2+i*.32;stroke(c,[48+Math.cos(a)*24.8,53+Math.sin(a)*25.8,48+Math.cos(a)*23.7,53+Math.sin(a)*24.7],.5,'#edd09c');}
      stroke(c,[45,25,45,28],.4,'#d8bf87');stroke(c,[48,25,48,28],.4,'#d8bf87');stroke(c,[51,25,51,28],.4,'#d8bf87');
    }
  }
  if(detail){
    // Local scuffs follow the lower edge, leaving the object's identifying mark clear.
    for(let i=0;i<10;i++){const x=25+hash(seed,i)*48,y=63+hash(seed,20+i)*6;stroke(c,[x,y,x+1+hash(seed,40+i)*2,y-.25],.35,'#dfcda055');}
  }
}

/** A transparent 32 px optical icon, with a reduced silhouette at small sizes. */
export function drawSouvenirIcon(ctx,type,x,y,size){
  if(!SOUVENIR_TYPES.includes(type))return;
  frame(ctx,x,y,size,size,c=>{c.scale(size/100,size/100);object(c,type,false,1);});
}

/** A transparent relic plate. All wear is seeded; names are caller data, never invented. */
export function drawSouvenirRelic(ctx,type,x,y,size,options={}){
  if(!SOUVENIR_TYPES.includes(type))return;
  const opts=options&&typeof options==='object'?options:{},seed=seedOf(opts.seed??1);
  frame(ctx,x,y,size,size,c=>{
    c.scale(size/100,size/100);ellipse(c,50,76,31,5,'#0b171533');object(c,type,true,seed);
    stroke(c,[42,76,39,84],.8,'#9a8057');
    c.save();c.translate(50,88);c.rotate(-.035);c.translate(-50,-88);
    poly(c,[18,83,28,79,84,81,83,94,21,95],gradient(c,0,79,0,16,'#ecddba','#c8b58a'),'#816d4d',.7);
    ellipse(c,24,85,1.1,1.1,'#8e7956');
    const name=String(opts.ownerName??'').trim()||MEMORY_TEXT.unnamed;
    c.fillStyle='#66513b';c.font='italic 6px Georgia, serif';c.textAlign='center';c.textBaseline='middle';
    // Canvas maxWidth fits a long family name without clipping the tag or mutating it.
    c.fillText(name,54,87.8,51);stroke(c,[31,92,75,91],.35,'#a98e66');c.restore();
  });
}
