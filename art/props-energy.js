import { P, TAU, clamp, hash } from './palette.js';
import { box, ellipse, gradient, line, poly } from './primitives.js';

// Illustration coordinates are metres. No simulation state or electrical rules
// are inferred here: powered simply determines which moving parts are active.
const copper = '#b68c62', copperDark = '#70503c', brass = '#c4ad76';
const slate = '#4c6970', blueSteel = '#829c9a', deep = '#2d4248';
const time = (o) => o.powered === false ? 0 : (Number.isFinite(o.t) ? o.t : 0);
const live = (o) => o.powered !== false;

function pipe(c, points, width = .11, color = copper) {
  line(c, points, P.ink, width + .05); line(c, points, color, width);
  line(c, points.map((v,i) => v - (i % 2 ? .018 : .015)), 'rgba(248,232,199,.28)', width * .22);
}
function cable(c, a, b, sag = .18, color = '#383b35', width = .055) {
  c.beginPath(); c.moveTo(...a); c.bezierCurveTo(a[0],a[1]+sag,b[0],b[1]+sag,...b);
  c.strokeStyle=P.ink; c.lineWidth=width+.03;c.lineCap='round';c.stroke();
  c.strokeStyle=color;c.lineWidth=width;c.stroke();
}
function bolts(c,x,y,w,h) {
  for(const xx of [x+.08,x+w-.08])for(const yy of [y+.08,y+h-.08]) {
    ellipse(c,xx,yy,.026,.026,P.metalLight,P.ink,.013);
    line(c,[xx-.012,yy+.008,xx+.012,yy-.008],P.inkSoft,.01);
  }
}
function foot(c,x,floor,w=.36) {
  box(c,x-w/2,floor-.14,w,.14,P.metalDark,.025);
  line(c,[x-w*.35,floor-.11,x+w*.35,floor-.11],P.metalLight,.02);
}
function indicator(c,x,y,on) {
  ellipse(c,x,y,.063,.063,P.ink);
  ellipse(c,x,y,.037,.037,on?'#d1cd88':'#5f6251');
  if(on)ellipse(c,x-.011,y-.012,.013,.013,P.ivory);
}
function gauge(c,x,y,r=.15,value=.58) {
  ellipse(c,x,y,r+.033,r+.033,P.metalDark,P.ink,.025);
  ellipse(c,x,y,r,r,P.cream,P.ink,.018);
  for(let i=0;i<5;i++){
    const a=Math.PI*(.8+i*.35);
    line(c,[x+Math.cos(a)*r*.68,y+Math.sin(a)*r*.68,x+Math.cos(a)*r*.85,y+Math.sin(a)*r*.85],P.inkSoft,.012);
  }
  const a=Math.PI*(.8+value*1.4);
  line(c,[x,y,x+Math.cos(a)*r*.73,y+Math.sin(a)*r*.73],P.rust,.023);
  ellipse(c,x,y,.025,.025,P.inkSoft);
}
function rotor(c,x,y,r,angle,spokes=6) {
  ellipse(c,x,y,r,r,P.inkSoft,P.ink,.035);
  ellipse(c,x,y,r*.88,r*.88,deep,P.metalLight,.035);
  for(let i=0;i<spokes;i++){
    const a=angle+i*TAU/spokes;
    line(c,[x,y,x+Math.cos(a)*r*.85,y+Math.sin(a)*r*.85],brass,.045);
  }
  ellipse(c,x,y,r*.16,r*.16,copper,P.ink,.022);
  ellipse(c,x-r*.035,y-r*.035,r*.055,r*.055,P.cream);
}
function valve(c,x,y,r=.16) {
  ellipse(c,x,y,r,r,P.rust,P.ink,.025);
  ellipse(c,x,y,r*.57,r*.57,copperDark);
  line(c,[x-r*.8,y,x+r*.8,y],P.rust,.045);
  line(c,[x,y-r*.8,x,y+r*.8],P.rust,.045);
  ellipse(c,x,y,.035,.035,brass);
}
function vapor(c,x,y,t) {
  for(let i=0;i<4;i++) {
    const p=((t*.45+i*.25)%1+1)%1;
    ellipse(c,x+Math.sin(p*5+i)*.12,y-p*.64,.04+p*.09,.035+p*.07,`rgba(225,225,201,${(1-p)*.23})`);
  }
}
function motor(c,x,floor,w=1.1,h=.64,angle=0,on=true) {
  foot(c,x+w*.25,floor);foot(c,x+w*.75,floor);
  box(c,x,floor-h,w,h-.12,gradient(c,x,floor-h,0,h,blueSteel,slate),.12);
  for(let i=0;i<5;i++)line(c,[x+w*(.21+i*.13),floor-h+.09,x+w*(.21+i*.13),floor-.2],deep,.028);
  box(c,x+w*.28,floor-h-.14,w*.35,.18,P.metalDark,.035);
  rotor(c,x+w*.13,floor-h*.58,h*.25,angle,4);indicator(c,x+w*.76,floor-h*.75,on);
}

export const BIKE_GEOMETRY=Object.freeze({
  crank:Object.freeze({x:1.12,y:-.56}),seat:Object.freeze({x:.85,y:-1.12}),
  handlebar:Object.freeze({x:1.78,y:-1.32}),radius:.23,angularSpeed:3.6,
});
/** Returns module transforms. Apply local BIKE_GEOMETRY after x/y/scale. */
export function bikeLayout(w,h) {
  const count=Math.max(1,Math.floor((w-.3)/2.8)),span=(w-.36)/count;
  return Array.from({length:count},(_,n)=>({x:.18+n*span,y:h-.08,scale:Math.min(1,(span-.10)/3.05)}));
}
export function drawBicycle(c,t=0,on=true,damage=0) {
  c.save();t=on?t:0;
  const angle=t*BIKE_GEOMETRY.angularSpeed;
  // Rubber tyres and moving spokes remain fine enough to read behind the frame.
  for(const wx of [.48,1.94]){
    ellipse(c,wx,-.49,.445,.445,'#293735',P.ink,.035);
    ellipse(c,wx,-.49,.365,.365,'rgba(25,39,41,.24)',P.metalLight,.032);
    for(let i=0;i<8;i++){
      const a=angle*2+i*TAU/8;
      line(c,[wx,-.49,wx+Math.cos(a)*.36,-.49+Math.sin(a)*.36],'#a4afa0',.014);
    }
    ellipse(c,wx,-.49,.055,.055,brass,P.ink,.015);
  }
  // Elevated rear axle sits in the fixed training stand.
  pipe(c,[.48,-.49,.18,-.08,.77,-.08,.48,-.49],.055,P.metalDark);
  for(const x of [.18,.77,1.94])foot(c,x,0,.25);
  pipe(c,[.48,-.49,1.12,-.56,.83,-1.13,.48,-.49],.07,P.teal);
  pipe(c,[.83,-1.13,1.67,-1.13,1.12,-.56],.07,P.teal);
  pipe(c,[1.67,-1.13,1.94,-.49],.075,P.teal);
  pipe(c,[.83,-.95,.85,-1.11],.045,P.metalLight);
  box(c,.60,-1.17,.50,.10,'#655343',.07);
  line(c,[.64,-1.17,.99,-1.17],P.woodLight,.02);
  pipe(c,[1.67,-1.13,1.70,-1.30,1.94,-1.32],.047,P.metalLight);
  line(c,[1.73,-1.32,1.94,-1.32],P.woodDark,.07);
  cable(c,[1.89,-1.29],[1.83,-.77],.12,'#4e554c',.018);
  // Chain links travel on the straight upper run; the lower run sags slightly.
  c.beginPath();c.moveTo(.48,-.60);c.lineTo(1.12,-.77);c.quadraticCurveTo(1.39,-.53,1.14,-.35);c.lineTo(.48,-.40);c.quadraticCurveTo(.34,-.49,.48,-.60);
  c.strokeStyle=P.ink;c.lineWidth=.06;c.stroke();c.strokeStyle='#a99b73';c.lineWidth=.025;c.stroke();
  for(let i=0;i<7;i++){
    const p=((i/7+t*.7)%1+1)%1;
    line(c,[.48+p*.64,-.60-p*.17,.51+p*.64,-.608-p*.17],P.cream,.011);
  }
  ellipse(c,1.12,-.56,.205,.205,P.metalDark,P.metalLight,.035);
  for(let i=0;i<5;i++){
    const a=angle+i*TAU/5;line(c,[1.12,-.56,1.12+Math.cos(a)*.17,-.56+Math.sin(a)*.17],brass,.026);
  }
  for(const a of [angle,angle+Math.PI]){
    const px=1.12+Math.cos(a)*.23,py=-.56+Math.sin(a)*.23;
    line(c,[1.12,-.56,px,py],P.metalLight,.04);box(c,px-.095,py-.027,.19,.055,P.woodDark,.015);
  }
  ellipse(c,1.12,-.56,.046,.046,copper,P.ink,.018);
  // A belt drives the little alternator beside the bicycle.
  cable(c,[.48,-.49],[2.72,-.40],-.22,'#3b3b30',.025);
  motor(c,2.43,0,.58,.58,angle*3,on);
  cable(c,[2.72,-.59],[2.99,-1.22],.12,'#6a5941',.04);
  box(c,2.63,-1.48,.38,.31,P.metalDark,.035);gauge(c,2.82,-1.33,.11,on?.55:.03);
  if(damage>.5){line(c,[.84,-1.08,.94,-1.03,.87,-.94],P.rust,.024);box(c,2.54,-.32,.11,.05,copperDark,.01);}
  c.restore();
}
function bikeDynamo(c,w,h,o={}) {
  c.save();const t=time(o),on=live(o),damage=clamp(o.damage||0);
  for(const b of bikeLayout(w,h)){
    c.save();c.translate(b.x,b.y);c.scale(b.scale,b.scale);
    ellipse(c,1.48,-.015,1.47,.08,'rgba(10,20,21,.24)');drawBicycle(c,t,on,damage);c.restore();
  }
  c.restore();
}

function microHydro(c,w,h,o={}) {
  c.save();const t=time(o),on=live(o),floor=h-.08;
  const count=Math.max(1,Math.floor(w/5.6)),span=w/count;
  // Masonry-lined water race, visible through the cutaway.
  box(c,.1,floor-.50,w-.2,.48,'#465455',.035);
  box(c,.18,floor-.40,w-.36,.31,gradient(c,0,floor-.4,0,.31,'#739e9e','#355e68'),.02,null);
  for(let i=0;i<Math.floor(w*3);i++){
    const x=.22+((i*.37+t*.28)%(w-.5));
    line(c,[x,floor-.30+(i%3)*.055,Math.min(w-.22,x+.18),floor-.30+(i%3)*.055],'rgba(199,220,196,.38)',.015);
  }
  for(let n=0;n<count;n++){
    const size=Math.min(1,(span-.4)/5.05,(h-.2)/2.8),x=n*span+.2;
    c.save();c.translate(x,floor-.42);c.scale(size,size);
    pipe(c,[.05,-.25,.55,-.25,.55,-1.0,1.05,-1.0],.30,slate);
    box(c,.75,-.35,3.85,.22,P.metalDark,.035);foot(c,1.00,.05,.38);foot(c,4.30,.05,.38);
    box(c,1.02,-1.82,1.78,1.66,gradient(c,1.02,-1.82,1.78,0,'#87a09a','#45656c'),.25);bolts(c,1.02,-1.82,1.78,1.66);
    ellipse(c,1.90,-1.02,.70,.70,P.metalDark,P.metalLight,.075);
    ellipse(c,1.90,-1.02,.57,.57,'#2f5860',P.ink,.035);
    c.save();c.translate(1.90,-1.02);c.rotate(t*2.4);
    for(let j=0;j<8;j++){
      c.save();c.rotate(j*TAU/8);c.beginPath();c.moveTo(.08,-.02);c.quadraticCurveTo(.35,-.24,.53,-.08);c.lineTo(.46,.07);c.quadraticCurveTo(.24,.10,.08,.03);c.closePath();c.fillStyle='#afaa83';c.fill();c.strokeStyle=P.ink;c.lineWidth=.02;c.stroke();c.restore();
    }c.restore();ellipse(c,1.90,-1.02,.14,.14,copper,P.ink,.025);
    pipe(c,[2.79,-1.05,3.32,-1.05],.13,P.metalLight);motor(c,3.10,-.30,1.38,.95,t*3,on);
    pipe(c,[1.50,-1.85,1.50,-2.17,2.30,-2.17],.09,copper);gauge(c,2.32,-2.17,.15,on?.64:.04);
    box(c,3.32,-2.13,.78,.53,P.metalDark,.055);gauge(c,3.56,-1.87,.14,on?.60:.04);indicator(c,3.94,-1.88,on);
    cable(c,[3.74,-1.60],[3.79,-1.24],.2,deep,.05);
    pipe(c,[2.48,-.26,2.48,.11,3.04,.11],.21,slate);
    if(on){for(let j=0;j<3;j++){const p=(t*.5+j/3)%1;ellipse(c,3.08+p*.2,.15+p*.12,.025,.045,`rgba(175,213,202,${.5-p*.3})`);}}
    c.restore();
  }
  c.restore();
}

function geothermal(c,w,h,o={}) {
  c.save();const t=time(o),on=live(o),floor=h-.08;
  const count=Math.max(1,Math.floor(w/5.8)),span=w/count;
  for(let n=0;n<count;n++){
    const size=Math.min(1,(span-.4)/5.25,(h-.18)/3.15);
    c.save();c.translate(n*span+.20,floor);c.scale(size,size);
    ellipse(c,2.6,-.025,2.5,.10,'rgba(9,20,22,.24)');
    // The warm return and cool supply descend into the boreholes.
    pipe(c,[.35,0,.35,-2.70,1.05,-2.70,1.05,-2.18],.24,P.rust);
    pipe(c,[4.90,0,4.90,-2.90,3.91,-2.90,3.91,-1.65],.23,slate);
    for(const y of [-.35,-1.25,-2.25]){box(c,.18,y,.34,.12,copperDark,.02);box(c,4.73,y,.34,.12,P.metalDark,.02);}
    valve(c,.35,-1.85,.19);valve(c,4.90,-2.15,.19);
    box(c,.73,-2.45,1.12,2.20,gradient(c,.73,0,1.12,0,'#ba9a70','#796846'),.24);
    ellipse(c,1.29,-2.42,.56,.14,brass,P.ink,.025);
    for(let j=0;j<5;j++)box(c,.71,-2.12+j*.34,1.16,.08,copperDark,.018);
    line(c,[.9,-2.30,.9,-.46],'rgba(241,225,180,.38)',.06);
    gauge(c,1.32,-1.68,.18,on?.72:.06);foot(c,.96,0);foot(c,1.61,0);
    pipe(c,[1.85,-1.94,2.30,-1.94,2.30,-1.40],.19,copper);
    box(c,2.00,-1.42,2.33,1.14,gradient(c,2,-1.42,0,1.14,blueSteel,slate),.26);
    for(let j=0;j<7;j++)line(c,[2.18+j*.29,-1.28,2.18+j*.29,-.40],deep,.037);
    rotor(c,2.29,-.87,.40,t*3.1,7);box(c,3.19,-1.69,.82,.34,P.metalDark,.055);
    gauge(c,3.40,-1.52,.11,on?.56:.05);indicator(c,3.77,-1.52,on);
    foot(c,2.41,0,.5);foot(c,3.94,0,.5);
    pipe(c,[4.33,-.74,4.67,-.74,4.67,-1.55,4.90,-1.55],.16,slate);
    pipe(c,[1.30,-2.56,1.30,-2.86,1.75,-2.86],.075,copper);if(on)vapor(c,1.79,-2.87,t);
    // Insulated joints are wrapped in pale cloth, rather than an alarming glow.
    for(const x of [.35,4.90])box(c,x-.14,-.94,.28,.24,'#a8a589',.04);
    if(clamp(o.damage||0)>.5){line(c,[1.72,-1.32,1.66,-1.18,1.75,-1.03],P.inkSoft,.03);if(on)vapor(c,1.80,-1.12,t+.4);}
    c.restore();
  }
  c.restore();
}

function radiationMark(c,x,y,r=.14) {
  ellipse(c,x,y,r,r,'#cbb676',P.ink,.02);ellipse(c,x,y,r*.14,r*.14,P.inkSoft);
  for(let i=0;i<3;i++){
    const a=-Math.PI/2+i*TAU/3;c.beginPath();c.arc(x,y,r*.77,a-.41,a+.41);c.arc(x,y,r*.30,a+.41,a-.41,true);c.closePath();c.fillStyle=P.inkSoft;c.fill();
  }
}
function rtg(c,w,h,o={}) {
  c.save();const on=live(o),floor=h-.08,count=Math.max(1,Math.floor((w-.3)/3.1)),span=w/count;
  for(let n=0;n<count;n++){
    const s=Math.min(1,(span-.45)/2.65,(h-.2)/2.7);
    c.save();c.translate(n*span+(span-2.5*s)/2,floor);c.scale(s,s);
    box(c,.06,-.23,2.40,.23,'#676a58',.045);bolts(c,.06,-.23,2.40,.23);
    box(c,.55,-2.17,1.38,1.92,gradient(c,.55,-2.17,1.38,0,'#b1976b','#756b50'),.27);
    ellipse(c,1.24,-2.12,.68,.16,brass,P.ink,.027);
    // Broad, overlapping cooling fins give this machine its unmistakable shape.
    for(let j=0;j<8;j++){
      const yy=-1.98+j*.205;
      poly(c,[.40,yy,.60,yy-.06,1.92,yy-.06,2.10,yy,2.10,yy+.075,.40,yy+.075],j%2?'#69746a':'#819080');
      line(c,[.45,yy,2.04,yy],P.metalLight,.025);
    }
    box(c,.99,-1.60,.49,.58,copperDark,.04);radiationMark(c,1.235,-1.31,.15);
    pipe(c,[1.25,-2.28,1.25,-2.48,2.27,-2.48,2.27,-1.65],.065,P.metalDark);
    box(c,2.08,-1.75,.36,.54,P.metalDark,.045);gauge(c,2.26,-1.56,.105,on?.54:.03);indicator(c,2.26,-1.34,on);
    cable(c,[2.26,-1.21],[2.44,-.28],.18,deep,.05);
    // A low guard rail keeps hands away from the warm fins.
    for(const x of [.17,2.33])pipe(c,[x,-.23,x,-.86],.055,P.metal);
    pipe(c,[.17,-.78,2.33,-.78],.055,P.metal);
    for(let j=0;j<5;j++)line(c,[.24+j*.42,-.19,.39+j*.42,-.06],brass,.055);
    c.restore();
  }
  c.restore();
}

function battery(c,w,h,o={}) {
  c.save();const floor=h-.08,on=live(o),count=Math.max(1,Math.floor((w-.35)/1.60)),span=(w-.35)/count;
  const s=Math.min(1,(span-.10)/1.40,(h-.2)/2.45);
  const top=floor-1.92*s;
  // Copper bus bars make a repeated bank read as one connected installation.
  pipe(c,[.25,top-.22,w-.25,top-.22],.075,copper);
  pipe(c,[.25,top-.40,w-.25,top-.40],.06,P.metalDark);
  for(let n=0;n<count;n++){
    const x=.18+n*span+(span-1.4*s)/2;
    c.save();c.translate(x,floor);c.scale(s,s);
    foot(c,.30,0,.32);foot(c,1.10,0,.32);
    box(c,.04,-1.86,1.31,1.69,gradient(c,.04,-1.86,1.31,0,'#7f9484','#4a665d'),.10);bolts(c,.04,-1.86,1.31,1.69);
    box(c,.00,-1.97,1.40,.21,P.metalDark,.055);
    for(const tx of [.30,1.08]){
      box(c,tx-.095,-2.08,.19,.16,tx<.5?P.rust:P.metalLight,.025);
      line(c,[tx-.045,-2.045,tx+.045,-2.045],P.cream,.018);
      if(tx<.5)line(c,[tx,-2.09,tx,-2.005],P.cream,.018);
    }
    box(c,.20,-1.57,.99,.66,'#aeb49a',.035);
    gauge(c,.51,-1.25,.18,on?.66:.04);indicator(c,.97,-1.43,on);
    for(let i=0;i<3;i++)box(c,.88,-1.28+i*.10,.18,.05,on&&i<2?'#bac98c':'#687468',.012,null);
    for(let i=0;i<4;i++)line(c,[.29,-.72+i*.10,1.08,-.72+i*.10],deep,.025);
    for(const xx of [.10,1.28]){box(c,xx-.025,-1.45,.055,.60,copperDark,.025);}
    if(clamp(o.damage||0)>.6&&n%2===0)line(c,[.10,-.83,.22,-.69,.15,-.50],P.rust,.032);
    c.restore();
    cable(c,[x+.30*s,floor-2.08*s],[x+.30*s,top-.22],.08,P.rust,.05);
    cable(c,[x+1.08*s,floor-2.08*s],[x+1.08*s,top-.40],.07,P.metalDark,.045);
  }
  c.restore();
}

function surfaceSolar(c,w,h,o={}) {
  c.save();const on=live(o),floor=h-.08,count=Math.max(1,Math.floor(w/2.55)),span=w/count;
  const s=Math.min(1,(span-.15)/2.45,(h-.12)/1.95);
  for(let n=0;n<count;n++){
    const x=n*span+(span-2.45*s)/2;
    c.save();c.translate(x,floor);c.scale(s,s);
    // The sloping plane remains flat-coloured enough to feel like an illustration.
    pipe(c,[.35,0,.74,-1.27],.065,P.metalDark);pipe(c,[1.97,0,1.64,-1.55],.065,P.metalDark);
    pipe(c,[.35,-.08,1.64,-1.40,1.97,-.08,.74,-1.15],.04,P.metal);
    foot(c,.35,0,.42);foot(c,1.97,0,.42);
    const tl=[.23,-1.49],tr=[1.97,-1.87],br=[2.39,-.77],bl=[.65,-.39];
    poly(c,[...tl,...tr,...br,...bl],P.metalLight,P.ink,.04);
    const point=(u,v)=>[tl[0]+(tr[0]-tl[0])*u+(bl[0]-tl[0])*v,tl[1]+(tr[1]-tl[1])*u+(bl[1]-tl[1])*v];
    for(let row=0;row<3;row++)for(let col=0;col<5;col++){
      const u0=.035+col*.19,u1=u0+.172,v0=.04+row*.31,v1=v0+.285;
      const a=point(u0,v0),b=point(u1,v0),d=point(u0,v1),e=point(u1,v1);
      const color=(col+row)%3===0?'#547b8a':(col+row)%3===1?'#3e626f':'#4a6e7d';
      poly(c,[...a,...b,...e,...d],color,'#899e9d',.015);
      for(let j=1;j<3;j++){const k=v0+(v1-v0)*j/3;line(c,[...point(u0,k),...point(u1,k)],'#8ba0a24f',.009);}
    }
    line(c,[.29,-1.48,1.96,-1.85],'#d8d8b8',.025);
    // Dust settles along the low edge; a small junction box feeds a local cable.
    for(let i=0;i<9;i++){const p=point(.06+i*.10,.95);ellipse(c,p[0],p[1],.035,.011,'rgba(199,183,137,.34)');}
    box(c,1.38,-.50,.45,.25,P.metalDark,.04);indicator(c,1.71,-.38,on);
    cable(c,[1.52,-.26],[2.30,-.04],.10,deep,.04);
    if(clamp(o.damage||0)>.4){
      const a=point(.42,.17),b=point(.50,.40),d=point(.40,.61),e=point(.55,.84);
      line(c,[...a,...b,...d,...e],'#b6c4bd',.019);line(c,[...b,...point(.65,.48)],'#b6c4bd',.014);
    }
    c.restore();
  }
  c.restore();
}

export const ENERGY=Object.freeze({bikeDynamo,microHydro,geothermal,rtg,battery,surfaceSolar});
