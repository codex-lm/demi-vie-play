import { P, TAU, clamp, hash } from './palette.js';
import { box, line, ellipse, poly, gradient, halo } from './primitives.js';

// All measurements here describe illustration, never inventory or room capacity.
// The wrapper in props.js owns the room clipping, lighting and water surface.
const QUILTS = [
  ['#d0a44f','#916b35'], // ochre wool
  ['#bd6e52','#894b3e'], // brick red
  ['#9caf7d','#667b53'], // sage
  ['#7e9fac','#506f88'], // blue
];
function quilt(seed,index=0) {
  return QUILTS[(Math.floor(hash(seed,17)*QUILTS.length)+index)%QUILTS.length];
}

function keepsake(c,x,y,seed) {
  // A framed portrait and a book are silhouettes, never simulated inventory.
  box(c,x,y,.36,.43,P.woodDark,.025,P.woodLight,.024);
  box(c,x+.045,y+.045,.27,.34,'#c7b58b',.009,null);
  ellipse(c,x+.18,y+.15,.06,.07,'#745242');
  poly(c,[x+.09,y+.35,x+.11,y+.24,x+.25,y+.24,x+.28,y+.35],quilt(seed)[0],null);
  line(c,[x+.05,y+.055,x+.13,y+.055],P.ivory,.018);
}

function timber(c, x, y, w, h, vertical = false, honey = false) {
  box(c, x, y, w, h, gradient(c,x,y,w,h,honey?'#c9a779':P.woodLight,honey?'#70513b':P.woodDark), .025);
  line(c, vertical ? [x+w*.4,y+.08,x+w*.45,y+h-.08] : [x+.08,y+h*.45,x+w-.08,y+h*.55], '#bd9463', .013);
}

function bolt(c,x,y) {
  ellipse(c,x,y,.026,.026,P.metalDark);
  line(c,[x-.012,y,x+.012,y],P.metalLight,.009);
}

function shelf(c,x,y,w,levels=3,gap=.72) {
  timber(c,x,y,.11,(levels-1)*gap+.28,true);
  timber(c,x+w-.11,y,.11,(levels-1)*gap+.28,true);
  for(let j=0;j<levels;j++) {
    const sy=y+.17+j*gap;
    timber(c,x-.035,sy,w+.07,.12);
    bolt(c,x+.055,sy+.065); bolt(c,x+w-.055,sy+.065);
  }
}

function jar(c,x,y,s=1,color=P.teal,seed=0) {
  c.save(); c.translate(x,y); c.scale(s,s);
  box(c,-.15,-.42,.3,.39,gradient(c,-.15,-.42,.3,0,'#b7c9b2',color),.06,P.ink,.024);
  box(c,-.145,-.45,.29,.07,P.woodLight,.015);
  box(c,-.105,-.29,.21,.13,'#d7c7a0',.012,null);
  line(c,[-.105,-.38,-.105,-.13],'rgba(246,233,197,.6)',.025);
  if(seed%2) line(c,[-.055,-.23,.055,-.23],color,.022);
  else ellipse(c,0,-.225,.035,.038,color);
  c.restore();
}

function cup(c,x,y,s=1,color=P.ivory) {
  c.save(); c.translate(x,y); c.scale(s,s);
  ellipse(c,.09,-.1,.065,.066,P.woodDark,color,.025);
  box(c,-.09,-.19,.18,.17,color,.03);
  ellipse(c,0,-.19,.085,.025,P.woodDark,color,.018);
  c.restore();
}

function bowl(c,x,y,s=1,color=P.teal) {
  c.save(); c.translate(x,y); c.scale(s,s);
  c.beginPath(); c.moveTo(-.19,-.12); c.bezierCurveTo(-.17,.11,.17,.11,.19,-.12);
  c.closePath(); c.fillStyle=color; c.fill(); c.strokeStyle=P.ink; c.lineWidth=.025; c.stroke();
  ellipse(c,0,-.12,.19,.055,'#a98247',P.ivory,.018);
  ellipse(c,-.04,-.125,.035,.018,'#768653'); ellipse(c,.065,-.11,.025,.02,'#c19b62');
  c.restore();
}

function steam(c,x,y,t,seed=0) {
  c.save();
  for(let k=0;k<3;k++) {
    const p=((t*.45+k/3+seed*.11)%1+1)%1;
    c.globalAlpha=(1-p)*.32;
    const sx=x+Math.sin(p*5+k)*.055;
    c.beginPath(); c.moveTo(sx,y-p*.65);
    c.bezierCurveTo(sx-.12,y-.14-p*.65,sx+.13,y-.24-p*.65,sx,y-.36-p*.65);
    c.strokeStyle=P.ivory; c.lineWidth=.025+p*.018; c.lineCap='round'; c.stroke();
  }
  c.restore();
}

function crate(c,x,y,w=.86,h=.65,seed=0,tilt=0) {
  c.save(); c.translate(x+w*.5,y); c.rotate(tilt);
  box(c,-w*.5,-h,w,h,gradient(c,-w*.5,-h,w,h,P.wood,P.woodDark),.025);
  for(let j=1;j<4;j++) line(c,[-w*.5+.035,-h*j/4,w*.5-.035,-h*j/4],P.woodDark,.025);
  timber(c,-w*.5+.065,-h+.03,.095,h-.06,true);
  timber(c,w*.5-.16,-h+.03,.095,h-.06,true);
  box(c,-.12,-h+.15,.24,.08,P.woodDark,.03,null);
  if(seed%2===0) {
    box(c,-.12,-h*.47,.24,.17,P.cream,.009,null);
    line(c,[-.065,-h*.47+.07,.065,-h*.47+.07],P.rust,.025);
  }
  c.restore();
}

function sack(c,x,y,s=1,color='#ae9b70',seed=0) {
  c.save(); c.translate(x,y); c.scale(s,s);
  c.beginPath(); c.moveTo(-.13,-.71); c.bezierCurveTo(-.42,-.49,-.43,-.06,-.21,-.02);
  c.bezierCurveTo(.12,.05,.39,-.015,.33,-.25); c.bezierCurveTo(.3,-.46,.16,-.59,.12,-.71);
  c.closePath(); c.fillStyle=gradient(c,-.4,-.7,.7,0,color,'#807354'); c.fill(); c.strokeStyle=P.ink; c.lineWidth=.03; c.stroke();
  poly(c,[-.13,-.7,-.2,-.83,.14,-.8,.12,-.7],color);
  line(c,[-.15,-.71,.14,-.71],P.woodDark,.045);
  line(c,[-.15,-.69,-.22,-.38,-.2,-.14],'#d2bf91',.02);
  line(c,[.1,-.64,.17,-.38,.12,-.2],'#857750',.02);
  ellipse(c,0,-.35,.09,.115,seed%2 ? P.woodDark : '#b99253');
  line(c,[-.055,-.36,0,-.3,.05,-.4],P.cream,.018);
  c.restore();
}

function stool(c,x,floor,s=1) {
  timber(c,x-.22*s,floor-.52*s,.08*s,.5*s,true);
  timber(c,x+.14*s,floor-.52*s,.08*s,.5*s,true);
  line(c,[x-.17*s,floor-.19*s,x+.18*s,floor-.19*s],P.woodDark,.06*s);
  box(c,x-.32*s,floor-.58*s,.64*s,.11*s,P.woodLight,.035);
}

function board(c,x,y,w,h,color=P.teal) {
  box(c,x,y,w,h,P.woodDark,.025);
  box(c,x+.055,y+.055,w-.11,h-.11,color,.015,P.woodLight,.02);
  line(c,[x+.15,y+.2,x+w-.14,y+.2],'#c8bfa1',.018);
  line(c,[x+.15,y+.32,x+w-.25,y+.32],'#b0b899',.015);
}

function hook(c,x,y,color=P.woodDark) {
  c.beginPath(); c.moveTo(x,y); c.lineTo(x,y+.13); c.quadraticCurveTo(x,y+.24,x+.12,y+.16);
  c.strokeStyle=color; c.lineWidth=.035; c.stroke();
}

function bunk(c,x,floor,w,top,seed,damage,tiers=3) {
  const tier=(floor-top-.16)/tiers;
  // Back posts and modest bed rail keep each quilt's silhouette clear at zoom one.
  timber(c,x+.03,top,.12,floor-top,true,true); timber(c,x+w-.15,top,.12,floor-top,true,true);
  for(let k=0;k<tiers;k++) {
    const by=floor-.18-k*tier;
    const col=quilt(seed,k);
    box(c,x+.16,by-.24,w-.32,.2,'#d0c6a8',.065);
    box(c,x+.23,by-.32,.43,.14,P.ivory,.065,P.inkSoft,.018);
    c.beginPath(); c.moveTo(x+.69,by-.26);
    c.bezierCurveTo(x+.96,by-.32,x+w-.5,by-.29,x+w-.2,by-.23);
    c.lineTo(x+w-.2,by-.01); c.lineTo(x+.69,by-.02); c.closePath();
    c.fillStyle=gradient(c,x,by-.3,0,.3,...col); c.fill(); c.strokeStyle=P.ink; c.lineWidth=.025; c.stroke();
    line(c,[x+.78,by-.25,x+.77,by-.025],'#d5c7a0',.045);
    line(c,[x+w-.45,by-.25,x+w-.46,by-.035],'rgba(236,220,177,.3)',.022);
    for(let j=0;j<3;j++) line(c,[x+.9+j*.24,by-.19,x+1+j*.24,by-.1],'rgba(225,221,191,.22)',.013);
    timber(c,x,by,w,.09,false,true);
    if(k>0) {
      line(c,[x+.16,by-.38,x+.16,by-.56,x+w-.16,by-.56,x+w-.16,by-.38],P.woodDark,.055);
      line(c,[x+.18,by-.55,x+w-.18,by-.55],P.woodLight,.025);
    }
    bolt(c,x+.085,by+.045); bolt(c,x+w-.085,by+.045);
    if(tier>.85) {
      keepsake(c,x+.22,by-.84,seed+k);
      timber(c,x+.18,by-.39,.48,.055,false,true);
      if(k%2===0)cup(c,x+.46,by-.41,.62,col[0]);
      else {
        box(c,x+.25,by-.5,.32,.09,col[0],.012);
        line(c,[x+.27,by-.46,x+.53,by-.46],P.cream,.022);
      }
    }
  }
  const lx=x+w-.48;
  line(c,[lx,top+.14,lx,floor-.02,lx+.3,floor-.02,lx+.3,top+.14],P.woodDark,.075);
  for(let y=floor-.3;y>top+.18;y-=.35) line(c,[lx,y,lx+.3,y],P.woodLight,.06);
  if(damage>.58) line(c,[x+.09,top+.11,x+.16,top+.43,x+.07,top+.62,x+.16,top+.85],P.ink,.035);
}

/** Shared illustration geometry, including compact bunks for the original twelve beds. */
export function dormLayout(w,h,bedCount=0) {
  const floor=h-.12,normalCount=Math.max(1,Math.floor((w-.55)/2.65));
  const requested=Math.max(0,Math.floor(Number(bedCount)||0)),compact=requested>normalCount*3;
  const tiers=compact?Math.max(3,Math.min(4,Math.floor((h-.7)/.72))):3;
  const count=Math.max(normalCount,Math.ceil(requested/tiers));
  const bw=Math.min(2.32,(w-.65)/count-.22),gap=(w-count*bw)/(count+1);
  const top=Math.max(.55,floor-3.1),scale=compact?Math.min(1,bw/2.32):1;
  const bunks=[],beds=[];
  for(let i=0;i<count;i++) {
    const x=gap+i*(bw+gap);bunks.push({x,width:bw,scale,tiers});
    for(let k=0;k<tiers;k++)beds.push({x:x+bw/2,y:floor-.18*scale-k*(floor-top-.16*scale)/tiers,scale,width:bw});
  }
  return {floor,top,bunks,beds};
}

function dorm(c,w,h,o) {
  c.save();
  const {floor,top,bunks}=dormLayout(w,h,o.bedCount);
  for(let i=0;i<bunks.length;i++) {
    const b=bunks[i];c.save();c.translate(b.x,floor);c.scale(b.scale,b.scale);
    bunk(c,0,0,b.width/b.scale,(top-floor)/b.scale,(o.seed||0)+i*13,o.damage||0,b.tiers);c.restore();
  }
  // A washing line and folded belongings make this a lived-in shared room.
  if(h>3.6) {
    line(c,[.35,top-.22,w*.5,top-.12,w-.35,top-.22],P.woodDark,.025);
    const x=w*.48;
    poly(c,[x-.22,top-.18,x-.4,top+.02,x-.23,top+.11,x-.15,top+.02,x-.14,top+.37,x+.23,top+.37,x+.2,top+.02,x+.3,top+.1,x+.43,top-.02,x+.2,top-.18],quilt(o.seed||0,2)[0],P.inkSoft,.02);
    line(c,[x-.12,top-.18,x-.12,top-.24,x+.15,top-.24,x+.15,top-.18],P.cream,.022);
  }
  box(c,.18,floor-.33,.35,.26,P.woodDark,.03);
  box(c,.22,floor-.39,.29,.1,P.rust,.025);
  c.restore();
}

function canteen(c,w,h,o) {
  c.save(); const floor=h-.13;
  const count=Math.max(1,Math.floor((w-.6)/3.4));
  const tw=Math.min(2.85,(w-.6)/count-.3), gap=(w-count*tw)/(count+1);
  for(let i=0;i<count;i++) {
    const x=gap+i*(tw+gap), ty=floor-1.04;
    // The bench sits behind the trestle; bowls and mugs break the long flat line.
    timber(c,x+.1,floor-.48,tw-.2,.13);
    timber(c,x+.28,floor-.4,.09,.38,true); timber(c,x+tw-.37,floor-.4,.09,.38,true);
    poly(c,[x+.3,ty+.08,x+.65,ty+.08,x+.9,floor,x+.71,floor],P.woodDark);
    poly(c,[x+tw-.65,ty+.08,x+tw-.3,ty+.08,x+tw-.7,floor,x+tw-.9,floor],P.woodDark);
    line(c,[x+.65,floor-.22,x+tw-.65,floor-.22],P.wood,.09);
    timber(c,x,ty,tw,.16);
    const cloth=quilt(o.seed||0,i);
    box(c,x+tw*.35,ty-.045,tw*.3,.12,cloth[0],.015,P.inkSoft,.012);
    line(c,[x+tw*.38,ty-.018,x+tw*.62,ty-.018],P.cream,.018);
    box(c,x+tw*.43,ty-.025,.32,.045,P.cream,.01,null);
    for(let j=0;j<3;j++) { bowl(c,x+.47+j*(tw-.94)/2,ty-.08,.78,quilt(o.seed||0,i+j)[0]); cup(c,x+.71+j*(tw-.94)/2,ty-.025,.68,j%2?P.ivory:cloth[0]); }
    ellipse(c,x+tw*.55,ty-.15,.19,.09,'#c29c66',P.ink,.02);
    line(c,[x+tw*.45,ty-.18,x+tw*.52,ty-.12,x+tw*.59,ty-.18],P.cream,.02);
  }
  board(c,.48,Math.max(.45,h-3.25),1.05,.76,'#50655d');
  const cy=Math.max(.75,h-2.95); ellipse(c,w-.7,cy,.28,.28,P.woodDark,P.woodLight,.045);
  ellipse(c,w-.7,cy,.225,.225,P.cream); line(c,[w-.7,cy-.14,w-.7,cy,w-.59,cy+.065],P.ink,.025);
  // Tiny pitcher on a bracket, with a planted cutting beside it.
  if(w>8) { timber(c,w/2-.7,h-2.7,1.4,.1); jar(c,w/2-.35,h-2.71,.7); leafSprig(c,w/2+.28,h-2.8,.55,0,false); }
  if(h>3.6) {keepsake(c,w*.34,.65,o.seed||0);keepsake(c,w*.34+.44,.71,(o.seed||0)+1);}
  c.restore();
}

function stove(c,x,floor,w,o,seed,layer='all') {
  const top=floor-1.18;
  const px=x+w*.5,py=top-.14;
  if(layer==='motion') {
    if(o.powered)steam(c,px,py-.53,o.t||0,seed);
    return;
  }
  box(c,x,top,w,1.12,gradient(c,x,top,w,0,P.metal,P.metalDark),.07);
  box(c,x-.07,top-.1,w+.14,.13,P.metalLight,.035);
  box(c,x+.13,top+.35,w-.26,.56,P.inkSoft,.055);
  box(c,x+.2,top+.42,w-.4,.35,o.powered?'#ae7545':'#333b3a',.025,P.metalDark);
  for(let j=0;j<3;j++) ellipse(c,x+.24+j*(w-.48)/2,top+.19,.055,.055,P.cream,P.ink,.02);
  line(c,[x+.26,top+.44,x+w-.26,top+.44],P.metalLight,.055);
  box(c,x+.13,floor-.11,.13,.11,P.ink,.015); box(c,x+w-.26,floor-.11,.13,.11,P.ink,.015);
  // A round enamel stockpot and its two small handles.
  ellipse(c,px,py,.31,.07,P.ink);
  box(c,px-.3,py-.43,.6,.43,gradient(c,px-.3,py-.4,.6,0,'#b8c6b2','#5e7c79'),.07);
  line(c,[px-.29,py-.3,px-.4,py-.3,px-.4,py-.18,px-.3,py-.18],P.metalDark,.04);
  line(c,[px+.3,py-.3,px+.4,py-.3,px+.4,py-.18,px+.3,py-.18],P.metalDark,.04);
  ellipse(c,px,py-.43,.31,.065,P.metalLight,P.ink,.022);
  ellipse(c,px,py-.5,.075,.04,P.woodDark);
  if(layer==='all'&&o.powered)steam(c,px,py-.53,o.t||0,seed);
}

// Back and front are time-independent; steam stays between pot and hood.
// Modules do not overlap horizontally, so grouping their three layers retains
// the direct drawer's occlusion order without baking any animated steam.
export function drawKitchenLayer(c,w,h,o={},layer='all') {
  c.save(); const floor=h-.12, count=Math.max(1,Math.floor((w-.7)/3.5));
  const unit=(w-.6)/count;
  for(let i=0;i<count;i++) {
    const x=.3+i*unit;
    if(layer!=='front')stove(c,x,floor,1.36,o,i,layer);
    if(layer==='back'||layer==='motion')continue;
    const cw=Math.max(.65,unit-1.67), cx=x+1.52, top=floor-1.16;
    box(c,cx,top,cw,1.12,P.wood,.035);
    box(c,cx-.04,top-.09,cw+.08,.13,P.woodLight,.025);
    line(c,[cx+cw*.5,top+.05,cx+cw*.5,floor-.08],P.woodDark,.03);
    ellipse(c,cx+cw*.4,top+.22,.035,.035,P.metalDark); ellipse(c,cx+cw*.6,top+.22,.035,.035,P.metalDark);
    const cloth=quilt(o.seed||0,i+2);
    box(c,cx+cw*.63,top+.1,Math.min(.34,cw*.24),.57,cloth[0],.025,P.inkSoft,.018);
    line(c,[cx+cw*.66,top+.55,cx+cw*.82,top+.55],P.cream,.027);
    box(c,cx+.14,top-.13,Math.max(.35,cw-.28),.045,P.cream,.02);
    for(let j=0;j<3;j++) ellipse(c,cx+.29+j*.15,top-.17,.07,.04,j===1?P.green:P.rust);
    line(c,[cx+.2,top-.38,cx+.5,top-.2],P.metalLight,.045);
    line(c,[cx+.12,top-.43,cx+.23,top-.36],P.woodDark,.065);
    // Hood and flue: a recognisable kitchen profile without any lettering.
    const hy=Math.max(.6,floor-2.65);
    box(c,x+.58,.02,.3,hy,P.metalDark,.025);
    poly(c,[x+.42,hy,x+1.05,hy,x+1.5,hy+.38,x-.1,hy+.38],gradient(c,x,hy,1,.5,P.metalLight,P.metalDark));
    line(c,[x-.05,hy+.4,x+1.45,hy+.4],P.metalLight,.065);
    const railY=Math.max(.45,top-1.03);
    line(c,[cx+.05,railY,cx+cw-.05,railY],P.woodDark,.05);
    for(let j=0;j<3;j++) {
      const ux=cx+.22+j*(cw-.44)/2;
      hook(c,ux,railY); line(c,[ux+.055,railY+.19,ux+.055,railY+.48],P.metalLight,.035);
      ellipse(c,ux+.055,railY+.55,.075,.11,j%2?P.woodLight:P.metalLight,P.ink,.02);
    }
    if(railY>.9) {
      timber(c,cx+.02,railY-.23,cw-.04,.09);
      for(let j=0;j<3;j++)jar(c,cx+.2+j*Math.max(.14,(cw-.4)/2),railY-.24,.64,quilt(o.seed||0,i+j)[0],j);
    }
  }
  c.restore();
}

function kitchen(c,w,h,o) {drawKitchenLayer(c,w,h,o);}

function pantry(c,w,h,o) {
  c.save(); const floor=h-.13, count=Math.max(1,Math.floor((w-.6)/2.3));
  const fill=o.reserveArt?.foodFill;
  // This stable order leaves conspicuous gaps across all shelves as food goes.
  const order=[0,7,3,10,5,1,9,4,11,6,2,8];
  const sw=Math.min(2.05,(w-.5)/count-.16), gap=(w-count*sw)/(count+1);
  for(let i=0;i<count;i++) {
    const x=gap+i*(sw+gap), top=floor-2.45;
    shelf(c,x,top,sw,4,.69);
    for(let j=0;j<3;j++) for(let k=0;k<4;k++) {
      const bx=x+.29+k*(sw-.58)/3,by=top+.16+j*.69;
      if(fill!==undefined&&order[j*4+k]>=Math.ceil(fill*12)) {
        // Dust where jars used to stand, with no phantom full containers.
        line(c,[bx-.12,by-.025,bx+.12,by-.025],'rgba(217,198,156,.3)',.022);
        continue;
      }
      if(fill===undefined&&j===0&&k===3) { cup(c,bx,by,.9,P.rust); continue; }
      jar(c,bx,by,.82+hash(i*12+j*4+k,9)*.2,[P.teal,'#a18e5b',P.rust,'#9aab8b'][(j+k+i)%4],k);
    }
    if(fill===undefined||fill>.42)sack(c,x+.4,floor,.65,P.cream,i);
    if(fill===undefined||fill>.75)sack(c,x+sw-.38,floor,.7,'#b1a47b',i+1);
    if(fill===0) {
      line(c,[x+.12,top+.3,x+.46,top+.3,x+.12,top+.62,x+.12,top+.3],'rgba(220,211,183,.35)',.014);
      line(c,[x+.12,top+.3,x+.31,top+.49],'rgba(220,211,183,.3)',.012);
      for(let d=0;d<7;d++)ellipse(c,x+.15+hash(i,d)*(sw-.3),floor-.03,.025,.012,'#97866b');
    }
  }
  if(w>5&&(fill===undefined||fill>.65)) {
    const x=w*.5;
    line(c,[x,.2,x,.7],P.woodDark,.023);
    for(let k=0;k<5;k++) { ellipse(c,x+(k%2-.5)*.13,.65+k*.115,.085,.1,'#c4a06a',P.woodDark,.015); }
  }
  if(o.damage>.6&&(fill===undefined||fill>0)) jar(c,w-.35,floor,1,P.rust,1);
  c.restore();
}

// Illustration-only stacks. Fractions are sampled by the renderer, not here.
export function drawStoredMaterials(c,x,floor,width,reserveArt) {
  if(!reserveArt)return;
  const span=width/3,types=['stone','wood','metal'];
  for(let p=0;p<types.length;p++) {
    const type=types[p],count=Math.ceil((reserveArt[`${type}Fill`]??0)*12);
    const left=x+p*span,unit=Math.min(.4,(span-.13)/3);
    for(let j=0;j<count;j++) {
      const row=Math.floor(j/3),col=j%3,xx=left+.08+col*unit,yy=floor-row*.22;
      if(type==='stone') {
        poly(c,[xx,yy,xx-.02,yy-.13,xx+unit*.31,yy-.24,xx+unit*.76,yy-.21,xx+unit,yy-.08,xx+unit*.9,yy], '#8e9488',P.ink,.018);
        line(c,[xx+unit*.18,yy-.14,xx+unit*.37,yy-.19,xx+unit*.7,yy-.16],'#bdbeaa',.025);
      } else if(type==='wood') {
        box(c,xx,yy-.2,unit*.9,.2,gradient(c,xx,yy-.2,0,.2,P.woodLight,P.woodDark),.035);
        ellipse(c,xx+unit*.74,yy-.1,unit*.13,.07,P.cream,P.woodDark,.018);
      } else {
        box(c,xx,yy-.17,unit*.93,.17,gradient(c,xx,yy-.17,0,.17,'#bcc6b8',P.metal),.012);
        line(c,[xx+.03,yy-.14,xx+unit*.82,yy-.14],'#e0dec6',.018);
      }
    }
  }
}

function storage(c,w,h,o) {
  c.save(); const floor=h-.12, count=Math.max(1,Math.floor((w-.5)/2.7));
  if(o.reserveArt) {
    for(let i=0;i<3;i++) {
      const x=.2+i*(w-.4)/3;
      timber(c,x,floor-.02,(w-.4)/3-.08,.08);
    }
    drawStoredMaterials(c,.2,floor-.04,w-.4,o.reserveArt);
    // The empty pallet stays visibly empty when the room owns no materials.
    c.restore();return;
  }
  const unit=(w-.4)/count;
  for(let i=0;i<count;i++) {
    const x=.2+i*unit;
    timber(c,x,floor-.08,unit-.16,.08);
    crate(c,x+.06,floor-.1,1.02,.78,i);
    crate(c,x+.13,floor-.9,.88,.66,i+1,o.damage>.62&&i===count-1?-.17:0);
    if(unit>2) {
      sack(c,x+1.58,floor-.1,.95,'#ac9b70',i);
      crate(c,x+1.22,floor-1.0,.82,.62,i+3);
      if(h>3) sack(c,x+1.62,floor-1.65,.65,'#b8aa82',i+2);
    }
    const sy=Math.max(.6,floor-2.9);
    timber(c,x+.1,sy,unit-.3,.11);
    for(let j=0;j<3;j++) {
      box(c,x+.22+j*.42,sy-.38,.33,.37,[P.teal,P.red,P.blue][j],.025);
      box(c,x+.25+j*.42,sy-.41,.27,.06,P.metalLight,.012);
      line(c,[x+.29+j*.42,sy-.27,x+.43+j*.42,sy-.27],P.cream,.04);
    }
    // A coil of rope caught on a wall peg; fine concentric strokes at high zoom.
    const rx=x+unit-.52,ry=sy+.42;
    for(let j=0;j<4;j++) ellipse(c,rx,ry,.25-j*.04,.31-j*.045,'rgba(0,0,0,0)',P.woodLight,.023);
    line(c,[rx,ry-.37,rx,ry-.22],P.metalDark,.06);
  }
  c.restore();
}

function hospitalBed(c,x,floor,w,seed) {
  const by=floor-.61;
  line(c,[x+.08,floor-.08,x+.08,by-.59,x+.27,by-.59],P.metalLight,.07);
  line(c,[x+w-.08,floor-.08,x+w-.08,by-.34],P.metalLight,.065);
  line(c,[x+.1,by+.13,x+w-.1,by+.13],P.metalDark,.11);
  box(c,x+.13,by-.19,w-.26,.24,P.ivory,.07);
  box(c,x+.18,by-.31,.44,.16,'#efe8d1',.07);
  box(c,x+.74,by-.2,w-.9,.25,gradient(c,x,by-.2,0,.3,...quilt(seed)),.05);
  line(c,[x+.8,by-.18,x+.8,by+.03],P.cream,.055);
  ellipse(c,x+.08,floor-.04,.08,.08,P.ink,P.metalLight,.018);
  ellipse(c,x+w-.08,floor-.04,.08,.08,P.ink,P.metalLight,.018);
}

function infirmary(c,w,h,o) {
  c.save(); const floor=h-.13, count=Math.max(1,Math.floor((w-.9)/2.9));
  const bw=Math.min(2.3,(w-.9)/count-.2), gap=(w-count*bw)/(count+1);
  for(let i=0;i<count;i++) {
    const x=gap+i*(bw+gap);
    hospitalBed(c,x,floor,bw,(o.seed||0)+i*13);
    const pole=x+bw-.26;
    line(c,[pole,floor-.1,pole,Math.max(.65,floor-2.5),pole-.33,Math.max(.65,floor-2.5)],P.metalLight,.045);
    line(c,[pole-.2,floor-.1,pole+.17,floor-.1],P.metalDark,.06);
    box(c,pole-.4,Math.max(.76,floor-2.38),.22,.38,'#afc9ba',.04,P.metalLight,.025);
    line(c,[pole-.29,Math.max(1.14,floor-2),pole-.29,floor-1.1,pole-.57,floor-.86],P.teal,.018);
    // A folded fabric privacy curtain occupies only the left edge of each bay.
    const cy=Math.max(.4,floor-2.8);
    line(c,[x-.16,cy,x+bw+.12,cy],P.metalDark,.04);
    for(let j=0;j<4;j++) {
      box(c,x-.15+j*.09,cy+.1,.14,1.55,gradient(c,x-.15+j*.09,cy,.14,0,'#c4c7ae','#82998c'),.025,P.inkSoft,.012);
      ellipse(c,x-.08+j*.09,cy+.065,.035,.045,'rgba(0,0,0,0)',P.metalLight,.015);
    }
    if(bw>1.8) {
      timber(c,x+.53,cy+.78,.72,.08);
      keepsake(c,x+.61,cy+.34,(o.seed||0)+i);
      cup(c,x+1.11,cy+.76,.7,quilt(o.seed||0,i)[0]);
    }
  }
  const cabinetX=Math.max(.2,w-.95), cabinetY=Math.max(.35,h-3.45);
  box(c,cabinetX,cabinetY,.64,.88,'#bdc5b1',.05);
  line(c,[cabinetX+.32,cabinetY+.08,cabinetX+.32,cabinetY+.8],P.teal,.025);
  box(c,cabinetX+.25,cabinetY+.23,.13,.4,P.red,.01,null);
  box(c,cabinetX+.12,cabinetY+.36,.39,.13,P.red,.01,null);
  if(o.powered) ellipse(c,cabinetX+.54,cabinetY+.72,.025,.025,'#b6d3a3');
  c.restore();
}

function mushroomCap(c,x,y,s,color) {
  line(c,[x,y,x+.01,y+.24*s],P.cream,.06*s);
  c.beginPath(); c.moveTo(x-.23*s,y+.035*s);
  c.bezierCurveTo(x-.2*s,y-.26*s,x+.18*s,y-.29*s,x+.24*s,y+.035*s);
  c.bezierCurveTo(x+.12*s,y+.11*s,x-.12*s,y+.11*s,x-.23*s,y+.035*s);
  c.closePath(); c.fillStyle=gradient(c,x,y-.25*s,0,.32*s,color,'#8a735e'); c.fill(); c.strokeStyle=P.ink; c.lineWidth=.02; c.stroke();
  line(c,[x-.15*s,y+.03*s,x+.16*s,y+.03*s],P.cream,.016);
  ellipse(c,x-.07*s,y-.1*s,.05*s,.025*s,'rgba(243,220,180,.45)');
}

function mushroom(c,w,h,o) {
  c.save(); const floor=h-.13, count=Math.max(1,Math.floor((w-.5)/2.5));
  const sw=Math.min(2.2,(w-.55)/count-.12), gap=(w-count*sw)/(count+1);
  for(let i=0;i<count;i++) {
    const x=gap+i*(sw+gap), top=Math.max(.7,floor-2.6), step=(floor-top-.2)/3;
    shelf(c,x,top,sw,4,step);
    for(let k=0;k<3;k++) {
      const by=top+.15+(k+1)*step;
      box(c,x+.12,by-.14,sw-.24,.13,P.woodDark,.02);
      ellipse(c,x+sw*.5,by-.13,(sw-.32)*.5,.045,'#564d3c');
      for(let j=0;j<6;j++) {
        const mx=x+.3+j*(sw-.6)/5;
        mushroomCap(c,mx,by-.27-(j%2)*.05,.65+hash(i*31+k*7+j,2)*.35,['#d8b383','#bf9977','#b9a68b'][(j+k)%3]);
      }
    }
  }
  const bx=w-.46; box(c,bx-.22,floor-.4,.44,.38,P.metal,.04);
  ellipse(c,bx,floor-.4,.22,.06,P.woodDark,P.metalLight,.025);
  line(c,[bx-.2,floor-.4,bx-.17,floor-.65,bx+.16,floor-.65,bx+.2,floor-.4],P.metalLight,.025);
  // The hose and hygrometer stay still: cultivation here does not need electricity.
  line(c,[.16,.2,.16,h-.3,.36,h-.14,.64,h-.2],P.teal,.05);
  ellipse(c,w-.4,.62,.15,.15,P.cream,P.metalDark,.035);
  line(c,[w-.4,.62,w-.33,.55],P.ink,.022);
  c.restore();
}

function leafSprig(c,x,y,s,t,animated=true) {
  c.save(); c.translate(x,y);
  const bend=animated?Math.sin(t*1.3+x*2)*.025:0;
  c.rotate(bend); c.scale(s,s);
  line(c,[0,0,-.01,-.65],P.green,.025);
  const colors=['#6a8965','#95a975','#b2b582','#789665'];
  for(let j=0;j<4;j++) {
    const sign=j%2?1:-1, yy=-.15-j*.13;
    c.beginPath(); c.moveTo(0,yy);
    c.bezierCurveTo(sign*.35,yy-.02,sign*.4,yy-.25,sign*.32,yy-.34);
    c.bezierCurveTo(sign*.08,yy-.32,sign*.02,yy-.17,0,yy);
    c.fillStyle=colors[j]; c.fill(); c.strokeStyle='#435f4f'; c.lineWidth=.016; c.stroke();
    line(c,[sign*.015,yy-.02,sign*.22,yy-.22],'#bac18b',.012);
  }
  c.restore();
}

function hydroponics(c,w,h,o) {
  c.save(); const floor=h-.12, count=Math.max(1,Math.floor((w-.55)/2.7));
  const sw=Math.min(2.4,(w-.5)/count-.16), gap=(w-count*sw)/(count+1);
  for(let i=0;i<count;i++) {
    const x=gap+i*(sw+gap), growY=floor-.92, top=Math.max(.5,floor-2.65);
    line(c,[x+.05,floor-.06,x+.05,top,x+sw-.05,top,x+sw-.05,floor-.06],P.metalDark,.09);
    line(c,[x+.06,floor-.08,x+.06,top+.02],P.metalLight,.035);
    // Root chamber and four separate leafy crowns, visibly biological at every zoom.
    box(c,x+.12,growY,sw-.24,.42,gradient(c,x,growY,0,.45,'#a0b3a6','#536f70'),.08);
    box(c,x+.21,growY+.15,sw-.42,.11,'#4c7779',.025,P.metalDark,.02);
    for(let j=0;j<4;j++) {
      const px=x+.39+j*(sw-.78)/3;
      ellipse(c,px,growY,.17,.05,P.metalDark);
      leafSprig(c,px,growY-.025,.82+hash(i*4+j,4)*.15,o.t||0,Boolean(o.powered));
      line(c,[px,growY+.18,px-.04,growY+.24,px+.04,growY+.29],'#b6b991',.012);
    }
    line(c,[x+.17,top+.02,x+.17,top+.22,x+sw-.17,top+.22,x+sw-.17,top+.02],P.metalLight,.03);
    box(c,x+.15,top+.24,sw-.3,.11,P.metalDark,.035);
    box(c,x+.22,top+.31,sw-.44,.045,o.powered?'#e5dcac':'#7d8c83',.018,null);
    if(o.powered) {
      c.save(); c.globalAlpha=.08;
      poly(c,[x+.22,top+.37,x+sw-.22,top+.37,x+sw-.05,growY,x+.05,growY],'#e9d6a0',null);
      c.restore();
    }
    line(c,[x+sw-.07,growY+.28,x+sw-.07,floor-.2,x+.2,floor-.2],P.teal,.07);
    box(c,x+.22,floor-.44,.54,.33,P.metalDark,.05);
    ellipse(c,x+.48,floor-.3,.105,.105,P.metalLight,P.ink,.02);
    const a=o.powered?(o.t||0)*3:0;
    line(c,[x+.48-Math.cos(a)*.065,floor-.3-Math.sin(a)*.065,x+.48+Math.cos(a)*.065,floor-.3+Math.sin(a)*.065],P.metalDark,.035);
    if(o.powered) ellipse(c,x+.66,floor-.35,.027,.027,'#bbd393');
  }
  c.restore();
}

export const DOMESTIC = Object.freeze({ dorm, canteen, kitchen, pantry, storage, infirmary, mushroom, hydroponics });
