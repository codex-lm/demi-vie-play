import { P, hash, seedOf, finite, smooth, frame, clamp } from './common.js';
import { box, ellipse, line, poly, gradient } from '../primitives.js';
import { drawPortrait } from '../portrait.js';
import { colonistFeatures } from '../colonist.js';
import { MEMORY_TEXT } from './memory-strings.fr.js';

export const ELDER_EXPRESSIONS = Object.freeze(['neutral','proud','worried','sad','amused']);
export const OBJECTIVE_TYPES = Object.freeze(['dig','bed','water','ventilation','repair','commons','kitchen','school','ossuary','radio','firstExit','seeds','food','power','heat','medicine','support','research','storage','hygiene','expedition','birth','heritage','exodus','waterReserve','insects','lab','archive','workshopMethods','filterWeaving','evenings','work12','finds','kit']);
export const INK_CHECK_DURATION = .6;

/** Blank ruled paper below the heading; objective text remains the caller's content. */
export function drawNotebookPage(ctx,x,y,w,h,options={}){
  const seed=seedOf(options?.seed??1);
  frame(ctx,x,y,w,h,c=>{
    const s=Math.min(w,h)/300;
    c.fillStyle='#171e1f26';c.fillRect(5*s,8*s,w-5*s,h-8*s);
    poly(c,[0,0,w-22*s,0,w,23*s,w-2*s,h-4*s,7*s,h,0,h-13*s],gradient(c,0,0,w,h,'#f0e2c1','#c7b58d'),'#7e6c4e',1.2*s);
    c.save();c.beginPath();c.rect(2*s,2*s,w-4*s,h-6*s);c.clip();
    // Paper fibres, foxing and a faint old cup ring never overpower the writing area.
    for(let i=0;i<140;i++){
      const px=hash(seed,i)*w,py=hash(seed,180+i)*h;
      line(c,[px,py,px+(2+hash(seed,360+i)*5)*s,py+.3*s],i%3?'#927b4d0c':'#fff6d419',.5*s);
    }
    ellipse(c,w*.82,h*.83,22*s,22*s,'#91724204','#94754312',3*s);
    for(let i=0;i<12;i++)ellipse(c,(i%2?w-10*s:9*s)+hash(seed,540+i)*5*s,hash(seed,560+i)*h,(1+hash(seed,i)*2)*s,.9*s,'#9b7c4a1a');
    const lineStart=Math.max(62*s,h*.24),step=19*s;
    for(let yy=lineStart;yy<h-15*s;yy+=step)line(c,[31*s,yy,w-20*s,yy],'#8b947e43',.6*s);
    line(c,[31*s,23*s,31*s,h-13*s],'#b171594d',.8*s);c.restore();
    // Bound edge: thread through real punched holes, with a thin leather spine.
    box(c,0,1*s,13*s,h-3*s,'#6c5136',1*s,'#59412e',.6*s);
    for(let yy=24*s;yy<h-12*s;yy+=30*s){ellipse(c,17*s,yy,2*s,2*s,'#7f6849');line(c,[8*s,yy-4*s,20*s,yy-1*s,20*s,yy+1*s,9*s,yy+4*s],'#dcc696',1*s);}
    poly(c,[w-22*s,0,w-23*s,23*s,w,23*s],'#b9a780','#8f7c59',.8*s);line(c,[w-22*s,0,w,23*s],'#f7e6bf',.8*s);
    poly(c,[w-12*s,h-4*s,w-23*s,h-18*s,w-25*s,h-3*s],'#b5a17a',null);
    c.fillStyle='#5c4b36';c.font=`italic ${15*s}px Georgia, serif`;c.textAlign='left';c.textBaseline='alphabetic';
    c.fillText(MEMORY_TEXT.notebook,39*s,29*s,w-61*s);
    c.fillStyle='#8c7554';c.font=`italic ${9*s}px Georgia, serif`;c.fillText(MEMORY_TEXT.subtitle,40*s,44*s,w-67*s);
    line(c,[40*s,50*s,w-35*s,50*s],'#ab9063',.7*s);
  });
}

function elderSeed(seed) {
  // The doyenne is a specific recurring woman, retaining the parent portrait's
  // inherited visual vocabulary. Seed chooses her features, expression never does.
  let n=seedOf(seed);
  for(let i=0;i<128;i++,n=(n+1)|0){const f=colonistFeatures(n,'elder');if(!f.beard&&f.style>=3)return n;}
  return 6;
}

export function drawElderPortrait(ctx,x,y,size,expression='neutral',options={}){
  const aliases={neutre:'neutral',fiere:'proud','fière':'proud',inquiete:'worried','inquiète':'worried',triste:'sad',amusee:'amused','amusée':'amused'};
  expression=aliases[expression]??expression;if(!ELDER_EXPRESSIONS.includes(expression))expression='neutral';
  const seed=elderSeed(options?.seed??72),f=colonistFeatures(seed,'elder');
  const moods={neutral:59,proud:84,worried:38,sad:19,amused:98};
  frame(ctx,x,y,size,size,c=>{
    drawPortrait(c,0,0,size,{seed,age:'elder',job:'none',mood:moods[expression]});
    c.scale(size/100,size/100);
    // A little darned shawl is constant in all expressions and makes her silhouette
    // instantly recognisable next to the ordinary colony portraits.
    poly(c,[15,92,31,80,42,87,34,100,16,100],'#718878',P.ink,1);
    poly(c,[65,81,83,91,85,100,63,100,57,88],'#7e9380',P.ink,1);
    for(let i=0;i<4;i++)line(c,[22+i*3,94,26+i*3,97],'#bbba91',.6);
    ellipse(c,63,89,2.4,3,P.woodLight,P.ink,.6);ellipse(c,63,89,.7,1,'#6b795e');
    const dy=expression==='sad'?2.5:0;
    if(expression==='worried'){
      line(c,[38,40,44,38],'#7c7968',1.2);line(c,[58,38,64,40],'#7c7968',1.2);
      line(c,[46,64,51,62.7,59,64],'#8b604a',1.1);
    }else if(expression==='sad'){
      // Lowered gaze and the small wet highlight, not an exaggerated cartoon sob.
      line(c,[38,43+dy,44,41+dy],'#8c8975',1);line(c,[58,41+dy,64,43+dy],'#8c8975',1);
      poly(c,[64,54+dy,62.6,58.8+dy,65.3,59.5+dy],'#b7c9b09a',null);
      ellipse(c,64,60+dy,1.3,1.7,'#b7c9b0aa');
    }else if(expression==='amused'){
      // Close the same eyes, without changing head geometry or palette.
      for(const [ex,rx]of [[42,4.2],[61,3.7]]){
        ellipse(c,ex,45,rx+.9,2.6,f.skin);
        c.beginPath();c.moveTo(ex-rx,46);c.quadraticCurveTo(ex,42.3,ex+rx,46);c.strokeStyle=P.ink;c.lineWidth=.95;c.stroke();
      }
      c.beginPath();c.moveTo(46,63);c.quadraticCurveTo(52,71,60,62.6);c.quadraticCurveTo(53,65,46,63);c.fillStyle='#865b45';c.fill();
      line(c,[48,64.2,56,64.5],'#ead8b9',1);
    }else if(expression==='proud'){
      line(c,[37,40,44,39.6],'#868372',1.1);line(c,[58,39.5,65,40],'#868372',1.1);
      line(c,[35,53,37,55],'#b18364',.55);line(c,[66,53,67,54.5],'#b18364',.55);
    }
  });
}

/** Optically distinct goal marks on a 24-unit grid, readable at 24–32 px. */
export function drawObjectiveIcon(ctx,type,x,y,size){
  if(!OBJECTIVE_TYPES.includes(type))return;
  frame(ctx,x,y,size,size,c=>{
    c.scale(size/24,size/24);
    const path=(p,color=P.cream,width=1.65)=>line(c,p,color,width);
    const ring=(x,y,r)=>{c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.strokeStyle=P.cream;c.lineWidth=1.6;c.stroke();};
    const rect=(x,y,w,h)=>{c.strokeStyle=P.cream;c.lineWidth=1.6;c.strokeRect(x,y,w,h);};
    const head=(x,y,r=2)=>ring(x,y,r);
    const book=()=>{path([3,5,8,4,12,7,16,4,21,5,21,19,16,18,12,21,8,18,3,19,3,5]);path([12,7,12,20]);};
    const drop=(x=12,y=3)=>{c.beginPath();c.moveTo(x,y);c.bezierCurveTo(x-1,y+5,x-7,y+8,x-6,y+12);c.bezierCurveTo(x-5,y+20,x+6,y+20,x+6,y+12);c.bezierCurveTo(x+6,y+8,x+1,y+3,x,y);c.strokeStyle=P.cream;c.lineWidth=1.6;c.stroke();};
    if(type==='dig'){path([5,20,17,7],P.cream,2);c.beginPath();c.moveTo(6,5);c.quadraticCurveTo(16,1,21,14);c.strokeStyle=P.cream;c.lineWidth=1.7;c.stroke();path([5,21,7,21]);}
    else if(type==='bed'){path([3,5,3,21]);path([21,10,21,21]);path([3,17,21,17]);rect(5,10,5,5);path([11,15,11,9,18,9,21,12]);}
    else if(type==='water'){drop();path([9,16,11,18],P.water,1.7);}
    else if(type==='ventilation'){ring(12,12,2.4);for(let i=0;i<3;i++){c.save();c.translate(12,12);c.rotate(i*Math.PI*2/3);path([0,-3,-4,-6,-3,-10,2,-9,4,-6,3,-3]);c.restore();}ring(12,12,10);}
    else if(type==='repair'){path([6,21,15,12,19,12,22,8,19,8,18,5,18,2,14,5,13,9,3,18,6,21]);}
    else if(type==='commons'){head(6,6);head(18,6);path([2,13,10,13,10,20]);path([14,20,14,13,22,13]);path([4,10,4,18,8,18,8,21]);path([20,10,20,18,16,18,16,21]);}
    else if(type==='kitchen'){path([3,10,21,10,18,20,6,20,3,10]);path([8,7,7,4,9,2]);path([15,7,14,4,16,2]);path([1,12,4,12]);path([20,12,23,12]);}
    else if(type==='school'){book();path([6,10,9,10]);path([6,14,9,14]);path([15,10,18,10]);}
    else if(type==='ossuary'){path([3,21,3,8,7,4,17,4,21,8,21,21,3,21]);rect(6,8,4,5);rect(14,8,4,5);path([9,20,9,16,15,16,15,20]);}
    else if(type==='radio'){rect(3,8,18,13);path([5,8,16,2]);path([6,12,12,12]);path([6,16,12,16]);ring(17,15,2);}
    else if(type==='firstExit'){path([3,19,12,19,12,22,3,22,3,19]);path([7,18,7,6,14,6]);path([11,3,14,6,11,9]);path([17,14,21,10]);path([17,10,21,10,21,14]);}
    else if(type==='seeds'){path([12,22,12,8]);c.beginPath();c.moveTo(12,15);c.bezierCurveTo(2,16,3,5,3,5);c.bezierCurveTo(10,5,12,9,12,15);c.moveTo(12,10);c.bezierCurveTo(12,2,21,2,21,2);c.bezierCurveTo(21,10,15,12,12,10);c.strokeStyle=P.cream;c.lineWidth=1.6;c.stroke();}
    else if(type==='food'){path([4,9,20,9,18,21,6,21,4,9]);path([8,7,8,4,16,4,16,7]);path([9,13,9,18]);path([15,13,15,18]);}
    else if(type==='power'){path([14,2,5,13,11,13,9,22,20,10,13,10,14,2]);}
    else if(type==='heat'){path([3,21,21,21]);for(let i=0;i<3;i++){c.beginPath();c.moveTo(6+i*6,17);c.bezierCurveTo(1+i*6,12,11+i*6,9,6+i*6,3);c.strokeStyle=P.cream;c.lineWidth=1.7;c.stroke();}}
    else if(type==='medicine'){path([9,3,15,3,15,9,21,9,21,15,15,15,15,21,9,21,9,15,3,15,3,9,9,9,9,3]);}
    else if(type==='support'){path([2,4,22,4]);path([5,5,5,22]);path([19,5,19,22]);path([5,12,12,5,19,12]);path([3,22,7,22]);path([17,22,21,22]);}
    else if(type==='research'){ring(9,9,6);path([13,14,21,22],P.cream,2.3);path([6,9,12,9]);path([9,6,9,12]);}
    else if(type==='storage'){path([3,8,12,3,21,8,21,19,12,23,3,19,3,8,12,12,21,8]);path([12,12,12,23]);path([7,6,17,10]);}
    else if(type==='hygiene'){path([3,13,5,21,19,21,21,13,3,13]);path([7,10,7,5,10,3,13,5]);path([13,5,13,7]);path([13,10,13,11]);ring(18,7,1.7);ring(4,8,1);}
    else if(type==='expedition'){ring(12,12,10);path([15,5,14,14,5,18,9,9,15,5]);path([9,9,14,14]);}
    else if(type==='birth'){c.save();c.translate(12,12);c.rotate(-.4);path([-6,-7,6,-7,8,4,3,10,-4,10,-8,4,-6,-7]);head(0,-4,3.3);path([-7,1,6,7]);path([7,0,-4,9]);c.restore();}
    else if(type==='heritage'){book();path([7,9,9,11,16,8],P.amber,1.8);path([6,15,9,15]);path([15,14,18,14]);}
    else if(type==='exodus'){path([2,21,8,21,11,17,22,17]);path([17,12,22,17,17,22]);path([8,13,8,8,12,6,15,8,15,12]);head(11,3,1.8);}
    else if(type==='waterReserve'){
      // Lidded potable-water tank, gauge and tap; separate from the plain drop.
      path([5,5,5,21,18,21,18,5,5,5]);path([4,3,19,3]);path([18,16,22,16,22,19]);
      path([7,14,10,13,13,14,16,13],P.water,1.4);path([8,17,15,17],P.water,1.2);
      path([9,8,9,11]);path([12,8,12,10]);path([15,8,15,11]);
    }else if(type==='insects'){
      // A rearing tray around a six-legged cricket, not a generic food sack.
      path([3,17,5,21,19,21,21,17,3,17]);
      ellipse(c,12,10,2.6,4,'transparent',P.cream,1.5);ring(12,4.5,1.6);
      for(const side of [-1,1]){
        path([12+side*2,8,12+side*5,6,12+side*7,7],P.cream,1.2);
        path([12+side*3,10,12+side*6,10],P.cream,1.2);
        path([12+side*2,12,12+side*6,14,12+side*7,12],P.cream,1.2);
      }
    }else if(type==='lab'){
      path([9,2,15,2]);path([10,2,10,9,4,19,5,22,19,22,20,19,14,9,14,2]);
      path([7,16,11,15,16,16],P.water,1.4);ring(12,12,1);path([10,19,14,19],P.water,1.2);
    }else if(type==='archive'){
      // Indexed volumes on two shelves: the room, not a generic open book.
      path([3,3,3,22,21,22,21,3]);path([3,12,21,12]);
      for(const px of [6,12,17]){rect(px,4,3,7);path([px+.8,8,px+2.2,8],P.amber,1);}
      rect(6,15,5,6);rect(14,15,5,6);path([7.5,17.5,9.5,17.5],P.amber,1);path([15.5,17.5,17.5,17.5],P.amber,1);
    }else if(type==='workshopMethods'){
      // Bench, measured workpiece and a written checklist for the procedure.
      path([2,15,14,15]);path([4,16,4,22]);path([12,16,12,22]);
      path([6,13,6,9,10,9,10,13]);path([3,6,10,6]);path([5,5,5,3,9,3,9,5]);
      rect(15,3,7,18);path([17,7,20,7],P.amber,1.2);path([17,11,20,11],P.amber,1.2);path([17,15,18,16,20,13],P.cream,1.2);
    }else if(type==='filterWeaving'){
      // A framed filter crossed by warp and weft, with the shuttle beneath.
      rect(4,3,16,15);
      for(const px of [8,12,16])path([px,4,px,17],P.cream,1.1);
      for(const py of [7,11,15])path([5,py,19,py],P.cream,1.1);
      path([3,22,6,20,18,20,21,22,3,22],P.amber,1.2);
    }else if(type==='evenings'){
      // Moon above two people gathered around a small evening lantern.
      c.beginPath();c.moveTo(12,2);c.bezierCurveTo(3,0,3,10,11,10);c.bezierCurveTo(7,8,8,4,12,2);c.strokeStyle=P.cream;c.lineWidth=1.5;c.stroke();
      head(5,14,1.8);head(19,14,1.8);path([2,22,2,19,5,17,8,20]);path([22,22,22,19,19,17,16,20]);
      path([10,22,10,16,14,16,14,22,10,22],P.amber,1.3);path([11,14,13,14],P.amber,1.2);
    }else if(type==='work12'){
      // Twelve hour marks and a drawn 12 keep the law legible without colour.
      ring(12,12,10);
      for(let i=0;i<12;i++){const a=i*Math.PI/6;path([12+Math.cos(a)*8.1,12+Math.sin(a)*8.1,12+Math.cos(a)*9,12+Math.sin(a)*9],P.cream,1);}
      path([6.7,10,8.5,8.5,8.5,15.5]);path([12,9.5,13.5,8.5,16,9.2,16,11,12,15.5,16.5,15.5],P.cream,1.5);
    }else if(type==='finds'){
      // An uncovered keepsake and bottle, with the discovery glint.
      path([2,17,5,22,20,22,22,17]);path([5,18,5,11,10,11,10,18]);path([6,11,6,8,9,8,9,11]);
      ellipse(c,16,15,3,4,'transparent',P.cream,1.5);path([16,11,16,9]);
      path([17,2,17,7],P.amber,1.3);path([14.5,4.5,19.5,4.5],P.amber,1.3);
    }else if(type==='kit'){
      // Packed and buckled rucksack: the ready kit, before anyone departs.
      path([8,5,8,2,16,2,16,5]);path([5,6,19,6,21,10,21,21,3,21,3,10,5,6]);
      path([4,10,12,13,20,10]);rect(10,10,4,5);path([7,16,7,20]);path([17,16,17,20]);
    }
  });
}

/** Ink follows a single polyline with eased pen speed, complete at 0.6 s. */
export function drawInkCheck(ctx,x,y,size,t=0){
  const progress=smooth(clamp(finite(t)/INK_CHECK_DURATION));
  if(progress<=0)return;
  frame(ctx,x,y,size,size,c=>{
    c.scale(size/24,size/24);
    const a=[3.5,12.5],b=[9.1,18.4],d=[21,4.8];
    const l1=Math.hypot(b[0]-a[0],b[1]-a[1]),l2=Math.hypot(d[0]-b[0],d[1]-b[1]),distance=(l1+l2)*progress;
    let points;
    if(distance<=l1){const q=distance/l1;points=[...a,a[0]+(b[0]-a[0])*q,a[1]+(b[1]-a[1])*q];}
    else {const q=(distance-l1)/l2;points=[...a,...b,b[0]+(d[0]-b[0])*q,b[1]+(d[1]-b[1])*q];}
    line(c,points,'#3e5b4b',2.6);line(c,points,'#5c7460',.6);
    if(progress>.96)ellipse(c,3.5,12.5,.8,1.05,'#3e5b4b');
  });
}
