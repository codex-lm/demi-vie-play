import {P,hash} from './palette.js';
import {line,poly,ellipse,gradient} from './primitives.js';

export const SHELTER_KINDS=Object.freeze(['farm','military','school','hospital','monastery','mine','lock','printshop','silent']);

/** A painted metal badge. x/y are top-left, size includes the whole shield. */
export function drawShelterEmblem(c,kind,x,y,size){
  if(!c||![x,y,size].every(Number.isFinite)||size<=0)return;
  if(!SHELTER_KINDS.includes(kind))kind='silent';
  const silent=kind==='silent',gold=silent?'#70716a':'#d1bf8e',ink='#202c2d';
  c.save();c.setLineDash([]);c.translate(x,y);c.scale(size/96,size/96);c.beginPath();c.rect(0,0,96,96);c.clip();
  const shield=()=>{c.beginPath();c.moveTo(12,10);c.quadraticCurveTo(48,1,84,10);c.lineTo(81,55);c.quadraticCurveTo(77,76,48,90);c.quadraticCurveTo(19,76,15,55);c.closePath();};
  shield();c.fillStyle=gradient(c,20,8,60,82,silent?'#383b38':'#495653',silent?'#252c2b':'#263b3a');c.fill();c.strokeStyle=gold;c.lineWidth=2;c.stroke();
  c.save();shield();c.clip();
  poly(c,[13,58,83,33,83,45,17,70],silent?'#343a36':'#5b6250',null);
  for(let i=0;i<30;i++){const px=10+hash(i,7)*78,py=8+hash(i,9)*82;line(c,[px,py,px+1+hash(i,6)*4,py+.4],silent?'#424741':'#6f7561',.5);}
  c.restore();
  const l=(p,w=4)=>line(c,p,gold,w),circ=(px,py,r)=>ellipse(c,px,py,r,r,'transparent',gold,3.2);
  if(kind==='farm'){
    l([48,72,48,25],3.3);
    for(let i=0;i<3;i++){const py=29+i*12;poly(c,[47,py+9,35,py+5,32,py-3,44,py+1],gold,null);poly(c,[49,py+9,61,py+5,64,py-3,52,py+1],gold,null);}
    l([30,73,66,73],2.2);
  }else if(kind==='military'){
    const p=[];for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5,r=i%2?10:23;p.push(48+Math.cos(a)*r,40+Math.sin(a)*r);}poly(c,p,gold,null);
    l([29,65,48,73,67,65],4);l([31,75,48,82,65,75],2.3);
  }else if(kind==='school'){
    poly(c,[24,27,36,25,48,31,60,25,72,27,72,62,59,61,48,68,37,61,24,62],'#293d3b',gold,3);
    l([48,32,48,67],2.4);l([30,35,41,37],2);l([55,37,66,35],2);l([30,44,41,46],2);l([55,46,66,44],2);l([30,53,41,55],2);l([55,55,66,53],2);
  }else if(kind==='hospital'){
    poly(c,[41,23,55,23,55,39,71,39,71,53,55,53,55,69,41,69,41,53,25,53,25,39,41,39],gold,null);
    line(c,[34,76,48,81,62,76],'#8a9a88',2);
  }else if(kind==='monastery'){
    l([30,68,30,45],3);l([66,68,66,45],3);
    c.beginPath();c.moveTo(30,45);c.quadraticCurveTo(30,27,48,20);c.quadraticCurveTo(66,27,66,45);c.strokeStyle=gold;c.lineWidth=3;c.stroke();
    l([25,70,71,70],3);l([48,56,48,34],3);l([39,42,57,42],3);l([41,62,55,62],2);
  }else if(kind==='mine'){
    l([29,69,66,29],5);l([29,29,66,69],5);
    c.beginPath();c.moveTo(23,39);c.quadraticCurveTo(26,21,45,23);c.moveTo(51,23);c.quadraticCurveTo(69,21,73,39);c.strokeStyle=gold;c.lineWidth=6;c.lineCap='round';c.stroke();
  }else if(kind==='lock'){
    // Jo's valve wheel, mitred lock gates and two unequal water levels.
    circ(48,29,10);circ(48,29,2);
    for(let i=0;i<4;i++){const a=i*Math.PI/2;l([48+Math.cos(a)*3,29+Math.sin(a)*3,48+Math.cos(a)*9,29+Math.sin(a)*9],2.2);}
    l([48,40,48,66],2.8);
    poly(c,[28,42,47,50,47,71,28,64],ink,gold,2.3);
    poly(c,[49,50,68,42,68,64,49,71],ink,gold,2.3);
    l([34,47,34,64],1.4);l([41,50,41,67],1.4);l([55,50,55,67],1.4);l([62,47,62,64],1.4);
    line(c,[20,54,25,54],'#b8d2c3',2);line(c,[71,65,76,65],'#b8d2c3',2);
    line(c,[32,77,40,75,48,78,56,75,64,77],'#b8d2c3',2.3);
    // A drooping willow twig distinguishes the Saules from a generic machine.
    l([23,20,26,24,27,37],1.5);
    poly(c,[25,24,20,25,22,33,25,28],gold,null);
    poly(c,[27,28,31,29,30,37,27,32],gold,null);
  }else if(kind==='printshop'){
    // Hand-operated screw press, fresh sheet and the surviving blue ink.
    l([25,27,71,27],4);l([29,27,29,70],4);l([67,27,67,70],4);
    l([23,72,73,72],4);l([48,22,48,46],4);
    l([38,21,58,21],3);circ(37,21,1.7);circ(59,21,1.7);
    for(let py=31;py<43;py+=5)line(c,[44,py+1,52,py-1],ink,1.5);
    poly(c,[36,46,60,46,63,51,33,51],gold,null);
    poly(c,[35,55,61,55,64,67,32,67],'#e0d3aa',ink,1.3);
    line(c,[39,59,57,59],'#3e666c',2);line(c,[38,63,52,63],'#3e666c',1.5);
    line(c,[33,79,47,79],'#b8d2c3',1.8);line(c,[52,79,62,79],gold,1.8);
  }else{
    l([48,65,48,40],3.5);circ(48,34,5);l([39,70,57,70],2.5);
    for(const a of [-1,1]){c.beginPath();c.moveTo(48+a*13,29);c.quadraticCurveTo(48+a*20,38,48+a*13,47);c.strokeStyle=gold;c.lineWidth=2.6;c.stroke();}
    line(c,[22,73,75,22],ink,9);line(c,[22,73,75,22],'#b09b82',4);
  }
  for(const px of [20,76])ellipse(c,px,15,1.5,1.5,silent?'#72766c':P.metalLight);
  c.restore();
}
