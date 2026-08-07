/* ============================================================
   MALIK — game.js   engine, worlds, mechanics, rendering
   ============================================================ */

const Game = {
  cv:null, x:null, W:CFG.W, H:CFG.H,
  state:'idle',              // idle | run | pause | dying | over
  mode:'chal',               // chal | adv
  level:null,
  raf:0, lastT:0, acc:0, fps:60,

  /* run state */
  t:0, spd:1, stepIdx:0, stepT:0, score:0, worldX:0,
  worldId:'blank', pal:null, palFrom:null, palTo:null, palK:1,
  trans:null, breakUntilX:0, nameT:0,
  runCoins:0, runShards:0, attempts:1,
  solids:[], hazards:[], picks:[], fx:[], bgParts:[], sand:[],
  colTimer:0, colEvents:[],
  bgT:0, shake:0, shakeMag:0,
  barrierX:-260, fill:0, overShown:false, result:null,
  cd:0, cdMax:CFG.SKILL_CD, skillUses:0,
  hudT:0,

  p:null,

  /* ---------------- boot ---------------- */
  init(){
    this.cv = document.getElementById('cv');
    this.x  = this.cv.getContext('2d');
    this.pal = Object.assign({}, worldById('blank').pal);
    this.resize();
    addEventListener('resize', ()=>this.resize());
    addEventListener('orientationchange', ()=>setTimeout(()=>this.resize(),200));
    this.bindInput();
    this.lastT = performance.now();
    this.raf = requestAnimationFrame(t=>this.loop(t));
  },
  resize(){
    const s = document.getElementById('stage');
    const portrait = innerHeight > innerWidth && innerWidth < 900;
    document.getElementById('rotate').classList.toggle('hide', !(portrait && matchMedia('(pointer:coarse)').matches));
    void s;
  },

  /* ---------------- input ---------------- */
  keys:{}, jumpHeld:false, crouchHeld:false,
  bindInput(){
    const jd = ()=>this.pressJump(), ju = ()=>{ this.jumpHeld=false; };
    addEventListener('keydown', e=>{
      if (e.repeat) return;
      const k = e.code;
      if (['Space','ArrowUp','KeyW','KeyZ'].includes(k)){ e.preventDefault(); this.jumpHeld=true; jd(); }
      else if (['ArrowDown','KeyS'].includes(k)){ e.preventDefault(); this.setCrouch(true); }
      else if (['ArrowLeft','KeyA','KeyQ'].includes(k)) this.lane(-1);
      else if (['ArrowRight','KeyD'].includes(k)) this.lane(1);
      else if (['KeyE','ShiftLeft','ShiftRight'].includes(k)) this.useSkill();
      else if (['Escape','KeyP'].includes(k)) UI.togglePause();
    });
    addEventListener('keyup', e=>{
      const k = e.code;
      if (['Space','ArrowUp','KeyW','KeyZ'].includes(k)) ju();
      else if (['ArrowDown','KeyS'].includes(k)) this.setCrouch(false);
    });

    const hold=(el,on,off)=>{
      if(!el) return;
      el.addEventListener('pointerdown',e=>{e.preventDefault();on();});
      ['pointerup','pointercancel','pointerleave'].forEach(ev=>el.addEventListener(ev,e=>{e.preventDefault();off&&off();}));
    };
    hold(document.getElementById('tJump'), ()=>{this.jumpHeld=true;jd();}, ju);
    hold(document.getElementById('tCrouch'), ()=>this.setCrouch(true), ()=>this.setCrouch(false));
    hold(document.getElementById('tLeft'), ()=>this.lane(-1));
    hold(document.getElementById('tRight'), ()=>this.lane(1));
    document.getElementById('btnSkill').addEventListener('pointerdown', e=>{e.preventDefault();this.useSkill();});

    // canvas halves as a fallback on touch
    this.cv.addEventListener('pointerdown', e=>{
      if (this.state!=='run' || e.pointerType==='mouse') return;
      const rect = this.cv.getBoundingClientRect();
      const rel = (e.clientX-rect.left)/rect.width;
      const lefty = Save.d.set.lefty;
      const crouchSide = lefty ? rel>0.5 : rel<0.5;
      if (crouchSide) this.setCrouch(true); else { this.jumpHeld=true; this.pressJump(); }
    });
    ['pointerup','pointercancel'].forEach(ev=>this.cv.addEventListener(ev,()=>{
      this.jumpHeld=false; this.setCrouch(false);
    }));
  },

  /* ---------------- run lifecycle ---------------- */
  startChallenge(){
    this.mode='chal'; this.level=null;
    this.attempts = (Save.d.attempts||0)+1; Save.d.attempts=this.attempts; Save.save();
    this.reset(worldById(this._randomWorld(null,true)).id, 1.00, Math.floor(Math.random()*1e9));
    this.stepIdx=0; this.stepT=SPEED_STEPS[0].dur;
    this.begin();
  },
  startLevel(lv){
    this.mode='adv'; this.level=lv;
    const b = Save.d.adventure.best[lv.key] || {att:0};
    b.att = (b.att||0)+1; Save.d.adventure.best[lv.key]=b; Save.save();
    this.attempts = b.att;
    this.reset(lv.world, lv.spd, lv.seed);
    this.begin();
  },
  _randomWorld(prev, noColumns){
    const pool = WORLDS.filter(w=>w.id!==prev && !(noColumns && w.mech==='columns'));
    return pool[Math.floor(Math.random()*pool.length)].id;
  },

  reset(worldId, spd, seed){
    this.t=0; this.score=0; this.worldX=0; this.spd=spd;
    this.solids=[]; this.hazards=[]; this.picks=[]; this.fx=[]; this.sand=[];
    this.runCoins=0; this.runShards=0; this.skillUses=0; this.cd=0;
    this.barrierX=-320; this.fill=0; this.overShown=false; this.result=null;
    this.shake=0; this.bgT=0; this.colTimer=0.9;
    this.worldId=worldId; this.trans=null; this.palK=1;
    this.pal = Object.assign({}, worldById(worldId).pal);
    this.nameT = 2.4;
    this.rules = {}; (this.level?this.level.rules:[]).forEach(r=>this.rules[r]=true);
    Gen.reset(seed, 0);
    this.breakUntilX = 380;   // free run-up at the start of every attempt
    this.stats = { jumps:0, djumps:0, slows:0, crouches:0, skills:0, att:this.attempts };
    this.p = {
      by: GY, vy:0, h:CFG.R*2, targetH:CFG.R*2, grounded:true, jumps:0, maxJumps:2,
      rot:0, screenX:CFG.PLAYER_X, sqX:1, sqY:1, gliding:false, glideT:0,
      crouch:false, alive:true, invuln:0, fadeT:0, tripleT:0, dashT:0, cleanseT:0,
      gumT:0, gumCd:0, coyote:0, lane:1, laneX:CFG.PLAYER_X, dead:false, trail:[]
    };
    this.makeBgParts();
    this.buildAhead();
    document.body.classList.toggle('lanes', this.worldId==='malik');
  },
  begin(){
    Audio2.init(); Audio2.resume();
    Audio2.playWorld(this.worldId, true);
    Audio2.setRate(this.spd);
    UI.showHUD(true);
    UI.setWorldName(worldById(this.worldId).name);
    UI.setProgress(this.mode==='adv');
    this.state='run';
    UI.hideAll();
  },

  quit(){
    this.state='idle';
    Audio2.stop();
    UI.showHUD(false);
    document.body.classList.remove('lanes');
  },

  /* ---------------- world switching ---------------- */
  switchWorld(id){
    if (id===this.worldId) return;
    const from = worldById(this.worldId), to = worldById(id);
    let kind = 'wipe';
    if (to.mech==='columns') kind='build';
    else if (from.mech==='columns') kind='unbuild';
    else if (to.mech==='flip' || from.mech==='flip') kind='flip';
    this.trans = { k:kind, t:0, dur: kind==='wipe'?0.75:1.0, from:this.worldId, to:id, swapped:false };
    this.palFrom = Object.assign({}, from.pal); this.palTo = Object.assign({}, to.pal); this.palK = 0;
    Audio2.playWorld(id, false);
    Audio2.sfx('world');
    // breathing room, longer the faster we go
    this.breakUntilX = this.worldX + CFG.PX*this.spd*breakTime(this.spd) + 460;
  },
  finishSwitch(){
    const id = this.trans.to;
    this.worldId = id;
    this.pal = Object.assign({}, worldById(id).pal);
    this.nameT = 2.2;
    this.makeBgParts();
    this.colTimer = 1.1;
    // Malik has no common obstacles at all — clear whatever is still coming
    if (id==='malik' || this.trans.from==='malik'){
      const cut = this.worldX + this.W*0.6;
      this.hazards = this.hazards.filter(h=>h.x < cut);
      this.picks   = this.picks.filter(h=>h.x < cut);
      Gen.cursor = Math.max(Gen.cursor, this.breakUntilX);
    }
    UI.setWorldName(worldById(id).name);
    document.body.classList.toggle('lanes', id==='malik');
  },
  get flipped(){
    const cur = worldById(this.worldId).mech==='flip';
    if (!this.trans || this.trans.k!=='flip') return cur;
    return cur;
  },
  get inColumns(){ return worldById(this.worldId).mech==='columns' && (!this.trans || this.trans.swapped); },

  /* ---------------- generation ---------------- */
  buildAhead(){
    const ahead = this.worldX + this.W + 700;
    const out = { solids:this.solids, hazards:this.hazards, picks:this.picks };
    const before = this.hazards.length;

    if (this.inColumns || (this.trans && worldById(this.trans.to).mech==='columns')){
      Gen.runFlat(out, ahead);         // flat floor, obstacles come from above
    } else {
      if (Gen.cursor < this.breakUntilX) Gen.runFlat(out, Math.min(ahead, this.breakUntilX));
      if (Gen.cursor < ahead){
        Gen.fill(out, ahead, {
          spd:this.spd, world:this.worldId, rules:this.rules,
          noDouble: this.rules.noDouble || this.worldId==='malik'
        });
      }
    }
    // Me ni mienai: tag some new obstacles with their own flicker rhythm
    const flick = worldById(this.worldId).mech==='flicker' || this.rules.flicker;
    if (flick) for (let i=before;i<this.hazards.length;i++){
      const h=this.hazards[i];
      if (Math.random()<0.62) h.flick = { sp:rand(1.6,5.2), ph:rand(0,6.3), duty:rand(0.32,0.62) };
    }
  },

  /* ---------------- actions ---------------- */
  pressJump(){
    if (this.state!=='run') return;
    const p=this.p;
    if (p.gumT>0) { Audio2.sfx('deny'); return; }
    if (p.crouch) this.setCrouch(false);
    const maxJ = p.tripleT>0 ? 3 : (this.rules.noDouble || this.worldId==='malik' ? 1 : 2);
    if (p.jumps >= maxJ) return;
    const first = p.jumps===0 && (p.grounded || p.coyote>0);
    p.vy = -(first ? CFG.JUMP : CFG.DJUMP);
    p.jumps++; p.grounded=false; p.gliding=false; p.coyote=0;
    p.sqX = 0.82; p.sqY = 1.2;
    if (first){ this.stats.jumps++; Audio2.sfx('jump'); this.puff(6,'#000'); }
    else { this.stats.djumps++; Audio2.sfx('djump'); this.ring(p.screenX,p.by-p.h/2,10,52,'#ffffff',0.35); }
  },
  setCrouch(on){
    const p=this.p; if(!p) return;
    if (on===p.crouch) return;
    if (on && p.gumT>0) return;
    p.crouch=on;
    p.targetH = on ? CFG.R : CFG.R*2;
    if (on){ this.stats.crouches++; Audio2.sfx('crouch'); this.puff(4,'#000'); p.sqX=1.22; p.sqY=0.8; }
    else { Audio2.sfx('uncrouch'); p.sqX=0.88; p.sqY=1.12; }
  },
  lane(dir){
    if (this.state!=='run' || !this.inColumns) return;
    const p=this.p;
    if (p.gumT>0) return;
    const n = clamp(p.lane+dir,0,2);
    if (n===p.lane) return;
    p.lane=n; p.sqX=0.8; p.sqY=1.14;
    Audio2.sfx('ui');
    this.streak(p.screenX, p.by-p.h/2, -dir);
  },

  laneCenter(i){ const x0=178, w=(this.W-x0-30)/3; return x0+w*(i+0.5); },
  laneEdges(){ const x0=178, w=(this.W-x0-30)/3; return [x0,x0+w,x0+2*w,x0+3*w]; },

  /* ---------------- skills ---------------- */
  useSkill(){
    if (this.state!=='run') return;
    const id = Save.d.equipSkill;
    if (!id || !Save.ownsSkill(id) || this.rules.noSkill){ Audio2.sfx('deny'); return; }
    if (this.cd>0){ Audio2.sfx('deny'); return; }
    if (id==='revive') { Audio2.sfx('deny'); return; }   // fires on its own
    const p=this.p;
    this.cd = this.cdMax; this.stats.skills++; this.skillUses++;
    if (id==='fade'){
      p.fadeT=5; Audio2.sfx('sk_fade');
      for(let i=0;i<14;i++) this.fx.push({k:'ghost',x:p.screenX,y:p.by-p.h/2,r:CFG.R,a:0.5,life:0.7,t:0,vx:rand(-40,-160),vy:rand(-40,40),c:'#b47bff'});
      this.ring(p.screenX,p.by-p.h/2,14,120,'#b47bff',0.55);
    }
    if (id==='triple'){
      p.tripleT=5; p.jumps=Math.max(0,p.jumps-1); Audio2.sfx('sk_triple');
      for(let i=0;i<3;i++) this.ring(p.screenX,p.by-p.h/2,8+i*10,60+i*18,'#7bff9e',0.4);
    }
    if (id==='dash'){
      p.dashT=0.45; p.invuln=Math.max(p.invuln,0.6); Audio2.sfx('sk_dash');
      this.shakeIt(0.3,9);
      for(let i=0;i<18;i++) this.fx.push({k:'streak',x:p.screenX+rand(-30,30),y:p.by-rand(6,60),len:rand(60,190),a:1,life:0.35,t:0,c:'#ffffff'});
    }
    if (id==='cleanse'){
      p.cleanseT=5; p.gumT=0; Audio2.sfx('sk_cleanse');
      this.sand.length=0;
      this.hazards = this.hazards.filter(h=>h.type!=='gum');
      this.ring(p.screenX,p.by-p.h/2,10,340,'#7be3ff',0.85);
      for(let i=0;i<22;i++) this.fx.push({k:'spark',x:p.screenX,y:p.by-p.h/2,vx:rand(-260,260),vy:rand(-260,120),life:0.7,t:0,c:'#d8f8ff'});
    }
    UI.flashSkill();
  },
  tryRevive(){
    if (Save.d.equipSkill!=='revive' || !Save.ownsSkill('revive') || this.rules.noSkill) return false;
    if (this.cd>0) return false;
    this.cd=this.cdMax; this.stats.skills++; this.skillUses++;
    const p=this.p;
    p.invuln=1.8; p.vy=-560; p.grounded=false; p.jumps=1; p.gumT=0; p.by=Math.min(p.by,GY);
    // wipe everything the player is about to hit
    const cut = this.worldX + this.W*0.9;
    this.hazards = this.hazards.filter(h => h.type==='gum' ? false : (h.x===undefined || h.x > cut));
    Audio2.sfx('sk_revive');
    this.ring(p.screenX,p.by-p.h/2,12,460,'#ffd76b',1.0);
    this.fx.push({k:'flash',a:0.85,life:0.5,t:0});
    this.shakeIt(0.35,10);
    UI.flashSkill();
    return true;
  },

  /* ---------------- fx helpers ---------------- */
  ring(x,y,r0,r1,c,a){ this.fx.push({k:'ring',x,y,r0,r1,c,a:a||0.6,life:0.55,t:0}); },
  puff(n,c){ const p=this.p; for(let i=0;i<n;i++) this.fx.push({k:'dust',x:p.screenX+rand(-8,8),y:p.by-2,vx:rand(-130,-30),vy:rand(-90,-10),life:0.45,t:0,c:c||'#000',r:rand(2,5)}); },
  streak(x,y,d){ for(let i=0;i<7;i++) this.fx.push({k:'streak',x:x+rand(-10,10),y:y+rand(-18,18),len:rand(30,80)*d,a:0.7,life:0.28,t:0,c:'#ff6b5a'}); },
  shakeIt(t,m){ if(!Save.d.set.shake) return; this.shake=Math.max(this.shake,t); this.shakeMag=Math.max(this.shakeMag,m); },

  /* ---------------- main loop ---------------- */
  loop(now){
    this.raf = requestAnimationFrame(t=>this.loop(t));
    let dt = (now-this.lastT)/1000; this.lastT=now;
    if (dt>0.05) dt=0.05;
    this.fps = lerp(this.fps, 1/Math.max(dt,0.0001), 0.08);
    Audio2.update(dt);
    if (this.state==='run') this.update(dt);
    else if (this.state==='dying') this.updateDying(dt);
    this.render(dt);
    this.hudT+=dt;
    if (this.hudT>0.08){ this.hudT=0; if(this.state==='run'||this.state==='dying') UI.updateHUD(); }
  },

  update(dt){
    const p=this.p;
    this.t += dt;
    this.bgT += dt*this.spd;
    if (this.cd>0) this.cd=Math.max(0,this.cd-dt);

    /* ---- speed / world schedule (challenge only) ---- */
    if (this.mode==='chal'){
      this.stepT -= dt;
      if (this.stepT<=0 && this.stepIdx<SPEED_STEPS.length-1){
        this.stepIdx++;
        this.spd = SPEED_STEPS[this.stepIdx].spd;
        this.stepT = SPEED_STEPS[this.stepIdx].dur;
        Audio2.setRate(this.spd);
        if (this.stepIdx < SPEED_STEPS.length-1) this.switchWorld(this._randomWorld(this.worldId));
        else { this.nameT=2.0; this.breakUntilX=this.worldX+CFG.PX*this.spd*1.4; }
      }
      if (this.t>=CFG.RUN_TIME){ this.finish('win'); return; }
    } else if (this.t>=this.level.len){ this.finish('clear'); return; }

    /* ---- transition ---- */
    if (this.trans){
      this.trans.t += dt;
      const k = clamp(this.trans.t/this.trans.dur,0,1);
      this.palK = k;
      if (!this.trans.swapped && k>=0.5){ this.trans.swapped=true; this.finishSwitch(); }
      if (k>=1) this.trans=null;
      if (this.palFrom&&this.palTo) this.pal = mixPal(this.palFrom,this.palTo,k);
    }

    /* ---- scroll ---- */
    const dashBoost = p.dashT>0 ? 2.3 : 0;
    const px = CFG.PX*this.spd*(1+dashBoost);
    this.worldX += px*dt;
    this.score += dt*this.spd*115 * (this.mode==='chal'?1:0.6);

    /* ---- timers ---- */
    ['fadeT','tripleT','dashT','cleanseT','invuln','gumCd'].forEach(k=>{ if(p[k]>0) p[k]=Math.max(0,p[k]-dt); });

    /* coyote time — a hair of grace after walking off a ledge */
    if (p.grounded) p.coyote = 0.09;
    else if (p.coyote>0){ p.coyote-=dt; if (p.coyote<=0) p.jumps=Math.max(p.jumps,1); }

    if (p.gumT>0){
      p.gumT-=dt;
      p.screenX -= 108*dt;
      if (p.gumT<=0){ p.sqY=1.15; p.sqX=0.9; p.gumCd=0.7; }
    } else if (p.screenX < CFG.PLAYER_X && !this.inColumns){
      p.screenX = Math.min(CFG.PLAYER_X, p.screenX + 95*dt);
    }

    /* ---- lane tween (Malik) ---- */
    if (this.inColumns){
      const target = this.laneCenter(p.lane) + (p.gumT>0?-60:0);
      p.screenX = lerp(p.screenX, target, Math.min(1,dt*13));
    }

    /* ---- crouch height ---- */
    const hStep = 260*dt;
    if (p.h < p.targetH) p.h = Math.min(p.targetH, p.h+hStep);
    else if (p.h > p.targetH) p.h = Math.max(p.targetH, p.h-hStep);

    /* ---- gravity / glide ---- */
    const canGlide = !this.rules.noSlow && this.worldId!=='malik';
    const wantGlide = canGlide && this.jumpHeld && !p.grounded && p.vy>0;
    if (wantGlide && !p.gliding){ p.gliding=true; this.stats.slows++; Audio2.sfx('slow'); p.glideT=0;
      this.ring(p.screenX,p.by-p.h/2,10,44,'#ffffff',0.32); }
    if (!wantGlide) p.gliding=false;
    if (p.gliding){
      p.glideT+=dt;
      p.vy += CFG.G*CFG.SLOW_G*dt;
      p.vy = Math.min(p.vy, CFG.SLOW_MAX);
      if (Math.random()<0.5) this.fx.push({k:'spark',x:p.screenX+rand(-14,14),y:p.by-p.h/2+rand(-10,10),vx:rand(-60,-20),vy:rand(-10,40),life:0.4,t:0,c:'#ffffff'});
    } else {
      p.vy += CFG.G*dt;
    }
    if (p.dashT>0) p.vy=Math.min(p.vy, 120);

    p.by += p.vy*dt;

    /* ---- squash relax ---- */
    p.sqX = lerp(p.sqX,1,Math.min(1,dt*11));
    p.sqY = lerp(p.sqY,1,Math.min(1,dt*11));

    /* ---- rotation follows speed ---- */
    p.rot += (px*dt)/CFG.R * (this.flipped?-1:1);

    /* ---- collision ---- */
    this.collide(dt);

    /* ---- world mechanics ---- */
    this.worldTick(dt, px);

    /* ---- barrier ---- */
    const target = (this.inColumns? this.laneCenter(0)-40 : CFG.PLAYER_X) - CFG.BARRIER_GAP;
    // eases in quickly at the start of a run, falls back slowly once it has gained ground
    const ease = this.barrierX < target ? 3.2 : 0.85;
    this.barrierX += (target-this.barrierX)*Math.min(1,dt*ease);
    if (p.gumT>0) this.barrierX += CFG.BARRIER_CATCHUP*dt;
    if (p.screenX - CFG.R <= this.barrierX + 4){ this.finish('wall'); return; }

    /* ---- pickups ---- */
    for (let i=this.picks.length-1;i>=0;i--){
      const c=this.picks[i]; c.t+=dt;
      const sx=c.x-this.worldX;
      if (sx < -60){ this.picks.splice(i,1); continue; }
      if (Math.abs(sx-p.screenX)<CFG.R+c.r && Math.abs(c.y-(p.by-p.h/2))<CFG.R+c.r+6){
        if (c.type==='coin'){ this.runCoins++; Audio2.sfx('coin'); }
        else { this.runShards++; Audio2.sfx('shard'); this.shakeIt(0.16,4); }
        this.ring(sx,c.y,6,44,c.type==='coin'?'#ffc63d':'#7be3ff',0.7);
        for(let k=0;k<10;k++) this.fx.push({k:'spark',x:sx,y:c.y,vx:rand(-200,200),vy:rand(-220,60),life:0.55,t:0,c:c.type==='coin'?'#ffe08a':'#bff2ff'});
        this.picks.splice(i,1);
      }
    }

    /* ---- housekeeping ---- */
    this.buildAhead();
    const cull = this.worldX-260;
    this.solids  = this.solids.filter(s=>s.x+s.w>cull);
    this.hazards = this.hazards.filter(h=>(h.x===undefined?true:h.x+ (h.w||60) > cull) && !h.dead);
    this.updateFx(dt);
    if (this.shake>0){ this.shake-=dt; if(this.shake<=0) this.shakeMag=0; }
    if (this.nameT>0) this.nameT-=dt;
  },

  /* ---------------- collisions ---------------- */
  collide(dt){
    const p=this.p;
    const ghost = p.fadeT>0;
    const box = { x:p.screenX-CFG.R+2, y:p.by-p.h, w:CFG.R*2-4, h:p.h };
    const prevBottom = p.by - p.vy*dt;
    let landed=false;

    if (!this.inColumns){
      for (const s of this.solids){
        const sx = s.x-this.worldX;
        if (sx+s.w < box.x || sx > box.x+box.w) continue;
        if (box.y+box.h < s.y || box.y > s.y+s.h) continue;
        if (ghost && s.kind!=='ground'){ continue; }
        // a low lip lifts the ball instead of killing it — no cheap 15px deaths
        const rise = p.by - s.y;
        if (s.kind!=='ceil' && rise>0 && rise<=18 && p.vy>=-40){
          p.by = s.y; p.vy = 0;
          if (!p.grounded){ p.sqX=1.10; p.sqY=0.9; }
          p.grounded=true; p.jumps=0; p.gliding=false; landed=true;
          continue;
        }
        if (p.vy>=0 && prevBottom <= s.y+10){
          p.by = s.y; p.vy=0;
          if (!p.grounded){ p.sqX=1.16; p.sqY=0.84; Audio2.sfx('land'); this.puff(4); }
          p.grounded=true; p.jumps=0; p.gliding=false; landed=true;
        } else if (p.dashT>0){
          // dash shreds blocks
          if (s.kind!=='ground'){ s.x=-99999; this.shredAt(sx+s.w/2, s.y); }
        } else if (!ghost){
          return this.die();
        }
      }
    } else {
      if (p.by>=GY){ p.by=GY; if(p.vy>0){ if(!p.grounded){p.sqX=1.15;p.sqY=.85;Audio2.sfx('land');} p.vy=0; p.grounded=true; p.jumps=0; } landed=true; }
    }

    if (!landed && p.grounded && p.vy>=0){
      // walked off a ledge
      let support=false;
      for (const s of this.solids){
        const sx=s.x-this.worldX;
        if (sx < box.x+box.w && sx+s.w > box.x && Math.abs(s.y-p.by)<3){ support=true; break; }
      }
      if (this.inColumns) support = p.by>=GY;
      if (!support){ p.grounded=false; if (p.coyote<=0) p.jumps=Math.max(p.jumps,1); }
    }
    if (p.by > this.H+120) return this.die();

    /* hazards */
    if (p.invuln<=0){
      for (const h of this.hazards){
        if (h.type==='gum'){
          const sx=h.x-this.worldX;
          if (p.cleanseT>0) continue;
          if (box.x < sx+h.w && box.x+box.w > sx && box.y+box.h > h.y-2 && p.grounded){
            if (p.gumT<=0 && p.gumCd<=0){ p.gumT=1.25; Audio2.sfx('deny'); this.shakeIt(0.2,5);
              for(let i=0;i<12;i++) this.fx.push({k:'spark',x:sx+h.w/2,y:h.y,vx:rand(-120,120),vy:rand(-180,-20),life:.6,t:0,c:'#ff8fc6'}); }
          }
          continue;
        }
        if (ghost) continue;
        const b = this.hazBox(h);
        if (!b) continue;
        if (box.x < b.x+b.w && box.x+box.w > b.x && box.y < b.y+b.h && box.y+box.h > b.y){
          if (p.dashT>0 && h.type!=='bar'){ h.dead=true; this.shredAt(b.x+b.w/2,b.y+b.h/2); continue; }
          if (h.type==='bar' && p.crouch && p.h<=CFG.R+2) continue;
          return this.die();
        }
      }
    }
  },
  hazBox(h){
    const sx = (h.type==='fall'||h.type==='bar') ? h.sx : h.x-this.worldX;
    if (sx===undefined) return null;
    if (h.type==='spike') return { x:sx+7, y:h.y+6, w:h.w-14, h:h.h-6 };
    if (h.type==='mover') return { x:sx+3, y:h.cy-h.h/2+3, w:h.w-6, h:h.h-6 };
    if (h.type==='fall')  return { x:sx-h.w/2+4, y:h.y+4, w:h.w-8, h:h.h-8 };
    if (h.type==='bar')   return { x:h.bx, y:h.y, w:h.bw, h:h.h };
    return null;
  },
  shredAt(x,y){
    this.shakeIt(0.14,5);
    for(let i=0;i<12;i++) this.fx.push({k:'shard',x,y,vx:rand(-320,120),vy:rand(-300,60),life:.6,t:0,r:rand(3,8),c:this.pal.obst});
  },

  /* ---------------- world mechanics ---------------- */
  worldTick(dt, px){
    const p=this.p, w=worldById(this.worldId);

    /* movers ride a fixed world-space cycle → timing feels the same at any speed */
    for (const h of this.hazards){
      if (h.type==='mover'){
        const ph = this.worldX/h.cycle + h.phase;
        h.cy = h.base - Math.sin(ph*Math.PI*2)*h.amp;
      }
    }

    /* Wüste — sandstorm */
    if (w.mech==='sand' || this.rules.sand){
      if (p.cleanseT>0) this.sand.length=0;
      else {
        const want = Save.d.set.particles?170:70;
        while (this.sand.length<want) this.sand.push({x:rand(0,this.W),y:rand(0,this.H),v:rand(0.7,2.1),r:rand(0.8,2.6),a:rand(.15,.5)});
        for (const s of this.sand){
          s.x -= px*dt*s.v*0.55; s.y += Math.sin(this.bgT*2+s.x*0.01)*22*dt;
          if (s.x<-6){ s.x=this.W+rand(0,60); s.y=rand(0,this.H); }
        }
      }
    } else this.sand.length=0;

    /* Malik — column spawns on a seeded timer */
    if (this.inColumns){
      this.colTimer -= dt;
      if (this.colTimer<=0){
        this.spawnColumn();
        this.colTimer = Math.max(0.44, (1.15 - (this.spd-1)*0.34)) * Gen.rng.range(0.8,1.3);
      }
      const edges=this.laneEdges();
      for (const h of this.hazards){
        if (h.type==='fall'){
          h.vy += 900*dt*this.spd*0.35;
          h.y += (h.vy + 300*this.spd)*dt;
          h.sx = this.laneCenter(h.lane);
          if (h.y>this.H+80) h.dead=true;
        } else if (h.type==='bar'){
          h.bx = edges[h.lane]+3; h.bw = edges[h.lane+h.span]-edges[h.lane]-6;
          h.phase = h.phase||'down';
          const rest = GY-40-h.h;
          if (h.phase==='down'){ h.y += 470*this.spd*dt; if(h.y>=rest){h.y=rest; h.phase='hold'; h.hold=0.55/this.spd;} }
          else if (h.phase==='hold'){ h.hold-=dt; if(h.hold<=0) h.phase='up'; }
          else { h.y -= 620*this.spd*dt; if (h.y< -60) h.dead=true; }
        }
      }
    }
  },
  spawnColumn(){
    const r=Gen.rng, roll=r.next();
    if (roll<0.6){
      const n = this.spd>=1.45 ? r.int(1,2) : 1;
      const lanes=[0,1,2];
      for(let i=0;i<n;i++){
        const lane = lanes.splice(r.int(0,lanes.length-1),1)[0];
        this.hazards.push({type:'fall',lane,x:this.worldX+9999,sx:this.laneCenter(lane),y:-70-i*70,w:54,h:54,vy:0});
      }
    } else if (roll<0.92){
      const span = +r.weighted({1:3,2:3,3:2});
      const from = span===3?0:r.int(0,3-span);
      this.hazards.push({type:'bar',lane:from,span,x:this.worldX+9999,y:-70,h:22,phase:'down'});
    } else {
      const lane=r.int(0,2);
      this.picks.push({type:r.chance(0.22)?'shard':'coin',x:this.worldX+this.laneCenter(lane),y:GY-120,r:11,t:0});
    }
  },

  /* ---------------- death / finish ---------------- */
  die(){
    if (this.state!=='run') return;
    if (this.p.invuln>0) return;
    if (this.tryRevive()) return;
    this.finish('over');
  },
  finish(kind){
    if (this.state!=='run') return;
    this.result = kind;
    this.state = 'dying';
    this.p.dead = true;
    this.fill = 0;
    Audio2.sfx(kind==='wall'?'wall':(kind==='over'?'hit':(kind==='win'?'win':'clear')));
    if (kind==='over'||kind==='wall'){ this.shakeIt(0.4,12); }
    Audio2.pause();
    this.commit(kind);
  },
  commit(kind){
    const s=Save.d;
    s.coins += this.runCoins; s.shards += this.runShards;
    s.totals.jumps+=this.stats.jumps; s.totals.djumps+=this.stats.djumps;
    s.totals.slows+=this.stats.slows; s.totals.crouches+=this.stats.crouches;
    s.totals.skills+=this.stats.skills; s.totals.runs++;
    if (this.mode==='chal'){
      const sc=Math.floor(this.score);
      if (sc>s.highScore) s.highScore=sc;
      if (this.t>s.bestTime) s.bestTime=this.t;
      if (kind==='win'){
        s.wins++;
        if (!s.designs.includes('twominutes')){ s.designs.push('twominutes'); this.newDesign=true; }
      }
    } else {
      const key=this.level.key;
      const b=s.adventure.best[key]||{att:this.attempts,pct:0};
      const pct = Math.min(100, Math.floor(this.t/this.level.len*100));
      b.pct = Math.max(b.pct||0, kind==='clear'?100:pct);
      s.adventure.best[key]=b;
      if (kind==='clear'){
        if (!s.adventure.cleared.includes(key)) s.adventure.cleared.push(key);
        s.adventure.unlocked = Math.max(s.adventure.unlocked, Math.min(LEVELS.length, this.level.n+1));
      }
    }
    Save.save();
  },
  updateDying(dt){
    this.fill = Math.min(1, this.fill + dt/0.55);
    this.updateFx(dt);
    if (this.shake>0){ this.shake-=dt; if(this.shake<=0)this.shakeMag=0; }
    if (this.fill>=1 && !this.overShown){
      this.overShown=true;
      this.state='over';
      UI.showOver(this.result);
    }
  },

  /* ---------------- fx ---------------- */
  updateFx(dt){
    for (let i=this.fx.length-1;i>=0;i--){
      const f=this.fx[i]; f.t+=dt;
      if (f.t>=f.life){ this.fx.splice(i,1); continue; }
      if (f.vx!==undefined){ f.x+=f.vx*dt; f.y+=f.vy*dt; if(f.k==='shard'||f.k==='dust') f.vy+=900*dt; }
    }
    for (const b of this.bgParts){
      b.x -= b.v*CFG.PX*this.spd*dt*0.35;
      b.y += (b.vy||0)*dt;
      if (b.x < -b.r*2-40){ b.x=this.W+b.r+rand(0,120); if(b.reY) b.y=rand(0,this.H); }
      if (b.y > this.H+40) b.y=-40;
    }
  },
  makeBgParts(){
    this.bgParts=[];
    const w=worldById(this.trans?this.trans.to:this.worldId);
    const n = Save.d.set.particles? 26 : 10;
    for(let i=0;i<n;i++){
      this.bgParts.push({
        x:rand(0,this.W), y:rand(0,this.H), r:rand(6,40),
        v:rand(.15,.75), vy: w.mech==='gum'?rand(-40,-12): (w.id==='wardsback'?rand(-16,16):0),
        a:rand(.08,.3), reY:true, s:rand(0,6.3)
      });
    }
  },

  /* ============================================================
                              RENDER
     ============================================================ */
  render(dt){
    const x=this.x, W=this.W, H=this.H;
    x.save();
    x.clearRect(0,0,W,H);

    if (this.state==='idle'){ x.fillStyle='#000'; x.fillRect(0,0,W,H); x.restore(); return; }

    if (this.shakeMag>0){ x.translate(rand(-1,1)*this.shakeMag, rand(-1,1)*this.shakeMag); }

    /* flip transform */
    let flipK = 1;
    const isFlip = worldById(this.worldId).mech==='flip';
    if (this.trans && this.trans.k==='flip'){
      const k=clamp(this.trans.t/this.trans.dur,0,1);
      const fromFlip = worldById(this.trans.from).mech==='flip';
      const a = fromFlip?-1:1, b = worldById(this.trans.to).mech==='flip'?-1:1;
      flipK = lerp(a,b,k);
      if (Math.abs(flipK)<0.02) flipK = flipK<0?-0.02:0.02;
    } else flipK = isFlip?-1:1;

    x.save();
    x.translate(0,H/2); x.scale(1,flipK); x.translate(0,-H/2);

    this.drawBackground();
    this.drawWorldName();
    this.drawTerrain();
    this.drawPicks();
    this.drawPlayer();
    this.drawOverlays();

    x.restore();

    this.drawBarrier();
    this.drawFxScreen();
    this.drawTransition();

    if (Save.d.set.fps){
      x.fillStyle='rgba(255,255,255,.55)'; x.font='11px ui-monospace,monospace'; x.textAlign='right';
      x.fillText(Math.round(this.fps)+' FPS', W-14, H-12);
    }
    x.restore();
  },

  drawBackground(){
    const x=this.x,W=this.W,H=this.H,pal=this.pal,t=this.bgT;
    const g=x.createLinearGradient(0,0,0,H);
    g.addColorStop(0,pal.sky1); g.addColorStop(1,pal.sky2);
    x.fillStyle=g; x.fillRect(0,0,W,H);

    const id = this.worldId;
    x.save();
    switch(id){
      case 'blank': {
        x.strokeStyle=pal.deco; x.lineWidth=2;
        for(let i=0;i<9;i++){
          const off=((t*30*0.6+i*140)%(W+340))-170;
          x.beginPath(); x.moveTo(W-off,0); x.lineTo(W-off-170,H); x.stroke();
        }
        x.globalAlpha=.5;
        this.bgParts.forEach(b=>{ x.strokeStyle=pal.deco; x.lineWidth=1.5;
          x.beginPath(); x.arc(b.x,b.y,b.r,0,7); x.stroke(); });
        break;
      }
      case 'wuste': {
        x.fillStyle='rgba(255,240,190,.55)'; x.beginPath(); x.arc(W*0.76,110,52,0,7); x.fill();
        for(let l=0;l<3;l++){
          const off=(t*(18+l*22))%(W+400);
          x.fillStyle=`rgba(120,58,6,${0.10+l*0.07})`;
          x.beginPath(); x.moveTo(-200-off%400,H);
          for(let i=-1;i<7;i++){
            const bx=-200+i*220-(off%220), by=H-90-l*46;
            x.quadraticCurveTo(bx+110,by-52-l*16,bx+220,by);
          }
          x.lineTo(W+300,H); x.closePath(); x.fill();
        }
        break;
      }
      case 'menimienai': {
        this.bgParts.forEach(b=>{
          x.fillStyle=`rgba(255,255,255,${b.a+0.25})`;
          x.beginPath(); x.ellipse(b.x,b.y*0.5+40,b.r*1.9,b.r*0.8,0,0,7); x.fill();
        });
        x.strokeStyle='rgba(255,255,255,.25)'; x.lineWidth=26;
        for(let i=0;i<4;i++){ const o=((t*12+i*260)%(W+520))-260;
          x.beginPath(); x.moveTo(o,0); x.lineTo(o+150,H); x.stroke(); }
        break;
      }
      case 'malik': {
        x.strokeStyle=pal.deco; x.lineWidth=1;
        for(let i=0;i<26;i++){ const yy=(i*22+t*40)%H; x.beginPath(); x.moveTo(0,yy); x.lineTo(W,yy); x.stroke(); }
        const pulse=0.14+Math.sin(t*3)*0.06;
        const rg=x.createRadialGradient(W/2,H/2,20,W/2,H/2,W*0.6);
        rg.addColorStop(0,`rgba(255,42,23,${pulse})`); rg.addColorStop(1,'rgba(0,0,0,0)');
        x.fillStyle=rg; x.fillRect(0,0,W,H);
        break;
      }
      case 'wardsback': {
        x.strokeStyle=pal.deco; x.lineWidth=1.4;
        for(let i=0;i<12;i++){ const yy=H-((i*i*4+t*30)%H); x.beginPath(); x.moveTo(0,yy); x.lineTo(W,yy); x.stroke(); }
        for(let i=0;i<10;i++){ const xx=((i*128 - t*26)%(W+128))-64;
          x.beginPath(); x.moveTo(xx,0); x.lineTo(xx+40,H); x.stroke(); }
        this.bgParts.forEach(b=>{ x.fillStyle=`rgba(125,255,171,${b.a*0.7})`;
          x.fillRect(b.x,b.y,3,3); });
        break;
      }
      case 'gum': {
        this.bgParts.forEach(b=>{
          const wob=Math.sin(t*2+b.s)*4;
          x.fillStyle=`rgba(255,255,255,${b.a*0.9})`;
          x.beginPath(); x.arc(b.x,b.y,b.r+wob,0,7); x.fill();
          x.strokeStyle='rgba(164,22,107,.16)'; x.lineWidth=1.5; x.stroke();
        });
        break;
      }
    }
    x.restore();
  },

  drawWorldName(){
    if (this.nameT<=0) return;
    const x=this.x, k=clamp(this.nameT/2.2,0,1);
    const a = k>0.8 ? (1-k)/0.2 : Math.min(1,k/0.35);
    x.save();
    x.globalAlpha = clamp(a,0,1);
    x.fillStyle=this.pal.text;
    x.font = `bold ${Math.min(150, 1000/Math.max(6,worldById(this.worldId).name.length))}px Haettenschweiler, "Arial Narrow", Impact, sans-serif`;
    x.textAlign='center'; x.textBaseline='middle';
    x.save();
    if (worldById(this.worldId).mech==='flip'){ x.translate(this.W/2,this.H*0.42); x.scale(1,-1); x.translate(-this.W/2,-this.H*0.42); }
    x.fillText(worldById(this.worldId).name, this.W/2, this.H*0.42);
    x.restore();
    x.restore();
  },

  drawTerrain(){
    const x=this.x, pal=this.pal;
    x.lineWidth=2; x.strokeStyle='#000'; x.lineJoin='miter';

    /* Malik columns */
    if (this.inColumns || (this.trans&&(this.trans.k==='build'||this.trans.k==='unbuild'))){
      const e=this.laneEdges();
      x.save();
      for (let i=0;i<3;i++){
        x.fillStyle = i%2 ? 'rgba(255,42,23,.05)' : 'rgba(255,255,255,.025)';
        x.fillRect(e[i],0,e[i+1]-e[i],this.H);
      }
      [e[1],e[2]].forEach(ex=>{
        x.strokeStyle='rgba(255,42,23,.55)'; x.lineWidth=7;
        x.beginPath(); x.moveTo(ex,0); x.lineTo(ex,this.H); x.stroke();
        x.strokeStyle='#000'; x.lineWidth=3;
        x.beginPath(); x.moveTo(ex,0); x.lineTo(ex,this.H); x.stroke();
      });
      x.restore();
    }

    /* ground — merged into continuous runs so seams don't show */
    for (const g of this.mergeGround()){
      const sx=g.x-this.worldX;
      x.fillStyle = pal.ground;
      x.beginPath(); x.rect(sx,g.y,g.w,g.h); x.fill(); x.stroke();
      x.fillStyle='rgba(0,0,0,.10)'; x.fillRect(sx,g.y+11,g.w,6);
      if (worldById(this.worldId).dark){
        x.strokeStyle=pal.obst; x.lineWidth=2; x.globalAlpha=.5;
        x.beginPath(); x.moveTo(sx,g.y+3); x.lineTo(sx+g.w,g.y+3); x.stroke();
        x.globalAlpha=1; x.strokeStyle='#000'; x.lineWidth=2;
      }
    }
    /* platforms and ceilings */
    for (const s of this.solids){
      if (s.kind==='ground') continue;
      const sx=s.x-this.worldX;
      if (sx>this.W+40 || sx+s.w<-40) continue;
      x.fillStyle = pal.obst;
      x.beginPath(); x.rect(sx,s.y,s.w,s.h); x.fill(); x.stroke();
      x.fillStyle='rgba(0,0,0,.13)'; x.fillRect(sx+4,s.y+s.h-5,s.w-8,3);
    }

    /* hazards */
    for (const h of this.hazards){
      let a=1;
      if (h.flick){
        const cyc=(Math.sin(this.t*h.flick.sp+h.flick.ph)+1)/2;
        a = cyc>h.flick.duty ? 1 : clamp((cyc/h.flick.duty)*1.5-0.4,0,1);
      }
      x.globalAlpha=a;
      if (h.type==='spike') this.drawSpike(h);
      else if (h.type==='mover') this.drawMover(h);
      else if (h.type==='gum') this.drawGum(h);
      else if (h.type==='fall') this.drawFall(h);
      else if (h.type==='bar') this.drawBar(h);
      x.globalAlpha=1;
    }
  },
  mergeGround(){
    const vis=[], L=this.worldX-80, R=this.worldX+this.W+80;
    for (const s of this.solids){
      if (s.kind!=='ground') continue;
      if (s.x+s.w<L || s.x>R) continue;
      vis.push(s);
    }
    vis.sort((a,b)=>a.y-b.y||a.x-b.x);
    const out=[]; let cur=null;
    for (const s of vis){
      if (cur && Math.abs(cur.y-s.y)<0.5 && s.x<=cur.x+cur.w+0.5){
        cur.w = Math.max(cur.w, s.x+s.w-cur.x);
      } else { cur={x:s.x,y:s.y,w:s.w,h:s.h}; out.push(cur); }
    }
    return out;
  },
  drawSpike(h){
    const x=this.x, sx=h.x-this.worldX;
    if (sx>this.W+40||sx<-60) return;
    x.fillStyle=this.pal.obst; x.strokeStyle='#000'; x.lineWidth=2;
    const st=h.stack||1;
    for(let i=0;i<st;i++){
      const base=h.y+h.h-i*SPIKE_H, top=base-SPIKE_H;
      x.beginPath(); x.moveTo(sx,base); x.lineTo(sx+h.w/2,top); x.lineTo(sx+h.w,base); x.closePath();
      x.fill(); x.stroke();
    }
  },
  drawMover(h){
    const x=this.x, sx=h.x-this.worldX;
    if (sx>this.W+40||sx<-60) return;
    const cy=h.cy===undefined?h.base:h.cy;
    x.fillStyle=this.pal.obst; x.strokeStyle='#000'; x.lineWidth=2;
    x.beginPath(); x.rect(sx,cy-h.h/2,h.w,h.h); x.fill(); x.stroke();
    x.fillStyle='rgba(0,0,0,.22)'; x.fillRect(sx+6,cy-h.h/2+6,h.w-12,h.h-12);
  },
  drawGum(h){
    const x=this.x, sx=h.x-this.worldX;
    if (sx>this.W+40||sx<-60) return;
    if (this.p.cleanseT>0) return;
    x.fillStyle='#ff5fa8'; x.strokeStyle='#000'; x.lineWidth=2;
    x.beginPath();
    x.moveTo(sx,h.y+h.h);
    x.quadraticCurveTo(sx+h.w*0.2,h.y-6+Math.sin(this.t*4+h.t)*2,sx+h.w*0.5,h.y-2);
    x.quadraticCurveTo(sx+h.w*0.8,h.y-8-Math.sin(this.t*3+h.t)*2,sx+h.w,h.y+h.h);
    x.closePath(); x.fill(); x.stroke();
  },
  drawFall(h){
    const x=this.x, sx=h.sx;
    x.fillStyle='#0a0a0a'; x.strokeStyle='#ff2a17'; x.lineWidth=2;
    x.beginPath(); x.rect(sx-h.w/2,h.y,h.w,h.h); x.fill(); x.stroke();
    x.strokeStyle='rgba(255,42,23,.35)';
    x.beginPath(); x.moveTo(sx-h.w/2,h.y); x.lineTo(sx+h.w/2,h.y+h.h); x.stroke();
  },
  drawBar(h){
    const x=this.x;
    x.fillStyle='#0a0a0a'; x.strokeStyle='#ff2a17'; x.lineWidth=2;
    x.beginPath(); x.rect(h.bx||0,h.y,h.bw||0,h.h); x.fill(); x.stroke();
  },

  drawPicks(){
    const x=this.x;
    for (const c of this.picks){
      const sx=c.x-this.worldX;
      if (sx>this.W+40||sx<-40) continue;
      const bob=Math.sin(this.t*3+c.t)*4;
      x.save(); x.translate(sx,c.y+bob);
      x.rotate(Math.sin(this.t*2+c.t)*0.35);
      x.lineWidth=2; x.strokeStyle='#000';
      if (c.type==='coin'){
        x.fillStyle='#ffc63d';
        x.beginPath(); x.ellipse(0,0,c.r,c.r,0,0,7); x.fill(); x.stroke();
        x.fillStyle='rgba(0,0,0,.25)'; x.beginPath(); x.ellipse(0,0,c.r*0.45,c.r*0.62,0,0,7); x.fill();
      } else {
        x.fillStyle='#7be3ff';
        x.beginPath();
        x.moveTo(0,-c.r); x.lineTo(c.r*0.62,0); x.lineTo(0,c.r); x.lineTo(-c.r*0.62,0);
        x.closePath(); x.fill(); x.stroke();
        x.fillStyle='rgba(255,255,255,.7)'; x.beginPath();
        x.moveTo(0,-c.r*0.5); x.lineTo(c.r*0.28,0); x.lineTo(0,c.r*0.5); x.lineTo(-c.r*0.28,0); x.closePath(); x.fill();
      }
      x.restore();
    }
  },

  drawPlayer(){
    const x=this.x, p=this.p, r=CFG.R;
    const cx=p.screenX, cy=p.by-p.h/2;
    x.save();
    x.translate(cx,cy);
    x.scale(p.sqX,p.sqY);
    x.globalAlpha = p.fadeT>0 ? 0.42 : 1;

    // aura for active skills
    if (p.fadeT>0){ x.strokeStyle='rgba(180,123,255,.85)'; x.lineWidth=3;
      x.beginPath(); x.arc(0,0,r+6+Math.sin(this.t*9)*2,0,7); x.stroke(); }
    if (p.tripleT>0){ x.strokeStyle='rgba(123,255,158,.8)'; x.lineWidth=2;
      for(let i=0;i<3;i++){ x.beginPath(); x.arc(0,0,r+3+i*4,-2.2+this.t*4+i, -1.1+this.t*4+i); x.stroke(); } }
    if (p.cleanseT>0){ x.strokeStyle='rgba(123,227,255,.8)'; x.lineWidth=2;
      x.setLineDash([5,7]); x.beginPath(); x.arc(0,0,r+9,this.t*3,this.t*3+6.28); x.stroke(); x.setLineDash([]); }
    if (p.gumT>0){ x.fillStyle='rgba(255,95,168,.5)';
      x.beginPath(); x.ellipse(0,p.h/2-3,r*1.2,7,0,0,7); x.fill(); }

    // glide wings
    if (p.gliding){
      const k=clamp(p.glideT*6,0,1);
      x.save(); x.globalAlpha=0.75*k*(p.fadeT>0?0.5:1);
      x.strokeStyle='#fff'; x.lineWidth=2.5;
      for(let s=-1;s<=1;s+=2){
        x.beginPath();
        x.arc(0,0,r+8+Math.sin(this.t*10)*1.5, s>0?-0.9:2.25, s>0?0.9:4.05);
        x.stroke();
      }
      x.restore();
    }

    // body path
    const h=p.h, hw=r, hh=h/2, rad=Math.min(r, hh);
    x.beginPath();
    roundRectPath(x,-hw,-hh,hw*2,hh*2,rad);
    x.save(); x.clip();

    const design = designById(Save.d.equipDesign);
    x.save();
    try{ design.draw(x, r, this.t); }catch(e){ x.fillStyle='#fff'; x.fillRect(-r,-r,r*2,r*2); }
    x.restore();

    // rolling markers
    const dotR=r*0.235, dist=r*0.6, sc=h/(r*2);
    for(let i=0;i<2;i++){
      const a=p.rot+i*Math.PI;
      const dx=Math.cos(a)*dist, dy=Math.sin(a)*dist*sc;
      x.fillStyle=design.dot||'#000';
      x.beginPath(); x.arc(dx,dy,dotR,0,7); x.fill();
    }
    x.restore(); // clip

    x.lineWidth=2.4; x.strokeStyle='#000';
    x.beginPath(); roundRectPath(x,-hw,-hh,hw*2,hh*2,rad); x.stroke();

    x.restore();
  },

  drawOverlays(){
    const x=this.x;
    /* sandstorm */
    if (this.sand.length){
      x.save();
      for (const s of this.sand){
        x.fillStyle=`rgba(226,160,70,${s.a})`;
        x.beginPath(); x.arc(s.x,s.y,s.r,0,7); x.fill();
      }
      x.fillStyle='rgba(226,140,40,.13)'; x.fillRect(0,0,this.W,this.H);
      x.restore();
    }
    /* particle fx that live in world space */
    for (const f of this.fx){
      const k=1-f.t/f.life;
      x.save();
      if (f.k==='ring'){
        x.globalAlpha=f.a*k; x.strokeStyle=f.c; x.lineWidth=3;
        x.beginPath(); x.arc(f.x,f.y,lerp(f.r0,f.r1,1-k),0,7); x.stroke();
      } else if (f.k==='dust'||f.k==='shard'){
        x.globalAlpha=k; x.fillStyle=f.c;
        x.beginPath(); x.arc(f.x,f.y,(f.r||3)*k,0,7); x.fill();
      } else if (f.k==='spark'){
        x.globalAlpha=k; x.fillStyle=f.c; x.fillRect(f.x,f.y,3,3);
      } else if (f.k==='streak'){
        x.globalAlpha=k*(f.a||1); x.strokeStyle=f.c; x.lineWidth=2;
        x.beginPath(); x.moveTo(f.x,f.y); x.lineTo(f.x-f.len,f.y); x.stroke();
      } else if (f.k==='ghost'){
        x.globalAlpha=k*f.a; x.strokeStyle=f.c; x.lineWidth=2;
        x.beginPath(); x.arc(f.x,f.y,f.r,0,7); x.stroke();
      }
      x.restore();
    }
  },

  drawFxScreen(){
    const x=this.x;
    for (const f of this.fx){
      if (f.k!=='flash') continue;
      const k=1-f.t/f.life;
      x.save(); x.globalAlpha=f.a*k*(Save.d.set.flash?0.4:1);
      x.fillStyle='#fff'; x.fillRect(0,0,this.W,this.H); x.restore();
    }
  },

  drawBarrier(){
    const x=this.x, W=this.W, H=this.H;
    let bx = this.barrierX;
    if (this.state==='dying'||this.state==='over'){
      const e = this.fill<1 ? 1-Math.pow(1-this.fill,3) : 1;
      bx = lerp(this.barrierX, W+40, e);
    }
    if (bx<-40) return;
    x.save();
    x.fillStyle='#000';
    x.beginPath();
    x.moveTo(-10,-10); x.lineTo(bx,-10);
    const amp = this.state==='run'?7:2;
    for(let y=-10;y<=H+10;y+=18){
      x.lineTo(bx+Math.sin(y*0.06+this.t*6)*amp, y);
    }
    x.lineTo(-10,H+10); x.closePath(); x.fill();
    // edge glow
    x.strokeStyle='rgba(255,42,23,.5)'; x.lineWidth=2;
    x.beginPath();
    for(let y=-10;y<=H+10;y+=18) y===-10?x.moveTo(bx,y):x.lineTo(bx+Math.sin(y*0.06+this.t*6)*amp,y);
    x.stroke();
    x.restore();
  },

  drawTransition(){
    if (!this.trans) return;
    const x=this.x, W=this.W, H=this.H, k=clamp(this.trans.t/this.trans.dur,0,1);
    x.save();
    if (this.trans.k==='wipe'){
      const a = k<0.5 ? k*2 : (1-k)*2;
      x.globalAlpha=a*0.55; x.fillStyle='#000';
      const w=W*1.25*(k<0.5?k*2:1);
      x.beginPath(); x.moveTo(W-w,0); x.lineTo(W,0); x.lineTo(W,H); x.lineTo(W-w-120,H); x.closePath(); x.fill();
    } else if (this.trans.k==='build'||this.trans.k==='unbuild'){
      const build = this.trans.k==='build';
      const kk = build?k:1-k;
      const e=this.laneEdges();
      x.strokeStyle='#000'; x.lineWidth=4;
      [e[1],e[2]].forEach(ex=>{ x.beginPath(); x.moveTo(ex,0); x.lineTo(ex,H*kk); x.stroke(); });
      x.globalAlpha=0.5*Math.sin(kk*Math.PI);
      x.fillStyle='#ff2a17'; x.fillRect(0,0,W,H);
      x.globalAlpha=1;
      x.fillStyle='#000';
      x.fillRect(0,0,W,H*Math.max(0,(kk-0.75)*4));
    } else if (this.trans.k==='flip'){
      x.globalAlpha=Math.sin(k*Math.PI)*0.5; x.fillStyle='#000'; x.fillRect(0,0,W,H);
    }
    x.restore();
  }
};

/* ---------- helpers ---------- */
function roundRectPath(x,px,py,w,h,r){
  r=Math.min(r,w/2,h/2);
  x.moveTo(px+r,py);
  x.arcTo(px+w,py,px+w,py+h,r);
  x.arcTo(px+w,py+h,px,py+h,r);
  x.arcTo(px,py+h,px,py,r);
  x.arcTo(px,py,px+w,py,r);
  x.closePath();
}
function hex2rgb(h){
  h=h.replace('#','');
  if(h.length===3) h=h.split('').map(c=>c+c).join('');
  const n=parseInt(h,16); return [n>>16&255,n>>8&255,n&255];
}
function mixHex(a,b,k){
  if(a[0]!=='#'||b[0]!=='#') return k<0.5?a:b;
  const A=hex2rgb(a),B=hex2rgb(b);
  return `rgb(${Math.round(lerp(A[0],B[0],k))},${Math.round(lerp(A[1],B[1],k))},${Math.round(lerp(A[2],B[2],k))})`;
}
function mixPal(a,b,k){
  const o={};
  for(const key in a) o[key]=mixHex(a[key],b[key],k);
  return o;
}
