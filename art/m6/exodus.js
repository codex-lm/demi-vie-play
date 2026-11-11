import { P, hash, clamp, finite, smooth, seedOf, identityOf, frame } from './common.js';
import { line, poly, ellipse, box, gradient, halo } from '../primitives.js';
import { drawColonist, colonistFeatures, colonistOutfit } from '../colonist.js';
import { drawPortrait } from '../portrait.js';
import { drawFirstSky } from '../first-sky.js';
import { CINEMA_TEXT as T } from './cinema-strings.fr.js';

export const EXODUS_DURATION = 40;
export const EXODUS_CUTS = Object.freeze([0, 6, 12, 20, 29, 36, 40]);
const W = 1280, H = 720;
const mod = (n,d) => ((n%d)+d)%d;

function canvasOf(width,height) {
  let canvas;
  if (typeof OffscreenCanvas === 'function') canvas = new OffscreenCanvas(width,height);
  else if (typeof document !== 'undefined' && document.createElement) {
    canvas = document.createElement('canvas'); canvas.width=width; canvas.height=height;
  }
  return canvas;
}

function layer(draw) {
  // Fixed illustration resolution keeps cache memory and frame cost bounded.
  const canvas=canvasOf(W,H);
  // These immutable surfaces are copied repeatedly and also read during replay
  // verification. Keep their raster backend stable instead of letting Chrome
  // migrate individual caches between GPU and CPU after repeated readbacks.
  if (canvas) { draw(canvas.getContext('2d',{willReadFrequently:true})); return canvas; }
  return null;
}

function walkingAtlas(person,heldSide=0) {
  // The first row is unchanged for the final title; only shot five uses row two.
  const canvas=canvasOf(96*8,256);if(!canvas)return null;
  const c=canvas.getContext('2d',{willReadFrequently:true});
  for(let i=0;i<8;i++) {
    c.save();c.beginPath();c.rect(i*96,0,96,128);c.clip();
    drawColonist(c,i*96+48,117,56,{...person,pose:'walk',facing:-1,t:i*.96/8});
    c.restore();
    c.save();c.beginPath();c.rect(i*96,128,96,128);c.clip();
    rearWalker(c,i*96+48,245,100,person,i*.96/8,heldSide);c.restore();
  }
  return canvas;
}

// A standing back view has no face: nape, hair, shoulders and backpack establish
// its direction. The restrained foreshortened gait belongs to the receding road.
function rearWalker(c,x,y,height,person,t,heldSide=0) {
  const f=colonistFeatures(person.seed,person.age),dress=colonistOutfit(person.job);
  const child=person.age==='child',skin=person.skin??f.skin;
  const phase=t/.96*Math.PI*2,stride=Math.sin(phase),bob=-Math.abs(Math.cos(phase))*1.2;
  const sway=Math.sin(phase)*1.05,wide=f.width;
  c.save();c.translate(x,y);c.scale(height/100,height/100);
  ellipse(c,0,1,16,3,'#273e362c');
  // Opposite feet exchange support; the lifted sole is visible from behind.
  for(const side of [-1,1]) {
    const lift=Math.max(0,stride*side)*7,footX=side*(7+stride*side*1.2);
    line(c,[side*6+sway,-39+bob,side*7,-22-lift*.4,footX,-5-lift],'#293a36',10);
    line(c,[side*6+sway,-39+bob,side*7,-22-lift*.4,footX,-5-lift],side<0?'#4f5b50':'#46554d',7.5);
    box(c,footX-4.5,-5-lift,9,5.2,'#2b3732',1.6,null);
    line(c,[footX-3,-1-lift,footX+3,-1-lift],lift>2?'#b3aa83':'#7c806b',1);
  }
  const arm=(side)=>{
    const shoulder=[side*13*wide+sway,-73+bob],swing=stride*side*4;
    const hand=side===heldSide?[side*(child?28:25),child?(-44+Math.sin(phase)*.7)/.67:-44+Math.sin(phase)*.7]:[side*17+sway,-45+swing];
    const elbow=[shoulder[0]+side*3,(shoulder[1]+hand[1])*.5+2];
    line(c,[...shoulder,...elbow,...hand],'#35433b',8.6);
    line(c,[...shoulder,...elbow,...hand],dress[2],6.3);
    ellipse(c,hand[0],hand[1],2.6,3.1,skin,'#35433b',.6);
  };
  arm(-1);arm(1);
  c.save();c.translate(sway,bob);c.rotate(Math.sin(phase)*.014);
  poly(c,[-11*wide,-77,11*wide,-77,16*wide,-68,12*wide,-53,15*wide,-38,1,-36,-15*wide,-39,-12*wide,-57,-16*wide,-68],dress[0],'#35433b',1.2);
  line(c,[-12,-70,-11,-43],dress[1],.85);
  line(c,[-12,-40,-2,-39,1,-40,12,-39],'#cfbc9266',.8);
  // Broad shoulder straps and a tied bedroll make these travellers, not workers.
  line(c,[-10,-76,-12,-55,-8,-44],'#d1bb84',2.7);
  line(c,[10,-76,12,-55,8,-44],'#b5a779',2.7);
  box(c,-10.5,-72,21,29,child?'#8a795a':'#746f51',4,'#38473a',1.15);
  box(c,-11,-74,22,9,child?'#a4916c':'#919072',3,'#46523e',.8);
  line(c,[-7,-73,-7,-67,7,-67,7,-73],'#c8ba8c',1);
  box(c,-6.5,-57,13,10,'#8c8461',2,'#4e5944',.6);
  line(c,[0,-70,0,-61],'#c3ad79',1.5);
  // Neck, ears and full hair crown: deliberately no eyes, nose or mouth.
  box(c,-4,-84,8,10,skin,1,null);
  ellipse(c,-8.5,-88,2.1,3.1,skin);ellipse(c,8.5,-88,2.1,3.1,skin);
  ellipse(c,0,-90,child?9:8.6,child?10.5:10,f.hair,'#364238',.9);
  if(f.style===3)poly(c,[-7,-92,-7,-78,-2,-76,4,-84,6,-95],f.hair,null);
  if(f.style===4)ellipse(c,-6,-86,4.3,4.8,f.hair,'#364238',.65);
  line(c,[-6,-94,-3,-98,2,-99],'#e5cf9b66',.8);
  poly(c,[-8,-79,0,-76,8,-80,9,-77,1,-73,-8,-76],f.scarf,null);
  poly(c,[6,-77,13,-75,17+stride,-71,11,-71,6,-74],f.scarf,null);
  c.restore();c.restore();
}

function convoyGroups(people) {
  const children=[],adults=[];people.forEach((p,i)=>(p.age==='child'?children:adults).push(i));
  const groups=adults.map(adult=>({adult,child:children.shift()}));
  return groups.concat(children.map(adult=>({adult})));
}

function rock(c,seed) {
  c.fillStyle=gradient(c,0,0,W,H,'#4a4136','#172326');c.fillRect(0,0,W,H);
  for(let row=0;row<19;row++) {
    const y=row*44;
    const points=[0,y];for(let x=0;x<=W+80;x+=80)points.push(x,y+hash(seed+row,x)*13);
    points.push(W,y+44,0,y+44);poly(c,points,row%3?'#1c282844':'#94744a20',null);
    line(c,points.slice(0,-4),'#c0a37618',1.5);
  }
  for(let i=0;i<330;i++) {
    const x=hash(seed,i)*W,y=hash(seed+8,i)*H;
    line(c,[x,y,x+3+hash(seed+1,i)*18,y-2],i%3?'#a48b5b19':'#0c191d66',1);
  }
  for(let i=0;i<24;i++) {
    const x=hash(seed+17,i)*W,y=hash(seed+21,i)*H;
    line(c,[x,y,x-12,y+22,x+3,y+36,x-5,y+55],'#101d2166',2);
  }
}

function vignette(c,strength=.7) {
  const g=c.createRadialGradient(640,340,190,640,360,770);
  g.addColorStop(0,'#07131800');g.addColorStop(1,`rgba(7,19,24,${strength})`);
  c.fillStyle=g;c.fillRect(0,0,W,H);
}

function dust(c,seed,t,beam=false) {
  c.save();
  for(let i=0;i<55;i++) {
    const x=beam?475+hash(seed,i)*310:hash(seed,i)*W;
    const y=mod(hash(seed+2,i)*H+t*(2+hash(seed+3,i)*10),H);
    const a=.07+hash(seed+4,i)*.3;
    ellipse(c,x+Math.sin(t*.4+i)*8,y,hash(seed+5,i)*1.3+.6,.8,`rgba(247,225,176,${a})`);
  }
  c.restore();
}

function hatchBackdrop(c,seed) {
  rock(c,seed);
  // A massive concrete collar and tiled bolt sockets give the opening scale.
  ellipse(c,640,315,320,286,'#172224','#958269',9);
  ellipse(c,640,315,294,261,'#303e3d','#0c191e',11);
  for(let i=0;i<16;i++) {
    const a=i*Math.PI/8;
    ellipse(c,640+307*Math.cos(a),315+273*Math.sin(a),10,8,'#655b49','#172427',3);
    line(c,[635+307*Math.cos(a),312+273*Math.sin(a),646+307*Math.cos(a),318+273*Math.sin(a)],'#bcaa82',2);
  }
  line(c,[93,600,338,600,359,615],'#121d20',12);
  line(c,[93,598,338,598,359,613],'#716c55',5);
  line(c,[959,63,1084,63,1084,516],'#142225',17);
  line(c,[959,60,1080,60,1080,516],'#5e665c',8);
  box(c,1058,483,45,56,'#374b4b',5,'#15292d',3);
  vignette(c,.75);
}

function hatch(c,t,seed) {
  const open=smooth((t-2.7)/3.1);
  ellipse(c,640,315,277,248,'#0a171c');
  // The growing slit is a physical gap behind the hinged cover.
  const light=gradient(c,440,90,400,400,'#e6e8c7','#c19d67');
  ellipse(c,640,315,270,240,light);
  c.save();c.translate(640,82);c.scale(1,1-open*.88);c.translate(-640,-82);
  ellipse(c,640,315,270,241,gradient(c,430,100,330,480,'#65706a','#293b3d'),'#b09a73',5);
  for(let i=0;i<4;i++)line(c,[450,175+i*92,827,175+i*92],i%2?'#243638':'#92927a',5);
  for(let i=0;i<68;i++){
    const a=hash(seed+21,i)*Math.PI*2,r=Math.sqrt(hash(seed+22,i));
    ellipse(c,640+Math.cos(a)*240*r,315+Math.sin(a)*205*r,2+hash(seed+23,i)*12,1+hash(seed+24,i)*6,'#9a684e44');
  }
  // A rotating wheel, connecting rods and two retracting latches.
  c.save();c.translate(640,330);c.rotate(smooth(t/2.4)*Math.PI*.78);
  ellipse(c,0,0,71,71,'#00000000','#182c2e',16);
  ellipse(c,0,0,69,69,'#00000000','#b0a483',7);
  for(let i=0;i<3;i++){const a=i*Math.PI*2/3;line(c,[0,0,Math.cos(a)*66,Math.sin(a)*66],'#b6a982',9);}
  ellipse(c,0,0,16,16,'#4e6260','#152b2d',3);c.restore();
  const retract=smooth(t/2.4)*45;
  for(const side of [-1,1]) {
    line(c,[640+side*73,331,640+side*(235-retract),331],'#18282c',17);
    line(c,[640+side*73,328,640+side*(235-retract),328],'#a49675',9);
  }
  box(c,582,425,116,38,'#645e4c',2,'#202d2c',2);
  for(let i=0;i<3;i++)line(c,[598,435+i*7,676-i*18,435+i*7],'#b1aa87',1);
  c.restore();
  if(open>.05) {c.save();c.globalAlpha*=open*.32;poly(c,[438,149,844,149,1112,720,202,720],'#f9e8ac',null);c.restore();}
  dust(c,seed,t,true);
  // One hand stays on the last rung, silhouetted against the opening.
  line(c,[454,720,469,606,536,552],'#132429',48);line(c,[454,720,469,606,536,552],'#677a76',34);
  ellipse(c,541,550,27,17,'#c39b73','#172a2e',3);
  line(c,[521,545,545,536,560,541],'#e7be92',5);
}

function shaftBackdrop(c,seed) {
  rock(c,seed);
  poly(c,[365,0,886,0,829,720,429,720],'#0a171c','#56655b',8);
  poly(c,[365,0,425,0,479,720,429,720],'#5e5945',null);
  poly(c,[829,720,780,720,834,0,886,0],'#3c4640',null);
  for(let i=0;i<17;i++) {
    const y=i*46;line(c,[383+y*.082,y,424+y*.075,y+4],'#b19a6b66',4);
    line(c,[837-y*.076,y,881-y*.082,y+4],'#8f846266',4);
  }
  // Slight perspective: rungs widen towards the viewer.
  line(c,[580,-20,523,742],'#142529',17);line(c,[580,-20,523,742],'#a19777',8);
  line(c,[685,-20,742,742],'#142529',17);line(c,[685,-20,742,742],'#827f65',8);
  for(let i=0;i<16;i++) {
    const y=25+i*48;
    line(c,[579-y*.076,y,686+y*.076,y],'#17282a',13);
    line(c,[579-y*.076,y-2,686+y*.076,y-2],'#b5a47a',6);
  }
  poly(c,[365,0,886,0,867,67,380,67],'#d2d6ba',null);
  line(c,[350,63,886,63],'#b8b491',8);
  vignette(c,.73);
}

function shaftLight(c,t) {
  const alpha=.18+smooth(t/3)*.22;
  c.save();c.globalAlpha*=alpha;
  poly(c,[439,50,792,50,1052,720,271,720],gradient(c,0,40,0,680,'#f7e8b6','#f7e8b600'),null);
  c.globalAlpha*=.6;
  poly(c,[524,50,590,50,596,720,384,720],'#f0e4b455',null);
  poly(c,[738,50,775,50,991,720,740,720],'#f0e4b444',null);c.restore();
}

function caption(c,text,y=653,size=22,color=P.cream) {
  c.save();c.textAlign='center';c.textBaseline='middle';c.font=`${size}px Georgia, serif`;
  c.fillStyle=color;c.fillText(text,640,y,1100);c.restore();
}

function skyPortrait(c,x,y,size,person,t) {
  const f=colonistFeatures(person.seed,'child'),skin=person.skin??f.skin;
  c.save();c.translate(x+size/2,y+size/2);c.rotate(Math.sin(t*.43+person.seed)*.008);
  c.translate(-size/2,-size/2);drawPortrait(c,0,0,size,{...person,mood:84});
  c.scale(size/100,size/100);
  // Keep the exact saved face and wardrobe; only the eyes and lips react to light.
  const blink=mod(t+f.blinkOffset,4.7)/4.7>.968;
  function restoreFace(cx,cy,rx,ry) {
    c.save();c.beginPath();c.ellipse(cx,cy,rx,ry,0,0,Math.PI*2);c.clip();
    c.fillStyle=skin;c.fillRect(cx-rx,cy-ry,rx*2,ry*2);
    c.fillStyle=gradient(c,50-21*f.width,33,42*f.width,20,'rgba(255,229,188,.20)','rgba(80,45,34,.17)');
    c.fillRect(cx-rx,cy-ry,rx*2,ry*2);c.restore();
  }
  for(const [ex,rx]of [[42,3.9],[61,3.2]]) {
    restoreFace(ex,45.6,7.8,7.0);
    line(c,[ex-rx-1,38.5,ex,37.7,ex+rx+1,38.8],f.hair,1.25);
    if(blink)line(c,[ex-rx,46,ex,47,ex+rx,46],P.ink,.85);
    else {
      ellipse(c,ex,45.1,rx+0.5,3.2,'#f3e8cb',P.ink,.65);
      ellipse(c,ex+.6,43.8,1.55,2.1,'#373837');
      ellipse(c,ex+.2,43.1,.45,.55,'#fff5d7');
    }
  }
  restoreFace(53,65,9,3.4);
  ellipse(c,53.4,65,2.65,1.9,'#805946');
  line(c,[51.8,66.5,54.5,66.7],'#c29170',.55);
  if(f.glasses) {
    for(const [ex,rx]of [[42,6.9],[61,6]])ellipse(c,ex,46,rx,5.5,'#d3e0d112',P.inkSoft,.9);
    line(c,[49,45.4,55,45.4],P.inkSoft,.9);
  }
  c.restore();
}

function weatherName(weather) {
  if(typeof weather==='string')return weather;
  // The live simulation stores its effective state in weather.current; forecast
  // events have a type instead. Never substitute an upcoming event for current.
  for(const candidate of [weather?.current,weather?.type,weather?.kind,weather?.id]) {
    if(typeof candidate==='string')return candidate;
  }
  return 'clear';
}

function weatherLayer(c,weather,seed,t) {
  const name=weatherName(weather).toLowerCase();
  const dustStorm=/dust|poussi|sandstorm|cendre|ash/.test(name);
  const snow=/snow|neige|blizzard/.test(name);
  const rain=!dustStorm&&!snow&&/rain|pluie|storm|orage/.test(name);
  const blackRain=rain&&/black|noire/.test(name);
  const gray=rain||snow||/cloud|overcast|fog|gris|brume/.test(name);
  if(gray){c.fillStyle=blackRain?'#192d3570':rain?'#203b4655':'#6d7e8228';c.fillRect(0,0,W,H);}
  if(rain||snow)for(let i=0;i<95;i++) {
    const speed=snow?24:250,x=mod(hash(seed+55,i)*W+t*(snow?5:-65),W),y=mod(hash(seed+56,i)*H+t*speed,H);
    if(snow)ellipse(c,x+Math.sin(t*.6+i)*6,y,1.2+hash(seed+57,i),1.7,'#e6eadb99');
    else line(c,[x,y,x-4,y+15],blackRain?'#829b9255':'#b6d0cb44',1.1);
  }
  if(dustStorm) {
    c.fillStyle='#8d744c57';c.fillRect(0,0,W,H);
    for(let i=0;i<90;i++) {
      const x=mod(hash(seed+55,i)*W+t*(115+hash(seed+57,i)*70),W);
      const y=hash(seed+56,i)*H+Math.sin(t*.8+i)*9;
      line(c,[x,y,x+9+hash(seed+58,i)*23,y-2],'#c2a57866',1.2);
    }
    const haze=gradient(c,0,240,0,480,'#baa07100','#a7895c55');
    c.fillStyle=haze;c.fillRect(0,240,W,480);
  }
  if(name==='clearing'||name==='eclaircie'||name==='éclaircie') {
    const glow=c.createRadialGradient(860,182,30,860,182,450);
    glow.addColorStop(0,'#fff5cf39');glow.addColorStop(1,'#fff5cf00');
    c.fillStyle=glow;c.fillRect(0,0,W,H);
  }
  if(/fog|brume/.test(name)) {
    c.fillStyle=gradient(c,0,300,0,330,'#b5c5b500','#b5c5b56b');c.fillRect(0,300,W,330);
  }
}

function landscape(c,season,surfaceTemperature) {
  drawFirstSky(c,W,H,{people:[],t:0,season,surfaceTemperature});
  // A pale path heads past the ruined city, leaving the hatch behind.
  const haze=c.createLinearGradient(0,0,0,410);haze.addColorStop(0,'#bed8d533');haze.addColorStop(1,'#f2e1b300');
  c.fillStyle=haze;c.fillRect(0,0,W,410);
}

function distantCity(c,seed) {
  // The road's vanishing point meets the lost city. Broken towers continue
  // across the centre, with two pale depth bands dissolving into ground mist.
  c.save();
  for(let band=0;band<2;band++) {
    c.globalAlpha*=band===0?.48:1.05;
    const base=band===0?447:454;
    for(let i=0;i<31;i++) {
      const x=221+i*27+hash(seed+63,i+band*40)*13;
      const width=13+hash(seed+64,i+band*40)*21;
      const height=12+hash(seed+65,i+band*40)*(band===0?43:32);
      const top=base-height;
      poly(c,[x,base,x,top+4,x+width*.28,top+8,x+width*.28,top,x+width*.55,top+2,x+width*.62,top+13,x+width*.85,top+8,x+width,top+17,x+width,base],band===0?'#9cae9f':'#8f9f8f',null);
      if(i%3===0)for(let floor=0;floor<3;floor++)for(let win=0;win<2;win++) {
        c.fillStyle='#d6d8bb';c.fillRect(x+4+win*7,top+17+floor*8,3,4);
      }
      if(i%7===2)line(c,[x+width*.4,top+6,x+width*.4,top-9,x+width*.7,top-11],'#8d9e91',1.3);
    }
  }
  // A half-fallen civic tower gives the destination a memorable silhouette.
  poly(c,[629,449,629,410,635,410,635,387,641,391,641,404,648,402,648,449],'#91a295',null);
  line(c,[637,390,637,376,639,372],'#9ba99a',1.5);
  const mist=c.createLinearGradient(0,379,0,466);
  mist.addColorStop(0,'#e5e2c300');mist.addColorStop(.62,'#d7dbc344');mist.addColorStop(1,'#c2c9adbb');
  c.fillStyle=mist;c.fillRect(220,379,876,87);c.restore();
}

function rearConvoy(c,people,groups,atlases,t) {
  // Group each supplied child with one supplied adult; never create survivors.
  // Perspective uses the same vanishing point as the road, and sorts far first.
  for(let i=groups.length-1;i>=0;i--) {
    const group=groups[i],depth=groups.length===1?.22:.12+i/(groups.length-1)*.76;
    const travel=depth+t*.012,y=655-travel*207;
    const height=Math.max(9,(y-454)*.56),x=665+(1-travel)*(-6+Math.sin(i*2.1)*18);
    const phase=t+i*.31,frameIndex=Math.floor(mod(phase,.96)/.96*8);
    const paired=group.child!==undefined,childHeight=height*.67;
    const adultX=x-(paired?height*.16:0),childX=adultX+height*.25+childHeight*.28;
    const render=(index,px,h,heldSide)=>{
      const p=people[index],s=h/100;
      if(atlases[index])c.drawImage(atlases[index],frameIndex*96,128,96,128,px-48*s,y-117*s,96*s,128*s);
      else rearWalker(c,px,y,h,p,frameIndex*.96/8,heldSide);
    };
    c.save();c.globalAlpha*=1-depth*.17;
    const leaderHeight=people[group.adult].age==='child'?childHeight:height;
    render(group.adult,adultX,leaderHeight,paired?1:0);
    if(paired)render(group.child,childX,childHeight,-1);
    c.restore();
  }
}

function convoy(c,people,atlases,t) {
  // Render every supplied survivor, furthest first; no invented colonists.
  const n=people.length;
  for(let i=n-1;i>=0;i--) {
    const p=people[i],v=n===1?.4:i/Math.max(1,n-1),depth=.16+v*.66;
    const advance=t*.011,y=655-(depth+advance)*207;
    const x=690-(depth+advance)*60+Math.sin(i*1.8)*12*(1-depth);
    const size=49*(1-depth*.72);
    if(atlases[i]) {
      const frameIndex=Math.floor(mod(t+i*.41,.96)/.96*8),s=size/56;
      c.drawImage(atlases[i],frameIndex*96,0,96,128,x-48*s,y-117*s,96*s,128*s);
    } else drawColonist(c,x,y,size,{...p,pose:'walk',facing:-1,t:t+i*.41});
  }
}

/** 40 second, six-shot, seed-stable film. update uses elapsed seconds, never a wall clock.
 * An explicit empty cast stays empty. Pass born-underground children explicitly to select
 * them; if omitted, the children's scene uses colonists marked bornUnderground/bornBelow. */
export function createExodusCinematic(options={}) {
  const opts=options&&typeof options==='object'?options:{};
  const seed=seedOf(opts.seed??6);
  const source=Array.isArray(opts.colonists)?opts.colonists:[];
  const people=source.filter(p=>p&&typeof p==='object').map(identityOf);
  const children=(Array.isArray(opts.children)?opts.children:source.filter(p=>p?.bornUnderground||p?.bornBelow))
    .filter(p=>p&&typeof p==='object').map(p=>({...identityOf(p),age:'child'}));
  const season=['winter','spring','summer','autumn'].includes(opts.season)?opts.season:'spring';
  const weather=weatherName(opts.weather);
  // Snow follows the real surface temperature when the game supplies it.
  const surfaceTemperature=Number.isFinite(opts.surfaceTemperature)?opts.surfaceTemperature:undefined;
  let time=0;
  // Keep the approved landscape in its original raster. Packing both views in
  // one wide texture lets interpolation sample across the crop's right edge.
  const backdrops=[layer(c=>hatchBackdrop(c,seed)),layer(c=>shaftBackdrop(c,seed)),
    layer(c=>landscape(c,season,surfaceTemperature)),layer(c=>{landscape(c,season,surfaceTemperature);distantCity(c,seed);})];
  const groups=convoyGroups(people),heldSides=people.map(()=>0);
  for(const {adult,child}of groups)if(child!==undefined){heldSides[adult]=1;heldSides[child]=-1;}
  const atlases=people.map((person,i)=>walkingAtlas(person,heldSides[i]));
  const paint=(c,index,column=false)=>{
    const backdrop=backdrops[column?3:index];
    if(backdrop)c.drawImage(backdrop,0,0);
    else {
      [()=>hatchBackdrop(c,seed),()=>shaftBackdrop(c,seed),()=>landscape(c,season,surfaceTemperature)][index]();
      if(column)distantCity(c,seed);
    }
  };
  const sequence=()=>{
    for(let i=0;i<5;i++)if(time<EXODUS_CUTS[i+1])return i;
    return 5;
  };
  return {
    update(dt) {time=Math.min(EXODUS_DURATION,time+Math.max(0,finite(dt)));},
    skip() {time=EXODUS_DURATION;},
    get done() {return time>=EXODUS_DURATION;},
    get time() {return time;},
    get duration() {return EXODUS_DURATION;},
    get sequence() {return sequence();},
    draw(ctx,w,h,{reduceMotion=false}={}) {
      frame(ctx,0,0,w,h,(c)=>{
        c.fillStyle='#081418';c.fillRect(0,0,w,h);
        const scale=Math.min(w/W,h/H);c.translate((w-W*scale)/2,(h-H*scale)/2);c.scale(scale,scale);
        const shot=sequence(),elapsed=time-EXODUS_CUTS[shot];
        // Reduced motion preserves the forty-second narrative and every name,
        // while holding each shot still: no zoom, walking, dust or fade.
        const t=reduceMotion ? (shot===5?2:3) : elapsed;
        const visualTime=reduceMotion ? EXODUS_CUTS[shot]+t : time;
        if(shot===0){paint(c,0);hatch(c,t,seed);}
        if(shot===1){paint(c,1);shaftLight(c,t);if(!reduceMotion)dust(c,seed,t,true);}
        if(shot===2) {
          paint(c,1);shaftLight(c,6);if(!reduceMotion)dust(c,seed,time,true);
          if(people.length) {
            const position=Math.min(people.length-.0001,elapsed/8*people.length),i=Math.floor(position),u=reduceMotion?.5:position-i,p=people[i];
            c.save();c.beginPath();c.rect(426,68,397,652);c.clip();
            drawColonist(c,628,740-u*390,163,{...p,pose:'climb',facing:1,t:t*1.5});c.restore();
            const fade=smooth(Math.min(u/.12,(1-u)/.12));
            c.save();c.globalAlpha*=fade;
            drawPortrait(c,976,239,174,p);
            c.textAlign='center';c.fillStyle=P.cream;c.font='24px Georgia, serif';c.fillText(p.firstName,1063,449,230);
            line(c,[1008,474,1118,474],'#ad987266',1);c.restore();
          }
          caption(c,T.peopleCaption,669,21);
        }
        if(shot===3) {
          paint(c,2);c.fillStyle='#15333a70';c.fillRect(0,0,W,H);
          const pages=Math.max(1,Math.ceil(children.length/3)),page=Math.min(pages-1,Math.floor(elapsed/9*pages));
          const group=children.slice(page*3,page*3+3),n=group.length,size=n===1?325:n===2?290:258;
          const gap=n===1?0:n===2?90:64,total=n*size+(n-1)*gap,start=(W-total)/2;
          if(n)for(let i=0;i<n;i++) {
            const p=group[i],x=start+i*(size+gap),y=172+Math.sin(t*.4+i)*2;
            halo(c,x+size/2,y+size/2,size*.82,.12);
            skyPortrait(c,x,y,size,p,t);
            line(c,[x+size*.12,y+size+29,x+size*.88,y+size+29],'#cfc6a788',1);
            c.fillStyle='#f6e9c9';c.font='italic 35px Georgia, serif';c.textAlign='center';
            c.fillText(p.firstName,x+size/2,y+size+72,size+30);
          }
          caption(c,n?T.childrenCaption:T.emptyChildren,101,28);
          weatherLayer(c,weather,seed,visualTime);if(!reduceMotion)dust(c,seed,time);
        }
        if(shot===4) {paint(c,2,true);rearConvoy(c,people,groups,atlases,t);weatherLayer(c,weather,seed,visualTime);}
        if(shot===5) {
          paint(c,2);convoy(c,people,atlases,7);weatherLayer(c,weather,seed,visualTime);
          c.fillStyle='#0d2630bb';c.fillRect(0,0,W,H);
          c.save();c.globalAlpha*=smooth(t/.9);
          const lift=(1-smooth(t/2))*12;
          caption(c,T.firstSky,322+lift,76,'#f1e6c9');
          line(c,[516,385+lift,764,385+lift],'#b8ad8999',1.2);
          caption(c,T.subtitle,427+lift,21,'#cbcbb5');c.restore();
        }
        // Short ink fades hide hard cuts without making the final title disappear.
        const duration=EXODUS_CUTS[shot+1]-EXODUS_CUTS[shot];
        const fade=shot===5||reduceMotion?0:Math.max(1-smooth(t/.32),smooth((t-duration+.35)/.35));
        if(fade>0){c.fillStyle=`rgba(6,17,21,${fade})`;c.fillRect(0,0,W,H);}
      });
    },
  };
}
