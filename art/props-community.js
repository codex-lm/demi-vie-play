import { P, TAU, clamp, hash } from './palette.js';
import { box, ellipse, gradient, line, poly } from './primitives.js';
import { drawSouvenir, SOUVENIR_TYPES } from './finds.js';

// Community rooms and small livestock. Measurements are illustration-only.
// Insects, rats and fish remain alive when power is off. Pumps/radio/flames stop.
const BOOKS = ['#9c6b57', '#738c82', '#a99c6e', '#677d8c', '#c0ad84'];
const FABRICS=['#c49a4e','#b76b52','#98a97b','#7798aa'];
function fabric(seed,index=0) {return FABRICS[(Math.floor(hash(seed,17)*4)+index)%4];}

function picture(c,x,y,w,h,seed) {
  box(c,x,y,w,h,P.woodDark,.03,P.woodLight,.04);
  box(c,x+.06,y+.06,w-.12,h-.12,'#d8c69a',.015,null);
  ellipse(c,x+w*.7,y+h*.3,w*.12,w*.12,'#d9a85b');
  poly(c,[x+.07,y+h*.74,x+w*.35,y+h*.4,x+w*.61,y+h*.68,x+w-.07,y+h*.55,x+w-.07,y+h-.07,x+.07,y+h-.07],fabric(seed,2),null);
}

function layout(w, target) {
  const count = Math.max(1, Math.floor((w - .4) / (target + .2)));
  const width = Math.min(target, (w - .45) / count - .12);
  const gap = (w - count * width) / (count + 1);
  return Array.from({ length: count }, (_, i) => ({ x: gap + i * (width + gap), width, index: i }));
}
// The gallery uses the same module anchors to seat people and leave aisles clear.
export { layout as communityLayout };

function timber(c, x, y, w, h) {
  box(c, x, y, w, h, gradient(c,x,y,w,h,P.woodLight,P.woodDark), .025);
  if(w > h) line(c,[x+.06,y+h*.35,x+w-.06,y+h*.45],'#bd9565',.014);
  else line(c,[x+w*.4,y+.06,x+w*.5,y+h-.06],'#bd9565',.014);
}

function book(c, x, y, width, height, seed, tilt = 0) {
  c.save(); c.translate(x,y); c.rotate(tilt);
  const color = BOOKS[Math.abs(seed) % BOOKS.length];
  box(c,0,-height,width,height,color,.015,P.inkSoft,.018);
  line(c,[width*.23,-height+.035,width*.23,-.035],'rgba(244,226,183,.32)',.012);
  line(c,[.025,-height+.08,width-.025,-height+.08],P.cream,.018);
  line(c,[.025,-.07,width-.025,-.07],P.cream,.016);
  if(width>.14)box(c,width*.28,-height*.63,width*.48,.12,'#d1c3a0',.01,null);
  c.restore();
}

function openBook(c,x,y,s=1) {
  c.save();c.translate(x,y);c.scale(s,s);
  poly(c,[-.37,-.08,-.04,-.14,0,-.10,.31,-.16,.4,.02,.06,.08,0,.04,-.31,.09],P.woodDark,null);
  poly(c,[-.36,-.12,-.07,-.18,0,-.13,.30,-.2,.37,-.02,.05,.035,0,-.005,-.32,.05],P.cream,P.inkSoft,.015);
  line(c,[0,-.13,.035,.025],P.woodDark,.018);
  for(let j=0;j<3;j++) {
    line(c,[-.27,-.09+j*.036,-.075,-.13+j*.036],'#9e9379',.01);
    line(c,[.08,-.12+j*.036,.26,-.15+j*.036],'#9e9379',.01);
  }
  c.restore();
}

function plant(c,x,y,s=1,flowers=false) {
  c.save();c.translate(x,y);c.scale(s,s);
  poly(c,[-.18,-.3,.18,-.3,.13,0,-.13,0],P.rust);
  ellipse(c,0,-.3,.18,.045,P.woodDark,P.woodLight,.02);
  for(let i=0;i<4;i++) {
    const sx=(i-1.5)*.075,sy=-.6-(i%2)*.14;
    line(c,[sx*.3,-.3,sx,sy],P.green,.022);
    c.save();c.translate(sx,sy+.07);c.rotate((i%2?1:-1)*.65);
    ellipse(c,-.055,0,.09,.035,i%2?'#8d9e73':'#687f60',P.inkSoft,.012);c.restore();
    if(flowers) {
      for(let j=0;j<5;j++){const a=j*TAU/5;ellipse(c,sx+Math.cos(a)*.055,sy+Math.sin(a)*.055,.04,.035,i%2?'#c3aa85':'#b88a78');}
      ellipse(c,sx,sy,.026,.027,P.cream);
    }
  }
  c.restore();
}

function desk(c,x,floor,w,h=.87) {
  timber(c,x+.09,floor-h,.09,h);timber(c,x+w-.18,floor-h,.09,h);
  line(c,[x+.14,floor-.22,x+w-.14,floor-.22],P.woodDark,.06);
  timber(c,x-.02,floor-h-.09,w+.04,.13);
  box(c,x+.17,floor-h+.07,w-.34,.2,P.wood,.025);
  line(c,[x+w*.44,floor-h+.16,x+w*.58,floor-h+.16],P.woodDark,.035);
}

function chair(c,x,floor,s=1,back=true) {
  timber(c,x-.24*s,floor-.52*s,.07*s,.52*s);
  timber(c,x+.17*s,floor-.52*s,.07*s,.52*s);
  timber(c,x-.31*s,floor-.6*s,.62*s,.10*s);
  if(back) {
    timber(c,x-.24*s,floor-1.13*s,.07*s,.55*s);
    timber(c,x+.17*s,floor-1.13*s,.07*s,.55*s);
    box(c,x-.25*s,floor-1.15*s,.5*s,.30*s,P.wood,.03);
  }
}

function school(c,w,h,o={}) {
  c.save(); const floor=h-.12, boardW=Math.min(w-.7,3.4), boardX=(w-boardW)/2;
  const boardY=Math.max(.28,floor-2.85);
  box(c,boardX,boardY,boardW,1.23,P.wood,.045);
  box(c,boardX+.075,boardY+.075,boardW-.15,1.03,'#36524b',.025,P.woodDark,.025);
  // An unlabeled seedling study, a geometric solid and a little chalk abacus.
  const bx=boardX+boardW*.28,by=boardY+.93;
  line(c,[bx,by,bx,by-.55],'#cad0aa',.026);
  line(c,[bx,by-.28,bx-.23,by-.44,bx,by-.34,bx+.21,by-.52],'#a6b895',.025);
  ellipse(c,bx,by+.015,.28,.045,'rgba(0,0,0,0)','#cad0aa',.018);
  if(boardW>2) {
    const xx=boardX+boardW*.61;
    line(c,[xx,boardY+.36,xx+.38,boardY+.23,xx+.66,boardY+.38,xx+.3,boardY+.52,xx,boardY+.36,xx,boardY+.79,xx+.3,boardY+.97,xx+.3,boardY+.52],'#c8c5a0',.021);
    line(c,[xx+.66,boardY+.38,xx+.66,boardY+.78,xx+.3,boardY+.97],'#c8c5a0',.021);
  }
  timber(c,boardX-.025,boardY+1.18,boardW+.05,.08);
  box(c,boardX+.18,boardY+1.12,.23,.055,P.cream,.012,null);
  for(const {x,width,index} of layout(w,2.25)) {
    chair(c,x+width*.30,floor,.86);chair(c,x+width*.75,floor,.86);
    desk(c,x,floor,width,.92);
    openBook(c,x+width*.34,floor-1.03,.8);
    box(c,x+width*.65,floor-1.08,.42,.065,'#40544e',.02,P.woodLight,.025);
    line(c,[x+width*.69,floor-1.09,x+width*.91,floor-1.14],P.rust,.03);
    // A satchel hangs under each desk, with a stitched flap and brass buckle.
    const sx=x+width-.31;
    line(c,[sx-.14,floor-.77,sx-.14,floor-.93,sx+.12,floor-.93,sx+.12,floor-.77],P.woodDark,.035);
    box(c,sx-.18,floor-.75,.36,.46,fabric(o.seed||0,index),.05);
    box(c,sx-.18,floor-.76,.36,.16,fabric(o.seed||0,index+1),.045);
    box(c,sx-.035,floor-.65,.07,.11,P.amber,.012,P.inkSoft,.012);
    // Shared pencil tin, with little coloured tips legible at native scale.
    box(c,x+width*.53,floor-1.27,.18,.26,'#b8b597',.025);
    for(let j=0;j<3;j++)line(c,[x+width*.55+j*.05,floor-1.25,x+width*.54+j*.06,floor-1.42-j*.025],FABRICS[(index+j)%4],.025);
  }
  if(w>7) {
    const gx=w-.65,gy=boardY+.65;
    ellipse(c,gx,gy,.34,.34,'#9eae8e',P.woodDark,.025);
    poly(c,[gx-.2,gy-.15,gx-.05,gy-.21,gx+.09,gy-.11,gx+.05,gy+.06,gx-.08,gy+.2,gx-.15,gy+.04],'#5d7e71',null);
    ellipse(c,gx,gy,.22,.36,'rgba(0,0,0,0)',P.metalDark,.02);
    line(c,[gx,gy+.36,gx,gy+.52,gx-.25,gy+.52,gx+.25,gy+.52],P.woodDark,.05);
  }
  if(w>5.5) {
    const px=.3,py=Math.max(.45,boardY+.12);
    picture(c,px,py,.73,.62,o.seed||0);
    picture(c,px+.13,py+.79,.67,.56,(o.seed||0)+2);
    line(c,[px+.2,py-.07,px+.2,py+.02],P.rust,.06);
  }
  c.restore();
}

function chapel(c,w,h,o={}) {
  c.save();const floor=h-.12,cx=w/2,top=Math.max(.4,floor-2.9);
  // A secular circle and sprig: remembrance can belong to any colony.
  ellipse(c,cx,top+.54,.5,.59,'#817d65',P.woodDark,.075);
  ellipse(c,cx,top+.54,.4,.48,'#5b6658',P.woodLight,.025);
  line(c,[cx,top+.87,cx-.02,top+.25],P.cream,.035);
  for(let j=0;j<3;j++)for(const sign of [-1,1]) {
    const sy=top+.43+j*.14;
    line(c,[cx,sy+.08,cx+sign*.17,sy-.025],P.cream,.028);
    ellipse(c,cx+sign*.13,sy,.07,.027,'#c7bc8f');
  }
  box(c,cx-.7,floor-1.1,1.4,1.05,gradient(c,cx-.7,floor-1.1,1.4,0,'#9c9780','#6b7265'),.055);
  box(c,cx-.83,floor-1.19,1.66,.15,'#b4ac90',.045);
  poly(c,[cx-.3,floor-1.2,cx+.3,floor-1.2,cx+.28,floor-.65,cx,floor-.5,cx-.28,floor-.65],'#a68f6e',P.inkSoft,.018);
  plant(c,cx,floor-1.22,.7,true);
  for(const sign of [-1,1]) {
    const x=cx+sign*.57;
    box(c,x-.065,floor-1.52,.13,.3,P.cream,.02);
    ellipse(c,x,floor-1.22,.12,.035,P.woodDark,P.woodLight,.015);
    if(o.powered!==false&&o.lit!==false) {
      const flutter=Math.sin((o.t||0)*5+sign)*.012;
      ellipse(c,x+flutter,floor-1.58,.035,.075,'#e5b669');
      ellipse(c,x,floor-1.57,.015,.035,P.ivory);
    } else line(c,[x,floor-1.52,x,floor-1.55],P.inkSoft,.015);
  }
  const available=(w-2.1)/2;
  for(const sign of [-1,1]) {
    const bw=Math.min(2.0,available-.12);
    if(bw>.45) {
      const x=sign<0?.24:w-.24-bw;
      timber(c,x,floor-.66,bw,.13);
      timber(c,x+.1,floor-.55,.09,.55);timber(c,x+bw-.19,floor-.55,.09,.55);
      timber(c,x+.1,floor-1.17,.09,.5);timber(c,x+bw-.19,floor-1.17,.09,.5);
      box(c,x+.08,floor-1.2,bw-.16,.26,P.wood,.035);
      if(bw>1.2)openBook(c,x+bw*.5,floor-.71,.65);
    }
  }
  c.restore();
}

function archive(c,w,h,o={}) {
  c.save();const floor=h-.12;
  for(const {x,width,index} of layout(w,2.42)) {
    const top=Math.max(.35,floor-3.1),height=floor-top;
    box(c,x,top,width,height,P.woodDark,.035);
    box(c,x+.09,top+.1,width-.18,height-.18,'#534b3d',.02,null);
    timber(c,x,top,.1,height);timber(c,x+width-.1,top,.1,height);
    const levels=Math.max(3,Math.floor(height/.65)),gap=(height-.16)/levels;
    for(let j=1;j<=levels;j++) {
      const y=top+j*gap;
      timber(c,x-.02,y,width+.04,.1);
      let bx=x+.16,k=0;
      while(bx<x+width-.25) {
        const bw=.12+hash(index*41+j*9+k,3)*.10,bh=gap*(.61+hash(k,index+j)*.25);
        book(c,bx,y,bw,bh,index+j+k,(o.damage||0)>.7&&j===levels&&k===1?-.20:0);
        bx+=bw+.035;k++;
      }
    }
    box(c,x+.08,top-.07,width-.16,.12,P.woodLight,.03);
    if(index%2===0) {
      const lx=x+width-.4;
      line(c,[lx,top+.4,lx-.33,floor,lx-.03,floor,lx+.3,top+.4],P.woodDark,.075);
      for(let y=floor-.3;y>top+.45;y-=.34) {
        const offset=(floor-y)/(floor-top-.4)*.33;
        line(c,[lx-.33+offset,y,lx-.03+offset,y],P.woodLight,.06);
      }
    }
  }
  c.restore();
}

function armchair(c,x,floor,s,color) {
  c.save();c.translate(x,floor);c.scale(s,s);
  box(c,-.58,-1.25,1.16,.91,gradient(c,-.6,-1.25,0,1,color,'#66583f'),.18);
  box(c,-.51,-.58,1.02,.29,color,.12);
  for(const side of [-1,1]) {
    box(c,side*.53-.13,-.81,.26,.62,color,.10);
    box(c,side*.42-.045,-.2,.09,.2,P.woodDark,.02);
  }
  line(c,[-.32,-1.15,-.32,-.72],'rgba(239,221,178,.25)',.018);
  ellipse(c,-.14,-.95,.025,.025,P.woodDark);ellipse(c,.15,-.95,.025,.025,P.woodDark);
  box(c,.09,-.82,.35,.31,'#d7b477',.08,P.inkSoft,.02);
  line(c,[.14,-.72,.36,-.61],P.cream,.022);
  c.restore();
}

function commons(c,w,h,o={}) {
  c.save();const floor=h-.12;
  for(const {x,width,index} of layout(w,4.6)) {
    const s=Math.min(1,width/4.1),cy=floor-.69;
    armchair(c,x+width*.16,floor,s,fabric(o.seed||0,index));
    armchair(c,x+width*.84,floor,s,fabric(o.seed||0,index+2));
    const blanketX=x+width*.84-.15*s;
    box(c,blanketX,floor-1.23*s,.35*s,.83*s,fabric(o.seed||0,index+1),.045,P.inkSoft,.018);
    for(let j=0;j<3;j++)line(c,[blanketX+.035*s,floor-(.49+j*.08)*s,blanketX+.31*s,floor-(.49+j*.08)*s],P.cream,.018);
    const tx=x+width*.5,tw=Math.min(1.42,width*.32);
    line(c,[tx-tw*.34,cy,tx-tw*.28,floor,tx+tw*.28,floor,tx+tw*.34,cy],P.woodDark,.065);
    ellipse(c,tx,cy,tw*.55,.18,P.woodLight,P.woodDark,.035);
    box(c,tx-.31,cy-.13,.62,.18,'#b4a37b',.02,P.woodDark,.018);
    for(let j=0;j<4;j++)for(let k=0;k<3;k++)if((j+k)%2===0)box(c,tx-.29+j*.145,cy-.12+k*.05,.145,.05,'#6e7e69',0,null);
    for(let j=0;j<4;j++)ellipse(c,tx-.2+j*.13,cy-.09+(j%2)*.05,.025,.024,j%2?P.ivory:P.woodDark);
    // Cloth-bound radio, working dial and tiny speaker grille.
    const rx=x+width*.5,ry=Math.max(.53,floor-2.38);
    timber(c,rx-.65,ry+.49,1.3,.09);
    box(c,rx-.55,ry,1.1,.47,P.woodDark,.075);
    box(c,rx-.48,ry+.065,.55,.34,'#a68d66',.045);
    for(let j=0;j<6;j++)line(c,[rx-.42+j*.075,ry+.1,rx-.42+j*.075,ry+.35],'#5c5848',.018);
    box(c,rx+.15,ry+.09,.31,.12,o.powered!==false?'#ccb87c':'#786f57',.02);
    const dial=o.powered!==false?Math.sin((o.t||0)*.8)*.025:0;
    line(c,[rx+.29+dial,ry+.11,rx+.29+dial,ry+.18],P.rust,.022);
    ellipse(c,rx+.22,ry+.33,.055,.055,P.cream,P.inkSoft,.02);ellipse(c,rx+.4,ry+.33,.055,.055,P.cream,P.inkSoft,.02);
    line(c,[rx+.41,ry,rx+.65,ry-.62],P.metalLight,.022);
    if(width>3.7) {
      plant(c,x+.43,ry+.46,.72,false);
      picture(c,x+width-.95,Math.max(.48,ry-.2),.74,.62,(o.seed||0)+index);
    }
  }
  c.restore();
}

function washroom(c,w,h,o={}) {
  c.save();const floor=h-.12;
  for(const {x,width,index} of layout(w,4.6)) {
    const narrow=width<3.5;
    c.save();c.translate(x,floor);
    // Basin, trap and mirror are independent of the optional tiled back wall.
    const sx=narrow?.65:.85;
    box(c,sx-.53,-2.42,1.06,.92,P.metalLight,.07);
    box(c,sx-.46,-2.35,.92,.78,gradient(c,sx-.46,-2.35,.92,.78,'#91aaa2','#506d70'),.035);
    line(c,[sx-.34,-2.22,sx+.1,-1.72],'rgba(225,236,211,.28)',.06);
    box(c,sx-.57,-1.18,1.14,.32,P.ivory,.13);
    ellipse(c,sx,-1.18,.5,.115,'#82968d',P.metalLight,.025);
    ellipse(c,sx,-1.17,.35,.065,'#aebbae');
    line(c,[sx+.05,-1.22,sx+.05,-1.53,sx+.25,-1.53,sx+.25,-1.39],P.metalLight,.055);
    line(c,[sx-.12,-.85,sx-.12,-.61,sx+.1,-.61,sx+.1,-.82],P.metalDark,.07);
    line(c,[sx+.1,-.82,sx+.41,-.82,sx+.41,-.05],P.metalDark,.06);
    if(o.powered!==false) {
      const phase=(((o.t||0)*1.5)%1+1)%1;
      line(c,[sx+.25,-1.37,sx+.25,-1.22], '#a7c7bb',.023);
      ellipse(c,sx+.25,-1.35+phase*.12,.014,.022,'#c7d7c3');
    }
    // The cubicle is a curtain, not a full wall: the porcelain shape remains readable.
    const tx=narrow?width-.52:3.17;
    box(c,tx-.35,-1.22,.7,.61,'#c7c9b5',.075);
    box(c,tx-.4,-1.3,.8,.12,P.ivory,.04);
    line(c,[tx-.24,-.67,tx-.17,-.13,tx+.24,-.13,tx+.29,-.62],P.ivory,.14);
    ellipse(c,tx,-.71,.43,.14,P.ivory,P.metalDark,.025);
    ellipse(c,tx,-.72,.30,.075,'#8a9e91');
    box(c,tx+.15,-1.19,.13,.055,P.metalDark,.015);
    const curtainX=narrow?width-1.12:2.21;
    line(c,[curtainX,-2.65,width-.12,-2.65],P.metalLight,.045);
    for(let j=0;j<5;j++) {
      const xx=curtainX+j*.105;
      ellipse(c,xx+.06,-2.61,.04,.055,'rgba(0,0,0,0)',P.metalLight,.015);
      box(c,xx,-2.56,.14,2.22,gradient(c,xx,-2.5,.14,0,'#abb9a3','#6e8e81'),.035,P.inkSoft,.015);
    }
    if(!narrow) {
      line(c,[1.55,-1.72,1.98,-1.72],P.woodDark,.045);
      box(c,1.60,-1.75,.3,.66,index%2?'#ac9977':'#bdbb9c',.025);
      for(let j=0;j<3;j++)line(c,[1.63,-1.23-j*.05,1.87,-1.23-j*.05],P.cream,.013);
    }
    ellipse(c,tx-.22,-.035,.23,.055,P.metalDark);
    for(let j=0;j<4;j++)line(c,[tx-.36+j*.08,-.065,tx-.36+j*.08,-.01],P.metalLight,.015);
    c.restore();
  }
  c.restore();
}

function urn(c,x,y,s,color) {
  c.save();c.translate(x,y);c.scale(s,s);
  c.beginPath();c.moveTo(-.12,-.55);c.bezierCurveTo(-.33,-.47,-.29,-.16,-.15,-.04);
  c.lineTo(.15,-.04);c.bezierCurveTo(.29,-.16,.33,-.47,.12,-.55);c.closePath();
  c.fillStyle=gradient(c,-.3,-.55,.6,0,color,'#6b6c5f');c.fill();c.strokeStyle=P.inkSoft;c.lineWidth=.025;c.stroke();
  ellipse(c,0,-.55,.16,.045,P.cream,P.inkSoft,.015);
  ellipse(c,0,-.61,.065,.04,color,P.inkSoft,.015);
  line(c,[-.13,-.4,.13,-.4],P.cream,.022);
  box(c,-.12,-.04,.24,.06,P.metalDark,.02);
  c.restore();
}

function ossuary(c,w,h,o={}) {
  c.save();const floor=h-.12;
  const memories=(o.souvenirs??[]).filter(type=>SOUVENIR_TYPES.includes(type));
  for(const {x,width,index} of layout(w,2.4)) {
    const top=Math.max(.75,floor-2.8),height=floor-top;
    box(c,x,top,width,height,gradient(c,x,top,width,0,'#9a9c87','#6f7b70'),.07);
    const gap=(height-.25)/3;
    for(let j=0;j<3;j++)for(let k=0;k<2;k++) {
      const nw=(width-.32)/2,nx=x+.11+k*(nw+.1),ny=top+.12+j*gap;
      box(c,nx,ny,nw,gap-.1,'#4f6059',.08,P.metalDark,.025);
      const memory=memories[index*6+j*2+k];
      if(memory){
        // Each keeps its own niche beside the urns. The guitar is tall, so fit
        // its real outline instead of clipping its headstock against the shelf.
        const size=Math.min(.92,nw/.98,(gap-.18)/(memory==='guitar'?1.54:.92));
        drawSouvenir(c,memory,nx+nw/2,ny+gap-.15,size);
      }else urn(c,nx+nw/2,ny+gap-.15,Math.min(1,gap/.8),['#b8ad8c','#9ba997','#b5a391'][(index+j+k)%3]);
      box(c,nx+.13,ny+gap-.065,nw-.26,.065,P.cream,.012,null);
      // Uninscribed plaques; names belong to the game UI, not fake lettering.
    }
    box(c,x-.04,top-.06,width+.08,.14,'#b6b29a',.035);
    if(index%2===0)plant(c,x+width*.5,top-.07,.7,true);
  }
  c.restore();
}

function mesh(c,x,y,w,h,step=.14) {
  for(let px=x+.05;px<x+w-.02;px+=step)line(c,[px,y+.025,px,y+h-.025],'rgba(190,201,177,.28)',.011);
  for(let py=y+.05;py<y+h-.02;py+=step)line(c,[x+.025,py,x+w-.025,py],'rgba(190,201,177,.24)',.011);
}

function insectFarm(c,w,h,o={}) {
  c.save();const floor=h-.12;
  for(const {x,width,index} of layout(w,2.6)) {
    const top=Math.max(.5,floor-2.65),levels=3,gap=(floor-top-.14)/levels;
    box(c,x,top,.1,floor-top,P.metalDark,.025);box(c,x+width-.1,top,.1,floor-top,P.metalDark,.025);
    for(let j=0;j<levels;j++) {
      const yy=top+j*gap+.04,th=gap-.11,xx=x+.11,tw=width-.22;
      box(c,xx,yy,tw,th,gradient(c,xx,yy,0,th,'#737b58','#4c5b43'),.045);
      box(c,xx+.035,yy+th*.73,tw-.07,th*.22,'#94815c',.025,null);
      for(let k=0;k<7;k++) {
        const phase=(o.t||0)*.6+k*1.7+index+j;
        const ix=xx+.16+(tw-.32)*(k+.5)/7+Math.sin(phase)*.04,iy=yy+th*.64+Math.sin(phase*.7)*.045;
        for(const sign of [-1,1])for(let leg=0;leg<3;leg++)line(c,[ix-.04+leg*.04,iy,ix-.06+leg*.05,iy+sign*.055],'#c2b082',.014);
        ellipse(c,ix,iy,.065,.031,k%2?'#b7a777':'#c3b38c',P.inkSoft,.013);
        ellipse(c,ix+.057,iy-.002,.027,.026,P.woodDark);
      }
      for(let k=0;k<3;k++)poly(c,[xx+.2+k*.48,yy+th*.87,xx+.29+k*.48,yy+th*.72,xx+.42+k*.48,yy+th*.87],P.green,null);
      mesh(c,xx+.025,yy+.03,tw-.05,th-.06,.19);
      box(c,xx+.035,yy+th-.08,tw-.07,.1,P.metal,.02);
      line(c,[xx+tw*.42,yy+th+.015,xx+tw*.58,yy+th+.015],P.cream,.04);
    }
    box(c,x-.025,top-.08,width+.05,.12,P.woodLight,.025);
    box(c,x+.15,floor-.1,width-.3,.1,P.woodDark,.02);
  }
  c.restore();
}

function rat(c,x,y,s,t,seed) {
  c.save();c.translate(x,y);c.scale(s,s);
  const facing=Math.cos(t*.35+seed)>=0?1:-1;c.scale(facing,1);
  c.beginPath();c.moveTo(-.24,-.12);c.bezierCurveTo(-.47,-.11,-.5,-.02,-.68,-.04);
  c.strokeStyle='#b7947f';c.lineWidth=.028;c.lineCap='round';c.stroke();
  ellipse(c,-.04,-.15,.25,.16,gradient(c,-.27,-.28,.47,.24,'#a39a85','#716f65'),P.inkSoft,.02);
  poly(c,[.1,-.24,.26,-.19,.36,-.09,.17,-.06], '#9b9482',P.inkSoft,.017);
  ellipse(c,.14,-.25,.075,.085,'#a99d89',P.inkSoft,.018);ellipse(c,.145,-.25,.04,.05,'#c4a18b');
  ellipse(c,.24,-.16,.018,.02,P.ink);ellipse(c,.34,-.09,.026,.019,'#b88f7a');
  const twitch=Math.sin(t*2+seed)*.014;
  line(c,[.3,-.12,.43,-.15+twitch],P.cream,.01);line(c,[.3,-.1,.45,-.07-twitch],P.cream,.01);
  for(const xx of [-.14,.13])line(c,[xx,-.045,xx+.08,-.02],'#b89d85',.035);
  c.restore();
}

function ratFarm(c,w,h,o={}) {
  c.save();const floor=h-.12;
  for(const {x,width,index} of layout(w,2.7)) {
    const top=Math.max(.5,floor-2.6),gap=(floor-top-.16)/2;
    timber(c,x,top,.1,floor-top);timber(c,x+width-.1,top,.1,floor-top);
    for(let j=0;j<2;j++) {
      const xx=x+.12,yy=top+.04+j*gap,tw=width-.24,th=gap-.1;
      box(c,xx,yy,tw,th,'#5d6959',.045,P.metalDark,.035);
      box(c,xx+.03,yy+th-.14,tw-.06,.12,'#ab9368',.02,null);
      // Straw nest, feed dish, bottle and a small living silhouette behind mesh.
      ellipse(c,xx+tw-.42,yy+th-.17,.31,.13,'#968664',P.woodDark,.02);
      for(let k=0;k<5;k++)line(c,[xx+tw-.67+k*.09,yy+th-.14,xx+tw-.57+k*.09,yy+th-.26],P.cream,.013);
      const t=o.t||0,rx=xx+tw*.45+Math.sin(t*.35+index+j)*Math.max(0,tw*.14);
      rat(c,rx,yy+th-.16,.8,t,index*3+j);
      box(c,xx+.13,yy+.16,.24,.4,'#a9bfb0',.065,P.metalLight,.022);
      box(c,xx+.14,yy+.12,.22,.075,P.metalDark,.015);
      line(c,[xx+.25,yy+.55,xx+.25,yy+.67,xx+.35,yy+.72],P.metalLight,.025);
      ellipse(c,xx+.42,yy+th-.14,.18,.06,P.metalLight,P.inkSoft,.02);
      ellipse(c,xx+.42,yy+th-.16,.13,.03,'#b6a77d');
      mesh(c,xx+.025,yy+.025,tw-.05,th-.05,.21);
      line(c,[xx+tw*.5,yy+.035,xx+tw*.5,yy+th-.05],P.metalDark,.035);
      box(c,xx+tw*.5-.05,yy+th*.5,.1,.14,P.woodLight,.025);
    }
    timber(c,x-.02,top-.08,width+.04,.12);
  }
  c.restore();
}

function fish(c,x,y,s,facing,t,seed) {
  c.save();c.translate(x,y);c.scale(s*facing,s);
  const tail=Math.sin(t*4+seed)*.035;
  poly(c,[-.14,0,-.35,-.14+tail,-.35,.14+tail],seed%2?'#b89866':'#a5b1a2',P.inkSoft,.018);
  ellipse(c,0,0,.24,.12,gradient(c,-.2,-.12,.4,.25,seed%2?'#c5b484':'#b7c2ad',seed%2?'#908765':'#79948d'),P.inkSoft,.018);
  poly(c,[-.08,-.10,.04,-.21,.12,-.09],seed%2?'#a69d79':'#91aa99',P.inkSoft,.012);
  line(c,[.1,-.07,.065,0,.1,.065],P.inkSoft,.013);
  ellipse(c,.16,-.025,.018,.019,P.ink);
  line(c,[-.1,.015,-.03,.07,.04,.015],P.cream,.012);
  c.restore();
}

function fishTank(c,w,h,o={}) {
  c.save();const floor=h-.12;
  for(const {x,width,index} of layout(w,4.6)) {
    const top=Math.max(.6,floor-2.5),th=floor-top-.35;
    box(c,x+.13,top+th,width-.26,.35,P.metalDark,.025);
    for(const px of [x+.25,x+width-.38])box(c,px,floor-.25,.13,.25,P.metal,.025);
    box(c,x,top,width,th,gradient(c,x,top,0,th,'#527b78','#284f56'),.08,P.metalDark,.07);
    c.save();c.beginPath();c.rect(x+.08,top+.1,width-.16,th-.18);c.clip();
    const waterTop=top+.26;
    line(c,[x+.08,waterTop,x+width-.08,waterTop],'#a6c1ad',.03);
    poly(c,[x+.08,top+th-.17,x+width*.35,top+th-.28,x+width*.65,top+th-.19,x+width-.08,top+th-.29,x+width-.08,top+th,x+.08,top+th],'#8e8c69',null);
    for(let j=0;j<5;j++) {
      const px=x+.25+j*(width-.5)/4,py=top+th-.22;
      line(c,[px,py,px-.1,py-.27,px+.03,py-.56],j%2?'#7e9b7a':'#a0ac83',.05);
      line(c,[px-.05,py-.23,px+.14,py-.38],P.green,.04);
      ellipse(c,px+.09,py-.03,.13,.06,'#75816d');
    }
    const t=o.t||0;
    for(let j=0;j<5;j++) {
      const phase=t*.22+j*1.3+index,fx=x+width*.5+Math.sin(phase)*(width*.5-.5);
      const fy=waterTop+.35+(j%3)*Math.max(.16,(th-.85)/3)+Math.sin(phase*.7)*.06;
      fish(c,fx,fy,.72+(j%2)*.16,Math.cos(phase)>=0?1:-1,t,j);
    }
    if(o.powered!==false)for(let j=0;j<8;j++) {
      const age=(((t*.38+j/8)%1)+1)%1;
      ellipse(c,x+width-.34+Math.sin(age*7+j)*.045,top+th-.2-age*(th-.5),.018+age*.016,.025+age*.016,'rgba(189,215,192,.2)','#a9c6b2',.012);
    }
    line(c,[x+.27,top+.4,x+.27,top+th-.35],'rgba(231,237,205,.17)',.055);
    line(c,[x+width-.2,top+.38,x+width-.2,top+th-.35],'rgba(231,237,205,.10)',.03);
    if((o.damage||0)>.7)line(c,[x+width*.65,top+.05,x+width*.6,top+.4,x+width*.68,top+.59,x+width*.61,top+.85],P.metalLight,.018);
    c.restore();
    box(c,x-.025,top-.08,width+.05,.15,P.metal,.035);
    box(c,x-.025,top+th-.06,width+.05,.14,P.metalDark,.03);
    const pumpX=x+width-.35;
    box(c,pumpX-.18,floor-.3,.36,.23,P.metal,.03);
    ellipse(c,pumpX+.08,floor-.2,.025,.025,o.powered!==false?'#c3c78b':'#655e48');
  }
  c.restore();
}

export const COMMUNITY = Object.freeze({ school, chapel, archive, commons, washroom, ossuary, insectFarm, ratFarm, fishTank });
