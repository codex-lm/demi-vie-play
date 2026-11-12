import { P, TAU, clamp, hash } from './palette.js';
import { box, ellipse, gradient, line, poly } from './primitives.js';
import { STRUCTURE_IDS, WEATHER_IDS } from './data/world-catalog.js';

// Cached scenery is independent of animation time. A half-month colour step is
// imperceptible in play, while preventing one new landscape for every game tick.
const cache=new Map(),MAX_ENTRIES=16,MAX_PIXELS=20_000_000;
let cachedPixels=0,cacheHits=0,cacheMisses=0;
const copper='#b18c65',brass='#c4ac76',steel='#83988d',deep='#35494d';
const finite=(value,fallback)=>Number.isFinite(value)?value:fallback;
const mod=(v,n)=>((v%n)+n)%n;
const blend=(a,b,p)=>a.map((v,i)=>Math.round(v+(b[i]-v)*p));
const rgb=(a)=>`rgb(${a.join(',')})`;
const rgba=(a,alpha)=>`rgba(${a.join(',')},${alpha})`;
export const SEASONS=Object.freeze(['spring','summer','autumn','winter']);
const seasonIndex=value=>typeof value==='string'?(SEASONS.indexOf(value)<0?3:SEASONS.indexOf(value)):mod(Math.floor(finite(value,3)),4);

/** Snow coverage 0..0.85 for the surface, from the real surface temperature (°C):
 * nothing settles above +0.5 °C, the whitening climbs to 0.85 at −5 °C and below.
 * A missing temperature keeps the legacy season-and-recovery cover. */
export function snowCover(temperature,years,season){
  if(Number.isFinite(temperature)){
    if(temperature>=.5)return 0;
    return .85*clamp((.5-temperature)/5.5);
  }
  const index=seasonIndex(season),recovery=clamp(finite(years,0),0,5);
  return index===3?.85:clamp((1.7-recovery)/1.7)*(index===0?.42:index===1?.12:.23);
}

function colors(years,season){
  const early=clamp(years/1.7),late=clamp((years-1.7)/3.3);
  let skyTop=years<=1.7?blend([98,101,97],[124,133,132],early):blend([124,133,132],[139,176,195],late);
  let skyBottom=years<=1.7?blend([158,159,148],[179,184,166],early):blend([179,184,166],[218,221,191],late);
  const green=clamp((years-1.4)/3.6);
  if(season===3){skyTop=blend(skyTop,[114,135,148],.55);skyBottom=blend(skyBottom,[205,214,205],.50);}
  if(season===2){skyTop=blend(skyTop,[65,79,88],.68);skyBottom=blend(skyBottom,[157,160,143],.45);}
  if(season===1){skyTop=blend(skyTop,[140,177,191],green*.22);skyBottom=blend(skyBottom,[239,216,161],green*.72);}
  const grass=season===2?[163,108,64]:season===3?[127,137,111]:season===0?[115,145,100]:[108,135,91];
  return {skyTop,skyBottom,far:blend([136,137,119],[149,170,161],late),mid:blend([104,113,100],[111,139,132],late),near:blend([76,87,78],[80,111,103],late),
    soil:blend([85,82,66],[91,99,74],green),grass,green,snow:snowCover(NaN,years,season)};
}
function makeCanvas(w,h){
  if(typeof OffscreenCanvas==='function')return new OffscreenCanvas(w,h);
  if(typeof document!=='undefined'&&document.createElement){const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;return canvas;}
  return null;
}
export function clearSurfaceCache(){cache.clear();cachedPixels=0;cacheHits=0;cacheMisses=0;}
export function surfaceCacheInfo(){return {entries:cache.size,pixels:cachedPixels,hits:cacheHits,misses:cacheMisses,maxEntries:MAX_ENTRIES,maxPixels:MAX_PIXELS};}
function cachedScene(w,h,cell,horizon,years,season,seed,skyColors,snow=null){
  // Keep a wide monitor's fully zoomed panorama resident, including the
  // rounding to whole canvas pixels. Weather and hotspots stay full resolution.
  if(Math.ceil(w)*Math.ceil(h)>MAX_PIXELS){
    const scale=Math.sqrt(MAX_PIXELS/(w*h));
    w=Math.max(1,Math.floor(w*scale));h=Math.max(1,Math.floor(h*scale));cell*=scale;horizon*=scale;
  }
  // Thermal snow is quantised to twentieths by the caller, so a slowly drifting
  // thermometer reuses one landscape instead of rebuilding one every tick.
  const key=[w,h,cell,horizon,years,season,seed,JSON.stringify(skyColors),snow===null?'season':snow].join(':');
  if(cache.has(key)){const item=cache.get(key);cache.delete(key);cache.set(key,item);cacheHits++;return item.canvas;}
  cacheMisses++;const canvas=makeCanvas(Math.ceil(w),Math.ceil(h));if(!canvas)return null;
  const c=canvas.getContext('2d');if(!c)return null;
  paintLandscape(c,w,h,cell,horizon,years,season,seed,skyColors,snow);
  const pixels=canvas.width*canvas.height;
  if(pixels<=MAX_PIXELS){
    while(cache.size&&(cache.size>=MAX_ENTRIES||cachedPixels+pixels>MAX_PIXELS)){
      const first=cache.keys().next().value;cachedPixels-=cache.get(first).pixels;cache.delete(first);
    }
    cache.set(key,{canvas,pixels});cachedPixels+=pixels;
  }
  return canvas;
}

function cloud(c,x,y,w,h,color,alpha){
  c.save();c.globalAlpha*=alpha;
  ellipse(c,x,y,w*.53,h*.26,color);
  ellipse(c,x-w*.22,y-h*.12,w*.30,h*.37,color);
  ellipse(c,x+w*.16,y-h*.19,w*.25,h*.41,color);
  ellipse(c,x+w*.38,y,w*.22,h*.22,color);c.restore();
}
function skyline(c,w,horizon,cell,seed,layer,color,snow){
  const base=horizon-(layer===0?1.25:layer===1?.66:.12)*cell;
  const count=Math.max(5,Math.ceil(w/(cell*(layer===0?3.3:layer===1?4.5:6.6))));
  const span=w/count,outline=rgb(blend(color,[38,55,55],.18));
  for(let i=-1;i<=count;i++){
    const random=(salt)=>hash(seed+i*137,31+layer*53+salt);
    const x=i*span+(random(1)-.4)*span*.32;
    const bw=span*(.65+random(2)*.46),bh=cell*((layer===0?1.0:layer===1?1.25:1.05)+random(3)*(layer===0?2.7:layer===1?3.8:3.2));
    const y=base-bh,kind=Math.floor(random(4)*6);
    c.fillStyle=rgb(color);c.strokeStyle=outline;c.lineWidth=Math.max(.4,cell*.018);
    if(kind===0){
      // A roof missing half its tiles, with a remaining chimney.
      poly(c,[x,base,x,y+bh*.30,x+bw*.30,y,x+bw*.52,y+bh*.18,x+bw*.61,y+bh*.12,x+bw*.72,y+bh*.27,x+bw,base-bh*.65,x+bw,base],rgb(color),null);
      c.fillRect(x+bw*.14,y-bh*.09,bw*.12,bh*.42);
      if(layer>0)line(c,[x-bw*.035,y+bh*.32,x+bw*.30,y,x+bw*.52,y+bh*.18],rgb(blend(color,[218,213,177],.24)),cell*.022);
    }else if(kind===1){
      // The broken roofline is part of the silhouette, never a transparent cut.
      poly(c,[x,base,x,y+bh*.14,x+bw*.18,y+bh*.15,x+bw*.28,y,x+bw*.35,y+bh*.04,x+bw*.43,y+bh*.29,x+bw*.58,y+bh*.23,x+bw*.62,y+bh*.46,x+bw*.83,y+bh*.37,x+bw,base-bh*.47,x+bw,base],rgb(color),null);
      if(layer>0){
        line(c,[x+bw*.33,y+bh*.05,x+bw*.33,y-bh*.15],outline,cell*.025);
        line(c,[x+bw*.54,y+bh*.25,x+bw*.64,y+bh*.10],outline,cell*.025);
      }
    }else if(kind===2){
      const roof=y+bh*.20;
      c.beginPath();c.moveTo(x,base);c.lineTo(x,roof);
      for(let k=0;k<3;k++){c.lineTo(x+bw*(k+.63)/3,roof-bh*.23);c.lineTo(x+bw*(k+.67)/3,roof);}
      c.lineTo(x+bw,roof);c.lineTo(x+bw,base);c.closePath();c.fill();
      c.fillRect(x+bw*.73,y-bh*.35,bw*.10,bh*.69);
      line(c,[x+bw*.71,y-bh*.35,x+bw*.85,y-bh*.35],outline,cell*.045);
    }else if(kind===3&&layer===0){
      // A water tower, distant and delicate between the blocks.
      for(const side of [.25,.74])line(c,[x+bw*side,base,x+bw*(side*.7+.15),y+bh*.32],rgb(color),cell*.065);
      line(c,[x+bw*.29,base-bh*.20,x+bw*.68,y+bh*.43,x+bw*.34,y+bh*.44,x+bw*.73,base-bh*.20],rgb(color),cell*.04);
      box(c,x+bw*.14,y,bw*.72,bh*.35,rgb(color),cell*.11,null);
      ellipse(c,x+bw*.50,y,bw*.36,cell*.10,rgb(color));
    }else{
      const notch=kind===4?.22:.08;
      poly(c,[x,base,x,y,x+bw*.36,y,x+bw*.43,y+bh*notch,x+bw*.70,y+bh*notch*.8,x+bw*.83,y+bh*.04,x+bw,y+bh*.09,x+bw,base],rgb(color),null);
      if(layer>0){
        c.fillStyle=rgb(blend(color,[202,204,172],.15));c.fillRect(x,y,bw*.08,bh);
        for(let k=1;k<Math.floor(bh/cell);k++)line(c,[x,y+k*cell,x+bw,y+k*cell],rgb(blend(color,[212,214,183],.12)),cell*.023);
      }
    }
    if(layer>0&&kind!==3){
      // Empty windows retain dark reveals and a pale lower sill at close scale.
      const cols=Math.max(1,Math.floor(bw/(cell*.58))),rows=Math.max(1,Math.floor(bh/(cell*.66)));
      for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){
        if(random(20+row*9+col)>.72)continue;
        const wx=x+bw*(col+.22)/cols,wy=base-(row+.8)*cell*.57;
        if(wy<y+bh*.48)continue;
        const ww=Math.min(cell*.25,bw/cols*.5),hh=cell*.27;
        c.fillStyle=rgba(blend(color,[28,44,46],.44),layer===1?.65:.9);c.fillRect(wx,wy,ww,hh);
        if(layer===2)line(c,[wx,wy+hh,wx+ww,wy+hh],rgb(blend(color,[190,192,155],.22)),cell*.015);
      }
      if(random(9)>.55){const fx=x+bw*.64,fy=base-bh*.44;line(c,[fx,fy,fx-bw*.09,fy+bh*.17,fx-bw*.03,base],outline,cell*.022);}
    }
    if(snow>.15&&kind!==3){
      const length=bw*(.30+random(11)*.20);
      line(c,[x+cell*.03,y+bh*(kind===0?.32:kind===1?.15:kind===2?.20:0),x+length,y+bh*(kind===0?.12:kind===1?.16:kind===2?.20:0)],rgba([226,232,220],snow*(layer===2?.95:.70)),cell*(.04+.12*snow));
      if(layer===2&&snow>.65)for(let j=0;j<2;j++){
        const ix=x+length*(.23+j*.49),iy=y+bh*(kind===0?.29-j*.08:kind===1?.15:kind===2?.20:0);
        line(c,[ix,iy,ix,iy+cell*(.12+random(80+j)*.17)],'rgba(199,220,216,.7)',cell*.025);
      }
    }
    if(layer===2&&random(13)>.48){
      // A fallen beam and a few masonry pieces at the foot of the nearest ruin.
      line(c,[x+bw*.12,base,x+bw*.78,base-cell*.16],rgb(blend(color,[40,45,38],.26)),cell*.09);
      for(let j=0;j<4;j++){const rx=x+bw*random(j+30);poly(c,[rx,base,rx+cell*.12,base-cell*.17,rx+cell*.38,base-cell*.10,rx+cell*.45,base],rgb(blend(color,[150,145,114],.23)),null);}
    }
  }
}
function bareTree(c,x,y,size,color,leaves=0,leafColor=P.green,seed=1){
  c.save();c.translate(x,y);c.scale(size,size);
  line(c,[0,0,-.08,-.78,.035,-1.56,-.04,-2.18],color,.07);
  const branches=[[-.05,-.65,-.42,-1.03,-.61,-1.52],[-.04,-1.12,.40,-1.40,.49,-1.92],[0,-1.45,-.32,-1.80,-.35,-2.10]];
  for(const b of branches)line(c,b,color,.038);
  line(c,[.29,-1.36,.60,-1.56],color,.022);line(c,[-.39,-1.0,-.60,-1.15],color,.024);
  if(leaves>0)for(let i=0;i<14;i++){
    if(hash(seed,i)>leaves)continue;
    const x=(hash(seed,i+20)-.5)*1.1,y=-1.15-hash(seed,i+40)*.95;
    ellipse(c,x,y,.10+hash(seed,i+60)*.09,.06+hash(seed,i+80)*.06,leafColor);
  }
  c.restore();
}
function paintLandscape(c,w,h,cell,horizon,years,season,seed,skyColors,snow=null){
  const p=colors(years,season);
  if(snow!==null)p.snow=snow;
  if(skyColors?.top?.length===3&&skyColors?.bottom?.length===3){p.skyTop=skyColors.top;p.skyBottom=skyColors.bottom;}
  const sky=gradient(c,0,0,0,horizon,rgb(p.skyTop),rgb(p.skyBottom));c.fillStyle=sky;c.fillRect(0,0,w,h);
  const sunX=w*(.68+hash(seed,6)*.12),sunY=horizon*.25,sunR=cell*(.55+clamp(years/5)*.25);
  const glow=c.createRadialGradient(sunX,sunY,sunR*.2,sunX,sunY,sunR*4);
  const sunshine=(season===2?.27:season===3?.65:1)*(.22+years*.035);
  glow.addColorStop(0,rgba([244,227,179],sunshine));glow.addColorStop(1,'rgba(244,227,179,0)');ellipse(c,sunX,sunY,sunR*4,sunR*4,glow);
  ellipse(c,sunX,sunY,sunR,sunR,rgba([242,229,189],sunshine));
  // Broad washes read as overcast banks, rather than a row of cartoon clouds.
  const cloudCount=Math.max(3,Math.ceil(w/(cell*11)));
  for(let i=0;i<cloudCount;i++){
    const x=(i+.3)*w/cloudCount,y=horizon*(.13+hash(seed,i+7)*.30);
    cloud(c,x,y,cell*(6+hash(seed,i+17)*5),cell*(.65+hash(seed,i+27)*.55),rgb(blend(p.skyTop,[215,215,190],.35)),.16+(1-years/5)*.12);
  }
  if(season===2)for(let i=0;i<cloudCount+2;i++){
    const x=(i-.1)*w/(cloudCount+1),y=horizon*(.13+hash(seed,i+907)*.13);
    cloud(c,x,y,cell*(10+hash(seed,i+917)*6),cell*(1.4+hash(seed,i+927)),rgb(blend(p.skyTop,[39,52,62],.35)),.32);
  }
  for(let layer=0;layer<2;layer++){
    const base=horizon-cell*(layer===0?2.8:1.85),hillColor=blend(p.far,p.skyBottom,layer===0?.60:.32);
    c.beginPath();c.moveTo(0,horizon);
    for(let x=-cell;x<=w+cell;x+=cell)c.lineTo(x,base+Math.sin(x/(cell*10)+layer+seed*.04)*cell*.38+Math.sin(x/(cell*3.8)+layer)*cell*.14);
    c.lineTo(w,horizon);c.closePath();c.fillStyle=rgb(hillColor);c.fill();
  }
  skyline(c,w,horizon,cell,seed,0,p.far,p.snow);
  const haze=gradient(c,0,horizon-cell*3,0,cell*3,'rgba(200,204,182,0)',rgba(p.skyBottom,.35));c.fillStyle=haze;c.fillRect(0,horizon-cell*3,w,cell*3);
  skyline(c,w,horizon,cell,seed,1,p.mid,p.snow);
  skyline(c,w,horizon,cell,seed,2,p.near,p.snow);
  if(season===1&&p.green>0){
    const warmth=gradient(c,0,horizon-cell*3,0,cell*3,'rgba(239,196,124,0)',rgba([239,196,124],p.green*.13));
    c.fillStyle=warmth;c.fillRect(0,horizon-cell*3,w,cell*3);
  }
  // Dead trees survive the first winter; their branches gradually carry leaves.
  for(let i=0;i<Math.max(2,Math.floor(w/(cell*25)));i++){
    const x=w*(.10+i*.73)+cell*(hash(seed,i+91)-.5)*2;
    bareTree(c,x,horizon-cell*.04,cell*(.60+hash(seed,i+93)*.28),rgb(blend(p.near,[38,50,44],.24)),season===3?0:p.green*.55,rgb(p.grass),seed+i);
  }
  const groundY=x=>horizon+Math.sin(x/(cell*3.7))*cell*.06+Math.sin(x/(cell*1.13)+1)*cell*.035;
  c.beginPath();c.moveTo(0,h);c.lineTo(0,groundY(0));
  for(let x=0;x<=w+cell*.25;x+=cell*.25)c.lineTo(x,groundY(x));c.lineTo(w,h);c.closePath();
  c.fillStyle=gradient(c,0,horizon,0,Math.max(cell,h-horizon),rgb(p.soil),rgb(blend(p.soil,[38,45,41],.44)));c.fill();
  const groundPoints=[];for(let x=0;x<=w;x+=cell*.35)groundPoints.push(x,groundY(x)+cell*.04);
  line(c,groundPoints,rgb(blend(p.soil,[186,180,139],.38)),cell*.075);
  for(let i=0;i<Math.floor(w/(cell*.47));i++){
    const x=hash(seed,i+120)*w,y=groundY(x)+cell*(.18+hash(seed,i+150)*1.2),r=cell*(.02+hash(seed,i+170)*.07);
    ellipse(c,x,y,r*1.7,r,rgba(blend(p.soil,[158,153,118],.38),.52));
    if(i%5===0)line(c,[x,y,x+cell*.22,y+cell*.02],rgba([31,41,35],.26),cell*.018);
  }
  // A hairline of snow settles on the lip, with broken drifts among the stones.
  if(p.snow>0){
    const snowPoints=[];for(let x=0;x<=w;x+=cell*.25)snowPoints.push(x,groundY(x)-cell*.015);
    line(c,snowPoints,rgba([225,232,223],p.snow),cell*(.04+p.snow*.28));
    for(let i=0;i<Math.ceil(w/(cell*2));i++){
      const x=hash(seed,i+201)*w,y=groundY(x)+cell*(.02+hash(seed,i+210)*.27);
      ellipse(c,x,y,cell*(.30+hash(seed,i+217)*.85),cell*(.045+p.snow*.09),rgba([224,231,221],p.snow*.9));
    }
  }
  // Melt pools remain grey in year one; the first green shoots arrive with recovery.
  if(season===0)for(let i=0;i<Math.max(3,Math.ceil(w/(cell*6)));i++){
    const x=(i+.3+hash(seed,i+1201)*.4)*w/Math.ceil(w/(cell*6)),y=groundY(x)+cell*.18;
    const rx=cell*(.48+hash(seed,i+1211)*.70),ry=cell*.09;
    ellipse(c,x,y+cell*.025,rx*1.07,ry*1.24,'#424e4a');
    ellipse(c,x,y,rx,ry,rgb(blend(p.skyBottom,[79,117,117],.55)));
    line(c,[x-rx*.68,y-cell*.015,x+rx*.48,y-cell*.025],'rgba(208,224,213,.72)',cell*.025);
    if(p.green>.05)for(const side of [-1,1]){
      const sx=x+side*rx*.85,sy=y-cell*.04;
      line(c,[sx,sy,sx+side*cell*.06,sy-cell*(.15+p.green*.13)],rgb(p.grass),cell*.03);
      ellipse(c,sx+side*cell*.06,sy-cell*.17,cell*.08,cell*.035,rgb(blend(p.grass,[185,195,122],.3)));
    }
  }
  // Fine blades and a few broad leaves are enough to make the later years hopeful.
  const vegetation=p.green*(season===3?.08:season===2?.60:season===0?.68:1);
  if(vegetation>0)for(let i=0;i<Math.ceil(w/(cell*.46));i++){
    if(hash(seed,i+230)>vegetation)continue;
    const x=hash(seed,i+240)*w,y=groundY(x),height=cell*(.08+hash(seed,i+250)*.23)*(.4+vegetation*.6)*(season===1?2.8:1);
    const color=rgb(blend(p.grass,[181,177,112],hash(seed,i+270)*.28));
    line(c,[x-cell*.05,y,x-cell*.09,y-height*.65,x,y,x+cell*.035,y-height,x+cell*.08,y-height*.30],color,cell*.018);
    if(i%7===0&&vegetation>.45){ellipse(c,x+cell*.07,y-height*.72,cell*.08,cell*.026,color);ellipse(c,x-cell*.06,y-height*.43,cell*.07,cell*.026,color);}
    if(season===1&&i%4===0&&vegetation>.4){line(c,[x+cell*.035,y-height,x+cell*.06,y-height-cell*.13],'#c2b27b',cell*.035);}
  }
  if(season===2&&p.green>0)for(let i=0;i<Math.ceil(w/cell*1.3*p.green);i++){
    const x=hash(seed,i+1701)*w,y=groundY(x)+cell*(.07+hash(seed,i+1711)*.3),size=cell*(.045+hash(seed,i+1721)*.035);
    c.save();c.translate(x,y);c.rotate(hash(seed,i+1731)*TAU);
    poly(c,[-size,0,-size*.4,-size*.52,size,0,size*.3,size*.6],i%3===0?'#b57f4b':i%3===1?'#8d6043':'#c09b66',null);
    line(c,[-size*.65,0,size*.65,0],'#69533a',cell*.012);c.restore();
  }
  // The very first saplings are sparse and never obscure the surface buildings.
  if(p.green>.25&&season!==3)for(let i=0;i<Math.max(1,Math.floor(w/(cell*22)));i++){
    const x=w*(.27+i*.41)+cell*hash(seed,i+315);
    bareTree(c,x,groundY(x),cell*(.18+p.green*.19),rgb(blend(p.soil,[53,71,48],.4)),p.green,rgb(p.grass),seed+330+i);
  }
  // Slight paper grain, generated once, ties flat silhouettes to the soft art.
  for(let i=0;i<Math.min(1100,Math.floor(w*h/180));i++){
    c.fillStyle=i%3?'rgba(244,237,207,.035)':'rgba(30,42,43,.025)';c.fillRect(hash(seed,i+410)*w,hash(seed,i+510)*h,.7+hash(seed,i+610)*1.1,.6);
  }
}

function weather(c,w,h,cell,horizon,years,kind,t,seed){
  if(kind==='blackRain'){
    c.fillStyle='rgba(25,38,42,.29)';c.fillRect(0,0,w,h);
    c.strokeStyle='rgba(37,52,55,.66)';c.lineWidth=Math.max(.6,cell*.026);c.lineCap='round';c.beginPath();
    const count=Math.min(170,Math.max(28,Math.ceil(w/cell*2.4)));
    for(let i=0;i<count;i++){
      const x=mod(hash(seed,i+20)*w-t*cell*.85,w+cell)-cell*.5;
      const y=mod(hash(seed,i+230)*(horizon+cell)+t*cell*(6.0+hash(seed,i+36)*2.0),horizon+cell)-cell;
      c.moveTo(x,y);c.lineTo(x-cell*.12,y+cell*.62);
    }c.stroke();
    c.strokeStyle='rgba(191,200,184,.35)';c.lineWidth=Math.max(.5,cell*.018);c.beginPath();
    for(let i=0;i<Math.min(24,Math.ceil(w/(cell*2)));i++){
      const q=mod(t*1.7+hash(seed,i+55),1);if(q>.48)continue;
      const x=hash(seed,i+71)*w,y=horizon+cell*(.08+hash(seed,i+85)*.15),r=cell*(.03+q*.20);
      c.moveTo(x-r,y);c.lineTo(x,y-r*.35);c.lineTo(x+r,y);
    }c.stroke();
  }else if(kind==='dustStorm'){
    const dust=gradient(c,0,0,0,h,'rgba(151,125,86,.29)','rgba(133,107,67,.56)');c.fillStyle=dust;c.fillRect(0,0,w,h);
    c.strokeStyle='rgba(222,196,146,.30)';c.lineWidth=Math.max(.6,cell*.025);c.lineCap='round';c.beginPath();
    for(let i=0;i<Math.min(125,Math.ceil(w/cell*1.9));i++){
      const x=mod(hash(seed,i+39)*w+t*cell*(5+hash(seed,i+40)*3),w+cell*3)-cell*1.5;
      const y=hash(seed,i+70)*(horizon+cell*.5)+Math.sin(t*1.2+i)*cell*.15;
      c.moveTo(x,y);c.lineTo(x+cell*(.35+hash(seed,i+81)*1.5),y-cell*.05);
    }c.stroke();
    for(let i=0;i<4;i++){
      const x=mod(t*cell*(1.3+i*.25)+hash(seed,i+901)*w,w+cell*8)-cell*4,y=horizon*(.30+i*.19);
      cloud(c,x,y,cell*8,cell*.9,'#c2ab7f',.11);
    }
  }else if(kind==='clearing'){
    const sunX=w*.74,sunY=horizon*.19;
    c.save();c.globalAlpha*=.09+.025*Math.sin(t*.35);
    for(let i=0;i<3;i++)poly(c,[sunX-cell*.4,sunY,sunX+cell*.4,sunY,sunX-cell*(2+i*3),horizon+cell*.6,sunX-cell*(3.0+i*3),horizon+cell*.6],'#fff0bd',null);
    c.restore();
    const glow=c.createRadialGradient(sunX,sunY,0,sunX,sunY,cell*2.8);glow.addColorStop(0,'rgba(255,238,184,.17)');glow.addColorStop(1,'rgba(255,238,184,0)');ellipse(c,sunX,sunY,cell*2.8,cell*2.8,glow);
  }
  if(years<1.9&&kind!=='blackRain'&&kind!=='dustStorm'){
    const count=Math.min(70,Math.ceil(w/cell*(1.8-years*.7)));
    c.fillStyle='rgba(223,221,199,.43)';
    for(let i=0;i<count;i++){
      const x=mod(hash(seed,i+1200)*w+t*cell*.11+Math.sin(t*.5+i)*cell*.14,w);
      const y=mod(hash(seed,i+1300)*(horizon+cell)+t*cell*(.12+hash(seed,i+1400)*.08),horizon+cell);
      const r=Math.max(.55,cell*(.012+hash(seed,i+1500)*.019));ellipse(c,x,y,r,r*.68,'rgba(226,225,205,.44)');
    }
  }
}
function hotspots(c,rect,cell,horizon,spots){
  const left=finite(rect.left,0);
  for(let i=0;i<spots.length;i++){
    const spot=spots[i],value=typeof spot==='number'?spot:finite(spot?.multiplier,finite(spot?.value,0));
    const wx=typeof spot==='number'?i:finite(spot?.x,i),x=(wx-left+.5)*cell;
    const r=clamp(value/3),width=cell*(typeof spot==='number'?1:Math.max(.2,finite(spot?.radius,1.0))*2);
    if(x+width<0||x-width>rect.w||r<=0)continue;
    if(rect.hotspotColors){
      const level=r>.65?3:r>.35?2:0;
      c.save();c.globalAlpha=.78;c.fillStyle=rect.hotspotColors[level];
      c.fillRect(x-width/2,horizon-cell*.42,width,cell*.55);
      if(level){
        c.beginPath();c.rect(x-width/2,horizon-cell*.42,width,cell*.55);c.clip();
        c.strokeStyle='#fff8ce';c.lineWidth=1;c.globalAlpha=.65;c.beginPath();
        for(let px=x-width/2-cell;px<x+width/2;px+=9){
          c.moveTo(px,horizon+cell*.13);c.lineTo(px+cell*.55,horizon-cell*.42);
          if(level===3){c.moveTo(px,horizon-cell*.42);c.lineTo(px+cell*.55,horizon+cell*.13);}
        }
        c.stroke();
      }
      c.restore();continue;
    }
    const g=c.createLinearGradient(0,horizon-cell*.5,0,horizon+cell*.13);
    g.addColorStop(0,'rgba(150,97,61,0)');g.addColorStop(1,`rgba(${Math.round(120+r*81)},${Math.round(145-r*70)},64,.32)`);
    c.fillStyle=g;c.fillRect(x-width/2,horizon-cell*.5,width,cell*.65);
  }
  if(Number.isFinite(rect.selectedX)){
    const x=(rect.selectedX-left+.5)*cell;line(c,[x,horizon-cell*.9,x-cell*.18,horizon-cell*.65,x+cell*.18,horizon-cell*.65,x,horizon-cell*.9],rect.hotspotColors?.[2]??P.amber,Math.max(1,cell*.04));
  }
}

/** Pixels in; horizon is relative to rect.y. No structures are added implicitly. */
export function drawSurface(c,rect,cellPx,opts={}){
  if(!c||!rect||!Number.isFinite(cellPx)||cellPx<=0)return;
  const x=finite(rect.x,0),y=finite(rect.y,0),w=finite(rect.w,finite(rect.width,0)),h=finite(rect.h,finite(rect.height,0));
  if(w<=0||h<=0)return;
  const cell=cellPx,years=Math.round(clamp(finite(opts.years,0),0,5)*24)/24,season=seasonIndex(opts.season);
  const horizon=clamp(finite(rect.horizon,12*cell),Math.min(h*.5,cell*2),Math.max(1,h-Math.min(cell*.7,h*.12)));
  const seed=finite(opts.seed,1)|0,t=finite(opts.t,0),kind=WEATHER_IDS.includes(opts.weather)?opts.weather:'clear';
  // With a temperature the snow follows the real climate; without one (galleries,
  // older tests) the legacy season look stays pixel-identical.
  const temperature=Number.isFinite(opts.surfaceTemperature)?opts.surfaceTemperature:null;
  const snow=temperature===null?null:Math.round(snowCover(temperature)*20)/20;
  const snowfall=temperature===null?null:clamp(-temperature/10);
  c.save();c.beginPath();c.rect(x,y,w,h);c.clip();c.translate(x,y);
  const skyColors=opts.skyColors;
  const raster=opts.landscape;
  const scene=cachedScene(raster?.width??w,raster?.height??h,raster?.cell??cell,raster?.horizon??horizon,years,season,seed,skyColors,snow);
  if(scene)c.drawImage(scene,0,0,w,h);else paintLandscape(c,w,h,cell,horizon,years,season,seed,skyColors,snow);
  weather(c,w,h,cell,horizon,years,kind,t,seed);
  seasonalMotion(c,w,horizon,cell,years,season,t,seed,snowfall);
  if((rect.showHotspots===true||opts.showHotspots===true)&&Array.isArray(opts.hotspots))hotspots(c,{...rect,w},cell,horizon,opts.hotspots);
  c.restore();
}

// Only the few airborne elements animate; the landscape still shares one cache.
// snowfall is 0..1: legacy callers get full winter flakes, thermal callers only
// see flakes below 0 °C, and more of them as the cold deepens.
function seasonalMotion(c,w,horizon,cell,years,season,t,seed,snowfall=null){
  const flakes=snowfall===null?(season===3?1:0):snowfall;
  const count=Math.min(45,Math.ceil(w/cell*.6*flakes));
  for(let i=0;i<count;i++){
    const x=mod(hash(seed,i+2001)*w+t*cell*.15+Math.sin(t*.7+i)*cell*.16,w),y=mod(hash(seed,i+2011)*horizon+t*cell*(.18+hash(seed,i+2021)*.16),horizon);
    ellipse(c,x,y,Math.max(.6,cell*.025),Math.max(.5,cell*.018),'rgba(230,237,229,.64)');
  }
  const recovery=clamp((years-1.4)/3.6);
  if(season===2&&recovery>0)for(let i=0;i<Math.ceil(w/cell*.14*recovery);i++){
    const x=mod(hash(seed,i+2101)*w+t*cell*.39,w),y=mod(hash(seed,i+2111)*horizon+t*cell*.23,horizon);
    c.save();c.translate(x,y);c.rotate(Math.sin(t*1.4+i)*.9);
    ellipse(c,0,0,cell*.065,cell*(.018+Math.abs(Math.sin(t*1.8+i))*.025),i%2?'#b8854f':'#936c4d');c.restore();
  }
}

/** Pixel centre of an antenna emitter. strength is 0..1; t is visual seconds. */
export function drawRadioWaves(c,x,y,cellPx,opts={}){
  if(!c||![x,y,cellPx].every(Number.isFinite)||cellPx<=0)return;
  const strength=clamp(finite(opts.strength,1)),t=finite(opts.t,0);if(strength<=0)return;
  c.save();c.translate(x,y);c.scale(cellPx,cellPx);
  for(let i=0;i<3;i++){
    const phase=mod(t*.55+i/3,1),radius=.28+phase*2.2;
    const alpha=strength*Math.sin(phase*Math.PI)*.72;
    for(const side of [0,Math.PI]){
      c.beginPath();c.arc(0,0,radius,-.67+side,.67+side);
      c.strokeStyle=`rgba(183,222,205,${alpha})`;c.lineWidth=.035+strength*.018;c.stroke();
    }
  }
  ellipse(c,0,0,.048,.048,`rgba(231,238,206,${strength*(.55+.2*Math.sin(t*5))})`);
  c.restore();
}

function pipe(c,points,width=.10,color=steel){line(c,points,P.ink,width+.045);line(c,points,color,width);line(c,points.map((v,i)=>v-(i%2?.018:.014)),'rgba(241,226,183,.24)',width*.22);}
function bolt(c,x,y){ellipse(c,x,y,.027,.027,P.metalLight,P.ink,.013);line(c,[x-.012,y+.008,x+.012,y-.008],P.ink,.01);}
function foot(c,x,width=.45){box(c,x-width/2,-.12,width,.12,P.metalDark,.025);line(c,[x-width*.34,-.09,x+width*.34,-.09],P.metalLight,.018);}
function gauge(c,x,y,r=.15,value=.5){
  ellipse(c,x,y,r+.03,r+.03,P.metalDark,P.ink,.022);ellipse(c,x,y,r,r,P.cream,P.ink,.017);
  for(let i=0;i<5;i++){const a=Math.PI*(.8+i*.35);line(c,[x+Math.cos(a)*r*.7,y+Math.sin(a)*r*.7,x+Math.cos(a)*r*.86,y+Math.sin(a)*r*.86],P.ink,.012);}
  const a=Math.PI*(.8+clamp(value)*1.4);line(c,[x,y,x+Math.cos(a)*r*.72,y+Math.sin(a)*r*.72],P.rust,.023);ellipse(c,x,y,.024,.024,P.ink);
}
function lamp(c,x,y,on){ellipse(c,x,y,.06,.06,P.ink);ellipse(c,x,y,.037,.037,on?'#d8c98a':'#6c6851');if(on)ellipse(c,x-.012,y-.013,.012,.012,P.ivory);}
function hatch(c,o){
  box(c,-1.14,-.28,2.28,.28,gradient(c,0,-.28,0,.28,'#96967f','#626e64'),.09);for(const x of [-.95,.95])bolt(c,x,-.12);
  box(c,-.82,-.37,1.64,.20,P.metalDark,.055);ellipse(c,0,-.32,.71,.13,'#1d3034',P.metalLight,.04);
  const open=o.open!==false;
  if(open){
    poly(c,[-.75,-.35,-1.08,-1.43,.24,-1.58,.60,-.39],gradient(c,-.8,-1.5,1.5,1.2,'#87998a','#4c6662'),P.ink,.04);
    poly(c,[-.62,-.49,-.86,-1.26,.10,-1.36,.36,-.52],P.metalDark,P.metalLight,.027);
    ellipse(c,-.25,-.92,.20,.17,'#3a5657',P.woodLight,.035);line(c,[-.40,-1.04,-.11,-.80],P.cream,.04);line(c,[-.39,-.82,-.12,-1.03],P.cream,.04);
    for(const x of [-.58,.44])box(c,x,-.45,.15,.14,copper,.025);
    pipe(c,[-.53,-.30,-.53,-.03],.045);pipe(c,[.30,-.30,.30,-.03],.045);line(c,[-.53,-.13,.30,-.13],P.woodLight,.04);
  }else{
    ellipse(c,0,-.35,.76,.17,gradient(c,-.76,-.5,1.5,0,'#829489','#506b65'),P.ink,.035);
    ellipse(c,0,-.40,.21,.075,deep,P.woodLight,.025);line(c,[-.17,-.40,.17,-.40],P.cream,.035);
    box(c,-.68,-.40,.14,.11,copper,.02);box(c,.54,-.40,.14,.11,copper,.02);
  }
  for(let i=0;i<5;i++)line(c,[-.91+i*.37,-.245,-.74+i*.37,-.115],brass,.05);
}
function antenna(c,o){
  foot(c,0,.72);pipe(c,[-.23,-.10,-.08,-3.65,.08,-3.65,.23,-.10],.05,P.metalLight);
  for(let y=-.4;y> -3.4;y-=.38){const half=.22*(1+y/4.1);line(c,[-half,y,half,y-.34,-half,y-.34],P.metal,.024);}
  line(c,[-1.12,0,-.04,-2.95,1.10,0],'#8c947c',.025);foot(c,-1.12,.21);foot(c,1.10,.21);
  for(const [y,len] of [[-2.47,.70],[-2.92,.53],[-3.37,.36]]){
    pipe(c,[-len,y,len,y],.035,P.metalLight);for(const x of [-len,len])line(c,[x,y-.12,x,y+.12],P.metalLight,.027);
    box(c,-.055,y-.065,.11,.13,copper,.015);
  }
  c.save();c.translate(.20,-1.93);c.rotate(-.30);
  c.beginPath();c.moveTo(0,-.42);c.quadraticCurveTo(.56,0,0,.42);c.quadraticCurveTo(.24,0,0,-.42);c.fillStyle='#a5b2a0';c.fill();c.strokeStyle=P.ink;c.lineWidth=.026;c.stroke();
  line(c,[.20,0,.57,0],P.metal,.045);ellipse(c,.59,0,.055,.09,copper,P.ink,.02);c.restore();
  box(c,-.43,-.68,.86,.49,P.metalDark,.055);gauge(c,-.18,-.44,.12,o.on?.57:.04);lamp(c,.22,-.48,o.on);
  line(c,[-.25,-.77,-.25,-.68,.25,-.68,.25,-.77],P.metalLight,.035);
  if(o.on){const a=.12+.10*Math.sin(o.t*2.0);ellipse(c,0,-3.70,.04,.045,`rgba(230,190,115,${.7+a})`);}
}
function geiger(c,o){
  for(const x of [-.53,.51]){pipe(c,[x,0,0,-.94],.065,P.metalDark);foot(c,x,.22);}pipe(c,[0,0,0,-1.15],.06);
  box(c,-.50,-1.66,1.0,.67,gradient(c,-.5,-1.66,1,.7,'#a1a98c','#667c6d'),.08);for(const x of [-.41,.41])for(const y of [-1.56,-1.09])bolt(c,x,y);
  gauge(c,-.14,-1.36,.20,o.on?clamp(finite(o.radiation,.45)):0);lamp(c,.30,-1.47,o.on);
  for(let i=0;i<4;i++)line(c,[.15,-1.28+i*.05,.36,-1.28+i*.05],P.metalDark,.018);
  line(c,[-.24,-1.68,-.24,-1.82,.25,-1.82,.25,-1.68],P.metalDark,.045);
  pipe(c,[.53,-1.30,.78,-1.30,.78,-.78],.035,deep);
  box(c,.66,-.84,.25,.56,P.metalDark,.075);for(let i=0;i<4;i++)line(c,[.69,-.76+i*.1,.88,-.76+i*.1],P.metalLight,.018);
}
function solarPanel(c,o){
  pipe(c,[-1.14,0,-.75,-1.37],.065);pipe(c,[.93,0,.65,-1.65],.065);pipe(c,[-1.14,-.08,.65,-1.46,.93,-.08,-.75,-1.23],.04,P.metalDark);
  foot(c,-1.14,.45);foot(c,.93,.45);
  const tl=[-1.31,-1.58],tr=[.83,-2.02],bl=[-.78,-.36],br=[1.36,-.80];poly(c,[...tl,...tr,...br,...bl],P.metalLight,P.ink,.04);
  const point=(u,v)=>[tl[0]+(tr[0]-tl[0])*u+(bl[0]-tl[0])*v,tl[1]+(tr[1]-tl[1])*u+(bl[1]-tl[1])*v];
  for(let row=0;row<3;row++)for(let col=0;col<6;col++){
    const u=.024+col*.16,v=.035+row*.315;
    poly(c,[...point(u,v),...point(u+.145,v),...point(u+.145,v+.29),...point(u,v+.29)],(row+col)%2?'#486c7a':'#557b88','#9cacaa',.013);
    for(let j=1;j<3;j++)line(c,[...point(u,v+j*.09),...point(u+.145,v+j*.09)],'#9db2ae66',.009);
  }
  line(c,[...tl,...tr],P.cream,.023);
  for(let i=0;i<8;i++){const p=point(.06+i*.12,.95);ellipse(c,...p,.04,.013,'rgba(204,187,143,.35)');}
  box(c,.20,-.45,.42,.27,P.metalDark,.045);lamp(c,.52,-.32,o.on);
  pipe(c,[.29,-.19,.29,-.05,.75,-.05],.035,deep);
  if(o.damage>.35)line(c,[...point(.36,.10),...point(.43,.31),...point(.35,.48),...point(.49,.77)],P.metalLight,.017);
}
function rainCollector(c,o){
  for(const x of [-.47,.47])foot(c,x,.34);
  box(c,-.67,-1.33,1.34,1.22,gradient(c,-.67,-1.3,1.34,0,'#95a69c','#536f71'),.20);
  ellipse(c,0,-1.28,.67,.14,P.metalLight,P.ink,.025);
  for(const y of [-1.05,-.40])box(c,-.69,y,1.38,.075,P.metalDark,.025);
  line(c,[-.51,-1.17,-.51,-.30],'rgba(232,236,206,.32)',.045);
  poly(c,[-1.08,-1.88,1.08,-1.88,.34,-1.34,-.34,-1.34],gradient(c,-1,-1.9,2,.6,'#a8b4a2','#718a86'),P.ink,.035);
  ellipse(c,0,-1.88,1.08,.22,'#526e71',P.metalLight,.035);
  for(let i=-3;i<=3;i++)line(c,[i*.24,-1.99,i*.24+.25,-1.76],'rgba(172,191,171,.48)',.018);
  box(c,.28,-1.04,.16,.55,deep,.03);box(c,.32,-.78,.08,.24,'#8eb5ac',.015,null);
  pipe(c,[.65,-.38,.94,-.38,.94,-.23],.07,copper);line(c,[.83,-.51,1.02,-.51],P.rust,.04);line(c,[.92,-.51,.92,-.42],P.rust,.035);
  if(o.weather==='blackRain'&&o.on){const p=mod(o.t*.7,1);ellipse(c,.94,-.18+p*.15,.025,.045,'rgba(96,133,126,.7)');}
}
function ventShaft(c,o){
  box(c,-.60,-.22,1.20,.22,'#90947f',.055);bolt(c,-.44,-.10);bolt(c,.44,-.10);
  box(c,-.34,-1.68,.68,1.51,gradient(c,-.34,-1.68,.68,0,'#99aaa0','#506f71'),.07);
  for(const y of [-.43,-1.32])box(c,-.37,y,.74,.09,P.metalDark,.018);
  box(c,-.60,-1.85,1.20,.27,deep,.05);
  for(let i=-4;i<=4;i++)line(c,[i*.12,-1.81,i*.12,-1.60],P.metalLight,.025);
  poly(c,[-.79,-1.86,-.57,-2.12,.57,-2.12,.79,-1.86],gradient(c,-.8,-2.1,1.6,.24,P.metalLight,P.metal),P.ink,.03);
  line(c,[-.64,-2.06,.57,-2.06],P.cream,.017);
  box(c,-.25,-1.13,.50,.52,P.metalDark,.035);for(let i=0;i<5;i++)line(c,[-.17,-1.03+i*.075,.17,-1.03+i*.075],P.metalLight,.022);
  box(c,.36,-.77,.24,.33,copper,.035);lamp(c,.48,-.61,o.on);
  pipe(c,[.55,-1.71,.91,-1.71,.91,-2.22],.028,P.metalDark);
  const sway=o.on?Math.sin(o.t*1.8)*.07:0;
  poly(c,[.91,-2.22,1.47,-2.13+sway,1.48,-2.03+sway,.91,-2.10],P.rust,P.ink,.018);
  line(c,[1.10,-2.19+sway*.3,1.10,-2.06+sway*.3],P.cream,.04);
}
function lookout(c,o){
  const wood='#99805b',dark='#63563f';
  for(const x of [-.86,.86]){pipe(c,[x,0,x*.68,-2.75],.11,wood);foot(c,x,.32);}
  pipe(c,[-.80,-.20,.66,-2.47,-.66,-2.47,.80,-.20],.065,dark);
  pipe(c,[-.74,-1.17,.74,-1.17],.075,wood);
  box(c,-1.03,-2.78,2.06,.17,gradient(c,0,-2.78,0,.17,P.woodLight,wood),.035);
  for(const x of [-.94,.94])pipe(c,[x,-2.75,x,-3.65],.08,wood);
  pipe(c,[-.94,-3.12,.94,-3.12],.055,wood);pipe(c,[-.94,-2.92,.94,-2.92],.055,wood);
  for(const x of [-.49,0,.49])pipe(c,[x,-2.77,x,-3.13],.035,wood);
  poly(c,[-1.20,-3.62,-.06,-3.92,1.18,-3.62,1.18,-3.52,-1.20,-3.52],P.metalDark,P.ink,.035);
  line(c,[-1.16,-3.62,-.06,-3.92,1.14,-3.62],P.metalLight,.025);
  for(let i=0;i<5;i++)line(c,[-1.0+i*.43,-3.60,-.03+i*.025,-3.85],'#758577',.014);
  pipe(c,[-.40,0,-.40,-2.66],.055,P.woodLight);pipe(c,[.08,0,.08,-2.66],.055,P.woodLight);
  for(let y=-.18;y>-2.6;y-=.29)line(c,[-.40,y,.08,y],P.woodLight,.045);
  // A fixed observation instrument, waiting for the next expedition to return.
  pipe(c,[.40,-2.78,.40,-3.27],.045,P.metalDark);pipe(c,[.22,-3.30,.67,-3.41],.10,P.metal);
  ellipse(c,.70,-3.42,.065,.085,deep,P.metalLight,.019);
  box(c,-.80,-3.46,.26,.29,P.metalDark,.035);lamp(c,-.67,-3.30,o.on);
}
const STRUCTURES=Object.freeze({airlock:hatch,antenna,geiger,solarPanel,rainCollector,ventShaft,lookout});

/** x/y is bottom-centre. opts supports the original planned/selected/active flags. */
export function drawSurfaceStructure(c,type,x,y,cellPx,opts={}){
  if(!c||!STRUCTURE_IDS.includes(type)||!Number.isFinite(cellPx)||cellPx<=0||!Number.isFinite(x)||!Number.isFinite(y))return;
  const o={...opts,t:finite(opts.t,0),seed:finite(opts.seed,1)|0,damage:clamp(finite(opts.damage,0)),on:opts.active!==false&&opts.powered!==false};
  c.save();c.translate(x,y);c.scale(cellPx,cellPx);c.lineCap='round';c.lineJoin='round';
  if(opts.state==='planned')c.globalAlpha*=.45;
  ellipse(c,0,-.015,type==='lookout'?1.1:type==='solarPanel'?1.42:.91,.09,'rgba(20,34,31,.22)');
  STRUCTURES[type](c,o);
  if(o.damage>.45&&type!=='solarPanel'){
    line(c,[-.22,-.63,-.13,-.51,-.22,-.38],P.rust,.027);
    poly(c,[.49,0,.55,-.10,.70,-.06,.75,0],P.rockLight,P.ink,.02);
  }
  if(opts.selected)line(c,[-.62,.025,.62,.025],P.amber,.045);
  c.restore();
}
