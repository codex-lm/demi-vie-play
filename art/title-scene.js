import {hash} from './palette.js';
import {line, poly, ellipse, halo, gradient} from './primitives.js';
import {drawRoomProps, drawLadder, drawLamp} from './props.js';
import {drawColonist} from './colonist.js';

// All distances below belong to the illustration, never to the simulation.
const valid = (...values) => values.every(Number.isFinite);
const mod = (a,b) => ((a % b)+b)%b;

/** The title's letter height is size; its width is 5.72 * size. Top-left anchor.
 * Outlined by hand, with small open stencil joints: no font or raster resource. */
export function drawLogo(c,x,y,size) {
  if(!valid(x,y,size)||size<=0)return;
  c.save();c.setLineDash([]);c.translate(x,y);c.scale(size,size);
  const letters=[
    [[0,.96,0,.06,.30,.06,.49,.22,.49,.79,.32,.96,.06,.96]],
    [[.49,.06,0,.06,0,.96,.49,.96],[0,.49,.37,.49]],
    [[0,.96,0,.06,.28,.48,.56,.06,.56,.96]],
    [[.08,.06,.37,.06],[.225,.10,.225,.91],[.08,.96,.37,.96]],
    [[.05,.51,.4,.51]],
    [[0,.06,.26,.96,.52,.06]],
    [[.08,.06,.37,.06],[.225,.10,.225,.91],[.08,.96,.37,.96]],
    [[.49,.06,0,.06,0,.96,.49,.96],[0,.49,.37,.49]],
  ];
  const advances=[.78,.73,.83,.64,.64,.78,.66,.66];
  let offset=.075;
  for(let i=0;i<letters.length;i++){
    for(const points of letters[i]){
      c.beginPath();c.moveTo(offset+points[0],points[1]);
      for(let j=2;j<points.length;j+=2)c.lineTo(offset+points[j],points[j+1]);
      c.strokeStyle='#e3d3b3';c.lineWidth=.105;c.lineCap='butt';c.lineJoin='bevel';c.stroke();
      // A thin warm edge is the surviving paint on the stamped letters.
      c.strokeStyle='#f2e7ce';c.lineWidth=.014;c.stroke();
    }
    // Breaks in the paint are short faded strokes, not black holes tied to a background.
    const wearX=[.0,.0,.0,.225,.24,.072,.225,0][i],wearY=i===4?.51:.28;
    const alpha=c.globalAlpha;c.globalAlpha*=.32;
    line(c,[offset+wearX-.018,wearY-.008,offset+wearX+.018,wearY+.008],'#756b59',.021);
    c.globalAlpha=alpha;offset+=advances[i];
  }
  c.restore();
}

function skyline(c,H) {
  const ground=H*.405;
  c.fillStyle=gradient(c,0,0,0,ground,'#171a20','#695347');c.fillRect(0,0,1600,ground+30);
  // Low, broad cloud strata leave the central title in quiet air.
  for(let i=0;i<7;i++){
    const yy=ground*(.12+i*.11);
    c.fillStyle=gradient(c,0,yy,0,35,'#9c7b5d00','#9c7b5d0a');c.fillRect(0,yy,1600,35);
  }
  for(let layer=0;layer<3;layer++){
    const base=ground-22+layer*9;
    for(let i=0;i<23;i++){
      const x=i*78-20+hash(i,5)*23,bw=35+hash(i,6)*62;
      const centerQuiet=x>480&&x<1120?.52:1;
      const height=(28+hash(i,9)*100)*(layer===0?.75:1)*centerQuiet;
      const top=base-height;
      const color=['#574a43','#3e3935','#282b2a'][layer];
      const forms=[
        [x,base,x,top+8,x+bw*.18,top+9,x+bw*.20,top-3,x+bw*.43,top+9,x+bw*.61,top+3,x+bw*.64,top+20,x+bw,top+17,x+bw,base],
        [x,base,x,top+height*.48,x+bw*.33,top+height*.39,x+bw*.33,top,x+bw*.54,top+3,x+bw*.54,top+height*.44,x+bw,top+height*.6,x+bw,base],
        [x,base,x+3,top+12,x+bw*.13,top+2,x+bw*.66,top+2,x+bw*.7,top+20,x+bw,top+27,x+bw,base],
      ];
      poly(c,forms[(i+layer)%3],color,null);
      if(layer===2){
        if(i%3===0)line(c,[x+bw*.45,top+14,x+bw*.5,top-20,x+bw*.63,top-28],'#343531',2);
        for(let r=0;r<3;r++)for(let col=0;col<3;col++){
          if((i+layer)%3!==1){c.fillStyle='#191e20';c.fillRect(x+9+col*12,top+29+r*19,5,9);}
        }
        line(c,[x+bw*.8,top+28,x+bw*.62,top+49,x+bw*.74,top+65],'#171e20',2);
      }
    }
  }
  c.fillStyle=gradient(c,0,ground-35,0,40,'#9a7d5e00','#9a7d5e25');c.fillRect(0,ground-35,1600,40);
  return ground;
}

function rock(c,H,ground){
  c.fillStyle=gradient(c,0,ground,0,H-ground,'#332b25','#151b1c');c.fillRect(0,ground,1600,H-ground);
  for(let layer=0;layer<18;layer++){
    const y=ground+layer*43;
    const p=[-30,y];for(let x=-30;x<1650;x+=80)p.push(x,y+Math.sin(x*.006+layer*.7)*12+hash(x,layer)*14);
    p.push(1650,y+48,-30,y+48);
    poly(c,p,layer%3===0?'#41332755':layer%3===1?'#55422d22':'#0b161b25',null);
    line(c,p.slice(0,-4),'#6f58421d',1.7);
  }
  for(let i=0;i<1350;i++){
    const x=hash(i,22)*1600,y=ground+hash(i,23)*(H-ground);
    c.fillStyle=i%4?'#97785415':'#0b111a44';c.fillRect(x,y,1+hash(i,24)*7,.5+hash(i,25)*2);
  }
  for(let i=0;i<40;i++){
    const x=hash(i,32)*1600,y=ground+hash(i,33)*(H-ground);
    line(c,[x,y,x+13,y+11,x+9,y+25,x+28,y+34],'#101a1b66',1.6);
  }
  // The broken surface is a scar, not a clean floor.
  const edge=[0,ground+8];for(let x=0;x<=1600;x+=18)edge.push(x,ground-4+hash(x,31)*11);edge.push(1600,ground+16,0,ground+16);
  poly(c,edge,'#76634b',null);
  for(let i=0;i<60;i++){
    const x=hash(i,49)*1600;
    poly(c,[x,ground,x+7,ground-5-hash(i,50)*9,x+24,ground-1,x+28,ground+3],'#3a3630',null);
  }
}

function room(c,type,x,y,w,h,t,seed,people) {
  halo(c,x+w*.5,y+h*.5,w*.64,.055);
  poly(c,[x-10,y+20,x+3,y-7,x+w-8,y-8,x+w+10,y+7,x+w+9,y+h+14,x-11,y+h+12],'#0d1518','#76664a',2);
  drawRoomProps(c,type,{x,y,w,h},35,{seed,t,glow:true,lit:true,powered:true,shade:true,cache:false});
  c.save();c.beginPath();c.rect(x,y,w,h);c.clip();
  for(const p of people){
    let px=x+p.x;
    if(p.walk)px+=Math.sin(t*.10)*38;
    drawColonist(c,px,y+h-4,35,{seed:p.seed,age:p.age??'adult',job:p.job??'none',pose:p.walk?'walk':p.pose??'idle',facing:p.walk?Math.cos(t*.10)>=0?1:-1:p.facing??1,t:p.walk?t*.54:t*.45});
  }
  c.restore();
  line(c,[x-7,y+h+3,x+w+8,y+h+3],'#ab8a58',3);
  line(c,[x-3,y+5,x-3,y+h,x+w+3,y+h,x+w+3,y+6],'#5b4e38',5);
  // Uneven slab facets frame the room and bind it into the surrounding rock.
  for(let i=0;i<6;i++){
    const xx=x+i*w/6;
    poly(c,[xx,y-11,xx+w/6+2,y-9,xx+w/6-9,y-3,xx+8,y-2],'#51412f',null);
  }
}

/** Full-bleed title illustration; the host may overlay drawLogo and menu controls.
 * t is in seconds. No animation loop, text, DOM or mutable game state lives here. */
export function drawTitleScene(c,w,h,{t=0}={}) {
  if(!valid(w,h)||w<=0||h<=0)return;
  t=Number.isFinite(t)?t:0;
  c.save();c.setLineDash([]);c.beginPath();c.rect(0,0,w,h);c.clip();
  const s=w/1600,H=h/s;c.scale(s,s);
  const ground=skyline(c,H);rock(c,H,ground);
  const ry=ground+115,rh=168,floor=ry+rh;
  // The single access shaft visibly reaches the hatch and the occupied corridor.
  c.fillStyle='#111c1e';c.fillRect(585,ground+4,37,floor-ground+17);
  line(c,[584,ground+2,584,floor+21,1410,floor+21],'#756347',4);
  drawLadder(c,603,ground+15,floor-ground,33);
  c.fillStyle='#192123';c.fillRect(185,floor-31,1225,55);
  line(c,[185,floor+24,1410,floor+24],'#89704d',3);
  drawLamp(c,605,floor-25,30,{halo:true,lit:true,powered:true});
  room(c,'dorm',208,ry,340,rh,t,13,[{x:78,seed:42,age:'child',pose:'idle'},{x:256,seed:5,age:'elder',pose:'sit',facing:-1}]);
  room(c,'commons',655,ry,330,rh,t,19,[{x:84,seed:19,pose:'sit'},{x:247,seed:71,pose:'talk',facing:-1}]);
  room(c,'kitchen',1070,ry,300,rh,t,31,[{x:74,seed:11,job:'cook',pose:'work'},{x:242,seed:61,pose:'idle',facing:-1}]);
  drawColonist(c,770+Math.sin(t*.10)*105,floor+20,31,{seed:57,pose:'walk',job:'hauler',facing:Math.cos(t*.10)>=0?1:-1,t:t*.54});
  // A second inhabited level is quieter, leaving the warm first level dominant.
  const lowerY=floor+87;
  if(lowerY+125<H-15){
    c.fillStyle='#172022';c.fillRect(1007,floor+22,29,lowerY+125-floor);
    drawLadder(c,1021,floor+25,lowerY+122-floor,26);
    room(c,'hydroponics',665,lowerY,310,126,t,7,[{x:234,seed:23,job:'farmer',pose:'work'}]);
    room(c,'workshop',1070,lowerY,300,126,t,33,[{x:80,seed:3,job:'tech',pose:'work'}]);
    c.fillStyle='#11181a55';c.fillRect(650,lowerY-15,740,165);
  }
  // Rusted hatch rim, handle and ladder opening remain readable at 800 pixels.
  poly(c,[570,ground+2,579,ground-13,629,ground-13,639,ground+2],'#545751','#a19473',2);
  c.fillStyle='#101b1e';c.fillRect(587,ground-5,33,9);
  line(c,[578,ground-10,578,ground-38,620,ground-38,628,ground-13],'#778174',5);
  line(c,[595,ground-38,595,ground-44,607,ground-44,607,ground-38],'#a69b7c',2);
  ellipse(c,634,ground-10,3,3,'#d1ad6b');
  // Small motion stays under the artwork: slow dust and a gently fluttering lamp.
  halo(c,820,ry+28,95,.025+.012*Math.sin(t*1.7)+.005*Math.sin(t*4.3));
  for(let i=0;i<37;i++){
    const x=180+hash(i,72)*1220,yy=ry-42+mod(hash(i,73)*120+t*(1.4+hash(i,74)),120);
    c.fillStyle=`rgba(205,180,128,${.06+hash(i,75)*.11})`;c.fillRect(x+Math.sin(t*.2+i)*2,yy,1.6,1.3);
  }
  const shade=c.createRadialGradient(805,H*.58,180,800,H*.54,950);
  shade.addColorStop(0,'#070f1700');shade.addColorStop(.65,'#090e1425');shade.addColorStop(1,'#080f16b0');
  c.fillStyle=shade;c.fillRect(0,0,1600,H);
  c.fillStyle=gradient(c,0,H-120,0,120,'#10191a00','#0e171bd9');c.fillRect(0,H-120,1600,120);
  c.restore();
}
