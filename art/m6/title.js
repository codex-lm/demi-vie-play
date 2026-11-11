import { P, hash, finite, seedOf, frame } from './common.js';
import { drawTitleScene, drawLogo } from '../title-scene.js';
import { drawColonist } from '../colonist.js';
import { halo, line, ellipse } from '../primitives.js';
import { cinemaText } from './cinema-strings.fr.js';

/** Slow, layered title tableau; caller owns requestAnimationFrame and menu input. */
export function createTitleAnimation({seed=6,branding=true,language}={}) {
  const T=cinemaText(language);
  seed=seedOf(seed);let time=0,background=null;
  if(typeof OffscreenCanvas==='function')background=new OffscreenCanvas(1600,900);
  else if(typeof document!=='undefined'&&document.createElement){background=document.createElement('canvas');background.width=1600;background.height=900;}
  // Fixed CPU-backed cache avoids adaptive GPU/CPU raster differences on replay.
  if(background)drawTitleScene(background.getContext('2d',{willReadFrequently:true}),1600,900,{t:0});
  return {
    update(dt){time+=Math.max(0,finite(dt));},
    get time(){return time;},
    draw(ctx,w,h){
      frame(ctx,0,0,w,h,c=>{
        c.fillStyle='#101c22';c.fillRect(0,0,w,h);
        const s=Math.max(w/1600,h/900),offset=(w-1600*s)/2;
        c.translate(offset,(h-900*s)/2);c.scale(s,s);
        // A two-pixel breathing drift separates rock and the overlay's near dust.
        c.save();c.translate(Math.sin(time*.07)*1.8,0);
        if(background)c.drawImage(background,0,0);else drawTitleScene(c,1600,900,{t:0});
        c.restore();
        const floor=900*.405+115+168;
        drawColonist(c,880+Math.sin(time*.10+seed)*88,floor+20,30,{seed:seed+101,job:'hauler',pose:'walk',t:time*.57,facing:Math.cos(time*.10+seed)>=0?1:-1});
        drawColonist(c,410,floor-3,32,{seed:seed+13,age:'child',pose:'talk',t:time*.56,facing:-1});
        // Warm, deliberately non-periodic-looking lamp flicker stays deterministic.
        halo(c,820,900*.405+143,116,.032+.010*Math.sin(time*1.73)+.004*Math.sin(time*7.11));
        for(let i=0;i<61;i++) {
          const x=hash(seed,i)*1600+Math.sin(time*.13+i)*9;
          const y=320+((hash(seed+2,i)*530+time*(1+hash(seed+3,i)*3))%530);
          ellipse(c,x,y,.8+hash(seed+4,i),.7,`rgba(228,205,156,${.05+hash(seed+5,i)*.13})`);
        }
        // Feathered cloud wisps move independently from the cutaway.
        for(let i=0;i<4;i++) {
          const x=150+hash(seed+10,i)*1100+Math.sin(time*.012+i)*25,y=91+i*40;
          c.save();c.translate(x+110,y);c.scale(190+i*18,6+i*2);
          const mist=c.createRadialGradient(0,0,0,0,0,1);
          mist.addColorStop(0,'#bdbaa218');mist.addColorStop(.5,'#bdbaa20a');mist.addColorStop(1,'#bdbaa200');
          ellipse(c,0,0,1,1,mist);c.restore();
        }
        if(branding) {
          drawLogo(c,470,99,112);
          c.fillStyle=P.cream;c.font='21px Georgia, serif';c.textAlign='center';
          c.fillText(T.titleSubtitle,800,255);
          line(c,[719,281,881,281],'#d5bf8855',1);
        }
      });
    },
  };
}
