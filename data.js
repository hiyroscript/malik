/* ============================================================
   MALIK — data.js
   Config, worlds, designs, skills, adventure levels, i18n.
   ============================================================ */

const CFG = {
  W: 960, H: 540,
  GROUND_H: 90,
  GROUND_Y: 450,          // top of the floor
  PX: 420,                // px/sec at 1.00x
  G: 2400,                // gravity
  JUMP: 820,
  DJUMP: 745,
  SLOW_G: 0.30,           // gravity multiplier while gliding
  SLOW_MAX: 250,          // terminal velocity while gliding
  R: 22,                  // player radius
  PLAYER_X: 250,          // fixed screen x
  RUN_TIME: 120,          // two-minute challenge
  BARRIER_GAP: 235,       // how far the wall trails the player
  BARRIER_CATCHUP: 58,   // px/s the wall closes when player is slowed
  SKILL_CD: 10,
  COIN_CHANCE: 0.075,
  SHARD_CHANCE: 0.011,
};

/* Speed schedule: 1.00 -> 2.00 in 0.05 steps.
   Early stages are short (slow game = less content), later ones stretch out. */
const SPEED_STEPS = (() => {
  const a = [];
  for (let i = 0; i <= 20; i++) {
    const spd = +(1 + i * 0.05).toFixed(2);
    const dur = i === 20 ? 9999 : +(3.0 + i * 0.24).toFixed(2); // 3.0s -> 7.56s
    a.push({ spd, dur });
  }
  return a;
})();
// Breathing room right after a world switch — grows with speed.
const breakTime = s => 0.65 + (s - 1) * 1.35;

/* ================= WORLDS ================= */
const WORLDS = [
  {
    id: 'blank', name: 'BLANK', music: 'blank.mp3', mech: 'none',
    pal: { sky1:'#fdfdfd', sky2:'#dcdcdc', ground:'#ffffff', obst:'#ffffff',
           accent:'#111111', deco:'rgba(0,0,0,.10)', text:'rgba(0,0,0,.09)', hud:'#000' }
  },
  {
    id: 'wuste', name: 'WÜSTE', music: 'wuste.mp3', mech: 'sand',
    pal: { sky1:'#ffc078', sky2:'#e2651a', ground:'#f4c48a', obst:'#f2a45c',
           accent:'#7a3a06', deco:'rgba(122,58,6,.16)', text:'rgba(122,58,6,.16)', hud:'#fff' }
  },
  {
    id: 'menimienai', name: 'ME NI MIENAI', music: 'menimienai.mp3', mech: 'flicker',
    pal: { sky1:'#e8f6ff', sky2:'#a8d8f0', ground:'#f5e3ae', obst:'#f7ecc4',
           accent:'#2b6f96', deco:'rgba(43,111,150,.14)', text:'rgba(43,111,150,.13)', hud:'#0d3a52' }
  },
  {
    id: 'malik', name: 'MALIK', music: 'malik.mp3', mech: 'columns', dark:true,
    pal: { sky1:'#1a0205', sky2:'#000000', ground:'#2e0509', obst:'#cf1a1a',
           accent:'#ff2a17', deco:'rgba(255,42,23,.16)', text:'rgba(255,42,23,.14)', hud:'#fff' }
  },
  {
    id: 'wardsback', name: 'WARDSBACK', music: 'wardsback.mp3', mech: 'flip', dark:true,
    pal: { sky1:'#03170d', sky2:'#0a2f1a', ground:'#13512c', obst:'#3fcf72',
           accent:'#7dffab', deco:'rgba(125,255,171,.13)', text:'rgba(125,255,171,.12)', hud:'#fff' }
  },
  {
    id: 'gum', name: 'CHEWING-GUM', music: 'gum.mp3', mech: 'gum',
    pal: { sky1:'#ffe3ef', sky2:'#ff9ec9', ground:'#ff9ecb', obst:'#ff77b4',
           accent:'#a4166b', deco:'rgba(164,22,107,.14)', text:'rgba(164,22,107,.14)', hud:'#5c0034' }
  },
];
const worldById = id => WORLDS.find(w => w.id === id) || WORLDS[0];

/* ================= DESIGNS =================
   draw(g, r, t) — g is translated to the ball centre and already clipped
   to a circle of radius r. t = seconds (for animated designs). */
const PRICE = { common:15, rare:40, epic:90, legendary:180, exclusive:0 };

function fillAll(g,r,c){ g.fillStyle=c; g.fillRect(-r,-r,r*2,r*2); }
function band(g,r,y,h,c){ g.fillStyle=c; g.fillRect(-r,y,r*2,h); }

const DESIGNS = [
/* ---- COMMON ---- */
{id:'classic',name:{en:'Classic',fr:'Classique'},rar:'common',draw(g,r){fillAll(g,r,'#fff');}},
{id:'split',name:{en:'Split',fr:'Moitié'},rar:'common',draw(g,r){fillAll(g,r,'#fff');g.fillStyle='#1c1c1c';g.fillRect(-r,0,r*2,r);}},
{id:'stripes',name:{en:'Stripes',fr:'Rayures'},rar:'common',draw(g,r){fillAll(g,r,'#fff');g.fillStyle='#222';for(let y=-r;y<r;y+=10)g.fillRect(-r,y,r*2,5);}},
{id:'checker',name:{en:'Checker',fr:'Damier'},rar:'common',draw(g,r){fillAll(g,r,'#fff');g.fillStyle='#111';const s=9;for(let x=-3;x<3;x++)for(let y=-3;y<3;y++)if((x+y)%2===0)g.fillRect(x*s,y*s,s,s);}},
{id:'ring',name:{en:'Target',fr:'Cible'},rar:'common',draw(g,r){fillAll(g,r,'#fff');g.strokeStyle='#e23';g.lineWidth=4;for(let i=1;i<=3;i++){g.beginPath();g.arc(0,0,i*5.5,0,7);g.stroke();}}},
{id:'cross',name:{en:'Plus',fr:'Croix'},rar:'common',draw(g,r){fillAll(g,r,'#fff');g.fillStyle='#2b6cff';g.fillRect(-4,-r,8,r*2);g.fillRect(-r,-4,r*2,8);}},
{id:'dots',name:{en:'Speckle',fr:'Moucheté'},rar:'common',draw(g,r){fillAll(g,r,'#fff');g.fillStyle='#333';const p=[[-8,-9],[6,-6],[-4,4],[9,7],[-11,6],[2,-13]];p.forEach(([x,y])=>{g.beginPath();g.arc(x,y,2.6,0,7);g.fill();});}},
{id:'mint',name:{en:'Mint',fr:'Menthe'},rar:'common',draw(g,r){fillAll(g,r,'#d7fff0');g.fillStyle='#38c98d';for(let i=0;i<5;i++){g.beginPath();g.arc(-r+i*11,r-6,7,0,7);g.fill();}}},

/* ---- RARE ---- */
{id:'flame',name:{en:'Ember',fr:'Braise'},rar:'rare',draw(g,r,t){const k=Math.sin(t*7)*2;fillAll(g,r,'#ffd23f');g.fillStyle='#ff7a1a';g.beginPath();g.moveTo(-r,r);g.quadraticCurveTo(-6,2+k,0,-r);g.quadraticCurveTo(6,2-k,r,r);g.fill();g.fillStyle='#e8281a';g.beginPath();g.moveTo(-9,r);g.quadraticCurveTo(0,4+k,0,-6);g.quadraticCurveTo(0,4-k,9,r);g.fill();}},
{id:'wave',name:{en:'Tide',fr:'Marée'},rar:'rare',draw(g,r,t){fillAll(g,r,'#eaf7ff');g.fillStyle='#1b74d8';g.beginPath();g.moveTo(-r,r);for(let x=-r;x<=r;x+=3)g.lineTo(x,2+Math.sin(x*.22+t*3)*4);g.lineTo(r,r);g.fill();g.fillStyle='#7fd2ff';g.beginPath();g.moveTo(-r,r);for(let x=-r;x<=r;x+=3)g.lineTo(x,9+Math.sin(x*.25-t*4)*3);g.lineTo(r,r);g.fill();}},
{id:'circuit',dot:'#fff',name:{en:'Circuit',fr:'Circuit'},rar:'rare',draw(g,r,t){fillAll(g,r,'#0d2019');g.strokeStyle='#38ff9e';g.lineWidth=1.6;g.beginPath();g.moveTo(-r,-6);g.lineTo(-4,-6);g.lineTo(-4,6);g.lineTo(8,6);g.lineTo(8,-12);g.lineTo(r,-12);g.moveTo(-r,10);g.lineTo(-10,10);g.lineTo(-10,-14);g.stroke();g.fillStyle=Math.sin(t*6)>0?'#8dffce':'#38ff9e';[[-4,6],[8,-12],[-10,-14]].forEach(([x,y])=>{g.beginPath();g.arc(x,y,2.6,0,7);g.fill();});}},
{id:'vinyl',dot:'#fff',name:{en:'Vinyl',fr:'Vinyle'},rar:'rare',draw(g,r){fillAll(g,r,'#151515');g.strokeStyle='rgba(255,255,255,.2)';g.lineWidth=1;for(let i=4;i<r;i+=3.2){g.beginPath();g.arc(0,0,i,0,7);g.stroke();}g.fillStyle='#e83a2f';g.beginPath();g.arc(0,0,6,0,7);g.fill();}},
{id:'pixel',dot:'#fff',name:{en:'Pixel Heart',fr:'Cœur Pixel'},rar:'rare',draw(g,r){fillAll(g,r,'#1b1b2e');g.fillStyle='#ff4d6d';const m=[[1,0],[2,0],[4,0],[5,0],[0,1],[1,1],[2,1],[3,1],[4,1],[5,1],[6,1],[0,2],[1,2],[2,2],[3,2],[4,2],[5,2],[6,2],[1,3],[2,3],[3,3],[4,3],[5,3],[2,4],[3,4],[4,4],[3,5]];m.forEach(([x,y])=>g.fillRect(-11+x*3.4,-9+y*3.4,3.4,3.4));}},
{id:'bamboo',name:{en:'Bamboo',fr:'Bambou'},rar:'rare',draw(g,r){fillAll(g,r,'#f2f7e4');g.fillStyle='#5b9b3e';for(let x=-r+4;x<r;x+=11){g.fillRect(x,-r,6,r*2);}g.fillStyle='#3f7529';for(let x=-r+4;x<r;x+=11)for(let y=-r;y<r;y+=13)g.fillRect(x,y,6,2);}},
{id:'honey',name:{en:'Honeycomb',fr:'Alvéole'},rar:'rare',draw(g,r){fillAll(g,r,'#ffcf3d');g.strokeStyle='#8a5a00';g.lineWidth=1.8;for(let ry=-2;ry<3;ry++)for(let cx=-2;cx<3;cx++){const x=cx*13+(ry%2?6.5:0),y=ry*11;g.beginPath();for(let i=0;i<6;i++){const a=Math.PI/3*i;const px=x+Math.cos(a)*6,py=y+Math.sin(a)*6;i?g.lineTo(px,py):g.moveTo(px,py);}g.closePath();g.stroke();}}},
{id:'storm',dot:'#fff',name:{en:'Storm',fr:'Orage'},rar:'rare',draw(g,r,t){fillAll(g,r,'#2b3550');g.fillStyle='rgba(255,255,255,.14)';for(let i=0;i<4;i++){g.beginPath();g.arc(-10+i*8,-8+((i*7+t*9)%26)-13,7,0,7);g.fill();}if(Math.sin(t*5)>.75){g.fillStyle='#ffe14d';g.beginPath();g.moveTo(2,-12);g.lineTo(-5,2);g.lineTo(0,2);g.lineTo(-3,14);g.lineTo(7,-2);g.lineTo(2,-2);g.fill();}}},

/* ---- EPIC ---- */
{id:'galaxy',dot:'#fff',name:{en:'Galaxy',fr:'Galaxie'},rar:'epic',draw(g,r,t){const gr=g.createLinearGradient(-r,-r,r,r);gr.addColorStop(0,'#1a0b3d');gr.addColorStop(.5,'#4b1a7a');gr.addColorStop(1,'#0b1b4d');fillAll(g,r,gr);for(let i=0;i<22;i++){const a=i*2.399+t*.35,d=(i%7)*3.1;const x=Math.cos(a)*d,y=Math.sin(a)*d;g.fillStyle=`rgba(255,255,255,${.35+.65*Math.abs(Math.sin(t*3+i))})`;g.beginPath();g.arc(x,y,1.3,0,7);g.fill();}}},
{id:'prism',name:{en:'Prism',fr:'Prisme'},rar:'epic',draw(g,r,t){for(let i=0;i<8;i++){g.fillStyle=`hsl(${(i*45+t*70)%360} 92% 58%)`;g.beginPath();g.moveTo(0,0);g.arc(0,0,r,i*Math.PI/4+t*.6,(i+1)*Math.PI/4+t*.6);g.fill();}}},
{id:'magma',dot:'#fff',name:{en:'Magma',fr:'Magma'},rar:'epic',draw(g,r,t){fillAll(g,r,'#1a0603');for(let i=0;i<5;i++){const y=r-((t*22+i*13)%(r*2+14));g.fillStyle=`rgba(255,${90+i*22},20,.9)`;g.beginPath();g.ellipse(-14+i*7,y,4.5,7,0,0,7);g.fill();}g.fillStyle='#ff4a12';g.fillRect(-r,r-7,r*2,9);}},
{id:'glitch',dot:'#fff',name:{en:'Glitch',fr:'Glitch'},rar:'epic',draw(g,r,t){fillAll(g,r,'#0a0a0a');for(let i=0;i<9;i++){const y=-r+i*5;const off=Math.sin(t*17+i*2.3)*7;g.fillStyle=i%3===0?'#ff2a6d':(i%3===1?'#05d9e8':'#fff');g.fillRect(-r+off,y,r*2,3.1);}}},
{id:'clock',name:{en:'Clockwork',fr:'Rouages'},rar:'epic',draw(g,r,t){fillAll(g,r,'#e8dcc0');g.strokeStyle='#6b4f1d';g.lineWidth=2;[[0,0,12,t],[11,-11,7,-t*1.8]].forEach(([x,y,rad,a])=>{g.save();g.translate(x,y);g.rotate(a);g.beginPath();g.arc(0,0,rad,0,7);g.stroke();for(let i=0;i<8;i++){const an=i*Math.PI/4;g.beginPath();g.moveTo(Math.cos(an)*rad,Math.sin(an)*rad);g.lineTo(Math.cos(an)*(rad+3.4),Math.sin(an)*(rad+3.4));g.stroke();}g.restore();});}},
{id:'aurora',dot:'#fff',name:{en:'Aurora',fr:'Aurore'},rar:'epic',draw(g,r,t){fillAll(g,r,'#04121f');for(let i=0;i<3;i++){g.fillStyle=`hsla(${140+i*55+Math.sin(t)*20} 90% 60% / .5)`;g.beginPath();g.moveTo(-r,r);for(let x=-r;x<=r;x+=3)g.lineTo(x,-4+i*7+Math.sin(x*.16+t*1.7+i)*6);g.lineTo(r,r);g.fill();}}},

/* ---- LEGENDARY ---- */
{id:'eclipse',dot:'#fff',name:{en:'Eclipse',fr:'Éclipse'},rar:'legendary',draw(g,r,t){const gr=g.createRadialGradient(0,0,3,0,0,r);gr.addColorStop(0,'#000');gr.addColorStop(.62,'#000');gr.addColorStop(.72,'#ffb63d');gr.addColorStop(1,'#ff5a1a');fillAll(g,r,gr);g.globalAlpha=.55+Math.sin(t*3)*.25;g.strokeStyle='#fff2c9';g.lineWidth=1.4;g.beginPath();g.arc(0,0,r*.7,0,7);g.stroke();g.globalAlpha=1;}},
{id:'singularity',dot:'#fff',name:{en:'Singularity',fr:'Singularité'},rar:'legendary',draw(g,r,t){fillAll(g,r,'#05000a');for(let i=0;i<34;i++){const a=i*.61+t*1.15,d=(i/34)*r;g.fillStyle=`hsla(${270+i*3} 95% ${40+i}% / .85)`;g.beginPath();g.arc(Math.cos(a)*d,Math.sin(a)*d,1.9-i*.03,0,7);g.fill();}g.fillStyle='#000';g.beginPath();g.arc(0,0,4.5,0,7);g.fill();}},
{id:'phoenix',name:{en:'Phoenix',fr:'Phénix'},rar:'legendary',draw(g,r,t){const gr=g.createLinearGradient(0,r,0,-r);gr.addColorStop(0,'#ff2a00');gr.addColorStop(.5,'#ff9a00');gr.addColorStop(1,'#ffe94a');fillAll(g,r,gr);g.fillStyle='rgba(255,255,255,.85)';const s=1+Math.sin(t*4)*.09;g.save();g.scale(s,s);g.beginPath();g.moveTo(0,-13);g.quadraticCurveTo(11,-4,4,10);g.quadraticCurveTo(0,4,-4,10);g.quadraticCurveTo(-11,-4,0,-13);g.fill();g.restore();}},
{id:'void',dot:'#fff',name:{en:'Void Bloom',fr:'Floraison Vide'},rar:'legendary',draw(g,r,t){fillAll(g,r,'#0b0416');for(let p=0;p<6;p++){const a=p*Math.PI/3+t*.5;g.fillStyle=`hsla(${290+p*10} 90% 62% / .78)`;g.save();g.rotate(a);g.beginPath();g.ellipse(0,-10,4.5,10.5,0,0,7);g.fill();g.restore();}g.fillStyle='#fff';g.beginPath();g.arc(0,0,3.4,0,7);g.fill();}},
{id:'gold',name:{en:'Gold Leaf',fr:'Feuille d\'Or'},rar:'legendary',draw(g,r,t){const gr=g.createLinearGradient(-r,-r,r,r);const k=(Math.sin(t*1.6)+1)/2;gr.addColorStop(0,'#a06a00');gr.addColorStop(Math.max(.05,k*.8),'#fff3ba');gr.addColorStop(1,'#8a5a00');fillAll(g,r,gr);g.strokeStyle='rgba(80,50,0,.55)';g.lineWidth=1.2;g.beginPath();g.moveTo(-r,-6);g.quadraticCurveTo(0,2,r,-9);g.moveTo(-r,8);g.quadraticCurveTo(0,-1,r,11);g.stroke();}},

/* ---- EXCLUSIVE (win reward) ---- */
{id:'twominutes',dot:'#fff',name:{en:'Two Minutes',fr:'Deux Minutes'},rar:'exclusive',draw(g,r,t){fillAll(g,r,'#000');g.strokeStyle='#ff2a17';g.lineWidth=2;g.beginPath();g.arc(0,0,r*.72,-Math.PI/2,-Math.PI/2+((t*1.2)%1)*Math.PI*2);g.stroke();g.fillStyle='#fff';g.font='bold 13px ui-monospace,monospace';g.textAlign='center';g.textBaseline='middle';g.fillText('2:00',0,1);}},
];
DESIGNS.forEach(d => d.price = PRICE[d.rar]);
const designById = id => DESIGNS.find(d => d.id === id) || DESIGNS[0];
const RARITIES = ['common','rare','epic','legendary'];

/* ================= SKILLS ================= */
const SKILLS = [
  { id:'fade',    icon:'◍', cost:1, name:{en:'Fade',fr:'Estompe'},
    desc:{en:'Turn translucent and pass through obstacles for 5s.',fr:'Devient translucide et traverse les obstacles pendant 5 s.'} },
  { id:'triple',  icon:'⇈', cost:1, name:{en:'Triple Jump',fr:'Triple Saut'},
    desc:{en:'Gain a third mid-air jump for 5s.',fr:'Ajoute un troisième saut aérien pendant 5 s.'} },
  { id:'revive',  icon:'✚', cost:1, name:{en:'Revive',fr:'Réanimation'},
    desc:{en:'Fires automatically on death and continues the run. Cannot save you from the wall.',fr:'S\'active à la mort et poursuit la partie. Ne protège pas du mur.'} },
  { id:'dash',    icon:'⇥', cost:1, name:{en:'Dash',fr:'Ruée'},
    desc:{en:'Burst forward, shredding anything in the way.',fr:'Fonce vers l\'avant en détruisant tout sur le passage.'} },
  { id:'cleanse', icon:'✧', cost:1, name:{en:'Cleanse',fr:'Purge'},
    desc:{en:'Clears world effects that block sight or movement for 5s.',fr:'Efface les effets de monde gênants pendant 5 s.'} },
];
const skillById = id => SKILLS.find(s => s.id === id) || null;

/* ================= ADVENTURE LEVELS ================= */
const LEVELS = [
  {n:1, key:'l1', world:'blank',      spd:1.00, len:42, diff:'easy',   seed:1101, rules:[]},
  {n:2, key:'l2', world:'blank',      spd:1.10, len:48, diff:'easy',   seed:2202, rules:['gaps']},
  {n:3, key:'l3', world:'wuste',      spd:1.15, len:52, diff:'easy',   seed:3303, rules:['sand']},
  {n:4, key:'l4', world:'wuste',      spd:1.25, len:55, diff:'medium', seed:4404, rules:['ceilings','noDouble']},
  {n:5, key:'l5', world:'menimienai', spd:1.20, len:58, diff:'medium', seed:5505, rules:['flicker']},
  {n:6, key:'l6', world:'gum',        spd:1.25, len:58, diff:'medium', seed:6606, rules:['gum']},
  {n:7, key:'l7', world:'wardsback',  spd:1.30, len:60, diff:'medium', seed:7707, rules:['flip']},
  {n:8, key:'l8', world:'malik',      spd:1.30, len:55, diff:'hard',   seed:8808, rules:['columns']},
  {n:9, key:'l9', world:'menimienai', spd:1.45, len:64, diff:'hard',   seed:9909, rules:['flicker','noSlow']},
  {n:10,key:'l10',world:'wardsback',  spd:1.55, len:66, diff:'hard',   seed:1010, rules:['flip','gaps']},
  {n:11,key:'l11',world:'gum',        spd:1.65, len:70, diff:'brutal', seed:1111, rules:['gum','noSkill']},
  {n:12,key:'l12',world:'malik',      spd:1.80, len:72, diff:'brutal', seed:1212, rules:['columns','noSkill']},
];

/* ================= I18N ================= */
const I18N = {
  en:{
    h_kick:'ENDLESS RUN · REACT OR RESTART', h_best:'BEST', h_coins:'COINS', h_shards:'SHARDS',
    m_play:'PLAY', m_store:'STORE', m_locker:'LOCKER', m_set:'SETTINGS',
    mo_title:'SELECT MODE', mo_c:'TWO MINUTES', mo_a:'ADVENTURE',
    mo_cd:'Worlds rotate. Speed climbs from 1.00× to 2.00×. Survive the full two minutes to win.',
    mo_ad:'Fixed levels, fixed speed, one rule each. Finish a level to unlock the next.',
    a_title:'ADVENTURE', a_done:'CLEARED', a_locked:'LOCKED',
    s_title:'STORE', s_design:'DESIGNS', s_skill:'SKILLS', s_refresh:'NEW SELECTION IN',
    s_skillnote:'Every skill costs 1 shard. Shards only drop in Two Minutes runs.',
    l_title:'LOCKER', l_instore:'IN STORE', l_owned:'OWNED', l_equipped:'EQUIPPED',
    l_equip:'EQUIP', l_buy:'BUY', l_locked:'LOCKED',
    st_time:'TIME', st_score:'SCORE', st_jump:'JUMPS', st_djump:'DOUBLE JUMPS',
    st_slow:'SLOW FALLS', st_crouch:'CROUCHES', st_skill:'SKILL', st_att:'ATTEMPTS',
    p_title:'PAUSED', p_resume:'RESUME', p_restart:'RESTART', p_quit:'QUIT TO MENU',
    o_again:'TRY AGAIN', o_home:'MENU', o_over:'GAME OVER', o_win:'YOU SURVIVED',
    o_clear:'LEVEL CLEAR', o_wall:'THE WALL CAUGHT YOU', o_run:'RUN ENDED',
    o_best:'BEST', o_score:'SCORE', o_time:'TIME', o_prog:'PROGRESS',
    set_lang:'Language', set_sfx:'Sound effects', set_mus:'Music',
    set_musvol:'Music volume', set_sfxvol:'Effects volume',
    set_pitch:'Music pitch follows speed', set_pitch_d:'Off keeps the original pitch while still speeding up.',
    set_shake:'Screen shake', set_part:'Background particles', set_part_d:'Turn off if the game stutters.',
    set_flash:'Reduce flashing', set_lefty:'Left-handed controls', set_fps:'Show FPS',
    set_reset:'RESET ALL PROGRESS', set_reset_c:'Tap again to erase everything.',
    rot:'Turn your device sideways',
    t_bought:'Purchased', t_equipped:'Equipped', t_nocoins:'Not enough coins',
    t_noshards:'Not enough shards', t_owned:'Already owned', t_reset:'Progress erased',
    t_unlock:'New design unlocked', t_win:'Two Minutes design unlocked',
    d_easy:'EASY', d_medium:'MEDIUM', d_hard:'HARD', d_brutal:'BRUTAL',
    lv_rule:'RULE', lvr_gaps:'Wide gaps', lvr_sand:'Sandstorm', lvr_ceilings:'Low ceilings',
    lvr_noDouble:'No double jump', lvr_noSlow:'No slow fall', lvr_flicker:'Flickering obstacles',
    lvr_gum:'Sticky ground', lvr_flip:'World flipped', lvr_columns:'Three columns', lvr_noSkill:'No skills',
  },
  fr:{
    h_kick:'COURSE SANS FIN · RÉAGIS OU RECOMMENCE', h_best:'RECORD', h_coins:'PIÈCES', h_shards:'ÉCLATS',
    m_play:'JOUER', m_store:'BOUTIQUE', m_locker:'CASIER', m_set:'RÉGLAGES',
    mo_title:'CHOISIR UN MODE', mo_c:'DEUX MINUTES', mo_a:'AVENTURE',
    mo_cd:'Les mondes tournent. La vitesse monte de 1,00× à 2,00×. Tiens deux minutes pour gagner.',
    mo_ad:'Niveaux fixes, vitesse fixe, une règle chacun. Termine un niveau pour ouvrir le suivant.',
    a_title:'AVENTURE', a_done:'TERMINÉS', a_locked:'VERROUILLÉ',
    s_title:'BOUTIQUE', s_design:'DESIGNS', s_skill:'COMPÉTENCES', s_refresh:'NOUVELLE SÉLECTION DANS',
    s_skillnote:'Chaque compétence coûte 1 éclat. Les éclats tombent seulement en mode Deux Minutes.',
    l_title:'CASIER', l_instore:'EN BOUTIQUE', l_owned:'OBTENU', l_equipped:'ÉQUIPÉ',
    l_equip:'ÉQUIPER', l_buy:'ACHETER', l_locked:'VERROUILLÉ',
    st_time:'TEMPS', st_score:'SCORE', st_jump:'SAUTS', st_djump:'DOUBLES SAUTS',
    st_slow:'CHUTES LENTES', st_crouch:'ACCROUPIS', st_skill:'COMPÉTENCE', st_att:'ESSAIS',
    p_title:'PAUSE', p_resume:'REPRENDRE', p_restart:'RECOMMENCER', p_quit:'QUITTER',
    o_again:'RÉESSAYER', o_home:'MENU', o_over:'PARTIE TERMINÉE', o_win:'TU AS SURVÉCU',
    o_clear:'NIVEAU RÉUSSI', o_wall:'LE MUR T\'A RATTRAPÉ', o_run:'COURSE TERMINÉE',
    o_best:'RECORD', o_score:'SCORE', o_time:'TEMPS', o_prog:'PROGRESSION',
    set_lang:'Langue', set_sfx:'Effets sonores', set_mus:'Musique',
    set_musvol:'Volume musique', set_sfxvol:'Volume effets',
    set_pitch:'La musique suit la vitesse', set_pitch_d:'Désactivé garde la hauteur d\'origine.',
    set_shake:'Secousses d\'écran', set_part:'Particules d\'arrière-plan', set_part_d:'Désactive si le jeu saccade.',
    set_flash:'Réduire les clignotements', set_lefty:'Commandes gaucher', set_fps:'Afficher les FPS',
    set_reset:'EFFACER TOUTE LA PROGRESSION', set_reset_c:'Appuie encore pour tout effacer.',
    rot:'Tourne ton appareil',
    t_bought:'Acheté', t_equipped:'Équipé', t_nocoins:'Pas assez de pièces',
    t_noshards:'Pas assez d\'éclats', t_owned:'Déjà obtenu', t_reset:'Progression effacée',
    t_unlock:'Nouveau design débloqué', t_win:'Design Deux Minutes débloqué',
    d_easy:'FACILE', d_medium:'MOYEN', d_hard:'DIFFICILE', d_brutal:'BRUTAL',
    lv_rule:'RÈGLE', lvr_gaps:'Grands trous', lvr_sand:'Tempête de sable', lvr_ceilings:'Plafonds bas',
    lvr_noDouble:'Sans double saut', lvr_noSlow:'Sans chute lente', lvr_flicker:'Obstacles clignotants',
    lvr_gum:'Sol collant', lvr_flip:'Monde inversé', lvr_columns:'Trois colonnes', lvr_noSkill:'Sans compétences',
  }
};
