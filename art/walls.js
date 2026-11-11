import {P,hash} from './palette.js';
import {box,line,ellipse,poly,gradient} from './primitives.js';

const WALLS={
  dorm:'wood',canteen:'plaster',kitchen:'tile',pantry:'plaster',storage:'brick',diesel:'concrete',
  workshop:'brick',infirmary:'tile',mushroom:'wet',hydroponics:'glass',well:'wet',filterPlant:'steel',ventShaft:'concrete',lab:'chalk',
  school:'wood',chapel:'stone',archive:'wood',commons:'wood',washroom:'tile',ossuary:'stone',
  insectFarm:'brick',ratFarm:'brick',fishTank:'wet',recycler:'steel',cistern:'concrete',decon:'tile',pump:'wet',
  bikeDynamo:'brick',microHydro:'wet',geothermal:'concrete',rtg:'steel',battery:'steel',surfaceSolar:'sky',
  airFilter:'steel',scrubber:'concrete',algaeTank:'glass',heater:'brick',heatExchanger:'steel',
};
export const WALL_TYPES=Object.freeze({...WALLS});

/** All dimensions in metres. Caller owns clipping, lighting and Canvas state. */
export function drawBackWall(c,type,w,h){
  type=typeof type==='string'?type:'';
  const style=WALLS[type]??'stone';let seed=0;for(const n of type)seed=(seed*31+n.charCodeAt(0))|0;
  if(style==='sky'){
    c.fillStyle=gradient(c,0,0,0,h,'#697c7d','#b7b69a');c.fillRect(0,0,w,h);
    poly(c,[0,h*.80,w*.20,h*.61,w*.36,h*.73,w*.52,h*.55,w*.74,h*.7,w,h*.57,w,h,0,h],'#52615c',null);
    c.fillStyle='#5b6256';c.fillRect(0,h-.20,w,.2);return;
  }
  const tones={wood:['#a17b4b','#695039'],tile:['#b3b9a5','#6c8078'],concrete:['#73786d','#3d4848'],wet:['#435652','#283b3d'],steel:['#647e7b','#354d53'],chalk:['#59635a','#3c4941'],plaster:['#a58b62','#746046'],brick:['#786653','#4e4940'],stone:['#6d7063','#424b49'],glass:['#6d8982','#3c5d59']}[style];
  if(type==='kitchen')tones.splice(0,2,'#c9bd98','#958366');
  if(type==='infirmary')tones.splice(0,2,'#cbc5a7','#8a998a');
  if(type==='dorm')tones.splice(0,2,'#9c7d58','#6d5641');
  c.fillStyle=gradient(c,0,0,0,h,...tones);c.fillRect(0,0,w,h);
  if(style==='wood'){
    for(let x=0,i=0;x<w;x+=.48,i++){
      c.fillStyle=i%3===0?(type==='dorm'?'rgba(231,201,154,.10)':'rgba(239,191,107,.12)'):'rgba(63,38,24,.06)';c.fillRect(x,0,.48,h);
      line(c,[x,0,x,h],'#5e422b',.023);line(c,[x+.035,0,x+.035,h],type==='dorm'?'rgba(236,210,166,.23)':'rgba(247,205,133,.27)',.014);
      for(let j=0;j<3;j++){const yy=.25+hash(i,j+seed)*(h-.4);line(c,[x+.12,yy,x+.15,yy+.23,x+.11,Math.min(h,yy+.50)],'rgba(47,35,25,.22)',.013);}
      ellipse(c,x+.28,.3+hash(i,seed)*Math.max(.1,h-.6),.037,.09,'rgba(44,34,24,.16)');
    }
    for(const y of [.25,h-.30]){box(c,0,y,w,.09,type==='dorm'?'#a18460':'#aa814b',.01,'#65452e',.016);for(let x=.2;x<w;x+=.96)ellipse(c,x,y+.045,.018,.018,P.ink);}
  }else if(style==='tile'){
    const tint=type==='infirmary'?'#758f86':type==='kitchen'?'#a18d6a':'#608b92';
    for(let y=0,j=0;y<h;y+=.44,j++)for(let x=0,i=0;x<w;x+=.56,i++){
      c.fillStyle=(i+j)%7===0?'rgba(231,231,203,.16)':'rgba(219,225,204,.06)';c.fillRect(x+.012,y+.012,.535,.415);
      line(c,[x,y,x+.56,y,x+.56,y+.44],'#596e68',.014);
    }
    c.fillStyle=tint;c.fillRect(0,Math.max(.25,h-1.55),w,.12);line(c,[0,h-.2,w,h-.2],tint,.06);
  }else if(style==='concrete'){
    for(let x=0;x<w;x+=2.3){line(c,[x,0,x,h],'rgba(35,45,44,.48)',.025);for(const y of [.35,h-.42])ellipse(c,x+.12,y,.043,.043,'#48564f','#929489',.014);}
    for(let i=0;i<w*5;i++){
      const x=hash(i,seed)*w,y=hash(i,seed+9)*h;
      ellipse(c,x,y,.035+hash(i,2)*.12,.012+hash(i,3)*.05,'rgba(30,42,39,.12)');
    }
    if(['diesel','ventShaft','geothermal'].includes(type))for(let i=0;i<Math.ceil(w/1.4);i++){
      const x=.2+hash(i,seed+3)*(w-.4),yy=h-1.9+hash(i,4)*.6;
      line(c,[x,yy,x+.04,yy+.2,x-.01,h-.2],'rgba(34,36,29,.24)',.06+hash(i,7)*.11);
      ellipse(c,x,h-.13,.25,.07,'rgba(29,33,28,.23)');
    }
    line(c,[0,.7,w,.7],'rgba(177,173,139,.10)',.035);
  }else if(style==='wet'||style==='stone'){
    for(let row=0;row<Math.ceil(h/.60);row++){
      const yy=row*.6,points=[0,yy];for(let x=.20;x<w+.4;x+=.40)points.push(x,yy+(hash(row,Math.round(x*8)+seed)-.5)*.16);
      line(c,points,'rgba(17,32,33,.45)',.04);line(c,points.map((v,i)=>i%2?v+.038:v),'rgba(153,165,140,.16)',.013);
      for(let k=0;k<w;k+=1.2){const x=k+hash(row,seed)*.65;line(c,[x,yy,x+.06,yy+.20,x-.05,yy+.57],'rgba(21,34,31,.24)',.023);}
    }
    if(style==='wet')for(let i=0;i<w*2;i++){
      const x=hash(i,seed)*w,y=hash(i,3)*h;
      ellipse(c,x,y,.10+hash(i,7)*.2,.24+hash(i,8)*.3,'rgba(41,74,57,.30)');
      line(c,[x+.04,y+.05,x+.03,Math.min(h,y+.29)],'rgba(158,193,179,.20)',.018);
    }
  }else if(style==='steel'||style==='glass'){
    for(let x=0;x<w;x+=1.15){
      box(c,x+.03,.04,1.06,h-.08,'rgba(128,159,149,.045)',.025,'#344e51',.025);
      line(c,[x+.08,.08,x+.08,h-.1],'rgba(202,210,177,.14)',.023);
      for(let y=.16;y<h;y+=.65)ellipse(c,x+.15,y,.022,.022,'#b1b7a1',P.metalDark,.012);
    }
    if(style==='steel'){
      line(c,[.08,h*.37,w-.12,h*.37],P.metalDark,.16);line(c,[.08,h*.37,w-.12,h*.37],'#9b8b66',.09);
      for(let x=.3;x<w;x+=1.3)box(c,x,h*.37-.08,.07,.16,'#566b65',.015);
    }
  }else if(style==='chalk'){
    box(c,.40,.42,Math.max(.4,w-.8),Math.max(.5,Math.min(1.4,h-1.55)),'#273e38',.035,'#a08254',.075);
    const bottom=.42+Math.max(.5,Math.min(1.4,h-1.55));
    for(let x=.7;x<w-.6;x+=1.7){line(c,[x,bottom-.2,x,bottom-.85,x+.9,bottom-.85],'#9ea991',.015);line(c,[x,bottom-.25,x+.2,bottom-.4,x+.4,bottom-.36,x+.65,bottom-.64,x+.85,bottom-.72],'#d0ccb0',.018);ellipse(c,x+.55,bottom-.93,.11,.11,'rgba(0,0,0,0)','#b8b8a0',.015);}
    line(c,[.45,bottom+.06,w-.45,bottom+.06],P.woodLight,.07);
  }else{
    for(let y=.35,row=0;y<h;y+=.53,row++){
      line(c,[0,y,w,y],'rgba(31,36,31,.27)',.018);
      for(let x=(row%2)*.65;x<w;x+=1.3)line(c,[x,y,x,y+.53],'rgba(31,36,31,.24)',.017);
    }
  }
}
