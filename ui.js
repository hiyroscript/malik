/* ============================================================
   MALIK — ui.js   screens, store, locker, settings, HUD
   ============================================================ */

const UI = {
  cur:'splash', previews:[], prevRaf:0, resetArmed:false,

  init(){
    Save.load();
    LANG = Save.d.lang || ((navigator.language||'en').toLowerCase().startsWith('fr') ? 'fr' : 'en');
    applyLang();

    if (matchMedia('(pointer:coarse)').matches) document.body.classList.add('touch');
    document.body.classList.toggle('lefty', !!Save.d.set.lefty);

    Game.init();
    this.wire();

    // unlock audio on the first interaction
    const unlock = ()=>{ Audio2.init(); Audio2.resume(); removeEventListener('pointerdown',unlock); removeEventListener('keydown',unlock); };
    addEventListener('pointerdown',unlock); addEventListener('keydown',unlock);

    // splash → language / home
    setTimeout(()=>{
      if (!Save.d.lang) this.go('langScreen');
      else this.go('home');
    }, 2600);
  },

  /* ---------- navigation ---------- */
  go(id){
    document.querySelectorAll('.screen').forEach(s=>s.classList.remove('show'));
    const el = document.getElementById(id);
    if (el) el.classList.add('show');
    this.cur = id;
    this.stopPreviews();
    if (id==='home'){ this.refreshHome(); }
    if (id==='modes'){ this.refreshModes(); }
    if (id==='levels'){ this.buildLevels(); }
    if (id==='store'){ this.buildStore(); this.startPreviews(); }
    if (id==='locker'){ this.buildLocker(); this.startPreviews(); }
    if (id==='settings'){ this.buildSettings(); }
    if (id!=='splash') Audio2.sfx('ui');
  },
  hideAll(){ document.querySelectorAll('.screen').forEach(s=>s.classList.remove('show')); this.stopPreviews(); },

  wire(){
    document.querySelectorAll('[data-go]').forEach(b=>b.addEventListener('click',()=>{
      const t=b.getAttribute('data-go');
      if (t==='home'&&this.cur!=='home') Audio2.sfx('back');
      this.go(t);
    }));
    document.querySelectorAll('[data-lang]').forEach(b=>b.addEventListener('click',()=>{
      LANG = b.getAttribute('data-lang');
      Save.d.lang = LANG; Save.save(); applyLang(); this.go('home');
    }));
    document.getElementById('cardChal').addEventListener('click',()=>{ Audio2.sfx('go'); Game.startChallenge(); });
    document.getElementById('cardAdv').addEventListener('click',()=>this.go('levels'));

    document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>{
      document.querySelectorAll('[data-tab]').forEach(o=>o.classList.remove('on'));
      b.classList.add('on');
      const t=b.getAttribute('data-tab');
      document.getElementById('tabDesign').classList.toggle('hide',t!=='design');
      document.getElementById('tabSkill').classList.toggle('hide',t!=='skill');
      Audio2.sfx('ui');
    }));
    document.querySelectorAll('[data-ltab]').forEach(b=>b.addEventListener('click',()=>{
      document.querySelectorAll('[data-ltab]').forEach(o=>o.classList.remove('on'));
      b.classList.add('on');
      const t=b.getAttribute('data-ltab');
      document.getElementById('lTabDesign').classList.toggle('hide',t!=='design');
      document.getElementById('lTabSkill').classList.toggle('hide',t!=='skill');
      Audio2.sfx('ui');
    }));

    document.getElementById('btnPause').addEventListener('click',()=>this.togglePause());
    document.getElementById('btnResume').addEventListener('click',()=>this.resume());
    document.getElementById('btnRestart').addEventListener('click',()=>this.restart());
    document.getElementById('btnQuit').addEventListener('click',()=>{ Game.quit(); this.go('home'); });
    document.getElementById('btnAgain').addEventListener('click',()=>this.restart());
    document.getElementById('btnHome').addEventListener('click',()=>{ Game.quit(); this.go('home'); });
    document.getElementById('btnReset').addEventListener('click',()=>this.doReset());
  },

  /* ---------- home ---------- */
  refreshHome(){
    document.getElementById('homeBest').textContent = Save.d.highScore;
    document.getElementById('homeCoins').textContent = Save.d.coins;
    document.getElementById('homeShards').textContent = Save.d.shards;
  },
  refreshModes(){
    document.getElementById('chalBest').textContent = Save.d.highScore;
    document.getElementById('advDone').textContent = Save.d.adventure.cleared.length+'/'+LEVELS.length;
  },

  /* ---------- adventure list ---------- */
  buildLevels(){
    const wrap=document.getElementById('lvlList'); wrap.innerHTML='';
    LEVELS.forEach(lv=>{
      const unlocked = lv.n <= Save.d.adventure.unlocked;
      const best = Save.d.adventure.best[lv.key]||{pct:0,att:0};
      const b=document.createElement('button');
      b.className='lvl'+(unlocked?'':' locked');
      const rules = lv.rules.map(r=>T('lvr_'+r)).join(' · ') || '—';
      b.innerHTML = `<div class="lvlNo">${String(lv.n).padStart(2,'0')}</div>
        <div><div class="lvlName">${LEVEL_NAMES[lv.key][LANG]||LEVEL_NAMES[lv.key].en}</div>
        <div class="lvlSub"><span class="diff d-${lv.diff}">${T('d_'+lv.diff)}</span>${worldById(lv.world).name} · ${lv.spd.toFixed(2)}× · ${rules}</div></div>
        <div class="lvlPct">${unlocked?(best.pct||0)+'%':'🔒'}<br><span style="font-size:9px">${T('st_att')} ${best.att||0}</span></div>`;
      if (unlocked) b.addEventListener('click',()=>{ Audio2.sfx('go'); Game.startLevel(lv); });
      wrap.appendChild(b);
    });
  },

  /* ---------- store ---------- */
  buildStore(){
    const ids = rollStore();
    document.getElementById('stCoins').textContent = Save.d.coins;
    document.getElementById('stShards').textContent = Save.d.shards;
    const g=document.getElementById('storeGrid'); g.innerHTML=''; this.previews=[];
    ids.forEach(id=>{
      const d=designById(id), owned=Save.owns(id), eq=Save.d.equipDesign===id;
      const el=document.createElement('div');
      el.className='item'+(eq?' eqd':'');
      el.innerHTML=`${eq?`<span class="tagi eq">${T('l_equipped')}</span>`:(owned?`<span class="tagi own">${T('l_owned')}</span>`:'')}
        <canvas width="128" height="128"></canvas>
        <div class="iName">${d.name[LANG]||d.name.en}</div>
        <div class="iRar r-${d.rar}">${d.rar.toUpperCase()}</div>
        <div class="iPrice">${owned?(eq?'—':T('l_equip')):'◈ '+d.price}</div>`;
      el.addEventListener('click',()=>this.buyDesign(id));
      g.appendChild(el);
      this.previews.push({c:el.querySelector('canvas'),d});
    });
    this.tickRefresh();
    this.buildSkillStore();
  },
  tickRefresh(){
    const el=document.getElementById('refreshIn');
    const upd=()=>{
      if (this.cur!=='store') return;
      let ms=msToRefresh();
      const h=Math.floor(ms/3600000), m=Math.floor(ms/60000)%60, s=Math.floor(ms/1000)%60;
      el.textContent=`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
      setTimeout(upd,1000);
    };
    upd();
  },
  buyDesign(id){
    const d=designById(id);
    if (Save.owns(id)){
      if (Save.d.equipDesign===id) return;
      Save.d.equipDesign=id; Save.save(); Audio2.sfx('buy'); toast(T('t_equipped'));
    } else if (Save.d.coins>=d.price){
      Save.d.coins-=d.price; Save.d.designs.push(id); Save.d.equipDesign=id; Save.save();
      Audio2.sfx('buy'); toast(T('t_bought'));
    } else { Audio2.sfx('deny'); toast(T('t_nocoins')); return; }
    this.buildStore(); this.startPreviews();
  },
  buildSkillStore(){
    const g=document.getElementById('skillGrid'); g.innerHTML='';
    SKILLS.forEach(sk=>{
      const owned=Save.ownsSkill(sk.id), eq=Save.d.equipSkill===sk.id;
      const el=document.createElement('div');
      el.className='skillCard'+(eq?' eqd':'');
      el.innerHTML=`<div class="skIcon">${sk.icon}</div>
        <div class="skName">${sk.name[LANG]||sk.name.en}</div>
        <div class="skDesc">${sk.desc[LANG]||sk.desc.en}</div>
        <div class="iPrice shard">${owned?(eq?T('l_equipped'):T('l_equip')):'✦ '+sk.cost}</div>`;
      el.addEventListener('click',()=>this.buySkill(sk.id));
      g.appendChild(el);
    });
  },
  buySkill(id){
    const sk=skillById(id);
    if (Save.ownsSkill(id)){
      Save.d.equipSkill = Save.d.equipSkill===id ? null : id;
      Save.save(); Audio2.sfx('buy'); toast(T('t_equipped'));
    } else if (Save.d.shards>=sk.cost){
      Save.d.shards-=sk.cost; Save.d.skills.push(id); Save.d.equipSkill=id; Save.save();
      Audio2.sfx('buy'); toast(T('t_bought'));
    } else { Audio2.sfx('deny'); toast(T('t_noshards')); return; }
    document.getElementById('stShards').textContent=Save.d.shards;
    this.buildSkillStore();
  },

  /* ---------- locker ---------- */
  buildLocker(){
    const storeIds = rollStore();
    const g=document.getElementById('lTabDesign'); g.innerHTML=''; this.previews=[];
    const shown = DESIGNS.filter(d=>d.rar!=='exclusive' || Save.owns(d.id) || true);
    document.getElementById('lockerCount').textContent = `${Save.d.designs.length}/${DESIGNS.length}`;
    shown.forEach(d=>{
      const owned=Save.owns(d.id), eq=Save.d.equipDesign===d.id, inStore=storeIds.includes(d.id);
      const el=document.createElement('div');
      el.className='item'+(owned?'':' locked')+(eq?' eqd':'');
      el.innerHTML=`${eq?`<span class="tagi eq">${T('l_equipped')}</span>`:(inStore&&!owned?`<span class="tagi">${T('l_instore')}</span>`:'')}
        <canvas width="128" height="128"></canvas>
        <div class="iName">${d.name[LANG]||d.name.en}</div>
        <div class="iRar r-${d.rar}">${d.rar.toUpperCase()}</div>
        <div class="iPrice">${owned?(eq?'—':T('l_equip')):(d.rar==='exclusive'?T('l_locked'):(inStore?'◈ '+d.price:T('l_locked')))}</div>`;
      el.addEventListener('click',()=>{
        if (owned){ if(eq) return; Save.d.equipDesign=d.id; Save.save(); Audio2.sfx('buy'); toast(T('t_equipped')); this.buildLocker(); this.startPreviews(); }
        else if (inStore) this.buyDesign(d.id);
        else { Audio2.sfx('deny'); toast(d.rar==='exclusive'?T('o_win')+' — 2:00':T('l_locked')); }
      });
      g.appendChild(el);
      this.previews.push({c:el.querySelector('canvas'),d});
    });

    const s=document.getElementById('lTabSkill'); s.innerHTML='';
    SKILLS.forEach(sk=>{
      const owned=Save.ownsSkill(sk.id), eq=Save.d.equipSkill===sk.id;
      const el=document.createElement('div');
      el.className='skillCard'+(eq?' eqd':'')+(owned?'':' locked');
      el.style.opacity = owned?1:.45;
      el.innerHTML=`<div class="skIcon">${sk.icon}</div>
        <div class="skName">${sk.name[LANG]||sk.name.en}</div>
        <div class="skDesc">${sk.desc[LANG]||sk.desc.en}</div>
        <div class="iPrice shard">${owned?(eq?T('l_equipped'):T('l_equip')):'✦ '+sk.cost+' — '+T('s_skill')}</div>`;
      el.addEventListener('click',()=>{
        if (owned){ Save.d.equipSkill = eq?null:sk.id; Save.save(); Audio2.sfx('buy'); toast(T('t_equipped')); this.buildLocker(); this.startPreviews(); }
        else { Audio2.sfx('deny'); toast(T('t_noshards')); }
      });
      s.appendChild(el);
    });
  },

  /* ---------- design preview animation ---------- */
  startPreviews(){
    cancelAnimationFrame(this.prevRaf);
    const t0=performance.now();
    const draw=()=>{
      this.prevRaf=requestAnimationFrame(draw);
      const t=(performance.now()-t0)/1000;
      this.previews.forEach(p=>{
        const g=p.c.getContext('2d'), R=52;
        g.setTransform(1,0,0,1,0,0);
        g.clearRect(0,0,128,128);
        g.save(); g.translate(64,64);
        g.beginPath(); g.arc(0,0,R,0,7); g.save(); g.clip();
        try{ p.d.draw(g,R,t); }catch(e){ g.fillStyle='#fff'; g.fillRect(-R,-R,R*2,R*2); }
        g.restore();
        const rot=t*1.6;
        for(let i=0;i<2;i++){ const a=rot+i*Math.PI;
          g.fillStyle='#000'; g.beginPath(); g.arc(Math.cos(a)*R*0.6,Math.sin(a)*R*0.6,R*0.235,0,7); g.fill(); }
        g.lineWidth=4; g.strokeStyle='#000'; g.beginPath(); g.arc(0,0,R,0,7); g.stroke();
        g.restore();
      });
    };
    draw();
  },
  stopPreviews(){ cancelAnimationFrame(this.prevRaf); this.previews=[]; },

  /* ---------- settings ---------- */
  buildSettings(){
    const L=document.getElementById('setList'); L.innerHTML='';
    const S=Save.d.set;
    const row=(label,ctrl,note)=>{
      const d=document.createElement('div'); d.className='setRow';
      d.innerHTML=`<label>${label}${note?`<small>${note}</small>`:''}</label>`;
      d.appendChild(ctrl); L.appendChild(d);
    };
    const sw=(key,onChange)=>{
      const b=document.createElement('button');
      b.className='sw'+(S[key]?' on':'');
      b.addEventListener('click',()=>{ S[key]=!S[key]; b.classList.toggle('on',S[key]); Save.save(); Audio2.sfx('ui'); onChange&&onChange(); });
      return b;
    };
    const slider=(key)=>{
      const i=document.createElement('input');
      i.type='range'; i.min=0; i.max=1; i.step=0.05; i.value=S[key]; i.className='slider';
      i.addEventListener('input',()=>{ S[key]=+i.value; Save.save();
        if(key==='sfxVol'&&Audio2.sfxGain) Audio2.sfxGain.gain.value=+i.value; });
      return i;
    };
    // language
    const seg=document.createElement('div'); seg.className='seg';
    ['en','fr'].forEach(l=>{
      const b=document.createElement('button'); b.textContent=l.toUpperCase();
      if (LANG===l) b.classList.add('on');
      b.addEventListener('click',()=>{ LANG=l; Save.d.lang=l; Save.save(); applyLang(); this.buildSettings(); Audio2.sfx('ui'); });
      seg.appendChild(b);
    });
    row(T('set_lang'),seg);
    row(T('set_sfx'),sw('sfx'));
    row(T('set_mus'),sw('music',()=>{ if(!S.music) Audio2.stop(); else if(Game.state==='run') Audio2.playWorld(Game.worldId,true); }));
    row(T('set_musvol'),slider('musVol'));
    row(T('set_sfxvol'),slider('sfxVol'));
    row(T('set_pitch'),sw('pitch',()=>Audio2.setRate(Audio2.rate)),T('set_pitch_d'));
    row(T('set_shake'),sw('shake'));
    row(T('set_part'),sw('particles',()=>Game.makeBgParts()),T('set_part_d'));
    row(T('set_flash'),sw('flash'));
    row(T('set_lefty'),sw('lefty',()=>document.body.classList.toggle('lefty',S.lefty)));
    row(T('set_fps'),sw('fps'));
    this.resetArmed=false;
    document.getElementById('btnReset').textContent=T('set_reset');
  },
  doReset(){
    const b=document.getElementById('btnReset');
    if (!this.resetArmed){ this.resetArmed=true; b.textContent=T('set_reset_c'); Audio2.sfx('deny'); return; }
    const lang=Save.d.lang; Save.reset(); Save.d.lang=lang; Save.save();
    LANG=lang||'en'; applyLang(); this.resetArmed=false;
    toast(T('t_reset')); this.buildSettings();
  },

  /* ---------- HUD ---------- */
  showHUD(on){ document.getElementById('hud').classList.toggle('hide',!on); if(on) this.updateSkillBtn(); },
  setWorldName(n){ document.getElementById('worldName').textContent=n; },
  setProgress(on){ document.getElementById('progWrap').classList.toggle('hide',!on); },
  updateHUD(){
    const G=Game, s=G.stats;
    document.getElementById('sTime').textContent = G.t.toFixed(1);
    document.getElementById('sScore').textContent = Math.floor(G.score);
    document.getElementById('sJump').textContent = s.jumps;
    document.getElementById('sDjump').textContent = s.djumps;
    document.getElementById('sSlow').textContent = s.slows;
    document.getElementById('sCrouch').textContent = s.crouches;
    const sk = Save.d.equipSkill ? (skillById(Save.d.equipSkill).name[LANG]||skillById(Save.d.equipSkill).name.en) : '—';
    document.getElementById('sSkill').textContent = Save.d.equipSkill ? `${sk} ×${s.skills}` : '—';
    document.getElementById('sAtt').textContent = s.att;
    document.getElementById('speedTag').textContent = G.spd.toFixed(2)+'×';
    document.getElementById('cCoins').textContent = G.runCoins;
    document.getElementById('cShards').textContent = G.runShards;
    if (G.mode==='adv'){
      const pct = clamp(G.t/G.level.len,0,1);
      document.getElementById('progFill').style.width=(pct*100)+'%';
      document.getElementById('progPct').textContent=Math.floor(pct*100)+'%';
    }
    // cooldown ring
    const ring=document.querySelector('#cdRing circle'), txt=document.getElementById('cdText');
    const k = G.cd>0 ? G.cd/G.cdMax : 0;
    ring.style.strokeDashoffset = 276*(1-k);
    txt.textContent = G.cd>0 ? Math.ceil(G.cd) : '';
    const btn=document.getElementById('btnSkill');
    btn.classList.toggle('ready', !!Save.d.equipSkill && G.cd<=0);
    btn.classList.toggle('none', !Save.d.equipSkill);
  },
  updateSkillBtn(){
    const id=Save.d.equipSkill;
    document.getElementById('skillIcon').textContent = id?skillById(id).icon:'—';
  },
  flashSkill(){
    const b=document.getElementById('btnSkill');
    b.animate([{transform:'scale(1)'},{transform:'scale(1.18)'},{transform:'scale(1)'}],{duration:260});
  },

  /* ---------- pause / countdown ---------- */
  togglePause(){
    if (Game.state==='run'){
      Game.state='pause'; Audio2.pause();
      document.getElementById('pause').classList.add('show');
    } else if (Game.state==='pause'){ this.resume(); }
  },
  resume(){
    document.getElementById('pause').classList.remove('show');
    this.countdown(()=>{ Game.state='run'; Game.lastT=performance.now(); Audio2.unpause(); });
  },
  countdown(done){
    const el=document.getElementById('countdown');
    el.classList.remove('hide');
    let n=3;
    const tick=()=>{
      el.innerHTML=`<span>${n}</span>`;
      Audio2.sfx(n===1?'go':'count');
      n--;
      if (n>=0) setTimeout(tick,900);
      else { el.classList.add('hide'); done(); }
    };
    tick();
  },
  restart(){
    this.showHUD(true);
    document.getElementById('over').classList.remove('show');
    document.getElementById('pause').classList.remove('show');
    if (Game.mode==='adv') Game.startLevel(Game.level);
    else Game.startChallenge();
  },

  /* ---------- game over ---------- */
  showOver(kind){
    const T_ = k=>T(k);
    let title, kick;
    if (kind==='win'){ title=T_('o_win'); kick='02:00 · 2.00×'; }
    else if (kind==='clear'){ title=T_('o_clear'); kick=(LEVEL_NAMES[Game.level.key][LANG]||LEVEL_NAMES[Game.level.key].en).toUpperCase(); }
    else if (kind==='wall'){ title=T_('o_wall'); kick=T_('o_run'); }
    else { title=T_('o_over'); kick=T_('o_run'); }
    document.getElementById('overTitle').textContent=title;
    document.getElementById('overKick').textContent=kick;

    const st=document.getElementById('overStats');
    const cells=[];
    if (Game.mode==='chal'){
      cells.push([T_('o_score'),Math.floor(Game.score)]);
      cells.push([T_('o_time'),Game.t.toFixed(1)+'s']);
      cells.push([T_('o_best'),Save.d.highScore]);
    } else {
      const pct=Math.min(100,Math.floor(Game.t/Game.level.len*100));
      const b=Save.d.adventure.best[Game.level.key]||{pct:0};
      cells.push([T_('o_prog'),pct+'%']);
      cells.push([T_('o_best'),(b.pct||0)+'%']);
    }
    cells.push([T_('st_att'),Game.stats.att]);
    if (Game.runCoins) cells.push(['◈',Game.runCoins]);
    if (Game.runShards) cells.push(['✦',Game.runShards]);
    st.innerHTML=cells.map(c=>`<div>${c[0]}<b>${c[1]}</b></div>`).join('');

    this.showHUD(false);
    document.getElementById('over').classList.add('show');
    if (Game.newDesign){ Game.newDesign=false; setTimeout(()=>toast(T('t_win')),700); }
  }
};

/* level display names live here so data.js stays language-agnostic */
const LEVEL_NAMES = {
  l1:{en:'First Steps',fr:'Premiers Pas'},
  l2:{en:'Mind the Hole',fr:'Attention au Trou'},
  l3:{en:'Sandline',fr:'Ligne de Sable'},
  l4:{en:'Duck Season',fr:'Baisse la Tête'},
  l5:{en:'Blink',fr:'Clignement'},
  l6:{en:'Sticky',fr:'Collant'},
  l7:{en:'Upside',fr:'À l\'Envers'},
  l8:{en:'Descent',fr:'Descente'},
  l9:{en:'Ghost Run',fr:'Course Fantôme'},
  l10:{en:'Reverse Storm',fr:'Tempête Inversée'},
  l11:{en:'Bubblewrapped',fr:'Empapillonné'},
  l12:{en:'MALIK',fr:'MALIK'},
};

addEventListener('DOMContentLoaded',()=>UI.init());
