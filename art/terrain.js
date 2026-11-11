import { P, TAU, hash, clamp } from './palette.js';
import { box, ellipse, line, poly } from './primitives.js';
import { MATERIAL_IDS, DEPOSIT_IDS, LINING_IDS, COATING_IDS } from './data/world-catalog.js';

// Illustration parameters only. Eight-metre toroidal tiles prevent cell outlines
// and repeated one-metre stamps. Hidden tiles contain no fine geometry or secrets.
const TILE_CELLS = 8;
const textureCache = new Map();
const fogCache = new Map();
const fallbackTiles = new WeakSet();
const palette = Object.freeze({
  air:[24,37,40], topsoil:[49,41,33], clay:[66,47,41], sand:[72,63,43],
  limestone:[51,53,47], coal:[27,30,31], sandstone:[65,51,38],
  schist:[43,49,48], granite:[47,50,53], rubble:[46,43,37],
  concrete:[68,79,78], bedrock:[32,47,59],
});
const names = Object.freeze([...MATERIAL_IDS, 'schist']);
const mod = (n,m) => ((n % m) + m) % m;
const smooth = v => v*v*(3-2*v);
const finite = (n,f=0) => Number.isFinite(n) ? n : f;
const rgba = (a,alpha=1) => `rgba(${a.map(v=>Math.round(clamp(v,0,255))).join(',')},${alpha})`;
const materialName = value => typeof value==='number' ? (MATERIAL_IDS[value]??'limestone') : (palette[value] ? value : 'limestone');
const enumName = (value,list) => typeof value==='number' ? (list[value]??'none') : (list.includes(value)?value:'none');
function h2(x,y,seed=0) { return hash(Math.imul(x|0,374761393)^Math.imul(y|0,668265263)^seed,17); }

function surface(w,h) {
  let canvas;
  if(typeof OffscreenCanvas==='function') canvas=new OffscreenCanvas(w,h);
  else if(typeof document!=='undefined'&&typeof document.createElement==='function') {
    canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
  }
  return canvas&&canvas.getContext('2d') ? canvas : null;
}

function remember(cache,key,value,limit) {
  cache.set(key,value);
  while(cache.size>limit)cache.delete(cache.keys().next().value);
  return value;
}

function periodicNoise(u,v,period,seed) {
  const x=u*period,y=v*period,ix=Math.floor(x),iy=Math.floor(y);
  const fx=smooth(x-ix),fy=smooth(y-iy);
  const a=h2(mod(ix,period),mod(iy,period),seed);
  const b=h2(mod(ix+1,period),mod(iy,period),seed);
  const c=h2(mod(ix,period),mod(iy+1,period),seed);
  const d=h2(mod(ix+1,period),mod(iy+1,period),seed);
  return a+(b-a)*fx+(c-a)*fy+(a-b-c+d)*fx*fy;
}

function pigment(material,u,v,seed,fog=false,opacity=.85,pixels=768) {
  const base=palette[material];
  const broad=periodicNoise(u,v,4,seed), middle=periodicNoise(u,v,13,seed+31);
  // Large interpolated noise used to dominate the image as soft vertical
  // columns. Keep only a quiet pigment variation; geometry supplies the relief.
  let value=(broad-.5)*2+(middle-.5)*3;
  let warm=0;
  if(fog) {
    return fogColor(material,opacity);
  }
  // Fine mineral grain stays sharp when zooming; the broad geological noise
  // alone looks like a blurred photograph even with a denser chunk raster.
  value+=(h2(Math.floor(u*pixels),Math.floor(v*pixels),seed+807)-.5)*(material==='granite'?22:16);
  if(material==='topsoil')value+=(periodicNoise(u,v,27,seed+9)-.5)*3;
  if(material==='clay')warm=middle*3;
  if(material==='sand')value+=(periodicNoise(u,v,51,seed+9)-.5)*3;
  if(material==='coal')value+=(periodicNoise(u,v,23,seed+11)-.5)*3;
  if(material==='sandstone')warm=3;
  if(material==='granite')value+=(periodicNoise(u,v,41,seed+19)-.5)*6;
  if(material==='rubble')value+=(periodicNoise(u,v,19,seed+23)-.5)*6;
  if(material==='concrete')value+=(periodicNoise(u,v,31,seed+13)-.5)*3;
  return [base[0]+value+warm,base[1]+value,base[2]+value-warm];
}

// Motifs crossing a tile boundary are drawn again at their wrapped positions.
function torus(c,x,y,draw) {
  for(let iy=-1;iy<=1;iy++)for(let ix=-1;ix<=1;ix++) {
    const px=x+ix*TILE_CELLS,py=y+iy*TILE_CELLS;
    if(px<-.95||py<-.95||px>TILE_CELLS+.95||py>TILE_CELLS+.95)continue;
    c.save();c.translate(px,py);draw();c.restore();
  }
}

function fossil(c,s,seed) {
  c.save();c.rotate(hash(seed,2)*TAU);c.scale(s,s);
  const pts=[];
  for(let i=0;i<40;i++){const a=i*.24,r=.025+i*.0064;pts.push(Math.cos(a)*r,Math.sin(a)*r);}
  line(c,pts,'rgba(72,82,72,.45)',.026);
  line(c,pts.map((v,i)=>v+(i%2?-.018:0)),'rgba(228,215,176,.43)',.010);
  for(let i=0;i<8;i++){const a=i*.66;line(c,[Math.cos(a)*.16,Math.sin(a)*.16,Math.cos(a)*.27,Math.sin(a)*.27],'rgba(76,80,66,.27)',.013);}
  c.restore();
}

function motifs(c,material,seed) {
  const dark='rgba(28,43,42,.28)',light='rgba(223,222,189,.25)';
  if(material==='air')return;
  const count=material==='granite'?150:material==='rubble'?90:material==='sand'?95:42;
  for(let i=0;i<count;i++) {
    const x=hash(seed,i*7)*8,y=hash(seed,i*7+1)*8,s=.08+hash(seed,i*7+2)*.27;
    torus(c,x,y,()=>{
      if(material==='topsoil') {
        ellipse(c,0,0,s*.85,s*.34,hash(i,seed)>.5?'rgba(41,47,32,.24)':'rgba(187,166,121,.17)');
        if(i%4===0){line(c,[0,-.22,-.04,-.03,.08,.17,.02,.42],'rgba(50,44,30,.6)',.025);line(c,[.04,.1,-.13,.18,-.19,.31],'rgba(48,42,30,.46)',.017);}
      }else if(material==='clay') {
        if(i%2===0)line(c,[-s*1.4,0,-s*.5,-.02,s*.4,.05,s*1.5,.015],dark,.019);
        if(i%5===0){line(c,[0,-.2,.04,-.02,-.08,.12,-.03,.26],dark,.024);line(c,[.03,-.03,.16,.04,.21,.14],dark,.015);}
      }else if(material==='sand') {
        ellipse(c,0,0,.018+hash(i,2)*.02,.012,hash(i,3)>.5?'rgba(232,214,160,.36)':'rgba(88,81,55,.28)');
      }else if(material==='limestone') {
        if(i%3===0){line(c,[-.45,.06,-.2,-.02,.03,.07,.14,-.08,.39,-.02],dark,.034);line(c,[-.42,.09,-.2,.01,.03,.1,.14,-.05,.36,.01],light,.017);}
        else {poly(c,[-s,0,-s*.2,-s*.22,s*.8,-s*.08,s,.1,0,s*.28],i%2?'rgba(189,199,170,.27)':'rgba(89,111,101,.18)',null);}
      }else if(material==='coal') {
        poly(c,[-s,-s*.3,0,-s*.7,s*.8,-s*.3,s*.2,s*.4,-s*.7,s*.32],'rgba(18,29,34,.35)',null);
        line(c,[-s,-s*.3,0,-s*.7,s*.8,-s*.3],'rgba(160,171,166,.22)',.016);
      }else if(material==='sandstone') {
        if(i%9===0)fossil(c,1.1+hash(i,7)*.5,i+seed);
        else line(c,[-s*1.4,0,-s*.1,-.018,s*1.5,.012],i%3?dark:light,.017);
      }else if(material==='schist') {
        poly(c,[-s*1.4,s*.45,-s*.3,-s*.22,s*1.7,-s*.65,s*.25,s*.04],i%2?'rgba(156,178,169,.16)':'rgba(32,58,65,.22)',null);
        line(c,[-s*1.4,s*.45,s*1.7,-s*.65],'rgba(178,198,186,.24)',.014);
      }else if(material==='granite') {
        const cs=s*.42;
        poly(c,[-cs,-cs*.25,-cs*.25,-cs*.9,cs*.7,-cs*.37,cs*.5,cs*.4,-cs*.48,cs*.55],i%4===0?'rgba(48,66,79,.4)':i%3===0?'rgba(199,174,158,.5)':'rgba(215,221,203,.42)',null);
        if(i%5===0)line(c,[-cs,-cs*.25,cs*.5,cs*.4],'rgba(237,239,217,.4)',.014);
      }else if(material==='rubble') {
        poly(c,[-s,0,-s*.6,-s*.64,s*.2,-s*.77,s*.92,-s*.18,s*.62,s*.45,-s*.35,s*.5],i%3===0?'#8e9683':i%3===1?'#737f76':'#a2a18a',P.ink,.022);
        line(c,[-s*.6,-s*.64,s*.2,-s*.77,s*.92,-s*.18],'rgba(225,220,183,.29)',.022);
      }else if(material==='concrete') {
        ellipse(c,0,0,s*.17,s*.12,i%3===0?'rgba(54,74,70,.34)':'rgba(209,215,194,.2)');
        if(i%13===0)line(c,[-.42,0,-.12,-.04,.1,.07,.39,.02],'rgba(52,68,65,.23)',.023);
      }else if(material==='bedrock') {
        line(c,[-s*1.7,s*.7,-s*.3,s*.15,s*.9,-s*.3,s*1.8,-s*.18],'rgba(16,37,47,.48)',.046);
        line(c,[-s*1.6,s*.76,-s*.3,s*.21,s*.9,-s*.24],'rgba(143,161,160,.2)',.018);
      }
    });
  }
}

// Fine geometry is rasterised once at the cache's physical resolution. A joint
// has a one-pixel edge at both zoom 1 and zoom 2, not a scaled soft sine band.
function mineralEdges(c,material,seed,cellPx) {
  if(material==='air')return;
  const pixel=1/cellPx;
  const dark='rgba(12,14,13,.72)', light='rgba(171,155,122,.52)';
  const layered=['clay','limestone','sandstone','coal','schist','bedrock'].includes(material);
  if(layered) {
    const rows=material==='clay'?12:material==='limestone'?7:10;
    for(let row=0;row<rows;row++) {
      const points=[];
      for(let i=0;i<=64;i++) {
        const x=i/8;
        const broad=periodicNoise(x/8,row/rows,4,seed+601)-.5;
        const chip=h2(i%64,row,seed+607)-.5;
        const y=(row+.4)/rows*8+broad*.24+chip*.035;
        points.push(x,y);
      }
      line(c,points,dark,pixel);
      line(c,points.map((v,i)=>v+(i%2?pixel:0)),light,pixel*.65);
    }
  }
  // Jittered strata-independent sites avoid vertical striping and a metre grid.
  const count=material==='granite'?1250:material==='sand'?1400:700;
  for(let i=0;i<count;i++) {
    const x=hash(seed+509,i*5)*8,y=hash(seed+521,i*5+1)*8;
    const size=.022+hash(seed+541,i)*.065;
    torus(c,x,y,()=>{
      const pebble=[-size,0,-size*.3,-size*.65,size*.65,-size*.35,size,.28*size,0,size*.6];
      poly(c,pebble,i%3?'rgba(117,107,88,.46)':'rgba(25,27,25,.55)',dark,pixel*.75);
      if(i%3===0)line(c,pebble.slice(0,6),light,pixel*.7);
    });
  }
  for(let i=0;i<56;i++) {
    const x=hash(seed+563,i*7)*8,y=hash(seed+577,i*7+1)*8;
    const span=.16+hash(seed+587,i)*.44;
    torus(c,x,y,()=>{
      const pts=[-span*.5,-.07,-span*.14,.015,span*.16,-.035,span*.5,.04];
      line(c,pts,dark,pixel);
      if(i%3===0) {
        line(c,pts.map((v,j)=>v+(j%2?pixel:0)),light,pixel*.75);
        line(c,[span*.16,-.035,span*.2,-.17,span*.35,-.24],dark,pixel);
      }
    });
  }
}

function paintTile(c,material,pixels,seed,fog=false) {
  if(typeof c.createImageData==='function'&&typeof c.putImageData==='function') {
    const image=c.createImageData(pixels,pixels);
    for(let y=0;y<pixels;y++)for(let x=0;x<pixels;x++) {
      const rgb=pigment(material,(x+.5)/pixels,(y+.5)/pixels,seed,fog,.85,pixels),i=(y*pixels+x)*4;
      image.data[i]=rgb[0];image.data[i+1]=rgb[1];image.data[i+2]=rgb[2];image.data[i+3]=255;
    }
    c.putImageData(image,0,0);
  }else {
    c.fillStyle=rgba(fog?fogColor(material,.85):palette[material]);c.fillRect(0,0,pixels,pixels);
  }
  if(!fog){c.save();c.scale(pixels/8,pixels/8);motifs(c,material,seed);mineralEdges(c,material,seed,pixels/8);c.restore();}
}

/** Cached by size and seed. Browser values are CanvasImageSources. In Node,
 * values are frozen fallback descriptors, understood by drawTerrainCell. */
export function makeStrataTextures(cellPx,seed=1) {
  const cell=Math.max(.25,finite(cellPx,20)),salt=finite(seed,1)|0,key=`${cell}:${salt}`;
  if(textureCache.has(key))return textureCache.get(key);
  const pixels=Math.max(16,Math.ceil(cell*TILE_CELLS));
  const tiles={},fogTiles={};
  for(const material of names)for(const fog of [false,true]) {
    const size=fog?32:pixels,canvas=surface(size,size);
    if(canvas)paintTile(canvas.getContext('2d'),material,size,salt,fog);
    const tile=canvas??Object.freeze({width:size,height:size,material,seed:salt,fog});
    if(!canvas)fallbackTiles.add(tile);
    (fog?fogTiles:tiles)[material]=tile;
  }
  return remember(textureCache,key,Object.freeze({cellPx:cell,seed:salt,tileCells:TILE_CELLS,tiles:Object.freeze(tiles),fogTiles:Object.freeze(fogTiles)}),3);
}

function fallbackTexture(c,material,wx,wy,seed,fog=false) {
  // Lightweight deterministic alternative for Node recording contexts. It is not
  // a hidden image import, and the browser normally uses the cached raster tile.
  c.fillStyle=rgba(pigment(material,mod(wx+.5,8)/8,mod(wy+.5,8)/8,seed,fog));c.fillRect(0,0,1,1);
  if(fog)return;
  const phase=hash(seed,5)*TAU;
  for(let i=0;i<3;i++) {
    const pts=[];
    for(let j=0;j<=5;j++){const xx=j/5,yy=i*.36+.08+Math.sin((wx+xx)*1.8+phase)*.035;pts.push(xx,yy);}
    line(c,pts,'rgba(35,54,52,.14)',.018);
  }
  for(let i=0;i<7;i++)ellipse(c,h2(wx,wy,seed+i),h2(wx,wy,seed+i+51),.015,.009,'rgba(211,213,179,.20)');
}

function texture(c,material,wx,wy,textures,fog=false) {
  const tile=(fog?textures.fogTiles:textures.tiles)?.[material];
  if(tile&&!fallbackTiles.has(tile)&&typeof c.drawImage==='function') {
    // Clip before extending by a tiny amount: subpixel zoom does not expose seams.
    const unit=tile.width/textures.tileCells;
    c.drawImage(tile,mod(wx,textures.tileCells)*unit,mod(wy,textures.tileCells)*unit,unit,unit,-.001,-.001,1.002,1.002);
  }else fallbackTexture(c,material,wx,wy,textures.seed,fog);
}

function stateName(cell) {
  if(cell.state===1||cell.state==='empty')return 'empty';
  if(cell.state==='rubble'||materialName(cell.material)==='rubble')return 'rubble';
  return cell.state==='shored'?'shored':'solid';
}
function solid(value,fallback=true) {
  if(typeof value==='boolean')return value;
  if(value&&typeof value==='object')return value.revealed===false||value.revealed===0||stateName(value)!=='empty';
  return fallback;
}
const positions=[['topLeft',-1,-1],['top',0,-1],['topRight',1,-1],['left',-1,0],['right',1,0],['bottomLeft',-1,1],['bottom',0,1],['bottomRight',1,1]];
const aliases={topLeft:'nw',topRight:'ne',bottomLeft:'sw',bottomRight:'se',top:'north',bottom:'south',left:'west',right:'east'};
const neighbor=(n,k)=>n[k]??n[aliases[k]];

function occupation(cell,n) {
  const own=stateName(cell)!=='empty',grid=new Map([['0,0',own?1:0]]);
  for(const [key,x,y]of positions)grid.set(`${x},${y}`,solid(neighbor(n,key),own)?1:0);
  return {own,grid,mixed:[...grid.values()].some(v=>v!==(own?1:0))};
}
function field(grid,x,y,wx,wy,seed) {
  const gx=wx+x,gy=wy+y;
  // World anchored lobes join across cells; wider folds avoid the drilled-hole
  // appearance of a single empty metre surrounded by solid limestone.
  x+=Math.sin(gx*2.11+gy*1.37+seed*.013)*.20+Math.sin(gx*6.7-gy*4.1)*.09;
  y+=Math.sin(gx*1.63-gy*2.39+seed*.017)*.16+Math.sin(gx*5.3+gy*7.1)*.085;
  const ix=Math.floor(x-.5),iy=Math.floor(y-.5),fx=smooth(x-.5-ix),fy=smooth(y-.5-iy);
  const get=(a,b)=>grid.get(`${clamp(a,-1,1)},${clamp(b,-1,1)}`)??1;
  const a=get(ix,iy),b=get(ix+1,iy),cc=get(ix,iy+1),d=get(ix+1,iy+1);
  return a+(b-a)*fx+(cc-a)*fy+(a-b-cc+d)*fx*fy;
}

function contour(c,triangles,threshold,fill,stroke=null,width=.02) {
  c.beginPath();const edges=[];
  for(const triangle of triangles) {
    const pts=[];
    for(let i=0;i<3;i++) {
      const a=triangle[i],b=triangle[(i+1)%3],ia=a[2]<threshold,ib=b[2]<threshold;
      if(ia)pts.push(a);
      if(ia!==ib){const t=(threshold-a[2])/(b[2]-a[2]);const p=[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];pts.push(p);edges.push(p);}
    }
    if(pts.length){c.moveTo(pts[0][0],pts[0][1]);for(let i=1;i<pts.length;i++)c.lineTo(pts[i][0],pts[i][1]);c.closePath();}
  }
  c.fillStyle=fill;c.fill();
  if(stroke){c.beginPath();for(let i=0;i<edges.length-1;i+=2){c.moveTo(...edges[i]);c.lineTo(...edges[i+1]);}c.strokeStyle=stroke;c.lineWidth=width;c.lineCap='round';c.stroke();}
}

function cavity(c,cell,n,wx,wy,seed,textures,material) {
  const {own,grid,mixed}=occupation(cell,n);
  if(!mixed){if(!own){c.fillStyle='#111916';c.fillRect(0,0,1,1);}return;}
  const steps=10,points=[],triangles=[];
  for(let y=0;y<=steps;y++){points[y]=[];for(let x=0;x<=steps;x++)points[y][x]=[x/steps,y/steps,field(grid,x/steps,y/steps,wx,wy,seed)];}
  for(let y=0;y<steps;y++)for(let x=0;x<steps;x++) {
    const a=points[y][x],b=points[y][x+1],cc=points[y+1][x+1],d=points[y+1][x];
    triangles.push([a,b,cc],[a,cc,d]);
  }
  contour(c,triangles,.73,'rgba(15,18,15,.30)');
  contour(c,triangles,.59,'#35372b');
  contour(c,triangles,.50,'#242a22');
  contour(c,triangles,.37,'#111916');
  // Short mineral teeth at a real ceiling, never a complete circular rim.
  if(!own&&solid(neighbor(n,'top'),true)) {
    const tip=.31+h2(wx,wy,seed+79)*.18;
    poly(c,[.34,.05,.40,.08,.43,tip,.48,.09,.53,.05],'#535343',null);
    line(c,[.40,.09,.43,tip],'rgba(172,155,114,.30)',.018);
  }
}

function softenStrata(c,material,n) {
  for(const [key,side]of [['top',0],['right',1],['bottom',2],['left',3]]) {
    const other=neighbor(n,key);
    if(!other||typeof other!=='object'||other.revealed===false||other.revealed===0||!solid(other))continue;
    const name=materialName(other.material);if(name===material)continue;
    const color=palette[name];let g;
    if(side===0)g=c.createLinearGradient(0,0,0,.18);
    if(side===1)g=c.createLinearGradient(1,0,.82,0);
    if(side===2)g=c.createLinearGradient(0,1,0,.82);
    if(side===3)g=c.createLinearGradient(0,0,.18,0);
    g.addColorStop(0,rgba(color,.44));g.addColorStop(1,rgba(color,0));c.fillStyle=g;
    c.fillRect(side===1?.82:0,side===2?.82:0,side%2?.18:1,side%2?1:.18);
  }
}

const ores={iron:['#bd8e66','#e2c397'],copper:['#7baf9a','#c8ad7b'],lead:['#929da8','#c6c8be'],uranium:['#9eac71','#c8cc8d'],geode:['#aaa5be','#dfd6d1']};
function deposit(c,type,wx,wy,seed,n) {
  if(type==='none')return;
  const colors=ores[type],points=[];
  const connected=positions.filter(([k])=>{
    const v=neighbor(n,k);return v&&typeof v==='object'&&v.revealed!==false&&v.revealed!==0&&enumName(v.deposit,DEPOSIT_IDS)===type;
  });
  if(type==='geode') {
    // A seam of faceted crystals, not circular wheels linked by a white axle.
    const salt=seed+wx*97+wy*131;
    poly(c,[.17,.58,.24,.39,.39,.29,.61,.34,.78,.47,.72,.66,.47,.73,.28,.68],'rgba(27,26,29,.66)',null);
    for(let i=0;i<5;i++) {
      const x=.28+i*.105+(hash(salt,i)-.5)*.07,y=.50+(hash(salt,i+11)-.5)*.20;
      const h=.085+hash(salt,i+23)*.09,w=.065+hash(salt,i+35)*.065;
      c.save();c.translate(x,y);c.rotate((hash(salt,i+47)-.5)*3.4);
      poly(c,[-w,h*.38,-w*.65,-h*.55,w*.12,-h,w,-h*.38,w*.62,h*.44],'#625d6c',P.ink,.012);
      poly(c,[w*.12,-h,w,-h*.38,w*.62,h*.44,w*.08,h*.25],'#8b818e',null);
      c.restore();
    }
    for(const [,dx,dy] of connected)line(c,[.43,.58,.5+dx*.5,.5+dy*.5],'rgba(138,121,143,.32)',.035);
    return;
  }
  const anchors=connected.length?connected.map(([k,dx,dy])=>{
    if(dx&&dy)return[dx<0?0:1,dy<0?0:1];
    return dx?[dx<0?0:1,.27+h2(wx+(dx>0?1:0),wy,seed+912)*.46]:[.27+h2(wx,wy+(dy>0?1:0),seed+913)*.46,dy<0?0:1];
  }):[[0,.77],[1,.23]];
  const center=[.45+h2(wx,wy,seed+73)*.1,.43+h2(wx,wy,seed+91)*.14];
  for(const a of anchors) {
    const pts=[...center];for(let i=1;i<=3;i++){const f=i/3;pts.push(center[0]+(a[0]-center[0])*f+(i<3?(h2(wx,wy,seed+i)-.5)*.09:0),center[1]+(a[1]-center[1])*f+(i<3?(h2(wx,wy,seed+i+7)-.5)*.09:0));}
    line(c,pts,'rgba(28,42,44,.48)',.19);line(c,pts,colors[0],.105);line(c,pts,colors[1],.025);points.push(...pts);
  }
  for(let i=0;i<5;i++){
    const index=(i*2)%Math.max(2,points.length-2),x=points[index]+(hash(seed+i,1)-.5)*.14,y=points[index+1]+(hash(seed+i,2)-.5)*.13;
    poly(c,[x-.05,y,x-.01,y-.055,x+.07,y-.015,x+.035,y+.045],i%2?colors[0]:colors[1],null);
  }
}

function pocket(c,cell,wx,wy,seed) {
  const gas=cell.gas===true?1:clamp(Number(cell.gas)||0);
  const amount=typeof cell.water==='object'?finite(cell.water?.level):finite(cell.water);
  const water=clamp(amount>1?amount/8:amount);
  if(!gas&&!water)return;
  if(stateName(cell)==='empty') {
    // Open water joins its neighbouring cells; only buried pockets are lenses.
    if(gas)for(let i=0;i<3;i++)ellipse(c,.18+hash(seed+i,wx)*.64,.24+hash(seed+i,wy)*.43,.25,.13,'rgba(153,165,111,.10)');
    if(water){const level=1-water;c.fillStyle=cell.water?.dirty?'rgba(112,107,72,.65)':'rgba(66,126,134,.65)';c.fillRect(0,level,1,water);line(c,[0,level,.3,level-.012,.64,level+.009,1,level],'rgba(174,204,187,.6)',.021);}
    return;
  }
  // Rock lenses have rounded, asymmetric shoulders, not a square cell outline.
  c.save();c.beginPath();c.moveTo(.11,.52);
  c.bezierCurveTo(.09,.22,.36,.17,.55,.21);c.bezierCurveTo(.83,.14,.95,.38,.9,.63);
  c.bezierCurveTo(.93,.83,.59,.89,.31,.81);c.bezierCurveTo(.16,.79,.06,.69,.11,.52);c.closePath();
  c.fillStyle='#233d40';c.fill();c.strokeStyle='rgba(191,201,171,.35)';c.lineWidth=.025;c.stroke();c.clip();
  if(gas)for(let i=0;i<5;i++)ellipse(c,.22+hash(seed+i,wx)*.56,.36+hash(seed+i,wy+3)*.29,.2,.1,'rgba(153,165,111,.13)');
  if(water){const level=.81-water*.54;c.fillStyle=cell.water?.dirty?'#756f4d':'#447f86';c.fillRect(.06,level,.9,.85-level);line(c,[.08,level,.32,level-.013,.61,level+.014,.94,level], '#abc5b8',.023);line(c,[.28,level+.1,.45,level+.1],'rgba(204,223,190,.37)',.018);}
  c.restore();
}

function edgeFrame(c,side,draw) {c.save();if(side===1){c.translate(1,0);c.rotate(Math.PI/2);}if(side===2){c.translate(1,1);c.rotate(Math.PI);}if(side===3){c.translate(0,1);c.rotate(-Math.PI/2);}draw();c.restore();}
function supports(c,cell,n,wx,wy) {
  const state=stateName(cell),lining=state==='shored'?'timber':enumName(cell.lining,LINING_IDS),coating=enumName(cell.coating,COATING_IDS);
  if(lining==='none'&&coating==='none')return;
  const own=state!=='empty';
  let edges=['top','right','bottom','left'].map((key,i)=>solid(neighbor(n,key),own)!==own?i:-1).filter(v=>v>=0);
  if(!edges.length){
    // An interior cell has no exposed face to cover. Keep an isolated specimen
    // and the explicit solid shoring marker useful without inventing a ceiling.
    if(Object.keys(n).length===0||state==='shored')edges=[0];else return;
  }
  for(const side of edges)edgeFrame(c,side,()=>{
    if(coating!=='none') {
      const colors={waterproof:'#577f7c',insulation:'#baa278',leadLining:'#727e89',whitewash:'#c5cbb4'};
      box(c,0,.016,1,.13,colors[coating],.013,P.ink,.017);
      if(coating==='insulation')for(let x=-.12;x<1;x+=.22){line(c,[x,.02,x+.17,.14], '#796f57',.016);line(c,[x,.14,x+.17,.02], '#d9c6a0',.014);}
      if(coating==='waterproof'){line(c,[0,.105,1,.105],'#a3b7a2',.014);for(let x=.12;x<1;x+=.27)ellipse(c,x,.06,.016,.016,P.cream);}
      if(coating==='leadLining'){line(c,[.5,.02,.5,.14], '#b9c4bb',.024);ellipse(c,.08,.08,.019,.019,P.metalLight);ellipse(c,.92,.08,.019,.019,P.metalLight);}
      if(coating==='whitewash')for(let x=.03;x<1;x+=.19)line(c,[x,.035,x+.1,.11],'rgba(233,234,207,.3)',.025);
    }
    if(lining==='shotcrete'||lining==='boltsShotcrete') {
      box(c,0,.025,1,.16,'#a3aea2',.045,null);
      for(let i=0;i<9;i++)ellipse(c,hash(wx+i,wy)*1,.045+hash(wy+i,wx+9)*.11,.015,.009,i%2?'#d0d1b8':'#7b8c84');
    }
    if(lining==='timber') {
      box(c,-.015,.035,1.03,.13,'#a38559',.025,P.woodDark,.025);
      line(c,[0,.065,.43,.076,1,.065],'#d0b484',.016);
      for(const x of [.1,.9]){box(c,x-.035,.015,.07,.18,P.metalDark,.01);ellipse(c,x,.07,.015,.015,P.cream);}
      if(mod(side%2?wy:wx,3)===0)poly(c,[.06,.15,.06,.42,.32,.15],P.woodDark,P.ink,.015);
    }
    if(lining==='steelArch') {
      box(c,0,.035,1,.105,P.metalDark,.018);
      line(c,[0,.042,1,.042],P.metalLight,.027);line(c,[0,.14,1,.14],P.metal,.024);
      for(let x=.12;x<1;x+=.38){box(c,x-.04,.02,.08,.14,P.metal,.015);ellipse(c,x,.08,.018,.018,P.cream);}
    }
    if(lining==='bolts'||lining==='boltsShotcrete')for(const x of [.24,.76]) {
      line(c,[x,.19,x,.01],P.metalDark,.038);
      box(c,x-.065,.11,.13,.045,P.metalLight,.012);
      ellipse(c,x,.13,.027,.027,P.woodLight,P.ink,.012);
    }
  });
}

/** One grid cell; wx/wy anchor textures to the world, never to the camera. */
export function drawTerrainCell(c,x,y,cellPx,cell={},neighbors={}) {
  if(!c||!Number.isFinite(x)||!Number.isFinite(y)||!Number.isFinite(cellPx)||cellPx<=0)return;
  cell=cell&&typeof cell==='object'?cell:{};neighbors=neighbors&&typeof neighbors==='object'?neighbors:{};
  const material=materialName(cell.material),seed=finite(cell.seed,cell.textures?.seed??1)|0;
  const wx=Math.floor(finite(cell.wx,x/cellPx)),wy=Math.floor(finite(cell.wy,y/cellPx));
  const textures=cell.textures?.tiles?cell.textures:makeStrataTextures(cellPx,seed);
  c.save();c.translate(x,y);c.scale(cellPx,cellPx);c.beginPath();c.rect(0,0,1,1);c.clip();
  if(cell.revealed===false||cell.revealed===0){
    // Do not inspect state, neighbours, deposits, pockets or support in this branch.
    c.globalAlpha=1;c.globalCompositeOperation='source-over';texture(c,material==='air'?'limestone':material,wx,wy,textures,true);c.restore();return;
  }
  if(cell.background!==false){
    texture(c,material,wx,wy,textures);
    softenStrata(c,material,neighbors);
  }
  if(stateName(cell)!=='empty')deposit(c,enumName(cell.deposit,DEPOSIT_IDS),wx,wy,seed,neighbors);
  cavity(c,cell,neighbors,wx,wy,seed,textures,material);
  pocket(c,cell,wx,wy,seed);
  supports(c,cell,neighbors,wx,wy);c.restore();
}

/** Structural dressing without repainting the rock or the furnished room. */
export function drawTerrainSupport(c,x,y,cellPx,cell={},neighbors={}) {
  if(!c||![x,y,cellPx].every(Number.isFinite)||cellPx<=0)return;
  const wx=Math.floor(finite(cell.wx,x/cellPx)),wy=Math.floor(finite(cell.wy,y/cellPx));
  c.save();c.translate(x,y);c.scale(cellPx,cellPx);
  supports(c,cell,neighbors,wx,wy);c.restore();
}

// Attenuate light, not sRGB code values: multiplying dark encoded channels by
// .15 crushed the strata almost to black. 85% less linear light preserves hue.
function fogColor(material,opacity){return palette[material].map(v=>{
  const s=v/255,linear=(s<=.04045?s/12.92:((s+.055)/1.055)**2.4)*(1-clamp(opacity,0,.98));
  return Math.round(255*(linear<=.0031308?linear*12.92:1.055*linear**(1/2.4)-.055));
});}

/** Distance to the union of visited metre cells, sampled at 1/8 m. Cell origins
 * are absolute pixels, like rect. Overlaps take the minimum distance, never
 * accumulate transparency. A winding gallery therefore keeps its winding edge. */
export function explorationField(rect,cellPx,visited,{radius=cellPx,softness=cellPx*2}={}) {
  const step=Math.max(1,cellPx/8),width=Math.ceil(rect.w/step),height=Math.ceil(rect.h/step);
  const sx=rect.w/width,sy=rect.h/height,alpha=new Uint8ClampedArray(width*height).fill(255);
  radius=Math.max(0,finite(radius,cellPx));softness=Math.max(.01,finite(softness,cellPx*2));
  const reach=radius+softness;
  for(const cell of Array.isArray(visited)?visited:[]) {
    if(!cell||![cell.x,cell.y].every(Number.isFinite))continue;
    const x=cell.x-rect.x,y=cell.y-rect.y;
    const x0=Math.max(0,Math.floor((x-reach)/sx)),x1=Math.min(width,Math.ceil((x+cellPx+reach)/sx));
    const y0=Math.max(0,Math.floor((y-reach)/sy)),y1=Math.min(height,Math.ceil((y+cellPx+reach)/sy));
    for(let yy=y0;yy<y1;yy++)for(let xx=x0;xx<x1;xx++) {
      const px=(xx+.5)*sx,py=(yy+.5)*sy;
      const dx=Math.max(x-px,0,px-x-cellPx),dy=Math.max(y-py,0,py-y-cellPx);
      const value=Math.round(255*smooth(clamp((Math.hypot(dx,dy)-radius)/softness)));
      const index=yy*width+xx;if(value<alpha[index])alpha[index]=value;
    }
  }
  return {width,height,sx,sy,alpha};
}

function visitedFog(c,rect,cellPx,opts,material,seed,opacity) {
  const visited=opts.visited.filter(p=>p&&[p.x,p.y].every(Number.isFinite));
  const key=JSON.stringify(['cells',rect,cellPx,material,seed,opacity,opts.radius,opts.softness,visited]);
  let canvas=fogCache.get(key),field;
  if(!canvas) {
    field=explorationField(rect,cellPx,visited,opts);
    canvas=surface(field.width,field.height);
    if(canvas) {
      const cc=canvas.getContext('2d'),data=cc.createImageData(field.width,field.height),rgb=fogColor(material,opacity);
      for(let i=0;i<field.alpha.length;i++) {
        data.data[i*4]=rgb[0];data.data[i*4+1]=rgb[1];data.data[i*4+2]=rgb[2];data.data[i*4+3]=field.alpha[i];
      }
      cc.putImageData(data,0,0);remember(fogCache,key,canvas,12);
    }
  }
  c.save();c.beginPath();c.rect(rect.x,rect.y,rect.w,rect.h);c.clip();
  c.globalAlpha=1;c.globalCompositeOperation='source-over';
  if(canvas&&typeof c.drawImage==='function') {
    c.imageSmoothingEnabled=true;c.drawImage(canvas,rect.x,rect.y,rect.w,rect.h);
  } else {
    field??=explorationField(rect,cellPx,visited,opts);const rgb=fogColor(material,opacity);
    for(let y=0;y<field.height;y++)for(let x=0;x<field.width;x++) {
      const alpha=field.alpha[y*field.width+x];if(!alpha)continue;
      c.fillStyle=rgba(rgb,alpha/255);c.fillRect(rect.x+x*field.sx,rect.y+y*field.sy,field.sx,field.sy);
    }
  }
  c.restore();
}
function fogEllipses(reveal,rect) {
  return (Array.isArray(reveal)?reveal:[]).filter(e=>e&&[e.x,e.y,e.rx,e.ry].every(Number.isFinite)&&e.rx>0&&e.ry>0)
    .map(e=>({x:e.x-rect.x,y:e.y-rect.y,rx:e.rx,ry:e.ry}));
}
function paintFog(c,w,h,cellPx,material,seed,opacity) {
  const rgb=fogColor(material,opacity);c.fillStyle=rgba(rgb);c.fillRect(0,0,w,h);
  // Only broad stratigraphic tone survives. No crystal, crack, deposit or cavity.
  const size=Math.max(8,cellPx*2);
  for(let y=0;y<h;y+=size){
    const factor=(h2(0,Math.floor(y/size),seed)-.5)*3*(1-opacity);
    c.fillStyle=rgba(rgb.map(v=>v+factor));c.fillRect(0,y,w,Math.min(size,h-y));
  }
}

/** Opaque hidden rock; opacity means darkness, not layer transparency. Prefer
 * visited cell origins with radius/softness in pixels. Legacy reveal ellipses
 * remain accepted for existing callers; the scene exclusively uses cells. */
export function drawFog(c,rect,cellPx,opts={}) {
  if(!c||!rect||![rect.x,rect.y,rect.w,rect.h,cellPx].every(Number.isFinite)||rect.w<=0||rect.h<=0||cellPx<=0)return;
  opts=opts&&typeof opts==='object'?opts:{};
  const material=materialName(opts.material),seed=finite(opts.seed,1)|0,opacity=clamp(finite(opts.opacity,.85),0,.98);
  if(Array.isArray(opts.visited)){visitedFog(c,rect,cellPx,opts,material,seed,opacity);return;}
  const reveal=fogEllipses(opts.reveal,rect),w=Math.ceil(rect.w),h=Math.ceil(rect.h);
  const key=JSON.stringify([w,h,cellPx,material,seed,opacity,reveal]);let canvas=fogCache.get(key);
  if(!canvas) {
    canvas=surface(w,h);
    if(canvas) {
      const cc=canvas.getContext('2d');paintFog(cc,w,h,cellPx,material,seed,opacity);
      cc.globalCompositeOperation='destination-out';
      for(const e of reveal) {
        cc.save();cc.translate(e.x,e.y);cc.scale(e.rx,e.ry);
        const g=cc.createRadialGradient(0,0,0,0,0,1);g.addColorStop(0,'rgba(0,0,0,1)');g.addColorStop(.70,'rgba(0,0,0,1)');g.addColorStop(1,'rgba(0,0,0,0)');
        cc.fillStyle=g;cc.beginPath();cc.arc(0,0,1,0,TAU);cc.fill();cc.restore();
      }
      cc.globalCompositeOperation='source-over';remember(fogCache,key,canvas,5);
    }
  }
  c.save();c.beginPath();c.rect(rect.x,rect.y,rect.w,rect.h);c.clip();c.globalAlpha=1;c.globalCompositeOperation='source-over';
  if(canvas&&typeof c.drawImage==='function')c.drawImage(canvas,rect.x,rect.y,rect.w,rect.h);
  else {
    // No OffscreenCanvas and no DOM: one-pixel masks keep even a recording-context
    // fallback honest. Outside reveal ellipses every pixel is fully opaque.
    const rgb=fogColor(material,opacity);
    if(!reveal.length){c.fillStyle=rgba(rgb);c.fillRect(rect.x,rect.y,rect.w,rect.h);}
    else for(let yy=0;yy<h;yy++)for(let xx=0;xx<w;xx++) {
      let alpha=1;
      for(const e of reveal){const d=Math.hypot((xx+.5-e.x)/e.rx,(yy+.5-e.y)/e.ry);if(d<1)alpha*=smooth(clamp((d-.70)/.30));}
      if(alpha>0){c.fillStyle=rgba(rgb,alpha);c.fillRect(rect.x+xx,rect.y+yy,1,1);}
    }
  }
  c.restore();
}
