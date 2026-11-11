import {P, TAU} from './palette.js';
import {box, ellipse, line, poly, gradient, halo} from './primitives.js';

function map(c,x,y,w,h,variant=0){
  c.save();c.translate(x,y);c.rotate(variant?.035:-.035);
  box(c,0,0,w,h,'#d6c5a0',.025,P.woodDark,.025);
  for(let i=1;i<5;i++)line(c,[w*i/5,.04,w*i/5,h-.04],'#b8ae8d',.011);
  for(let j=1;j<4;j++)line(c,[.04,h*j/4,w-.04,h*j/4],'#b8ae8d',.011);
  const points=[w*.10,h*.64,w*.26,h*.38,w*.43,h*.53,w*.62,h*.31,w*.87,h*.43];
  line(c,points,'#8d9b87',.12);line(c,points,'#b8c4a4',.047);
  line(c,[w*.14,h*.83,w*.35,h*.67,w*.49,h*.74,w*.73,h*.59,w*.84,h*.14],'#a57258',.024);
  for(const [px,py]of [[.26,.38],[.49,.74],[.73,.59]]){box(c,w*px-.04,h*py-.04,.08,.08,'#687f78',.012,null);ellipse(c,w*px,h*py,.025,.025,'#ae6750');}
  for(const px of [.10,w-.10])ellipse(c,px,.07,.031,.031,'#a3654c',P.inkSoft,.01);
  // A folded corner keeps this a paper map, not another instrument screen.
  poly(c,[w-.17,h,w,h-.17,w,h],'#b4a98c',null);c.restore();
}
function receiver(c,x,y,active,t,powered){
  c.save();c.translate(x,y);
  box(c,-1.38,-1.30,2.76,1.30,gradient(c,-1.3,-1.3,2.7,1.3,'#8d775c','#514d41'),.12,P.ink,.045);
  box(c,-1.27,-1.17,2.54,1.07,'#526965',.065,P.ink,.027);
  // Glass valves rise above the chassis; their filaments stay warm at idle.
  for(let i=0;i<4;i++){
    const xx=-.96+i*.31;
    box(c,xx-.10,-1.67,.20,.36,gradient(c,xx-.1,-1.67,.2,.36,'#879d8c','#67796a'),.075,P.ink,.02);
    if(powered){halo(c,xx,-1.39,.22,.10);line(c,[xx-.035,-1.45,xx,-1.39,xx+.032,-1.46],'#e0ad65',.023);}
    line(c,[xx-.055,-1.58,xx-.055,-1.39],'#c9d1ad99',.015);box(c,xx-.12,-1.34,.24,.07,P.metalDark,.012);
  }
  box(c,.56,-1.63,.51,.32,'#657b73',.035,P.ink,.025);
  for(let i=0;i<5;i++)line(c,[.60+i*.095,-1.59,.60+i*.095,-1.35],'#92a591',.018);
  // Cloth speaker and closely spaced slats, recognisable at native room scale.
  box(c,-1.12,-1.02,.82,.78,'#9b9579',.055,P.inkSoft,.025);
  for(let i=0;i<8;i++)line(c,[-1.06+i*.096,-.96,-1.06+i*.096,-.30],'#5d6858',.025);
  for(let i=0;i<4;i++)line(c,[-1.08,-.91+i*.18,-.35,-.91+i*.18],'#c1b690',.011);
  box(c,-.16,-1.03,1.23,.37,powered?'#c3c79b':'#778575',.045,P.ink,.025);
  for(let i=0;i<13;i++)line(c,[-.08+i*.086,-.96,-.08+i*.086,-.91+(i%3===0?.11:.04)],'#566f60',.013);
  const needle=.39+(active?Math.sin(t*2.9)*.22+Math.sin(t*7)*.065:0);
  line(c,[needle,-.97,needle,-.71],'#9c5440',.035);
  box(c,.11,-.55,.45,.30,'#9bba9d',.04,P.ink,.022);
  const vu=active?Math.sin(t*10)*.50+.15:-.50;
  line(c,[.33,-.30,.33+Math.sin(vu)*.15,-.30-Math.cos(vu)*.16],P.inkSoft,.023);
  for(const [xx,r]of [[-.08,.10],[.78,.19],[1.13,.08]]){
    ellipse(c,xx,-.39,r,r,'#a9ac90',P.ink,.028);ellipse(c,xx,-.39,r*.72,r*.72,'#5b6b60');line(c,[xx,-.39-r*.5,xx,-.39-r*.85],'#d9caa6',.018);
  }
  const pilot=active?(.72+.28*Math.sin(t*9)):powered?.16:0;
  ellipse(c,1.10,-1.11,.10,.10,'#ad9c6d',P.ink,.02);
  ellipse(c,1.10,-1.11,.073,.073,active?'#ceda91':powered?'#718365':'#455d53');
  if(powered){c.save();c.globalAlpha*=pilot;halo(c,1.10,-1.11,active?.43:.17,active?.34:.12);ellipse(c,1.10,-1.11,.052,.052,'#f6efb5');c.restore();}
  for(const xx of [-1.24,1.24])for(const yy of [-1.23,-.10])ellipse(c,xx,yy,.022,.022,P.metalLight);
  c.restore();
}
function headset(c,x,y){
  c.save();c.translate(x,y);
  c.beginPath();c.moveTo(-.30,-.10);c.bezierCurveTo(-.48,-.95,.45,-.95,.32,-.10);c.strokeStyle=P.ink;c.lineWidth=.12;c.stroke();
  c.beginPath();c.moveTo(-.30,-.12);c.bezierCurveTo(-.44,-.87,.41,-.87,.32,-.12);c.strokeStyle='#a29472';c.lineWidth=.055;c.stroke();
  for(const s of [-1,1])box(c,s*.30-.09,-.30,.18,.32,'#51665e',.075,P.ink,.03);
  const p=[];for(let i=0;i<=24;i++)p.push(.33+Math.sin(i*TAU/3)*.035,-.05+i*.025);line(c,p,'#393f38',.027);c.restore();
}
function notebook(c,x,y){
  c.save();c.translate(x,y);c.rotate(-.1);
  poly(c,[-.49,-.08,-.08,-.13,0,-.08,.42,-.13,.51,.11,.04,.15,0,.11,-.42,.15],'#7d6650',P.ink,.022);
  poly(c,[-.47,-.12,-.08,-.17,0,-.12,.40,-.17,.48,.06,.03,.10,0,.06,-.43,.11],'#e1d1a9',P.inkSoft,.015);
  line(c,[0,-.12,.02,.07],'#ab9874',.016);
  for(let j=0;j<4;j++)for(const s of [-1,1])line(c,[s*.09,-.08+j*.04,s*.34,-.10+j*.04],'#978f73',.011);
  line(c,[.25,.11,.54,-.06],'#b18a57',.033);c.restore();
}

function radio(c,w,h,o={}){
  c.save();const scale=Math.max(.05,Math.min(1,(w-.35)/5.8,(h-.3)/3.8));
  c.translate(w/2,h-.12);c.scale(scale,scale);
  const powered=o.powered!==false,active=powered&&o.receiving===true,t=Number.isFinite(o.t)?o.t:0;
  // Copper feed wire runs from ceiling to the receiver, including ceramic guides.
  line(c,[2.38,-3.58,2.38,-2.26,1.17,-1.93,.89,-1.64],'#3c4943',.065);
  line(c,[2.40,-3.58,2.40,-2.27,1.19,-1.94,.91,-1.64],'#b39b73',.022);
  for(const yy of [-3.35,-2.75]){ellipse(c,2.39,yy,.10,.07,'#c4c7ae',P.ink,.02);ellipse(c,2.39,yy,.035,.035,'#67796b');}
  map(c,-2.63,-3.52,1.35,1.17);map(c,-.98,-3.69,2.05,1.28,1);
  // Desk, stool, power box and coiled cable all belong to this one station.
  for(const xx of [-2.48,2.48])box(c,xx-.075,-1.36,.15,1.36,'#7e6045',.025,P.ink,.025);
  line(c,[-2.46,-.27,2.46,-.27],P.woodDark,.085);
  box(c,-2.65,-1.46,5.3,.18,gradient(c,-2.6,-1.46,5.2,.18,'#b69a6b','#92724f'),.04,P.ink,.035);
  box(c,-2.28,-1.22,1.16,.25,'#7f7256',.025,P.ink,.025);line(c,[-1.88,-1.09,-1.59,-1.09],P.metalLight,.035);
  box(c,1.50,-.94,.79,.89,'#60766b',.05,P.ink,.03);for(let i=0;i<5;i++)line(c,[1.60,-.80+i*.12,2.17,-.80+i*.12],'#3b514b',.025);
  line(c,[.85,-1.46,.86,-1.12,1.41,-1.02,1.70,-.94],P.ink,.045);
  receiver(c,-.27,-1.48,active,t,powered);
  headset(c,1.77,-1.48);notebook(c,-2.06,-1.48);
  for(const xx of [-.55,.55])line(c,[xx,-.54,xx*.87,0],'#82664b',.085);
  box(c,-.69,-.64,1.38,.15,'#a48c67',.06,P.ink,.03);
  line(c,[-.57,-.66,-.57,-1.08,.56,-1.08,.56,-.66],'#756248',.07);box(c,-.62,-1.14,1.24,.22,'#9b8262',.045,P.ink,.025);
  c.restore();
}
export const RADIO=Object.freeze({radio});
