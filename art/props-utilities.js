import { P, TAU, clamp, hash } from './palette.js';
import { box, ellipse, line, poly, gradient } from './primitives.js';

// All dimensions are drawing metres. Every module is anchored to the room floor.
// Room walls, darkness, lamp glow and flood water belong to the caller.
const C = Object.freeze({ copper:'#b38b64', copperDark:'#6c4d3e', brass:'#c3ae7e',
  enamel:'#c7c6ad', enamelShade:'#8d9d92', pale:'#dcd9bd', dark:'#304446',
  glass:'#8baea2', green:'#789657', sludge:'#736950', blue:'#688e9a' });

function tube(c, pts, width=.12, color=C.copper) {
  line(c,pts,P.ink,width+.045);
  line(c,pts,color,width);
  line(c,pts.map((v,i)=>v-(i%2?.023:.012)),'rgba(245,226,185,.27)',width*.22);
}

function rivets(c,x,y,w,h,spacing=.36) {
  for(let px=x+.09;px<x+w-.025;px+=spacing) {
    ellipse(c,px,y+.075,.022,.022,C.pale,P.ink,.012);
    if(h>.2)ellipse(c,px,y+h-.075,.022,.022,C.pale,P.ink,.012);
  }
}

function dial(c,x,y,r=.15,value=.6) {
  ellipse(c,x,y,r+.035,r+.035,P.metalDark,P.ink,.025);
  ellipse(c,x,y,r,r,C.pale,P.ink,.018);
  for(let i=0;i<6;i++) {
    const a=Math.PI*(.75+i*.30);
    line(c,[x+Math.cos(a)*r*.66,y+Math.sin(a)*r*.66,x+Math.cos(a)*r*.84,y+Math.sin(a)*r*.84],P.inkSoft,.012);
  }
  const a=Math.PI*(.78+1.44*value);
  line(c,[x,y,x+Math.cos(a)*r*.7,y+Math.sin(a)*r*.7],P.rust,.022);
  ellipse(c,x,y,.024,.024,P.ink);
}

function valve(c,x,y,r=.15,angle=0) {
  ellipse(c,x,y,r,r,P.rust,P.ink,.025);
  ellipse(c,x,y,r*.63,r*.63,P.metalDark);
  for(let i=0;i<3;i++) {
    const a=angle+i*TAU/3;
    line(c,[x,y,x+Math.cos(a)*r*.86,y+Math.sin(a)*r*.86],P.rust,.045);
  }
  ellipse(c,x,y,.033,.033,C.brass);
}

function indicator(c,x,y,on,emergency=false) {
  ellipse(c,x,y,.06,.06,P.ink);
  ellipse(c,x,y,.04,.04,on?'#c6c28b':emergency?'#927252':'#4b5450');
  if(on)ellipse(c,x-.012,y-.013,.012,.012,P.ivory);
}

function wheel(c,x,y,r,t,color=P.metalLight,spokes=5) {
  ellipse(c,x,y,r,r,P.metalDark,P.ink,.025);
  ellipse(c,x,y,r*.77,r*.77,P.shadow,color,.05);
  for(let i=0;i<spokes;i++) {
    const a=t+i*TAU/spokes;
    line(c,[x,y,x+Math.cos(a)*r*.75,y+Math.sin(a)*r*.75],color,.045);
  }
  ellipse(c,x,y,r*.18,r*.18,C.brass,P.ink,.02);
}

function foot(c,x,width=.3) {
  box(c,x-width/2,-.13,width,.13,P.metalDark,.025);
  line(c,[x-width*.33,-.095,x+width*.33,-.095],P.metalLight,.022);
}

function hoopTank(c,x,width,height,color=P.teal) {
  foot(c,x+width*.2,.25);foot(c,x+width*.8,.25);
  box(c,x,-height+.15,width,height-.27,gradient(c,x,0,width,0,color,P.metalDark),Math.min(width*.22,.2));
  ellipse(c,x+width/2,-height+.17,width/2,.145,P.metalLight,P.ink,.025);
  line(c,[x+.08,-height+.28,x+.08,-.27],'rgba(230,226,193,.28)',.035);
  for(const fy of [.29,.75]) {
    box(c,x-.025,-height+height*fy,width+.05,.105,P.metalDark,.02);
    rivets(c,x,-height+height*fy,width,.105,.34);
  }
}

function sightGlass(c,x,y,height,level=.7,color=P.water,width=.14) {
  box(c,x-width/2,y,width,height,P.metalDark,.035);
  box(c,x-width/2+.03,y+.05,width-.06,height-.1,'#253f42',.02,null);
  if(level>0) {
    box(c,x-width/2+.035,y+.05+(height-.1)*(1-level),width-.07,(height-.1)*level,color,.015,null);
    if(width>.2)line(c,[x-width/2+.035,y+.05+(height-.1)*(1-level),x+width/2-.035,y+.05+(height-.1)*(1-level)],'#c1e0ce',.035);
  }
  line(c,[x-width/2+.052,y+.07,x-width/2+.052,y+height-.08],'rgba(233,239,211,.55)',width>.2?.025:.017);
  for(let k=1;k<5;k++)line(c,[x+width/2+.01,y+height*k/5,x+width/2+.09,y+height*k/5],C.pale,width>.2?.023:.015);
}

function arrow(c,x,y,right=true,color=C.pale) {
  const d=right?1:-1;
  line(c,[x-d*.12,y,x+d*.12,y],color,.028);
  line(c,[x+d*.04,y-.065,x+d*.12,y,x+d*.04,y+.065],color,.028);
}

function steam(c,x,y,t) {
  for(let i=0;i<3;i++) {
    const p=((t*.36+i/3)%1+1)%1;
    c.beginPath(); c.moveTo(x+Math.sin(p*5+i)*.04,y-p*.46);
    c.bezierCurveTo(x-.10,y-.12-p*.46,x+.11,y-.18-p*.46,x+.02,y-.27-p*.46);
    c.strokeStyle=`rgba(221,224,196,${.20*(1-p)})`;c.lineWidth=.025+p*.015;c.stroke();
  }
}

function bubbles(c,x,y,w,h,t,seed=0) {
  for(let i=0;i<8;i++) {
    const p=((t*.24+hash(seed,i))%1+1)%1;
    const px=x+.08+(w-.16)*hash(seed+47,i)+Math.sin(t+i)*.012;
    ellipse(c,px,y+h-p*h,.018+(i%3)*.006,.025,'rgba(215,228,186,.39)',null);
  }
}

function grime(c,x,y,w,seed=0,amount=.4) {
  for(let i=0;i<6;i++) {
    const px=x+hash(seed,i)*w;
    ellipse(c,px,y-hash(seed+1,i)*.1,.025+hash(seed+2,i)*.07,.012+hash(seed+4,i)*.03,`rgba(46,41,32,${.1+amount*.12})`);
  }
}

function moduleRow(c,w,h,o,preferred,draw) {
  const count=Math.max(1,Math.floor((w-.35)/preferred));
  const slot=(w-.4)/count;
  const s=Math.min(1,slot/preferred,(h-.25)/2.7);
  const on=o.powered!==false,t=on?(Number.isFinite(o.t)?o.t:0):0;
  for(let i=0;i<count;i++) {
    c.save();c.translate(.2+i*slot+(slot-preferred*s)/2,h-.1);c.scale(s,s);
    draw(c,preferred,{...o,powered:on,t,damage:clamp(o.damage||0)},i);c.restore();
  }
}

function recycler(c,w,h,opts={}) {
  c.save();
  moduleRow(c,w,h,opts,5,(c,m,o,n)=>{
    // Open settling basin, rake wheel and a small polished-water receiver.
    tube(c,[.03,-2.22,.56,-2.22,.56,-1.85],.14,P.metal);
    box(c,.14,-1.55,2.45,1.39,gradient(c,.14,-1.5,2.4,0,'#849084','#4b6661'),.12);
    ellipse(c,1.37,-1.54,1.23,.24,P.metalLight,P.ink,.035);
    ellipse(c,1.37,-1.57,1.06,.16,C.sludge,P.ink,.022);
    for(let i=0;i<5;i++)ellipse(c,.6+i*.37,-1.58+Math.sin(i*2)*.04,.08,.025,'#9b9573');
    foot(c,.43,.35);foot(c,2.26,.35);
    box(c,.3,-1.32,2.12,.91,P.metalDark,.07);
    box(c,.39,-1.23,1.94,.73,'#82816b',.055);
    // The slanted drum has wide ribs, recognisable even at twenty pixels/metre.
    c.save();c.translate(1.38,-.88);c.rotate(-.10);
    box(c,-.78,-.34,1.56,.68,gradient(c,-.78,0,1.56,0,'#acac88','#536a62'),.19);
    for(let i=0;i<7;i++) {
      const q=((i/7+o.t*.11)%1+1)%1;
      line(c,[-.67+q*1.34,-.28,-.67+q*1.34,.28],P.metalDark,.035);
    }
    ellipse(c,-.76,0,.1,.3,C.brass,P.ink,.025);c.restore();
    tube(c,[2.25,-1.34,2.95,-1.34,2.95,-1.77,3.35,-1.77],.12,C.copper);
    valve(c,2.93,-1.29,.16);
    hoopTank(c,3.26,1.12,1.98,'#90aaa0');
    sightGlass(c,3.85,-1.55,1.03,.72,'#82aba5');
    dial(c,3.82,-1.75,.13,o.powered?.6+Math.sin(o.t*2)*.025:.04);
    tube(c,[4.36,-.42,4.72,-.42,4.72,-.2],.1);
    wheel(c,2.58,-.67,.28,o.t*2.2,C.copper);
    indicator(c,.54,-1.08,o.powered);
    grime(c,.2,-.055,2.8,n,.7);
    if(o.powered) {
      bubbles(c,.45,-1.7,1.8,.13,o.t,n);
      for(let i=0;i<3;i++){const p=(o.t*.8+i/3)%1;ellipse(c,.55,-1.85+p*.19,.022,.035,P.water);}
    }
    if(o.damage>.5)line(c,[1.87,-1.11,1.74,-.97,1.92,-.8,1.79,-.67],P.ink,.035);
  });
  c.restore();
}

function cistern(c,w,h,opts={}) {
  c.save();
  moduleRow(c,w,h,opts,3.2,(c,m,o,n)=>{
    // Tall riveted reservoir, scale strip and climbing ladder: water storage, no engine.
    tube(c,[.08,-2.55,1.55,-2.55,1.55,-2.38],.13,P.metal);
    hoopTank(c,.35,2.13,2.38,'#7d9a94');
    ellipse(c,1.41,-2.24,.42,.095,P.metalDark,P.ink,.02);
    box(c,1.18,-2.47,.46,.16,P.metalLight,.04);
    line(c,[1.25,-2.47,1.25,-2.55,1.57,-2.55,1.57,-2.47],C.brass,.04);
    sightGlass(c,1.12,-1.9,1.4,o.reserveArt?.waterFill??.76,'#83b0ad',o.reserveArt?.waterFill!==undefined?.47:.14);
    dial(c,1.78,-1.76,.18,o.reserveArt?.waterFill??.54);
    for(const x of [2.23,2.61])line(c,[x,-.07,x,-2.1],P.metalLight,.055);
    for(let yy=-.22;yy>-2.02;yy-=.28)line(c,[2.23,yy,2.61,yy],P.metalLight,.045);
    tube(c,[.47,-.43,.12,-.43,.12,-.13],.16,C.copper);
    valve(c,.39,-.43,.19);
    box(c,.81,-.73,.62,.21,'#bcb99a',.025);
    for(let i=0;i<4;i++)line(c,[.89,-.67+i*.035,1.31,-.67+i*.035],P.metalDark,.012);
    indicator(c,1.85,-.5,false,true);
    if(o.damage>.55){ellipse(c,.33,-.04,.43,.055,'rgba(83,127,124,.4)');line(c,[.64,-1.2,.77,-1.04,.68,-.89],P.ink,.03);}
  });
  c.restore();
}

function hazard(c,x,y,r=.16) {
  poly(c,[x,y-r,x+r*.95,y+r*.65,x-r*.95,y+r*.65],C.brass,P.ink,.025);
  line(c,[x,y-r*.45,x,y+r*.1],P.ink,.028);
  ellipse(c,x,y+r*.37,.019,.019,P.ink);
}

function decon(c,w,h,opts={}) {
  c.save();
  moduleRow(c,w,h,opts,4.8,(c,m,o,n)=>{
    // Shielded treatment cabinet; pale enamel contrasts with the darker raw-water drum.
    hoopTank(c,.12,.94,1.72,'#7a8b80');
    tube(c,[.6,-1.72,.6,-2.2,1.55,-2.2],.1);
    box(c,1.32,-2.52,2.1,2.37,gradient(c,1.3,0,2.1,0,C.pale,C.enamelShade),.13);
    foot(c,1.6,.4);foot(c,3.1,.4);
    box(c,1.52,-2.34,1.7,1.64,'#5f7777',.07);
    box(c,1.61,-2.25,1.52,1.46,'#314d54',.05);
    for(let j=0;j<4;j++) {
      const xx=1.82+j*.35;
      box(c,xx-.045,-2.13,.09,1.16,o.powered?'#c6d2bb':'#6c817d',.035,null);
      line(c,[xx-.07,-2.15,xx+.07,-2.15],C.copper,.04);
      line(c,[xx-.07,-.95,xx+.07,-.95],C.copper,.04);
    }
    if(o.powered) {
      const g=gradient(c,1.61,0,1.52,0,'rgba(194,218,194,.05)','rgba(145,191,192,.19)');
      box(c,1.61,-2.25,1.52,1.46,g,.05,null);
      bubbles(c,1.7,-2.13,1.3,1.12,o.t,n);
    }
    line(c,[1.7,-2.2,1.7,-.91],'rgba(236,241,207,.35)',.035);
    box(c,3.21,-1.89,.08,.49,C.brass,.025);
    for(const yy of [-2.15,-1.04])box(c,1.27,yy,.17,.23,P.metalDark,.025);
    dial(c,1.81,-.43,.15,o.powered?.65+Math.sin(o.t*1.8)*.025:.05);
    indicator(c,2.33,-.42,o.powered);hazard(c,2.85,-.44,.18);
    tube(c,[3.43,-.91,3.83,-.91,3.83,-1.43,4.27,-1.43],.12,P.metalLight);
    hoopTank(c,3.82,.69,1.4,'#93b1a6');
    sightGlass(c,4.18,-1.06,.65,.6,P.water);
    if(o.damage>.6)line(c,[2.61,-1.83,2.46,-1.61,2.66,-1.42,2.54,-1.19],P.ink,.032);
  });
  c.restore();
}

function pump(c,w,h,opts={}) {
  c.save();
  moduleRow(c,w,h,opts,3.7,(c,m,o,n)=>{
    // A large snail casing and a finned motor on a low skid.
    tube(c,[.02,-.42,.52,-.42,.52,-.99],.23,P.metal);
    tube(c,[1.07,-1.34,1.07,-2.15,2.6,-2.15,2.6,-2.68],.19,C.copper);
    for(const xx of [1.6,2.26])box(c,xx,-2.29,.1,.28,P.metalDark,.025);
    dial(c,1.58,-2.43,.18,o.powered?.7+Math.sin(o.t*3)*.04:.06);
    valve(c,2.41,-2.15,.2);
    box(c,.26,-.26,3.08,.16,P.metalDark,.035);
    foot(c,.58,.4);foot(c,2.92,.4);
    ellipse(c,1.07,-1.04,.68,.68,gradient(c,.4,-1.7,1.3,1.3,'#8ba698','#426762'),P.ink,.04);
    ellipse(c,1.07,-1.04,.43,.43,P.metalDark,C.brass,.045);
    wheel(c,1.07,-1.04,.35,o.t*2.8,P.metalLight,6);
    for(let i=0;i<7;i++){const a=i*TAU/7;ellipse(c,1.07+Math.cos(a)*.56,-1.04+Math.sin(a)*.56,.025,.025,C.pale);}
    box(c,1.68,-1.22,1.4,.74,gradient(c,1.68,0,1.4,0,'#89978c','#466463'),.15);
    for(let i=0;i<7;i++)box(c,1.83+i*.15,-1.24,.04,.76,P.metalDark,.018,null);
    box(c,2.04,-1.49,.62,.27,P.metalLight,.045);
    indicator(c,2.35,-1.36,o.powered);
    line(c,[2.66,-1.37,3.28,-1.37,3.28,-.27],P.inkSoft,.045);
    arrow(c,.27,-.42,true);arrow(c,2,-2.15,true);
    grime(c,.3,-.055,2.9,n,.6);
    if(o.damage>.6) {line(c,[.58,-.86,.7,-.73,.57,-.57],P.ink,.035);ellipse(c,.6,-.05,.35,.045,'#3f6260');}
  });
  c.restore();
}

function fan(c,x,y,r,t) {
  ellipse(c,x,y,r+.07,r+.07,P.metalDark,P.ink,.025);
  ellipse(c,x,y,r,r,P.shadow,C.brass,.025);
  c.save();c.translate(x,y);c.rotate(t);
  for(let j=0;j<4;j++) {
    c.save();c.rotate(j*TAU/4);
    c.beginPath();c.moveTo(0,-.03);c.bezierCurveTo(r*.3,-r*.52,r*.86,-r*.46,r*.88,-r*.08);
    c.bezierCurveTo(r*.64,r*.23,r*.2,r*.25,0,.03);c.closePath();
    c.fillStyle='#a3b19b';c.fill();c.strokeStyle=P.ink;c.lineWidth=.022;c.stroke();c.restore();
  }
  ellipse(c,0,0,r*.17,r*.17,C.brass,P.ink,.02);c.restore();
  for(let j=-2;j<=2;j++) {
    const yy=j*r/3,half=Math.sqrt(r*r-yy*yy);
    line(c,[x-half,y+yy,x+half,y+yy],'rgba(41,56,54,.5)',.025);
  }
}

function pleats(c,x,y,w,h,dirty=false) {
  box(c,x-.045,y-.045,w+.09,h+.09,P.metalDark,.025);
  box(c,x,y,w,h,dirty?'#9d9775':'#d3ceac',.015);
  const count=Math.max(3,Math.floor(w/.11));
  for(let j=0;j<count;j++) {
    const px=x+j*w/count;
    poly(c,[px,y,px+w/count*.48,y+.06,px+w/count*.48,y+h-.04,px,y+h],dirty?'#6b7058':'#979f88',null);
    line(c,[px+w/count*.5,y+.05,px+w/count*.5,y+h-.04],C.pale,.013);
  }
  if(dirty)for(let i=0;i<8;i++)ellipse(c,x+hash(i,1)*w,y+hash(i,2)*h,.035,.05,'rgba(66,61,46,.3)');
}

function airFilter(c,w,h,opts={}) {
  c.save();
  moduleRow(c,w,h,opts,4.6,(c,m,o,n)=>{
    // Wide square cassette and exposed pleats distinguish this from the CO2 columns.
    tube(c,[.04,-2.15,.57,-2.15,.57,-1.4],.42,P.metal);
    tube(c,[3.45,-1.4,4.05,-1.4,4.05,-2.56],.38,P.metal);
    box(c,.36,-2.1,3.14,1.75,gradient(c,.36,0,3.14,0,C.enamel,C.enamelShade),.1);
    rivets(c,.36,-2.1,3.14,1.75,.45);
    foot(c,.73,.42);foot(c,3.08,.42);
    box(c,.65,-1.89,1.46,1.26,P.metalDark,.045);
    pleats(c,.75,-1.79,1.26,1.06,true);
    fan(c,2.72,-1.25,.47,o.t*2.9);
    dial(c,2.72,-1.91,.12,o.powered?.53+Math.sin(o.t*2)*.02:.05);
    indicator(c,2.37,-.57,o.powered);
    line(c,[2.63,-.57,3.07,-.57],P.metalDark,.035);
    // A spare cartridge, complete with carrying handle, leans beside the housing.
    c.save();c.translate(3.82,-.12);c.rotate(o.damage>.65?.8:.12);
    pleats(c,-.25,-1.05,.5,.96,false);
    line(c,[-.12,-1.09,-.12,-1.2,.12,-1.2,.12,-1.09],C.brass,.035);c.restore();
    arrow(c,.14,-2.15,true);arrow(c,3.84,-1.4,true);
  });
  c.restore();
}

function scrubber(c,w,h,opts={}) {
  c.save();
  moduleRow(c,w,h,opts,4.4,(c,m,o,n)=>{
    // Paired chemical absorption columns, connected by a high copper manifold.
    tube(c,[.02,-.6,.52,-.6,.52,-2.47,3.2,-2.47,3.2,-.55,4.22,-.55],.12);
    for(let j=0;j<2;j++) {
      const x=.67+j*1.43;
      hoopTank(c,x,1.05,2.26,j?'#899e85':'#9b9b7e');
      box(c,x+.13,-1.78,.79,.73,P.metalDark,.04);
      box(c,x+.2,-1.71,.65,.59,'#aeb29a',.025);
      for(let k=0;k<5;k++) {
        line(c,[x+.22,-1.65+k*.105,x+.83,-1.65+k*.105],'#6c806c',.025);
        for(let q=0;q<3;q++)ellipse(c,x+.3+q*.19,-1.6+k*.105,.025,.025,'#d4d0ae');
      }
      dial(c,x+.53,-1.98,.15,o.powered?.5+Math.sin(o.t*1.1+j)*.035:.06);
      valve(c,x+.53,-.39,.16);
      if(o.powered) {
        const p=(o.t*.35+j*.5)%1;
        ellipse(c,x+.52,-1.17-p*.45,.035,.035,'rgba(225,227,199,.7)');
      }
    }
    box(c,3.58,-2.04,.47,1.01,P.metalDark,.045);
    indicator(c,3.82,-1.81,o.powered);
    indicator(c,3.82,-1.55,false,true);
    for(let k=0;k<3;k++)line(c,[3.66,-1.29+k*.07,3.98,-1.29+k*.07],P.metalLight,.025);
    tube(c,[3.8,-1.03,3.8,-.77],.055,P.metal);
    // Stack of replacement absorbent sacks, tied with cord.
    for(let j=0;j<2;j++) {
      box(c,.05,-.3-j*.23,.52,.22,'#b6ab80',.07);
      line(c,[.09,-.2-j*.23,.52,-.2-j*.23],P.woodDark,.018);
    }
    if(o.damage>.6)line(c,[2.92,-1.67,2.8,-1.53,2.94,-1.32],P.ink,.03);
  });
  c.restore();
}

function aquaticPlant(c,x,y,height,seed,t) {
  const sway=Math.sin(t*.7+seed)*.045;
  line(c,[x,y,x+sway,y-height],C.green,.028);
  for(let j=0;j<5;j++) {
    const yy=y-height*(.12+j*.16),d=j%2?1:-1;
    c.beginPath();c.moveTo(x+sway*.5,yy);
    c.bezierCurveTo(x+d*.23+sway,yy-.04,x+d*.2+sway,yy-.25,x+d*.1+sway,yy-.26);
    c.bezierCurveTo(x+sway,yy-.21,x+sway,yy-.08,x+sway*.5,yy);
    c.fillStyle=['#7a995f','#a7b57a','#92aa65'][j%3];c.fill();
    c.strokeStyle='#4d744f';c.lineWidth=.013;c.stroke();
  }
}

function algaeTank(c,w,h,opts={}) {
  c.save();
  moduleRow(c,w,h,opts,3.35,(c,m,o,n)=>{
    const x=.46,tw=2.17,th=2.29;
    foot(c,.78,.4);foot(c,2.29,.4);
    box(c,x,-th,tw,th-.18,gradient(c,x,-th,tw,0,'#9bad87','#42685d'),.27);
    box(c,x+.12,-th+.17,tw-.24,th-.53,gradient(c,x,-th,tw,0,'#839b63','#365b4e'),.2);
    ellipse(c,x+tw/2,-th+.19,tw*.43,.095,'#a1b481',P.metalDark,.02);
    // Soil bed, rooted strands and the still-visible glass ribs.
    box(c,x+.19,-.45,tw-.38,.12,'#665f43',.04,null);
    for(let j=0;j<5;j++)aquaticPlant(c,x+.34+j*.37,-.46,1.15+hash(n,j)*.42,n*7+j,o.t);
    if(o.powered)bubbles(c,x+.22,-2.02,tw-.44,1.53,o.t,n);
    line(c,[x+.23,-1.99,x+.23,-.61],'rgba(229,236,199,.4)',.055);
    line(c,[x+tw-.21,-1.94,x+tw-.21,-.62],'rgba(210,226,191,.2)',.025);
    for(const yy of [-2.13,-.39])box(c,x-.03,yy,tw+.06,.12,P.metalDark,.025);
    rivets(c,x,-.39,tw,.12,.34);
    box(c,.81,-2.49,1.46,.19,P.metalDark,.04);
    box(c,.91,-2.32,1.26,.055,o.powered?'#dce3af':'#768773',.02,null);
    tube(c,[.19,-.13,.19,-1.49,.49,-1.49],.09,P.metal);
    valve(c,.18,-.88,.13);
    tube(c,[2.64,-1.57,2.96,-1.57,2.96,-2.53],.1,C.copper);
    dial(c,2.94,-2.12,.12,o.powered?.46+Math.sin(o.t)*.025:.06);
    box(c,2.77,-.65,.36,.4,P.metalDark,.04);indicator(c,2.95,-.48,o.powered);
    if(o.damage>.65)line(c,[1.79,-1.88,1.6,-1.64,1.77,-1.47,1.56,-1.22],P.ink,.03);
  });
  c.restore();
}

function heater(c,w,h,opts={}) {
  c.save();
  moduleRow(c,w,h,opts,3.25,(c,m,o,n)=>{
    // Heavy cast-iron radiator, a copper header, and a thermostatic dial.
    tube(c,[.04,-.3,.41,-.3,.41,-1.5,2.76,-1.5,2.76,-.3,3.16,-.3],.12,C.copper);
    for(let j=0;j<7;j++) {
      const x=.53+j*.3;
      box(c,x,-1.65,.25,1.41,gradient(c,x,0,.25,0,'#c0b89a','#687e73'),.11);
      box(c,x+.07,-1.44,.10,.99,P.metalDark,.05,null);
      line(c,[x+.04,-1.46,x+.04,-.43],P.cream,.018);
      ellipse(c,x+.13,-1.56,.048,.035,C.brass);
    }
    foot(c,.72,.27);foot(c,2.31,.27);
    valve(c,2.78,-1.34,.18);
    dial(c,2.78,-1.8,.14,o.powered?.68+Math.sin(o.t*.8)*.018:.1);
    // Protected little heating element in a separate floor-level control box.
    box(c,.08,-.91,.34,.49,P.metalDark,.035);
    indicator(c,.25,-.73,o.powered);
    if(o.powered) {
      for(let j=0;j<4;j++) {
        const x=.75+j*.46,p=(o.t*.28+j*.19)%1;
        c.beginPath();c.moveTo(x,-1.73-p*.35);
        c.bezierCurveTo(x-.06,-1.86-p*.35,x+.07,-1.96-p*.35,x,-2.11-p*.35);
        c.strokeStyle=`rgba(213,186,132,${.16*(1-p)})`;c.lineWidth=.028;c.stroke();
      }
    }
    grime(c,.4,-.04,2.2,n,.4);
    if(o.damage>.65)line(c,[1.53,-1.32,1.64,-1.11,1.52,-.98],P.ink,.03);
  });
  c.restore();
}

function serpentine(c,x,y,w,h,rows,color) {
  const pts=[];
  for(let j=0;j<rows;j++) {
    const yy=y+j*h/(rows-1);
    pts.push(j%2?x+w:x,yy,j%2?x:x+w,yy);
  }
  tube(c,pts,.075,color);
}

function heatExchanger(c,w,h,opts={}) {
  c.save();
  moduleRow(c,w,h,opts,4.8,(c,m,o,n)=>{
    // Twin fins: warm copper to the left, cool patinated blue to the right.
    tube(c,[.02,-2.36,.58,-2.36,.58,-1.92],.18,C.copper);
    tube(c,[4.13,-1.92,4.13,-2.36,4.75,-2.36],.18,C.blue);
    tube(c,[.02,-.45,.58,-.45,.58,-.81],.16,C.copper);
    tube(c,[4.13,-.81,4.13,-.45,4.75,-.45],.16,C.blue);
    box(c,.36,-2.19,4,1.76,gradient(c,.36,0,4,0,'#9da28b','#617c75'),.1);
    rivets(c,.36,-2.19,4,1.76,.42);
    foot(c,.74,.4);foot(c,4,.4);
    for(let j=0;j<2;j++) {
      const xx=.64+j*1.86;
      box(c,xx,-1.98,1.57,1.33,P.metalDark,.055);
      for(let k=0;k<11;k++)line(c,[xx+.12+k*.13,-1.89,xx+.12+k*.13,-.75],j?'#719694':'#a88e6d',.033);
      serpentine(c,xx+.1,-1.81,1.36,.95,5,j?C.blue:C.copper);
    }
    box(c,2.24,-2.02,.22,1.38,P.metalLight,.03);
    dial(c,1.2,-2.44,.14,o.powered?.76:.24);
    dial(c,3.45,-2.44,.14,o.powered?.38:.24);
    valve(c,.21,-.45,.14);valve(c,4.59,-.45,.14);
    arrow(c,.92,-2.36,true);arrow(c,3.86,-2.36,false);
    wheel(c,2.35,-.29,.18,o.t*2.3,C.brass,4);
    indicator(c,2.34,-1.28,o.powered);
    if(o.powered) {
      // Tiny flowing markers give direction without becoming an overlay or a label.
      for(let j=0;j<2;j++) {
        const p=(o.t*.27+j*.5)%1;
        ellipse(c,.78+p*1.23,-1.81,.035,.027,'#e2bc81');
        ellipse(c,2.64+(1-p)*1.23,-.86,.035,.027,'#b9d0ba');
      }
    }
    if(o.damage>.6)line(c,[2.34,-1.98,2.25,-1.81,2.39,-1.63,2.29,-1.44],P.ink,.03);
  });
  c.restore();
}

export const UTILITIES=Object.freeze({recycler,cistern,decon,pump,airFilter,scrubber,algaeTank,heater,heatExchanger});
