import { P, TAU, hash, clamp } from './palette.js';
import { box, ellipse, line, poly, gradient } from './primitives.js';
import { drawOutsideAnimal, drawOutsideClothes, drawOutsideMask, ANIMAL_KINDS } from './outsiders.js';

export const POSES = Object.freeze(['idle','walk','climb','dig','carry','sit','eat','sleep','crank','work','crisis','talk','pedal','suit']);
export const JOBS = Object.freeze(['digger','hauler','farmer','tech','medic','cook','none']);
export const AGES = Object.freeze(['child','adult','elder']);
export const WALK_CYCLE = .96;
export const WALK_DISTANCE = 1.12;
export const DIG_CYCLE = 1.72;
export const PICK_LENGTH = .90;
export const CRANK = Object.freeze({x:.60,y:-1.08,radius:.26,speed:3});
export const PEDAL = Object.freeze({x:0,y:-.56,radius:.23,speed:3.6});
const SKINS = ['#e8bd96','#d6a17b','#bd865e','#986749','#744b38','#efcfaa'];
const HAIR = ['#37312d','#5d4538','#9c7047','#c3a16b','#433932','#8b4d37'];
const OUTFITS = {
  digger: ['#b58b54','#d5b474','#65513c'], hauler: ['#72948f','#9db5a2','#465e60'],
  farmer: ['#839167','#aab487','#54634b'], tech: ['#6e8498','#9badb5','#425668'],
  medic: ['#c6c7aa','#e8dfbf','#7c9285'], cook: ['#a96e50','#c9946a','#725449'],
  none: ['#9e7f77','#c39d87','#6c5f62'],
};

/** Shared portrait/silhouette wardrobe. Callers receive a copy, never mutable palette state. */
export function colonistOutfit(job='none') { return [...(OUTFITS[job]??OUTFITS.none)]; }

export function colonistFeatures(seed = 1, age = 'adult', sex = null) {
  return {
    skin: SKINS[Math.floor(hash(seed,1)*SKINS.length)],
    hair: age === 'elder' ? ['#b4b2a0','#d9cfb4','#919b96'][Math.floor(hash(seed,2)*3)] : HAIR[Math.floor(hash(seed,2)*HAIR.length)],
    style: Math.floor(hash(seed,3)*5), beard: age !== 'child' && sex !== 'female' && hash(seed,4) > .55,
    width: .91 + hash(seed,5)*.20, nose: .055 + hash(seed,6)*.025,
    scarf: ['#c6935f','#9cb5a5','#b98073','#c2ad7a'][Math.floor(hash(seed,7)*4)],
    glasses: hash(seed,8) > .78, blinkOffset: hash(seed,9)*4.7,
  };
}

const FOOT = [[.28,0],[.14,0],[0,0],[-.14,0],[-.28,0],[-.20,-.14],[0,-.22],[.20,-.14]];
function footAt(phase) {
  const p = ((phase % 1) + 1) % 1 * 8;
  const i = Math.floor(p), f = p - i, a=FOOT[i], b=FOOT[(i+1)%8];
  return [a[0]+(b[0]-a[0])*f,a[1]+(b[1]-a[1])*f];
}
function phaseAt(t, period) { return ((t / period % 1)+1)%1; }
function keyframe(p, frames) {
  for (let i=1; i<frames.length; i++) {
    if (p<=frames[i][0]) {
      const a=frames[i-1],b=frames[i]; let f=(p-a[0])/(b[0]-a[0]); f=f*f*(3-2*f);
      return a[1]+(b[1]-a[1])*f;
    }
  }
  return frames.at(-1)[1];
}

// Public, pure kinematics, also used by acceptance checks over complete cycles.
export function samplePose(pose='idle', t=0, age='adult') {
  const walking = pose==='walk'||pose==='carry'||pose==='suit';
  const p=phaseAt(t,WALK_CYCLE), breathe=Math.sin(t*2.2)*.008;
  const s={ hip:[0,-.69+breathe], lean:age==='elder'?.13:0,
    feet:[[-.12,0],[.16,0]], hands:[[-.15,.01],[.23,-.015]],
    head:0, toolAngle:0, impact:false, phase:Math.floor(p*8), scale:age==='child'?.70:age==='elder'?.95:1 };
  if(walking) {
    s.feet=[footAt(p+.5),footAt(p)]; s.hip[1]=-.69+Math.cos(p*TAU*2)*.014;
    s.lean+=.045; const a=Math.sin(p*TAU)*.23;
    s.hands=[[-a-.02,-.09],[a+.08,-.10]];
  }
  if(pose==='carry') {s.lean+=.015; s.hands=[[-.52,-.69],[-.25,-.72]];}
  if(pose==='dig') {
    const d=phaseAt(t,DIG_CYCLE);
    s.toolAngle=keyframe(d,[[0,-1.55],[.30,-2.35],[.46,-2.35],[.64,.45],[.76,.45],[1,-1.55]]);
    s.lean+=keyframe(d,[[0,0],[.30,-.13],[.46,-.13],[.64,.28],[.76,.28],[1,0]]);
    s.hip[1]=keyframe(d,[[0,-.70],[.38,-.73],[.64,-.61],[.76,-.61],[1,-.70]]);
    const grip=[keyframe(d,[[0,.12],[.46,.06],[.64,.32],[.76,.32],[1,.12]]),keyframe(d,[[0,-.72],[.46,-.85],[.64,-.68],[.76,-.68],[1,-.72]])];
    s.hands=[[grip[0]-.20*Math.cos(s.toolAngle),grip[1]-.20*Math.sin(s.toolAngle)],grip];
    s.feet=[[-.27,0],[.30,0]]; s.impact=d>=.64&&d<.79; s.impactAge=(d-.64)/.15;
  }
  if(pose==='climb') {
    const q=phaseAt(t,1.2), a=Math.sin(q*TAU);
    s.hip=[0,-.77]; s.feet=[[-.06,-.15-Math.max(0,a)*.25],[.25,-.15-Math.max(0,-a)*.25]];
    s.hands=[[.29,-.74+a*.20],[.29,-.74-a*.20]]; s.lean=.10;
  }
  if(pose==='sit'||pose==='eat') {
    s.hip=[-.10,-.48+breathe]; s.feet=[[.32,0],[.50,0]]; s.hands=[[.25,-.12],[.39,-.12]];
    if(pose==='eat') { const a=(Math.sin(t*3)+1)*.5; s.hands[1]=[.30-a*.10,-.18-a*.44]; s.head=.08; }
  }
  if(pose==='work') { s.lean+=.20; s.hands=[[.46,-.22],[.47,-.27+Math.sin(t*7)*.12]]; s.head=.12; }
  if(pose==='crank') {
    const a=t*CRANK.speed; s.lean+=.11+Math.cos(a)*.075;s.hip[0]=Math.cos(a)*.035;
    s.hands=[[.30,-.29],[.48+Math.cos(a)*.26,-.39+Math.sin(a)*.26]];
  }
  if(pose==='pedal') {
    const a=t*PEDAL.speed;s.hip=[-.27,-1.12+Math.sin(a*2)*.008];s.lean=.48+Math.sin(a)*.018;
    s.feet=[[Math.cos(a+Math.PI)*PEDAL.radius,PEDAL.y+Math.sin(a+Math.PI)*PEDAL.radius],[Math.cos(a)*PEDAL.radius,PEDAL.y+Math.sin(a)*PEDAL.radius]];
    s.hands=[[.65,-.46],[.71,-.48]];s.head=-.14;
  }
  if(pose==='crisis') {
    s.hip=[-.1,-.27+breathe]; s.lean=.63+Math.sin(t*1.5)*.018; s.feet=[[.15,0],[.40,0]];
    s.hands=[[.015,-.88],[.21,-.86]]; s.head=.26;
  }
  if(pose==='talk') {
    s.hands=[[.25,-.18],[.43+Math.sin(t*2.5)*.08,-.47+Math.sin(t*3)*.10]];
    s.head=Math.sin(t*2)*.06;
  }
  return s;
}

/** Pick anchors in metres before age scale / facing; shared with the strike face. */
export function pickaxeGeometry(t=0,seed=19,age='adult') {
  const s=samplePose('dig',t,age),width=colonistFeatures(seed,age).width,a=s.toolAngle;
  const transform=p=>[s.hip[0]+Math.cos(s.lean)*width*p[0]-Math.sin(s.lean)*p[1],s.hip[1]+Math.sin(s.lean)*width*p[0]+Math.cos(s.lean)*p[1]];
  const grip=s.hands[1],head=[grip[0]+Math.cos(a)*.65,grip[1]+Math.sin(a)*.65];
  const point=[head[0]+Math.cos(a)*.18+Math.sin(a)*.40,head[1]+Math.sin(a)*.18-Math.cos(a)*.40];
  return {base:transform([grip[0]-Math.cos(a)*.25,grip[1]-Math.sin(a)*.25]),head:transform(head),point:transform(point),impact:s.impact,impactAge:s.impactAge,angle:a+s.lean};
}

function joint(a,b,l1,l2,bend=1) {
  const dx=b[0]-a[0],dy=b[1]-a[1],d=Math.max(.001,Math.hypot(dx,dy));
  const r=Math.min(d,l1+l2-.001), along=(l1*l1-l2*l2+r*r)/(2*r);
  const off=Math.sqrt(Math.max(0,l1*l1-along*along))*bend;
  return [a[0]+dx/d*along-dy/d*off,a[1]+dy/d*along+dx/d*off];
}
function limb(c,a,k,b,color,width) {
  line(c,[...a,...k,...b],P.ink,width+.035);
  line(c,[...a,...k,...b],color,width);
  line(c,[a[0]-.018,a[1],k[0]-.018,k[1]],'rgba(240,222,185,.16)',width*.26);
}
function boot(c,x,y,far=false) {
  c.save(); c.translate(x,y);
  box(c,-.075,-.145,.17,.12,far?'#383b3b':'#50504a',.035);
  c.beginPath(); c.moveTo(-.085,-.08); c.quadraticCurveTo(.04,-.11,.11,-.07);
  c.quadraticCurveTo(.22,-.06,.20,-.01); c.lineTo(-.085,-.01); c.closePath();
  c.fillStyle=far?'#353638':'#55524a'; c.fill(); c.strokeStyle=P.ink; c.lineWidth=.025; c.stroke();
  line(c,[-.06,-.015,.18,-.015],far?'#6b6659':'#a69a7c',.025);
  if(!far)line(c,[-.045,-.095,.035,-.108,.085,-.083],'#8a8270',.015);
  c.restore();
}
function arm(c,hand,colors,skin,far=false,pose='idle') {
  const a=[far?-.10:.09,-.49],extended=pose==='pedal'||pose==='crank'; const elbow=joint(a,hand,extended?.36:.30,extended?.35:.28,far?1:-1);
  limb(c,a,elbow,hand,far?colors[2]:colors[0],far?.135:.155);
  const cuff=[elbow[0]+(hand[0]-elbow[0])*.78,elbow[1]+(hand[1]-elbow[1])*.78];
  line(c,[...cuff,...hand],far?colors[0]:colors[1],.13);
  ellipse(c,hand[0],hand[1],.063,.070,skin,P.ink,.019);
  line(c,[hand[0]-.028,hand[1]-.04,hand[0]+.008,hand[1]-.048],'rgba(255,226,182,.32)',.018);
  if(pose==='talk'&&!far) line(c,[hand[0]+.03,hand[1],hand[0]+.08,hand[1]-.06],skin,.035);
}

function head(c,f,job,pose,angle,detail,age,t=0) {
  c.save(); c.translate(age==='elder'?.055:.015,age==='elder'?-.69:-.72); c.rotate(angle+(age==='elder'?.055:0));
  if(age==='child')c.scale(1.08,1.06);
  if(pose==='suit'){
    ellipse(c,-.015,-.15,.265,.31,gradient(c,-.24,-.45,.5,.6,'#d5c899','#8d947a'),P.ink,.028);
    box(c,-.085,-.31,.325,.225,'#263e42',.085,P.metalDark,.035);
    box(c,-.055,-.28,.26,.165,f.skin,.065,null);
    ellipse(c,.11,-.205,.021,.024,P.ink);line(c,[-.025,-.25,.10,-.265],'#e5efdc88',.021);
    box(c,.04,-.10,.215,.16,'#536866',.05,P.ink,.022);
    ellipse(c,.205,-.025,.075,.07,'#354b4d',P.metalLight,.018);
    for(let i=0;i<3;i++)line(c,[.18,-.055+i*.025,.23,-.055+i*.025],'#9dafa3',.012);
    line(c,[-.17,-.005,-.09,.11,.09,.12,.18,.07],P.metalDark,.047);
    c.restore();return;
  }
  // Nape, soft cheek, small nose: a three-quarter face reads even at twenty pixels per metre.
  box(c,-.075,-.02,.15,.18,f.skin,.045,P.ink,.02);
  if(f.style===3) ellipse(c,-.13,-.12,.16,.23,f.hair,P.ink,.025);
  const face=gradient(c,-.16,-.34,.35,.42,'#f1c9a1',f.skin);
  c.beginPath(); c.moveTo(-.15,-.26); c.bezierCurveTo(-.22,-.08,-.14,.08,.03,.07);
  c.quadraticCurveTo(.18,.06,.19,-.08); c.lineTo(.19+f.nose,-.115);
  c.quadraticCurveTo(.21,-.16,.17,-.19); c.quadraticCurveTo(.17,-.37,-.03,-.36);
  c.quadraticCurveTo(-.13,-.36,-.15,-.26); c.closePath();
  c.fillStyle=f.skin; c.fill(); c.strokeStyle=P.ink; c.lineWidth=.024; c.stroke();
  c.save(); c.clip(); c.globalAlpha=.22; c.fillStyle=face; c.fillRect(-.3,-.5,.7,.8); c.restore();
  ellipse(c,-.14,-.10,.065,.085,f.skin,P.ink,.016);
  if(detail) { line(c,[-.16,-.13,-.13,-.14,-.12,-.09], '#976e56',.015); ellipse(c,.12,-.04,.052,.027,'rgba(186,108,83,.22)'); }
  c.beginPath(); c.moveTo(-.18,-.12); c.bezierCurveTo(-.26,-.40,.13,-.48,.19,-.25);
  if(f.style===0) { c.quadraticCurveTo(.03,-.30,-.10,-.20); c.lineTo(-.12,-.07); }
  else if(f.style===1) {c.lineTo(.12,-.20); c.lineTo(.04,-.25); c.lineTo(-.03,-.17); c.lineTo(-.10,-.22); c.lineTo(-.12,-.05);}
  else if(f.style===2) { c.quadraticCurveTo(.01,-.34,-.12,-.22); c.lineTo(-.13,-.08); }
  else {c.quadraticCurveTo(.12,-.12,.04,-.18); c.lineTo(-.10,-.21); c.lineTo(-.12,-.04);}
  c.closePath(); c.fillStyle=f.hair;c.fill(); c.strokeStyle=P.ink;c.lineWidth=.018;c.stroke();
  if(f.style===4) ellipse(c,-.22,-.23,.09,.085,f.hair,P.ink,.018);
  if(detail) line(c,[-.15,-.30,-.07,-.34,.02,-.33], 'rgba(255,230,185,.25)',.019);
  if(f.beard) {
    c.beginPath();c.moveTo(-.08,-.04);c.quadraticCurveTo(.04,.045,.17,-.02);
    c.quadraticCurveTo(.14,.15,.015,.12);c.quadraticCurveTo(-.07,.08,-.08,-.04);c.fillStyle=f.hair;c.fill();
  }
  const blink=phaseAt(t+f.blinkOffset,4.7)>.968;
  if(pose==='sleep'||pose==='crisis'||blink) line(c,[.06,-.14,.12,-.12,.16,-.14],P.ink,.02);
  else {
    ellipse(c,.115,-.155,.021,.025,P.ink);
    if(detail) {line(c,[.068,-.204,.135,-.211],f.hair,.023); line(c,[.12,.015,.16,.005], '#835845',.015);}
  }
  if(f.glasses&&detail) { ellipse(c,.115,-.15,.069,.058,'rgba(211,224,209,.12)',P.inkSoft,.015); line(c,[-.10,-.17,.05,-.16],P.inkSoft,.018); }
  if(age==='elder'&&detail) {line(c,[.05,-.09,.10,-.075], '#8e6e58',.013);line(c,[-.015,-.21,.01,-.215], '#8e6e58',.012);}
  if(job==='digger') {
    c.beginPath(); c.ellipse(-.01,-.27,.235,.16,0,Math.PI,TAU); c.lineTo(.23,-.23);c.lineTo(-.24,-.23);c.closePath();
    c.fillStyle='#c5a468';c.fill();c.strokeStyle=P.ink;c.lineWidth=.028;c.stroke();
    line(c,[-.26,-.23,.25,-.23],P.woodLight,.065);
    line(c,[-.03,-.40,-.03,-.27],'#e0c58b',.035);
    box(c,.10,-.35,.12,.13,P.metalDark,.025);
    ellipse(c,.19,-.29,.041,.043,'#ffe1a1',P.ink,.014);
  }
  if(job==='cook') {
    box(c,-.20,-.37,.39,.15,'#e3d5b5',.07);
    ellipse(c,-.13,-.41,.10,.10,P.cream,P.ink,.018); ellipse(c,0,-.44,.12,.10,P.ivory,P.ink,.018);ellipse(c,.12,-.40,.09,.09,P.cream,P.ink,.018);
    box(c,-.19,-.34,.38,.08,'#c7b794',.018);
  }
  c.restore();
}

function torso(c,f,colors,job,dirty,detail,age) {
  c.beginPath(); c.moveTo(-.10,-.60);c.quadraticCurveTo(age==='elder'?-.29:-.24,-.58,age==='elder'?-.25:-.22,-.40);
  c.lineTo(-.19,.035);c.quadraticCurveTo(.02,.085,.20,.035);c.lineTo(.22,-.40);
  c.quadraticCurveTo(.21,-.57,.10,-.60);c.closePath();
  c.fillStyle=gradient(c,-.2,-.6,.42,.65,colors[1],colors[0]);c.fill();c.strokeStyle=P.ink;c.lineWidth=.035;c.stroke();
  poly(c,[-.10,-.60,-.02,-.45,.06,-.60],P.cream,null);
  line(c,[.02,-.44,.02,.01],colors[2],.022);
  box(c,-.22,-.04,.44,.075,'#695342',.015);
  box(c,.00,-.035,.085,.065,'#c1ab76',.008,P.ink,.015);
  if(job==='farmer'||job==='cook') {
    poly(c,[-.11,-.47,.13,-.47,.22,-.03,-.17,-.03],job==='cook'?'#d3c39e':'#b5ad82');
    line(c,[-.10,-.46,-.11,-.57,.12,-.57,.13,-.46],P.cream,.03);
    box(c,-.06,-.22,.19,.13,'#b2a47d',.015);
  }
  if(job==='hauler') {line(c,[-.14,-.55,.17,-.07], '#544d3f',.065); box(c,.10,-.08,.22,.25,'#ad8d58',.035);}
  if(job==='tech') { box(c,-.17,-.35,.18,.16,colors[2],.015);line(c,[-.13,-.43,-.13,-.31],P.cream,.026);line(c,[-.06,-.41,-.06,-.31],P.rust,.025); }
  if(job==='medic') {box(c,-.16,-.40,.19,.19,'#e4debf',.025);line(c,[-.066,-.37,-.066,-.24],P.red,.042);line(c,[-.12,-.305,-.015,-.305],P.red,.042);}
  if(job==='none') {poly(c,[-.14,-.58,.16,-.58,.11,-.46,-.07,-.48],f.scarf);poly(c,[-.07,-.50,.03,-.47,-.02,-.23,-.11,-.29],f.scarf);}
  if(job==='digger') {line(c,[-.14,-.48,-.10,-.07], '#716047',.055);line(c,[.14,-.48,.10,-.07], '#716047',.055);}
  // Dirt is a readable patch even at game scale, with extra small flecks at close zoom.
  if(dirty) {ellipse(c,-.11,-.12,.055,.026,'rgba(65,53,43,.32)');ellipse(c,.13,-.22,.034,.047,'rgba(65,53,43,.26)');}
  if(detail) {
    if(job!=='cook'&&job!=='farmer') box(c,.07,-.37,.115,.11,colors[0],.018,colors[2],.015);
    // A few broken stitches, rather than a noisy texture, reward the close view.
    for(let i=0;i<4;i++)line(c,[-.15+i*.08,.018,-.12+i*.08,.018],colors[1],.012);
    line(c,[-.17,-.13,-.11,-.16],colors[2],.015);
    if(dirty) for(let i=0;i<6;i++) ellipse(c,(hash(i,3)-.5)*.30,-.05-hash(i,6)*.4,.02+hash(i,2)*.025,.02,'rgba(65,53,43,.35)');
  }
}

function drawSleeper(c,f,colors,job,t,detail,age,opts) {
  const breath=Math.sin(t*2)*.009;
  ellipse(c,.02,-.015,.89,.06,'rgba(9,14,16,.22)');
  c.save();c.translate(-.60,-.25);c.rotate(-Math.PI/2+.10);
  c.translate(-.015,.72);head(c,f,'none','sleep',0,detail,age,t);c.restore();
  c.beginPath();c.moveTo(-.43,-.29);c.bezierCurveTo(-.18,-.48-breath,.45,-.40,.69,-.18);
  c.quadraticCurveTo(.91,-.12,.79,-.04);c.lineTo(-.44,-.04);c.closePath();
  c.fillStyle=gradient(c,0,-.4,0,.4,colors[1],colors[2]);c.fill();c.strokeStyle=P.ink;c.lineWidth=.035;c.stroke();
  line(c,[-.37,-.29,-.14,-.21,.06,-.17],colors[0],.03);
  ellipse(c,-.42,-.13,.12,.06,f.skin,P.ink,.02);
  if(opts.injured) {box(c,-.41,-.19,.10,.12,P.cream,.02);line(c,[-.39,-.18,-.34,-.08],'#aa987b',.016);}
  if(opts.dirty) for(let i=0;i<5;i++)ellipse(c,-.1+hash(i,4)*.62,-.13-hash(i,7)*.16,.03,.018,'rgba(72,54,40,.28)');
}

/** Pure drawing: x/y anchor the soles. t is visual seconds, cellPx is pixels/metre. */
export function drawColonist(c,x,y,cellPx,opts={}) {
  if(!c||![x,y,cellPx].every(Number.isFinite)||cellPx<=0) return;
  if(ANIMAL_KINDS.includes(opts.kind)){drawOutsideAnimal(c,x,y,cellPx,opts);return;}
  const outsider=['raider','stranger','strangerChild'].includes(opts.kind)?opts.kind:null;
  const pose=POSES.includes(opts.pose)?opts.pose:'idle',job=JOBS.includes(opts.job)?opts.job:'none';
  const age=outsider==='strangerChild'?'child':AGES.includes(opts.age)?opts.age:'adult',t=Number.isFinite(opts.t)?opts.t:0;
  const suited=pose==='suit'||opts.suit===true;
  const f=colonistFeatures(opts.seed??1,age,opts.sex),s=samplePose(pose,t,age),colors=suited?['#a5a483','#cebf91','#737e6d']:OUTFITS[job],detail=cellPx>=30;
  if (typeof opts.skin === 'string' && /^#[0-9a-f]{6}$/i.test(opts.skin)) f.skin = opts.skin;
  const handColor=suited?'#4f6663':f.skin;
  if(outsider==='stranger'||outsider==='strangerChild') {s.lean+=.17;s.head+=.16;s.hands=[[.05,-.40],[.15,-.34]];}
  if(outsider==='raider') {s.hands[1]=[.35,-.17];s.lean+=.045;}
  // Optional integration anchor, in unmirrored metres from the soles. It keeps a
  // hand on an actual crank handle instead of approximating different machines.
  const handTarget=opts.handTarget??(pose==='crank'?{x:(CRANK.x+Math.cos(t*CRANK.speed)*CRANK.radius)*s.scale,y:(CRANK.y+Math.sin(t*CRANK.speed)*CRANK.radius)*s.scale}:pose==='pedal'?{x:.66*s.scale,y:-1.32*s.scale}:null);
  if(handTarget&&Number.isFinite(handTarget.x)&&Number.isFinite(handTarget.y)) {
    const dx=handTarget.x/s.scale-s.hip[0],dy=handTarget.y/s.scale-s.hip[1];
    s.hands[1]=[(Math.cos(s.lean)*dx+Math.sin(s.lean)*dy)/f.width,-Math.sin(s.lean)*dx+Math.cos(s.lean)*dy];
    if(pose==='pedal')s.hands[0]=[(Math.cos(s.lean)*(dx-.15)+Math.sin(s.lean)*dy)/f.width,-Math.sin(s.lean)*(dx-.15)+Math.cos(s.lean)*dy];
  }
  c.save();c.translate(x,y);c.scale(cellPx*(opts.facing===-1?-1:1)*s.scale,cellPx*s.scale);c.lineCap='round';c.lineJoin='round';
  if(pose==='sleep') {drawSleeper(c,f,colors,job,t,detail,age,opts);c.restore();return;}
  ellipse(c,.04,0,pose==='dig'?.40:.32,.055,'rgba(8,13,16,.24)');
  // Legs are articulated separately, leaving the contact foot precisely on the ground.
  for(let i=0;i<2;i++) {
    const a=[s.hip[0]+(i===0?-.06:.06),s.hip[1]],b=[s.feet[i][0],s.feet[i][1]-.10];
    const relaxed=['idle','talk','crank'].includes(pose);
    const knee=relaxed?[(a[0]+b[0])*.5+.025,(a[1]+b[1])*.5]:joint(a,b,pose==='pedal'?.43:.35,pose==='pedal'?.43:.34,-1);
    limb(c,a,knee,b,i===0?(suited?'#717c69':'#3e484b'):colors[2],suited?.185:.16);boot(c,s.feet[i][0],s.feet[i][1],i===0);
    if(detail&&i===1) line(c,[knee[0]-.055,knee[1]-.02,knee[0]+.04,knee[1]-.025], '#a9a18a',.016);
  }
  c.save();c.translate(...s.hip);c.rotate(s.lean);c.scale(f.width,1);
  if(suited){box(c,-.34,-.52,.23,.52,'#697c70',.065);line(c,[-.32,-.39,-.36,-.12],'#b2b89a',.04);}
  if(pose!=='crisis')arm(c,s.hands[0],colors,handColor,true,pose);
  torso(c,f,colors,suited?'suit':job,opts.dirty,detail,age);
  if(outsider)drawOutsideClothes(c,f,outsider,t);
  if(suited){
    line(c,[-.03,-.54,-.03,.015],'#596d61',.038);
    box(c,.07,-.41,.14,.18,'#344e4f',.025);box(c,.09,-.385,.10,.06,'#b3c5a3',.012,null);
    line(c,[-.19,-.12,.19,-.12],'#d9c797',.045);
    c.beginPath();c.moveTo(.19,-.60);c.bezierCurveTo(.36,-.52,.31,-.27,.14,-.28);c.strokeStyle='#435a58';c.lineWidth=.055;c.stroke();
  }
  if(pose==='carry') {
    c.save();c.translate(-.46,-1.02);c.rotate(-.08);
    box(c,-.30,-.12,.65,.52,gradient(c,-.3,-.1,.6,.5,'#bd9962','#8b673e'),.035);
    for(let i=0;i<3;i++) line(c,[-.28,-.01+i*.14,.32,-.01+i*.14], '#6b5137',.022);
    line(c,[-.18,-.10,-.18,.36], '#d3b378',.07);line(c,[.22,-.10,.22,.36], '#d3b378',.07);
    box(c,-.02,.09,.17,.10,'#d9ca9f',.012,null);c.restore();
  }
  head(c,f,job,suited?'suit':pose,s.head,detail,age,t);
  if(outsider==='raider')drawOutsideMask(c,f,age);
  if(pose==='crisis')arm(c,s.hands[0],colors,handColor,true,pose);
  if(pose==='dig') {
    const h=s.hands[1],a=s.toolAngle,dx=Math.cos(a),dy=Math.sin(a);
    const top=[h[0]+dx*.65,h[1]+dy*.65],base=[h[0]-dx*.25,h[1]-dy*.25];
    line(c,[...base,...top],P.ink,.082);line(c,[...base,...top],P.woodLight,.047);
    c.save();c.translate(...top);c.rotate(a);
    c.beginPath();c.moveTo(.18,-.40);c.bezierCurveTo(-.13,-.25,-.13,.25,.18,.40);
    c.bezierCurveTo(.05,.19,.06,-.19,.18,-.40);c.closePath();
    c.fillStyle=gradient(c,-.1,-.4,.2,.8,P.metalLight,P.metal);c.fill();c.strokeStyle=P.ink;c.lineWidth=.027;c.stroke();
    line(c,[.14,-.34,-.04,-.15,-.04,.15,.14,.34],P.ivory,.022);
    box(c,-.055,-.075,.16,.15,P.metalDark,.028);ellipse(c,.025,0,.025,.025,P.cream);c.restore();
  }
  arm(c,s.hands[1],colors,suited?handColor:job==='hauler'?'#b8a178':f.skin,false,pose);
  if(opts.injured) { const h=s.hands[1]; line(c,[h[0]-.015,h[1]-.13,h[0]+.005,h[1]-.055],P.cream,.15);line(c,[h[0]-.05,h[1]-.10,h[0]+.045,h[1]-.08], '#a79679',.017); }
  if(pose==='eat') {
    ellipse(c,.25,-.11,.15,.045,P.cream,P.ink,.022);
    c.beginPath();c.arc(.25,-.105,.15,0,Math.PI);c.fillStyle=P.metal;c.fill();
    const h=s.hands[1];line(c,[h[0],h[1],h[0]+.12,h[1]-.035],P.cream,.025);ellipse(c,h[0]+.13,h[1]-.038,.035,.018,P.metalLight);
  }
  if(pose==='work') {const h=s.hands[1];line(c,[h[0],h[1],h[0]+.06,h[1]-.18],P.woodLight,.038);box(c,h[0]-.03,h[1]-.23,.20,.075,P.metalLight,.015);}
  c.restore();
  if(pose==='dig'&&s.impact){
    const hit=pickaxeGeometry(t,opts.seed??1,age),p=clamp(hit.impactAge);
    for(let i=0;i<3;i++){
      const px=hit.point[0]-.05-p*(.20+i*.11),py=hit.point[1]-.05-p*(.35-i*.12)+p*p*.45;
      poly(c,[px-.035,py,px,py-.045,px+.043,py+.01,px+.008,py+.032],i===0?'#c3b18b':'#8c8c79',P.ink,.012);
    }
    c.save();c.globalAlpha*=(1-p)*.28;
    for(let i=0;i<4;i++)ellipse(c,hit.point[0]-.06-p*(.12+i*.055),hit.point[1]+.07+i*.035+p*.08,.07+p*.10,.045+p*.07,'#c0ad84');
    c.restore();
  }
  c.restore();
}
