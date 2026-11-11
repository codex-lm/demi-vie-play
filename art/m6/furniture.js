import { box, ellipse, line, poly, gradient, halo } from '../primitives.js';
import { P, finite, hash, seedOf, frame } from './common.js';
import { LIFE_ART } from './life-strings.fr.js';

function beam(c,x,y,w,h,seed) {
  box(c,x,y,w,h,gradient(c,x,y,w,h,'#a38158','#584533'),2,P.ink,2);
  for(let i=0;i<3;i++)line(c,[x+7,y+h*(.2+i*.24),x+w*.43,y+h*(.27+i*.20),x+w-7,y+h*(.23+i*.23)],'#bb9661',.65);
  for(const bx of [x+7,x+w-7])ellipse(c,bx,y+h*.5,1.7,1.7,P.ink);
  if(w>100)ellipse(c,x+w*(.35+hash(seed,2)*.3),y+h*.5,5,1.5,'#69543d','#c19a69',.6);
}
function room(c,seed) {
  c.fillStyle=gradient(c,0,0,800,320,'#263133','#39413b');c.fillRect(0,0,800,360);
  // Shallow stone courses: broken joints are quieter than a repeated tile.
  for(let r=0;r<7;r++){
    const yy=18+r*44;
    line(c,[0,yy,180,yy+2,375,yy-1,570,yy+3,800,yy], '#657065',1.2);
    for(let j=0;j<5;j++){
      const xx=j*180+(r%2?70:0)+hash(seed,r*9+j)*24;
      line(c,[xx,yy,xx+2,yy+43], '#172327',2);
    }
  }
  for(let i=0;i<170;i++){
    const x=hash(seed,i*2)*800,y=hash(seed,i*2+1)*315;
    c.fillStyle=i%3?'#65706522':'#15242544';c.fillRect(x,y,2+hash(seed,i+510)*4,1);
  }
  c.fillStyle=gradient(c,0,296,0,64,'#615640','#302f2b');c.fillRect(0,296,800,64);
  line(c,[0,299,800,299],'#ab9161',3);
  for(let i=0;i<4;i++)line(c,[0,312+i*14,800,312+i*14],'#292c28',1);
  for(let i=0;i<6;i++)line(c,[70+i*138,300,34+i*150,360],'#262a25',1);
  const shade=c.createRadialGradient(400,140,45,400,140,470);
  shade.addColorStop(0,'#0b171900');shade.addColorStop(1,'#09151795');c.fillStyle=shade;c.fillRect(0,0,800,360);
}
function candle(c,x,y,t,seed,s=1) {
  c.save();c.translate(x,y);c.scale(s,s);
  halo(c,0,-26,64,.12+Math.sin(t*3+seed)*.025);
  ellipse(c,0,1,12,3,'#192725',P.metal,.8);
  box(c,-4.5,-24,9,24,gradient(c,-4,-20,8,0,P.ivory,'#b2a27d'),1.5,P.ink,.9);
  line(c,[-1,-24,-1,-12,-3,-9],P.ivory,1.5);
  line(c,[0,-25,0,-29],P.ink,.9);
  const flicker=Math.sin(t*4.3+seed)*1.5;
  c.beginPath();c.moveTo(0,-27);c.bezierCurveTo(-7,-34,2+flicker,-35,flicker,-44);c.bezierCurveTo(7,-34,6,-31,0,-27);
  c.fillStyle=P.amber;c.fill();ellipse(c,0,-32,2.2,4.5,P.ivory);c.restore();
}
function book(c,x,y,w,h,color,lean=0) {
  c.save();c.translate(x,y);c.rotate(lean);
  box(c,0,-h,w,h,color,1,P.ink,1.2);
  line(c,[2,-h+4,w-2,-h+4],P.cream,1);line(c,[2,-5,w-2,-5],P.woodLight,1.5);
  line(c,[w*.45,-h+9,w*.45,-10],'#e6d7b649',.7);c.restore();
}
function photo(c,x,y,w=34,h=43) {
  box(c,x,y,w,h,P.woodDark,1.5,P.ink,1.5);box(c,x+4,y+4,w-8,h-8,'#bcaf89',0,P.woodLight,1);
  ellipse(c,x+w*.5,y+h*.36,w*.115,h*.12,'#746349');
  poly(c,[x+w*.25,y+h*.78,x+w*.3,y+h*.54,x+w*.7,y+h*.54,x+w*.79,y+h*.78],'#6f7864',null);
  line(c,[x+5,y+5,x+w-5,y+5],P.ivory,.7);
}
function urn(c,x,y,seed) {
  const color=['#849389','#b4a586','#8b7160','#648282'][Math.floor(hash(seed,4)*4)];
  c.beginPath();c.moveTo(x-15,y-38);c.bezierCurveTo(x-23,y-16,x-20,y-2,x-9,y);c.lineTo(x+9,y);
  c.bezierCurveTo(x+20,y-2,x+23,y-16,x+15,y-38);c.closePath();c.fillStyle=gradient(c,x-20,y-40,40,0,color,'#354746');c.fill();c.strokeStyle=P.ink;c.lineWidth=1.5;c.stroke();
  ellipse(c,x,y-38,16,4,color,P.metalLight,1);box(c,x-7,y-45,14,6,'#aca688',1,P.ink,.8);
  line(c,[x-13,y-32,x-14,y-18,x-10,y-8],'#d7ccb15a',1.5);
  box(c,x-10,y-25,20,9,'#c9bc98',1,null);line(c,[x-6,y-20,x+6,y-20],'#776a54',.7);
}

/** Enriched room illustration. Transparent-call isolation, full clipped rectangle.
 * The urns and blank labels are decoration; no deceased identity is invented. */
export function drawOssuary(c,x,y,w,h,options={}) {
  const opts=options??{},seed=seedOf(opts.seed??6),t=finite(opts.t);
  frame(c,x,y,w,h,ctx=>{
    ctx.scale(w/800,h/360);room(ctx,seed);
    // Three paired alcoves, with masonry ledges and the warm shadow of each urn.
    for(let row=0;row<2;row++)for(let col=0;col<4;col++){
      const nx=54+col*112,ny=46+row*115;
      box(ctx,nx-6,ny-6,93,96,'#51605a',31,'#152325',2.5);
      ctx.beginPath();ctx.moveTo(nx,ny+80);ctx.lineTo(nx,ny+32);ctx.bezierCurveTo(nx,ny-2,nx+80,ny-2,nx+80,ny+32);ctx.lineTo(nx+80,ny+80);ctx.closePath();
      ctx.fillStyle=gradient(ctx,nx,ny,0,82,'#0d1b1f','#253535');ctx.fill();
      halo(ctx,nx+40,ny+49,40,.045);
      if(opts.bodyCount===undefined||row*4+col<opts.bodyCount)urn(ctx,nx+40,ny+77,seed+row*4+col);
      beam(ctx,nx-9,ny+79,98,10,seed+col);
      box(ctx,nx+25,ny+92,32,7,'#ae9b74',1,P.ink,.5);
      line(ctx,[nx+30,ny+95,nx+51,ny+95],'#564e40',.7);
      if(row===1&&col%2===0)candle(ctx,nx+76,ny+79,t,seed+col,.65);
    }
    // The memory shelf carries very different, visibly repaired keepsakes.
    beam(ctx,535,64,211,12,seed);beam(ctx,535,157,211,12,seed+1);beam(ctx,535,257,211,14,seed+2);
    for(const yy of [77,170,271])for(const xx of [548,724])poly(ctx,[xx,yy,xx+13,yy,xx,yy+21],P.woodDark,P.ink,1);
    photo(ctx,557,108,35,47);photo(ctx,607,112,30,43);
    book(ctx,655,156,17,53,'#886b4d',-.08);book(ctx,674,156,16,45,'#69847d');book(ctx,692,156,13,48,'#a88756',.09);
    // An old hand tool, a folded scarf and a small songbook.
    line(ctx,[552,247,589,198],P.woodLight,6);line(ctx,[573,197,603,220],P.metal,7);
    poly(ctx,[624,239,642,223,693,228,717,246,694,252,641,251], '#a87b62',P.ink,1.7);
    for(let i=0;i<6;i++)line(ctx,[637+i*11,232,645+i*11,248], '#d5ab77',1.4);
    book(ctx,718,254,15,38,'#5b7478',-.1);
    candle(ctx,555,64,t,seed+2,.8);candle(ctx,719,64,t,seed+7,.65);
    // A low bench invites a quiet visit, without obstructing the memorials.
    beam(ctx,101,308,308,13,seed);beam(ctx,126,320,17,32,seed);beam(ctx,369,320,17,32,seed);
    candle(ctx,493,295,t,seed,1.05);
    line(ctx,[450,286,472,265,494,285],'#506f52',2);
    for(let i=0;i<5;i++)ellipse(ctx,456+i*9,276+Math.sin(i)*6,5,3,'#c7bea0');
  });
}

function bench(c,x,y,w,seed) {
  beam(c,x+9,y+5,11,36,seed);beam(c,x+w-21,y+5,11,36,seed);
  line(c,[x+17,y+28,x+w-16,y+28],P.woodDark,5);beam(c,x,y,w,11,seed);
}
function drawing(c,x,y,seed) {
  c.save();c.translate(x,y);c.rotate((hash(seed,1)-.5)*.14);
  poly(c,[-22,-25,23,-25,24,27,-24,26], '#d2c8a5',P.ink,.8);
  box(c,-6,-29,12,7,'#bca779',.5,null);
  // Children draw the sky they've heard described, with an overlarge sun.
  ellipse(c,10,-11,6,6,'#cf9f4d');for(let i=0;i<8;i++){const a=i*Math.PI/4;line(c,[10+Math.cos(a)*8,-11+Math.sin(a)*8,10+Math.cos(a)*11,-11+Math.sin(a)*11],'#cf9f4d',1);}
  line(c,[-18,18,-12,6,-4,17,4,7,17,18],'#6c8c78',1.6);
  const px=-10+hash(seed,5)*8;ellipse(c,px,-3,3,3,'#9f7254');line(c,[px,0,px,12,px-5,19,px,12,px+5,19],'#8b7365',1.3);line(c,[px-7,4,px,6,px+7,3],'#8b7365',1.3);
  c.restore();
}

/** School furniture and wall drawings; the blackboard text is localizable data. */
export function drawSchool(c,x,y,w,h,options={}) {
  const opts=options??{},seed=seedOf(opts.seed??9),t=finite(opts.t);
  frame(c,x,y,w,h,ctx=>{
    ctx.scale(w/800,h/360);room(ctx,seed);
    box(ctx,190,29,379,159,P.woodDark,4,P.ink,3);
    box(ctx,200,39,359,138,gradient(ctx,200,39,0,138,'#243d3a','#31413b'),1,P.woodLight,2);
    // Old chalk wipes remain behind the fresh lesson.
    for(let i=0;i<18;i++)line(ctx,[214+hash(seed,i)*250,50+hash(seed,i+30)*115,244+hash(seed,i)*260,52+hash(seed,i+30)*115],'#c4c8a014',5);
    ctx.fillStyle='#dbd8b5';ctx.font='italic 20px Georgia, serif';ctx.textAlign='left';ctx.textBaseline='alphabetic';ctx.fillText(LIFE_ART.schoolBoard,225,72);
    // Alphabet is geometry rather than a font dependency; seedling lesson below.
    line(ctx,[227,119,238,91,249,119,244,108,232,108],P.cream,2);
    line(ctx,[266,119,266,91,281,93,282,102,267,105,282,107,283,117,266,119],P.cream,2);
    ctx.beginPath();ctx.arc(310,106,14,.65,Math.PI*1.78);ctx.strokeStyle=P.cream;ctx.lineWidth=2;ctx.stroke();
    line(ctx,[228,149,325,149],'#aab7a1',1);
    for(let i=0;i<5;i++)ellipse(ctx,239+i*17,141,3,3,P.cream);
    line(ctx,[418,157,418,132,406,116,418,132,430,107],'#b3c7a2',2);
    ellipse(ctx,402,112,10,4,'#9fb793');ellipse(ctx,435,104,11,4,'#9fb793');
    ctx.beginPath();ctx.arc(503,111,22,0,Math.PI*2);ctx.strokeStyle='#d9bd7d';ctx.lineWidth=1.6;ctx.stroke();
    for(let i=0;i<10;i++){const a=i*Math.PI/5;line(ctx,[503+Math.cos(a)*27,111+Math.sin(a)*27,503+Math.cos(a)*33,111+Math.sin(a)*33],'#d9bd7d',1.5);}
    beam(ctx,194,178,369,12,seed);box(ctx,477,174,16,4,P.cream,1,null);box(ctx,504,168,25,10,'#b5a583',1,P.ink,1);
    // Three handmade displays with mismatched paper and tape.
    drawing(ctx,98,95,seed);drawing(ctx,651,88,seed+1);drawing(ctx,714,131,seed+2);
    beam(ctx,607,214,139,12,seed);book(ctx,619,214,14,54,'#a18b62');book(ctx,635,214,12,48,'#738e83',-.04);book(ctx,651,214,17,61,'#936a52',.08);
    box(ctx,699,181,22,32,P.metal,3,P.ink,1.5);
    for(let i=0;i<4;i++)line(ctx,[704+i*4,186,702+i*5,162+hash(seed,i)*7],i%2?P.woodLight:P.red,2.3);
    // Small desks, small benches, and a larger chair for the teacher.
    for(let row=0;row<2;row++)for(let col=0;col<3;col++){
      const bx=191+col*131+(row?22:0),by=218+row*52;
      beam(ctx,bx+9,by+10,10,36,seed+col);beam(ctx,bx+91,by+10,10,36,seed+col);
      beam(ctx,bx,by,110,12,seed+col+row);bench(ctx,bx+9,by+41,92,seed+row);
      poly(ctx,[bx+26,by-1,bx+27,by-15,bx+72,by-14,bx+75,by-1],P.cream,P.ink,.7);
      line(ctx,[bx+49,by-13,bx+50,by-2],'#a49473',.6);
      line(ctx,[bx+81,by-3,bx+91,by-11],P.rust,2);
    }
    beam(ctx,45,224,97,14,seed);beam(ctx,56,238,12,87,seed);beam(ctx,119,238,12,87,seed);
    photo(ctx,65,182,28,39);book(ctx,111,224,13,30,'#789b8b');
    // Hanging lamp: warm, modest, and visually shared with the shelter.
    line(ctx,[384,0,384,18],P.ink,2);halo(ctx,384,26,121,.13+Math.sin(t*1.7)*.009);
    poly(ctx,[362,26,372,12,396,12,406,26],P.metalDark,P.ink,1.5);
    ellipse(ctx,384,27,21,3,P.cream);
  });
}
