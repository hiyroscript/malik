/* ============================================================
   MALIK — core.js   RNG · save data · audio
   ============================================================ */

/* ---------- math / rng ---------- */
const clamp = (v,a,b)=>v<a?a:v>b?b:v;
const lerp  = (a,b,t)=>a+(b-a)*t;
const rand  = (a,b)=>a+Math.random()*(b-a);

function mulberry32(seed){
  let a = seed >>> 0;
  return function(){
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function makeRNG(seed){
  const f = mulberry32(seed);
  return {
    next:f,
    range:(a,b)=>a+f()*(b-a),
    int:(a,b)=>Math.floor(a+f()*(b-a+1)),
    pick:arr=>arr[Math.floor(f()*arr.length)],
    chance:p=>f()<p,
    weighted(obj){ // {key:weight}
      let tot=0; for(const k in obj) tot+=obj[k];
      let n=f()*tot;
      for(const k in obj){ n-=obj[k]; if(n<=0) return k; }
      return Object.keys(obj)[0];
    }
  };
}
function hashStr(s){ let h=2166136261; for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);} return h>>>0; }

/* ---------- save ---------- */
const SAVE_KEY = 'malik.save.v1';
const DEFAULT_SAVE = {
  v:1, lang:null, seedId:0,
  coins:0, shards:0,
  designs:['classic'], skills:[],
  equipDesign:'classic', equipSkill:null,
  highScore:0, bestTime:0, wins:0, attempts:0,
  store:{ day:-1, ids:[] },
  adventure:{ unlocked:1, best:{}, cleared:[] },
  totals:{ jumps:0, djumps:0, slows:0, crouches:0, skills:0, runs:0 },
  set:{ sfx:true, music:true, musVol:0.7, sfxVol:0.8, pitch:true,
        shake:true, particles:true, flash:false, lefty:false, fps:false }
};

const Save = {
  d: null,
  load(){
    try{
      const raw = localStorage.getItem(SAVE_KEY);
      this.d = raw ? Object.assign(structuredClone(DEFAULT_SAVE), JSON.parse(raw)) : structuredClone(DEFAULT_SAVE);
      this.d.set = Object.assign(structuredClone(DEFAULT_SAVE.set), this.d.set||{});
      this.d.adventure = Object.assign(structuredClone(DEFAULT_SAVE.adventure), this.d.adventure||{});
      this.d.totals = Object.assign(structuredClone(DEFAULT_SAVE.totals), this.d.totals||{});
    }catch(e){ this.d = structuredClone(DEFAULT_SAVE); }
    if(!this.d.seedId){ this.d.seedId = Math.floor(Math.random()*1e9)+1; this.save(); }
    return this.d;
  },
  save(){ try{ localStorage.setItem(SAVE_KEY, JSON.stringify(this.d)); }catch(e){} },
  reset(){ const seed = Math.floor(Math.random()*1e9)+1;
           this.d = structuredClone(DEFAULT_SAVE); this.d.seedId = seed; this.save(); },
  owns(id){ return this.d.designs.includes(id); },
  ownsSkill(id){ return this.d.skills.includes(id); },
};

/* ---------- daily store rotation (unique per player) ---------- */
function dayIndex(){ return Math.floor(Date.now()/86400000); }
function msToRefresh(){ const n=(dayIndex()+1)*86400000; return n-Date.now(); }

function rollStore(){
  const day = dayIndex();
  if (Save.d.store.day === day && Save.d.store.ids.length === 5) return Save.d.store.ids;
  // seed mixes the player's private id with the day → nobody sees the same 5
  const rng = makeRNG(hashStr(Save.d.seedId + ':' + day));
  const pools = {
    common: DESIGNS.filter(d=>d.rar==='common'),
    rare: DESIGNS.filter(d=>d.rar==='rare'),
    epic: DESIGNS.filter(d=>d.rar==='epic'),
    legendary: DESIGNS.filter(d=>d.rar==='legendary'),
  };
  const weights = { common:44, rare:32, epic:18, legendary:6 };
  const ids = [];
  let guard = 0;
  while (ids.length < 5 && guard++ < 200) {
    const rar = rng.weighted(weights);
    const pick = rng.pick(pools[rar]);
    if (pick && !ids.includes(pick.id)) ids.push(pick.id);
  }
  // guarantee at least one item the player doesn't own yet, if any exist
  const unowned = DESIGNS.filter(d=>d.rar!=='exclusive' && !Save.owns(d.id));
  if (unowned.length && ids.every(id=>Save.owns(id))) ids[4] = rng.pick(unowned).id;
  Save.d.store = { day, ids };
  Save.save();
  return ids;
}

/* ---------- audio ---------- */
const Audio2 = {
  ctx:null, master:null, sfxGain:null, ready:false,
  cur:null, nxt:null, curId:null, fading:0, rate:1, wanted:null,

  init(){
    if (this.ready) return;
    try{
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 1;
      this.master.connect(this.ctx.destination);
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = Save.d.set.sfxVol;
      this.sfxGain.connect(this.master);
      this.ready = true;
    }catch(e){}
  },
  resume(){ if(this.ctx && this.ctx.state==='suspended') this.ctx.resume(); },

  /* ----- music ----- */
  _make(file){
    const a = new Audio('assets/music/'+file);
    a.loop = true; a.preload = 'auto'; a.volume = 0;
    a.crossOrigin = 'anonymous';
    try{ a.preservesPitch = !Save.d.set.pitch;
         a.mozPreservesPitch = !Save.d.set.pitch;
         a.webkitPreservesPitch = !Save.d.set.pitch; }catch(e){}
    a.addEventListener('error',()=>{ /* file not supplied yet — stay silent */ },{once:true});
    return a;
  },
  playWorld(worldId, immediate){
    if (!Save.d.set.music) { this.stop(); this.curId = worldId; return; }
    if (this.curId === worldId && this.cur) return;
    const w = worldById(worldId);
    const a = this._make(w.music);
    a.playbackRate = this.rate;
    const p = a.play();
    if (p && p.catch) p.catch(()=>{});
    if (immediate || !this.cur){
      if (this.cur) { try{this.cur.pause();}catch(e){} }
      this.cur = a; this.nxt = null; this.fading = 0;
      a.volume = Save.d.set.musVol;
    } else {
      this.nxt = a; this.fading = 1.2;
    }
    this.curId = worldId;
  },
  update(dt){
    const vol = Save.d.set.music ? Save.d.set.musVol : 0;
    if (this.fading > 0 && this.nxt){
      this.fading -= dt;
      const k = clamp(1 - this.fading/1.2, 0, 1);
      try{ this.nxt.volume = vol*k; if(this.cur) this.cur.volume = vol*(1-k); }catch(e){}
      if (this.fading <= 0){
        if (this.cur){ try{this.cur.pause();}catch(e){} }
        this.cur = this.nxt; this.nxt = null;
        try{ this.cur.volume = vol; }catch(e){}
      }
    } else if (this.cur){
      try{ if(Math.abs(this.cur.volume-vol)>0.01) this.cur.volume = vol; }catch(e){}
    }
  },
  setRate(r){
    this.rate = r;
    [this.cur,this.nxt].forEach(a=>{ if(a){ try{
      a.preservesPitch = !Save.d.set.pitch;
      a.mozPreservesPitch = !Save.d.set.pitch;
      a.webkitPreservesPitch = !Save.d.set.pitch;
      a.playbackRate = r;
    }catch(e){} } });
  },
  pause(){ [this.cur,this.nxt].forEach(a=>{ if(a) try{a.pause();}catch(e){} }); },
  unpause(){ if(!Save.d.set.music) return; [this.cur,this.nxt].forEach(a=>{ if(a){const p=a.play(); if(p&&p.catch)p.catch(()=>{});} }); },
  stop(){ [this.cur,this.nxt].forEach(a=>{ if(a) try{a.pause();}catch(e){} }); this.cur=this.nxt=null; this.curId=null; this.fading=0; },

  /* ----- synthesised sfx (no files needed) ----- */
  tone(f1,f2,dur,type,gain,delay){
    if(!this.ready || !Save.d.set.sfx) return;
    const t = this.ctx.currentTime + (delay||0);
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type||'sine';
    o.frequency.setValueAtTime(f1,t);
    if (f2 && f2!==f1) o.frequency.exponentialRampToValueAtTime(Math.max(20,f2), t+dur);
    g.gain.setValueAtTime(0.0001,t);
    g.gain.exponentialRampToValueAtTime(Math.max(.0002,gain||.2), t+0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t+dur);
    o.connect(g); g.connect(this.sfxGain);
    o.start(t); o.stop(t+dur+0.02);
  },
  noise(dur,gain,type,freq,delay){
    if(!this.ready || !Save.d.set.sfx) return;
    const t = this.ctx.currentTime + (delay||0);
    const len = Math.max(1,Math.floor(this.ctx.sampleRate*dur));
    const buf = this.ctx.createBuffer(1,len,this.ctx.sampleRate);
    const dat = buf.getChannelData(0);
    for(let i=0;i<len;i++) dat[i] = (Math.random()*2-1)*(1-i/len);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = type||'bandpass';
    f.frequency.setValueAtTime(freq||1200,t);
    f.frequency.exponentialRampToValueAtTime(Math.max(80,(freq||1200)*0.3), t+dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain||.2,t);
    g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
    src.connect(f); f.connect(g); g.connect(this.sfxGain);
    src.start(t); src.stop(t+dur);
  },
  sfx(name){
    if(!this.ready || !Save.d.set.sfx) return;
    switch(name){
      case 'jump':    this.tone(430,760,.13,'square',.13); break;
      case 'djump':   this.tone(640,1080,.13,'square',.12); this.tone(320,540,.1,'triangle',.07,.01); break;
      case 'slow':    this.noise(.34,.05,'lowpass',900); this.tone(900,600,.3,'sine',.04); break;
      case 'land':    this.noise(.07,.09,'lowpass',420); break;
      case 'crouch':  this.tone(300,180,.09,'triangle',.09); break;
      case 'uncrouch':this.tone(200,320,.08,'triangle',.07); break;
      case 'coin':    this.tone(980,980,.07,'square',.13); this.tone(1470,1470,.13,'square',.11,.06); break;
      case 'shard':   this.tone(1240,1240,.07,'triangle',.13); this.tone(1860,2480,.24,'triangle',.11,.06);
                      this.tone(930,930,.3,'sine',.07,.06); break;
      case 'ui':      this.tone(520,520,.045,'square',.06); break;
      case 'back':    this.tone(360,260,.07,'square',.06); break;
      case 'buy':     this.tone(600,900,.09,'square',.11); this.tone(900,1350,.16,'square',.1,.08); break;
      case 'deny':    this.tone(220,140,.16,'sawtooth',.09); break;
      case 'hit':     this.noise(.4,.34,'lowpass',600); this.tone(160,42,.45,'sawtooth',.22); break;
      case 'wall':    this.noise(.7,.3,'lowpass',300); this.tone(90,32,.8,'sine',.24); break;
      case 'count':   this.tone(680,680,.09,'square',.1); break;
      case 'go':      this.tone(900,1400,.2,'square',.14); break;
      case 'world':   this.tone(300,900,.35,'sine',.09); this.noise(.4,.07,'bandpass',2200); break;
      case 'win':     [0,.13,.26,.42].forEach((d,i)=>this.tone([523,659,784,1047][i],[523,659,784,1047][i],.35,'triangle',.14,d)); break;
      case 'clear':   [0,.1,.2].forEach((d,i)=>this.tone([659,880,1319][i],[659,880,1319][i],.3,'square',.11,d)); break;
      /* skill identities */
      case 'sk_fade': this.tone(1200,300,.75,'sine',.13); this.tone(1800,450,.75,'sine',.06,.04);
                      this.noise(.8,.05,'lowpass',600); break;
      case 'sk_triple':[0,.07,.14].forEach((d,i)=>this.tone(560+i*260,900+i*320,.12,'square',.11,d)); break;
      case 'sk_revive':this.tone(120,760,.7,'sawtooth',.14); [0,.18,.36].forEach((d,i)=>this.tone([392,523,784][i],[392,523,784][i],.6,'triangle',.12,d));
                      this.noise(.5,.12,'highpass',900); break;
      case 'sk_dash': this.noise(.28,.28,'bandpass',3200); this.tone(180,1500,.2,'sawtooth',.14);
                      this.tone(90,60,.32,'square',.1,.02); break;
      case 'sk_cleanse':[0,.06,.12,.18,.24].forEach((d,i)=>this.tone(880+i*220,1320+i*260,.3,'triangle',.09,d));
                      this.noise(.55,.08,'highpass',2600); break;
    }
  }
};

/* ---------- i18n helper ---------- */
let LANG = 'en';
const T = k => (I18N[LANG] && I18N[LANG][k]) || I18N.en[k] || k;
function applyLang(){
  document.documentElement.lang = LANG;
  document.querySelectorAll('[data-i18n]').forEach(el=>{
    const k = el.getAttribute('data-i18n');
    const v = T(k);
    if (v) el.innerHTML = v;
  });
}

/* ---------- toast ---------- */
let toastT = null;
function toast(msg){
  const el = document.getElementById('toast');
  el.textContent = msg; el.classList.add('on');
  clearTimeout(toastT);
  toastT = setTimeout(()=>el.classList.remove('on'), 1700);
}
