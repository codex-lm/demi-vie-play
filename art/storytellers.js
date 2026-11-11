import {P,hash} from './palette.js';
import {box,ellipse,line,poly,gradient,halo} from './primitives.js';

export const STORYTELLERS=Object.freeze(['veilleur','chroniqueur','implacable']);

function curve(c,points,fill,stroke=null,width=1){
  c.beginPath();c.moveTo(points[0],points[1]);for(let i=2;i<points.length;i+=6)c.bezierCurveTo(...points.slice(i,i+6));
  if(fill){c.closePath();c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.lineWidth=width;c.lineJoin='round';c.lineCap='round';c.stroke();}
}
function hand(c,x,y,color,turn=0){
  c.save();c.translate(x,y);c.rotate(turn);
  curve(c,[-9,7,-11,0,-5,-12,1,-12,9,-12,12,-5,10,4,9,12,-3,13,-9,7],color,'#46392f',1.1);
  for(let i=0;i<3;i++)line(c,[-4+i*4,-8,-5+i*4,1],'#9b7454',.8);c.restore();
}
function face(c,kind){
  const elder=kind==='veilleur',woman=kind==='chroniqueur',hard=kind==='implacable';
  const skin=elder?'#c5a57b':woman?'#bc906b':'#9d896d',dark=elder?'#80634a':woman?'#79513b':'#564f44';
  // Neck and ears are separate shapes so the light wraps the head, not a flat mask.
  poly(c,[103,122,134,120,141,153,122,169,99,149],skin,'#393731',1.5);
  poly(c,[103,126,135,123,136,140,119,151,104,143],dark,null);
  ellipse(c,88,94,7,13,skin,'#393731',1.4);ellipse(c,149,93,6,12,dark,'#393731',1.2);
  curve(c,[88,72,86,44,132,36,147,64,153,83,149,110,139,127,129,144,109,143,98,127,89,113,85,90,88,72],skin,'#393731',1.7);
  c.save();
  curve(c,[88,72,86,44,132,36,147,64,153,83,149,110,139,127,129,144,109,143,98,127,89,113,85,90,88,72],skin);c.clip();
  c.fillStyle=gradient(c,90,65,65,35,'rgba(255,224,166,.27)','rgba(38,40,36,.43)');c.fillRect(78,40,86,110);
  poly(c,[135,71,151,63,151,123,130,139,140,113],hard?'rgba(34,43,39,.24)':'rgba(89,53,36,.12)',null);c.restore();
  const eyes=elder?96:woman?90:93;
  for(const [ex,w]of [[106,7.5],[133,6.2]]){
    ellipse(c,ex,eyes+5,w,2.9,'rgba(77,53,38,.18)');
    curve(c,[ex-w,eyes,ex-2,eyes-3,ex+4,eyes-3,ex+w,eyes],null,dark,1.7);
    if(!elder)ellipse(c,ex+1,eyes+1,2.2,2.5,'#303a33');else ellipse(c,ex+1,eyes+1,1.6,1.6,'#3c4036');
    line(c,[ex-w,eyes-7,ex+1,eyes-9+(hard?4:0),ex+w,eyes-7],elder?'#d0c3a0':woman?'#4c3830':'#3e4038',elder?3.9:2.8);
  }
  curve(c,[120,89,118,97,116,104,118,108,120,112,125,111,127,109],null,dark,1.3);
  line(c,[121,106,126,107],'#e1bf8b',1);
  if(hard){line(c,[110,122,128,122],dark,1.7);line(c,[130,98,136,110],'#b8a18a',1.2);line(c,[135,99,140,107],'#67574b',.9);}
  else curve(c,[109,120,114,elder?126:123,124,elder?127:124,130,119],null,woman?'#875747':'#8b6c4c',1.7);
  if(woman){curve(c,[109,121,117,120,124,120,130,119],null,'#c39278',.8);ellipse(c,91,108,2.4,3.3,'#d5b77d','#6b5c45',.8);}
  if(elder){
    for(const p of [[98,101,93,104],[99,105,95,107],[140,101,144,104],[141,105,144,107],[104,78,115,76,132,78],[106,82,116,80,131,82]])line(c,p,'#91785b',.9);
    // Open sideburns and broad white beard, with a real smile showing above it.
    curve(c,[91,99,93,111,99,117,107,120,108,130,130,133,136,118,142,114,146,107,148,100,149,130,139,149,121,154,104,151,91,131,91,99],'#c6c1a5','#55584c',1);
    curve(c,[105,119,109,112,117,115,120,119,124,114,132,113,137,117,133,122,126,122,121,121,115,123,109,122,105,119],'#e0d5b4',null);
    for(const [x,y]of [[100,123],[107,133],[116,138],[126,136],[136,129]])line(c,[x,y,x+2,y+9],'#e0d3ac',1.1);
    // Bald crown and swept silver hair.
    curve(c,[87,89,74,61,93,41,113,44,102,48,96,56,95,72,92,77,92,83,87,89],'#aaa991','#434a42',1.2);
    curve(c,[135,47,156,54,158,75,148,91,146,79,147,63,135,47],'#b4af93','#434a42',1.1);
    line(c,[91,57,85,71,88,81],'#d6c8a6',1.3);line(c,[147,60,152,72,149,82],'#d6c8a6',1.1);
  }else if(woman){
    curve(c,[85,100,71,62,80,30,116,32,148,26,165,53,151,91,147,78,143,60,128,54,115,67,100,71,91,68,86,79,91,90,85,100],'#48352e','#2b302d',1.8);
    curve(c,[86,60,94,41,110,40,128,42],null,'#826447',3);
    curve(c,[95,59,110,55,118,43,133,44],null,'#6c4b35',2);
    curve(c,[141,51,152,65,149,75,147,83],null,'#856345',1.8);
  }
}

/** Hand-drawn story selector portraits. No font, image, canvas or DOM dependency. */
export function drawStorytellerPortrait(c,id,x,y,size){
  if(!c||![x,y,size].every(Number.isFinite)||size<=0)return;
  if(!STORYTELLERS.includes(id))id='chroniqueur';
  const elder=id==='veilleur',woman=id==='chroniqueur';
  const ink='#252d2a',coat=elder?'#686950':woman?'#506965':'#46504a',light=elder?'#939074':woman?'#7b9690':'#6d7668';
  c.save();c.setLineDash([]);c.translate(x,y);c.scale(size/240,size/240);c.beginPath();c.roundRect(0,0,240,240,9);c.clip();
  c.fillStyle=gradient(c,0,0,240,240,elder?'#645945':woman?'#3d5754':'#49514b','#1e2c2b');c.fillRect(0,0,240,240);
  // Rounded masonry niche and air-worn frame keep all three in the same world.
  curve(c,[22,239,22,180,22,104,22,87,22,8,216,8,216,87,216,117,216,194,216,239],null,'#77816a',1.4);
  curve(c,[29,239,29,172,29,108,29,87,29,17,209,17,209,87,209,126,209,194,209,239],null,'rgba(175,169,131,.20)',1);
  for(let row=0;row<4;row++)line(c,[14,70+row*38,43,70+row*38],'rgba(190,178,132,.11)',.9);
  for(let i=0;i<80;i++){const px=hash(i,321)*240,py=hash(i,322)*240;line(c,[px,py,px+hash(i,8)*3,py+.5],'rgba(219,202,153,.10)',.7);}
  halo(c,elder?167:65,elder?181:66,elder?135:107,elder?.24:.12);
  ellipse(c,124,243,103,19,'rgba(10,17,17,.42)');
  if(woman){
    // Hair behind the collar and a braid down her right shoulder.
    curve(c,[86,57,76,88,71,116,84,156,95,174,118,169,136,154,156,130,167,75,144,49],'#3c332e',ink,1.7);
    for(let i=0;i<7;i++)ellipse(c,151-i*.9,111+i*8,7.2,6.2,i%2?'#71523b':'#574131',ink,.8);
    line(c,[144,163,141,174],'#a89263',3);
  }
  // Clothing is asymmetric and heavy, including seams and worn elbows.
  curve(c,[31,243,34,205,42,165,69,153,83,148,94,143,106,141,123,161,132,148,143,142,169,151,185,155,199,180,209,205,214,223,220,243],gradient(c,50,148,150,80,light,coat),ink,2);
  poly(c,[103,140,118,157,106,181,83,152],elder?'#9c9780':woman?'#8eaaa0':'#596459',ink,1.2);
  poly(c,[136,140,123,158,136,179,159,151],coat,ink,1.2);
  line(c,[120,166,116,239],elder?'#454c3f':woman?'#2e4b47':'#333e37',2);
  for(let py=183;py<230;py+=17)ellipse(c,122,py,1.7,1.9,'#b4ae86',ink,.6);
  line(c,[67,168,56,198,50,220],light,1.5);line(c,[175,169,187,195],light,1.4);
  if(!elder&&!woman){
    poly(c,[66,155,82,152,133,240,113,240],'#5a503e',ink,1.3);line(c,[72,159,122,238],'#9b8860',1);
    box(c,67,174,31,36,'#455047',2,ink,1.4);line(c,[70,183,94,183],'#89917a',1.1);
    box(c,159,175,26,27,'#303f37',2,ink,1.3);line(c,[166,179,176,179],'#86917d',1.4);
  }
  face(c,id);
  if(elder){
    // A wool scarf frames the beard; the lamp is sheltered by his hand.
    poly(c,[91,138,105,154,121,159,142,144,148,153,128,172,102,165,87,146],'#ab9c77',ink,1.4);
    poly(c,[105,164,123,170,117,210,103,204],'#8d805e',ink,1);line(c,[111,176,109,199],'#c5b48a',1.2);
    curve(c,[55,187,58,202,75,213,95,218,110,221,119,216,127,207],null,coat,18);
    curve(c,[61,190,64,202,79,209,96,212],null,light,2);hand(c,126,208,'#c2a078',-.65);
    // Ring, soot-black cap, cage and amber pane remain legible at 64 px.
    c.beginPath();c.arc(176,151,11,Math.PI,0);c.strokeStyle='#c8b88d';c.lineWidth=2.4;c.stroke();
    poly(c,[161,164,190,164,197,218,156,218],'#393f32',ink,2);
    poly(c,[166,172,187,172,190,211,163,211],gradient(c,0,172,0,39,'#f5cb77','#d99040'),'#e4c18a',1);
    halo(c,177,192,42,.22);
    curve(c,[176,203,164,196,178,189,176,181,188,191,185,202,176,203],'#fff0b1',null);
    line(c,[159,165,192,165],'#b7a87e',3);line(c,[157,219,197,219],'#9b9476',4);
    line(c,[168,167,165,214],'#5d5b42',2.8);line(c,[185,168,188,214],'#5d5b42',2.8);
    hand(c,169,155,'#c4a67b',.7);line(c,[163,151,170,153],'#dec499',1.5);
  }else if(woman){
    // She supports an open notebook, the pencil paused above a line.
    poly(c,[76,181,119,176,151,189,149,233,115,222,73,229],'#493c2e',ink,2);
    poly(c,[80,184,116,180,118,219,77,225],'#d4c6a0','#9c8c67',1);
    poly(c,[120,180,147,191,145,229,121,219],'#bcae87','#8b7c5a',1);
    for(let i=0;i<6;i++){line(c,[85,191+i*4.3,109,188+i*4.3],'#9a8d6e',.7);line(c,[126,190+i*4.2,140,195+i*4.2],'#8a7b5d',.65);}
    line(c,[119,180,119,220],'#6e6048',1.4);poly(c,[137,222,141,223,140,237,137,234],'#a65e47',null);
    hand(c,77,214,'#bc916b',-.8);hand(c,155,194,'#bd9671',-.4);
    line(c,[151,195,134,176],'#cfb87d',3);line(c,[134,176,131,172],'#302e25',1.7);
    curve(c,[160,210,174,215,179,201,184,192],null,coat,17);line(c,[163,211,171,209,176,202],light,1.4);
  }else{
    // Gas mask lifted onto the brow: bare eyes and mouth must remain visible.
    poly(c,[88,68,94,39,112,26,140,32,153,56,145,73,117,68],'#3a4840',ink,2);
    poly(c,[96,40,113,32,136,37,145,54,135,64,107,59],'#5e6d5c','#92977d',1.3);
    ellipse(c,108,45,10,8,'#253e3d','#a4aa88',2);ellipse(c,132,48,9,8,'#253e3d','#a4aa88',2);
    line(c,[102,43,109,40],'#839a83',1.5);line(c,[128,47,134,44],'#839a83',1.4);
    ellipse(c,118,65,10,8,'#5d6654',ink,1.6);for(let i=0;i<4;i++)line(c,[112+i*3,61,112+i*3,68],'#252e29',1.1);
    ellipse(c,148,69,9,12,'#5e624c',ink,1.7);line(c,[145,62,151,63],light,1);line(c,[145,67,153,68],light,1);line(c,[145,73,151,74],light,1);
    line(c,[89,66,86,90],'#262f29',4);line(c,[150,76,151,90],'#262f29',3);
    poly(c,[98,141,118,151,141,141,148,155,127,175,100,165],'#4e5544',ink,1.5);
    line(c,[101,152,119,158,137,150],'#77806a',1.3);
    curve(c,[54,196,73,212,107,220,145,221],null,'#343f38',20);
    curve(c,[185,198,172,214,144,221,115,222],null,'#4d594a',21);
    line(c,[58,196,84,212,109,218],'#8b8d72',1.4);hand(c,111,220,'#9d8b6d',-1.4);
    line(c,[177,200,159,213,137,216],'#889176',1.2);
  }
  // A modest patina, not a vignette hiding the face.
  const shade=c.createLinearGradient(0,190,0,240);shade.addColorStop(0,'rgba(14,22,22,0)');shade.addColorStop(1,'rgba(14,22,22,.31)');c.fillStyle=shade;c.fillRect(0,190,240,50);
  c.beginPath();c.roundRect(1,1,238,238,8);c.strokeStyle='#96967b';c.lineWidth=1.4;c.stroke();
  line(c,[10,31,10,10,33,10],'#b6ad87',1.1);line(c,[207,230,230,230,230,208],'#b6ad87',1.1);
  c.restore();
}
