import { box, ellipse, line, poly, gradient, halo } from '../primitives.js';
import { P, finite, hash, seedOf, frame, clamp, identityOf } from './common.js';
import { drawColonistAction } from './actions.js';
import { colonistFeatures, samplePose } from '../colonist.js';

const RISK = Object.freeze({green:{fill:'#98b483',rgb:'152,180,131',bars:1},yellow:{fill:'#e0b967',rgb:'224,185,103',bars:2},red:{fill:'#d78368',rgb:'215,131,104',bars:3}});
const ACCESSIBLE_RISK = Object.freeze({green:{fill:'#77857d',rgb:'119,133,125',bars:1},yellow:{fill:'#c4ba74',rgb:'196,186,116',bars:2},red:{fill:'#fee838',rgb:'254,232,56',bars:3}});

// A low-confidence survey is an uncertain area, not an exact rectangle with
// decoration around it. The same seeded edge resolves toward the true extents.
function surveyBoundary(x,y,w,h,uncertainty,seed) {
  const points=[],spread=uncertainty*58;
  for(let side=0;side<4;side++)for(let i=0;i<9;i++){
    const f=i/9,jitter=(hash(seed,side*13+i+720)-.5)*uncertainty*39;
    if(side===0)points.push(x-spread+f*(w+2*spread),y-spread+jitter);
    if(side===1)points.push(x+w+spread+jitter,y-spread+f*(h+2*spread));
    if(side===2)points.push(x+w+spread-f*(w+2*spread),y+h+spread+jitter);
    if(side===3)points.push(x-spread+jitter,y+h+spread-f*(h+2*spread));
  }
  return points;
}

// The listening action mirrors its identity head about the collar. Track its
// visible ear, including width/age, so the exposed stone actually meets it.
function contactOf(identity,t) {
  const features=colonistFeatures(identity.seed,identity.age),pose=samplePose('idle',t,identity.age);
  const age=pose.scale,headAngle=identity.age==='elder'?.055:0;
  const hx=identity.age==='elder'?.055:.015,hy=identity.age==='elder'?-.69:-.72;
  const ex=-.14*(identity.age==='child'?1.08:1),ey=-.10*(identity.age==='child'?1.06:1);
  const headX=hx+Math.cos(headAngle)*ex-Math.sin(headAngle)*ey;
  const headY=hy+Math.sin(headAngle)*ex+Math.cos(headAngle)*ey;
  const bodyX=pose.hip[0]+Math.cos(pose.lean)*features.width*headX-Math.sin(pose.lean)*headY;
  const bodyY=pose.hip[1]+Math.sin(pose.lean)*features.width*headX+Math.cos(pose.lean)*headY;
  const ax=-(bodyX-.02),ay=bodyY+1.31;
  const earX=190+100*age*(.07+Math.cos(.18)*ax-Math.sin(.18)*ay);
  const earY=329+100*age*(-1.31+Math.sin(.18)*ax+Math.cos(.18)*ay);
  return {earX,earY,edge:earX+6.1*age,palmX:190+50*age,palmY:329-110*age,skin:identity.skin??features.skin};
}

/** Illustration of a proposed room, not a structural calculation.
 * risk is the simulation's green/yellow/red result; precision controls only its
 * blurred uncertainty envelope. Only a precise reading has an exact outline;
 * the separate 1/2/3 risk marks remain legible at every confidence level.
 * All clocks are caller supplied; identity is preserved and never modified. */
export function drawGeologistSurvey(c,x,y,w,h,options={}) {
  const opts=options??{},seed=seedOf(opts.seed??12),t=finite(opts.t),precision=clamp(finite(opts.precision,.65));
  const palette=opts.colorblind?ACCESSIBLE_RISK:RISK;
  const risk=palette[opts.risk]??palette.yellow;
  frame(c,x,y,w,h,ctx=>{
    ctx.scale(w/800,h/420);
    const identity=identityOf(opts.identity??{seed:23,job:'digger',age:'adult'});
    const contact=contactOf(identity,t);
    ctx.fillStyle=gradient(ctx,0,0,800,420,'#18282d','#35403a');ctx.fillRect(0,0,800,420);
    // The excavated gallery ends at a rough exposed face. Its single protruding
    // sounding point meets the resident's temple, while the palm braces below.
    const wall=[248,0,800,0,800,420,250,420,247,339,258,297,
      contact.palmX+1,contact.palmY+35,contact.palmX+1,contact.palmY-12,
      contact.edge,contact.earY+13,contact.edge,contact.earY-11,
      236,contact.earY-32,246,106,237,63];
    poly(ctx,wall,gradient(ctx,230,0,570,300,'#49524a','#263337'),null);
    for(let row=0;row<9;row++){
      const yy=26+row*44;
      line(ctx,[258,yy+7,352,yy-2,473,yy+4,580,yy-5,682,yy+1,800,yy-4],row%2?'#75816b66':'#141e2459',2+row%2);
      for(let j=0;j<4;j++){
        const xx=285+j*139+hash(seed,row*7+j)*37;
        line(ctx,[xx,yy,xx-7,yy+20,xx+8,yy+44],'#1a272955',1.2);
      }
    }
    for(let i=0;i<160;i++){
      const px=262+hash(seed,i)*538,py=hash(seed,i+201)*415;
      ctx.fillStyle=i%3?'#b5b29a25':'#0e202530';ctx.fillRect(px,py,2+hash(seed,i+401)*6,1+hash(seed,i+601)*2);
    }
    ctx.fillStyle='#17252a';ctx.fillRect(0,329,258,91);
    line(ctx,[0,329,240,329],P.woodDark,5);
    for(let i=0;i<8;i++)line(ctx,[8+i*33,332,2+i*33,413],'#695d4738',1.2);
    halo(ctx,126,251,172,.15);
    // Only the rounded hand is masked at the stone face. The head and helmet
    // remain intact above the wrist; the flat palm replaces the hidden fingers.
    ctx.save();ctx.beginPath();ctx.rect(0,0,800,420);
    ctx.rect(contact.palmX+1,contact.palmY-12,800-contact.palmX-1,27);ctx.clip('evenodd');
    drawColonistAction(ctx,190,329,{...identity,cellPx:100,facing:1},'listeningRock',t);
    ctx.restore();
    // Four fingertips rise from the wrist instead of a round mitten floating
    // before the stone. Their flat outer edge lies on the exposed rock face.
    poly(ctx,[contact.palmX-5,contact.palmY+5,contact.palmX-6,contact.palmY-3,
      contact.palmX-4,contact.palmY-14,contact.palmX+1,contact.palmY-16,
      contact.palmX+1,contact.palmY+8,contact.palmX-3,contact.palmY+10],contact.skin,P.ink,1.2);
    for(let i=0;i<3;i++)line(ctx,[contact.palmX-3,contact.palmY-9+i*4,contact.palmX+.3,contact.palmY-10+i*4],'#976e56',.7);
    // Survey envelope is blurred, never the resident or essential legend.
    const rx=351,ry=94,rw=371,rh=206,uncertainty=1-precision;
    const boundary=surveyBoundary(rx,ry,rw,rh,uncertainty,seed);
    ctx.save();ctx.filter=`blur(${((1-precision)*13).toFixed(3)}px)`;
    if(uncertainty>.001){
      poly(ctx,boundary,`rgba(${risk.rgb},.10)`,`rgba(${risk.rgb},${.09+uncertainty*.08})`,10+uncertainty*47);
      poly(ctx,boundary,`rgba(${risk.rgb},.06)`,`rgba(${risk.rgb},.48)`,2+uncertainty*5);
    }else{
      ctx.fillStyle=`rgba(${risk.rgb},.15)`;ctx.fillRect(rx,ry,rw,rh);
      ctx.strokeStyle=risk.fill;ctx.lineWidth=2.2;ctx.strokeRect(rx,ry,rw,rh);
    }
    ctx.restore();
    // Sharp brackets are evidence of exactness, so they appear only once the
    // uncertainty has almost vanished. They never mislabel a vague estimate.
    if(precision>.85){
      ctx.save();ctx.globalAlpha*=clamp((precision-.85)/.15);
      for(const [cx,cy,sx,sy]of [[rx,ry,1,1],[rx+rw,ry,-1,1],[rx,ry+rh,1,-1],[rx+rw,ry+rh,-1,-1]])
        line(ctx,[cx+sx*17,cy,cx,cy,cx,cy+sy*17],risk.fill,3);
      ctx.restore();
    }
    // Rock-listening arcs radiate from the ear, opening into the rock.
    const origin={x:contact.edge,y:contact.earY};
    for(let i=0;i<4;i++){
      const phase=((t*.36+i*.25)%1+1)%1,radius=15+phase*137;
      ctx.save();ctx.globalAlpha*=Math.sin(phase*Math.PI)*.62;
      ctx.beginPath();ctx.arc(origin.x,origin.y,radius,-.68,.68);
      ctx.strokeStyle='#dbc593';ctx.lineWidth=1.5+phase;ctx.stroke();ctx.restore();
    }
    // Support ribs are sketches, to distinguish the proposal from an open room.
    ctx.save();ctx.globalAlpha*=precision*precision*.37;ctx.filter=`blur(${(uncertainty*7).toFixed(3)}px)`;
    for(let i=1;i<4;i++)line(ctx,[rx+i*rw/4,ry+rh,rx+i*rw/4,ry+13],risk.fill,2);
    ctx.restore();
    // Redundant graphic code: one stable bar, two warning bars, three danger bars.
    box(ctx,498,329,79,40,'#18282b',5,risk.fill,1.7);
    for(let i=0;i<risk.bars;i++)box(ctx,515+i*17,339,7,20,risk.fill,1,null);
    // Precision reads as five little facets. Empty facets do not imply safety.
    for(let i=0;i<5;i++){
      const fill=precision>=(i+1)/5-.001?'#c4c7aa':'#334342';
      poly(ctx,[602+i*22,344,610+i*22,336,618+i*22,344,610+i*22,352],fill,'#9aab9566',1);
    }
    // A field notebook and a chip sample anchor the gesture in observation.
    poly(ctx,[69,329,86,317,125,326,111,341],P.woodDark,P.ink,1.7);
    poly(ctx,[73,327,87,320,121,327,110,337],P.cream,P.ink,.8);
    line(ctx,[96,323,90,333],'#a29370',.8);
    poly(ctx,[136,330,141,316,153,313,165,323,161,333],'#7c8874',P.ink,1);
    line(ctx,[142,318,149,323,158,318],'#b6b498',1);
  });
}
