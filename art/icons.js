import {P} from './palette.js';

export const ICON_NAMES=Object.freeze(['winter','spring','summer','autumn','thaw','storm','blackRain','raiders','dilemma','radio','veilleur','chroniqueur','implacable','why','find','souvenir']);

// Optical grid is 24 units. Outer two units are breathing room, also at 16 px.
export function drawIcon(c,name,x,y,size,opts={}){
  if(!c||![x,y,size].every(Number.isFinite)||size<=0)return;
  c.save();c.setLineDash([]);c.translate(x,y);c.scale(size/24,size/24);c.beginPath();c.rect(0,0,24,24);c.clip();
  c.strokeStyle=typeof opts?.color==='string'?opts.color:P.cream;c.lineWidth=1.65;c.lineCap='round';c.lineJoin='round';
  const path=(p,closed=false)=>{c.beginPath();c.moveTo(p[0],p[1]);for(let i=2;i<p.length;i+=2)c.lineTo(p[i],p[i+1]);if(closed)c.closePath();c.stroke();};
  const arc=(cx,cy,r,a=0,b=Math.PI*2)=>{c.beginPath();c.arc(cx,cy,r,a,b);c.stroke();};
  const curve=(p)=>{c.beginPath();c.moveTo(p[0],p[1]);for(let i=2;i<p.length;i+=6)c.bezierCurveTo(...p.slice(i,i+6));c.stroke();};
  const cloud=()=>curve([4,13,0,12,3,7,7,9,7,2,15,2,17,8,22,7,24,13,19,13]);
  const leaf=()=>curve([5,19,3,10,9,3,20,4,20,16,14,21,5,19]);
  const lantern=()=>{path([7,10,17,10,18,20,6,20,7,10]);path([6,7,18,7]);arc(12,7,4,Math.PI,Math.PI*2);path([12,12,10,16,14,16,12,12]);};
  if(name==='winter'){
    for(let i=0;i<3;i++){c.save();c.translate(12,12);c.rotate(i*Math.PI/3);path([0,-9,0,9]);path([-3,-6,0,-3,3,-6]);path([-3,6,0,3,3,6]);c.restore();}
  }else if(name==='spring'){path([12,21,12,8]);curve([12,15,4,17,2,12,3,7,9,7,12,10,12,15]);curve([12,11,12,5,16,3,21,3,21,9,17,12,12,11]);}
  else if(name==='summer'){arc(12,12,4.2);for(let i=0;i<8;i++){const a=i*Math.PI/4;path([12+7*Math.cos(a),12+7*Math.sin(a),12+9.5*Math.cos(a),12+9.5*Math.sin(a)]);}}
  else if(name==='autumn'){leaf();path([4,21,15,10]);path([9,16,9,11]);path([12,13,17,13]);}
  else if(name==='thaw'){path([3,5,9,5,12,9,9,13,3,13,3,5]);path([6,5,6,9,9,13]);curve([17,10,14,14,13,16,15,18,17,21,21,18,20,16,19,14,18,12,17,10]);path([3,20,10,20]);}
  else if(name==='storm'){cloud();path([12,12,8,17,13,17,10,22]);}
  else if(name==='blackRain'){cloud();path([5,17,4,21]);path([11,17,10,21]);path([17,17,16,21]);path([5,12,18,12]);}
  else if(name==='raiders'){path([5,11,5,7,12,3,19,7,19,11]);path([4,12,7,20,17,20,20,12,4,12],true);path([8,8,10,9]);path([14,9,16,8]);path([10,15,14,15]);}
  else if(name==='dilemma'){path([12,21,12,13,5,6]);path([12,13,19,6]);path([3,10,3,4,9,4]);path([15,4,21,4,21,10]);}
  else if(name==='radio'){path([4,9,20,9,20,21,4,21,4,9],true);path([6,9,16,3]);path([7,13,12,13]);path([7,17,12,17]);arc(16,16,1.6);}
  else if(name==='veilleur')lantern();
  else if(name==='chroniqueur'){path([5,3,17,3,17,21,5,21,5,3],true);path([8,3,8,21]);path([12,14,20,6]);path([11,17,12,14,15,13]);}
  else if(name==='implacable'){curve([5,10,5,1,19,1,19,10]);arc(8,11,3);arc(16,11,3);path([11,11,13,11]);path([4,13,7,19,12,22,17,19,20,13]);arc(12,17,2);}
  else if(name==='why'){arc(12,12,9);curve([9,8,10,5,16,5,16,9,16,12,12,11,12,15]);path([12,18,12,18.1]);}
  else if(name==='find'){path([12,3,14,9,20,11,14,13,12,19,10,13,4,11,10,9,12,3],true);path([19,18,19,22]);path([17,20,21,20]);}
  else if(name==='souvenir'){path([4,4,20,4,20,21,4,21,4,4],true);path([7,17,11,12,14,15,16,13,18,17]);arc(9,9,1.4);path([15,4,15,9,18,7,20,9]);}
  else{arc(12,12,7);path([8,12,16,12]);}
  c.restore();
}
