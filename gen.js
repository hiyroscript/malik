/* ============================================================
   MALIK — gen.js
   Pattern-based terrain generation. Every parameter is derived
   from the jump arc at the current speed, so nothing it emits
   is physically impossible — only tight.
   ============================================================ */

const GY = CFG.GROUND_Y;
const SPIKE_W = 26, SPIKE_H = 28;

/* jump reach helpers */
const jumpH = () => (CFG.JUMP*CFG.JUMP)/(2*CFG.G);            // ~140
const jumpDist = spd => CFG.PX*spd * (2*CFG.JUMP/CFG.G);      // 287 @1x … 574 @2x

function ground(o,x,w,top){ o.solids.push({kind:'ground',x,y:top===undefined?GY:top,w,h:CFG.H-(top===undefined?GY:top)+40}); }
function block(o,x,y,w,h,kind){ o.solids.push({kind:kind||'block',x,y,w,h}); }
function spike(o,x,base,stack){
  const h = SPIKE_H*stack;
  o.hazards.push({type:'spike',x,y:base-h,w:SPIKE_W,h,stack});
}
function coinAt(o,x,y,rng,force){
  const r = rng.next();
  if (force || r < CFG.COIN_CHANCE) o.picks.push({type:'coin',x,y,r:11,t:rng.range(0,6)});
  else if (r < CFG.COIN_CHANCE + CFG.SHARD_CHANCE) o.picks.push({type:'shard',x,y,r:11,t:rng.range(0,6)});
}

/* ---------------- pattern library ----------------
   Each returns the width it consumed. o = output buckets. */
const PATTERNS = {

  /* plain run — breathing room */
  flat(o,x,c){
    const w = c.rng.range(140, 240);
    ground(o,x,w);
    return w;
  },

  /* ground spikes, stackable like GD */
  spikes(o,x,c){
    const n = c.hard ? c.rng.int(2,3) : c.rng.int(1,2);
    const gapBetween = Math.max(120, jumpDist(c.spd)*0.55);
    let w = 60;
    for (let i=0;i<n;i++){
      const stack = c.rng.weighted(c.hard? {1:3,2:4,3:2} : {1:6,2:3,3:1})|0;
      const cluster = c.rng.chance(c.hard?0.45:0.2) ? 2 : 1;   // side-by-side pair
      for (let k=0;k<cluster;k++) spike(o,x+w+k*SPIKE_W,GY,+stack);
      if (c.rng.chance(0.35)) coinAt(o,x+w+SPIKE_W/2, GY-SPIKE_H*stack-58, c.rng);
      w += SPIKE_W*cluster + gapBetween;
    }
    w += 60;
    ground(o,x,w);
    return w;
  },

  /* a hole in the floor */
  gap(o,x,c){
    const jd = jumpDist(c.spd);
    const lead = Math.max(90, jd*0.30);
    const gw = jd * c.rng.range(c.hard?0.36:0.26, c.hard?0.52:0.42) * (c.rules.gaps?1.12:1);
    const tail = Math.max(110, jd*0.36);
    ground(o,x,lead);
    ground(o,x+lead+gw,tail);
    if (c.rng.chance(0.4)) coinAt(o,x+lead+gw/2, GY-95, c.rng);
    return lead+gw+tail;
  },

  /* two holes with a tiny island — rewards a double jump */
  doubleGap(o,x,c){
    const jd = jumpDist(c.spd);
    const lead = Math.max(90, jd*0.28);
    const g1 = jd*c.rng.range(0.26,0.38);
    const isle = Math.max(70, jd*0.22);
    const g2 = jd*c.rng.range(0.26,0.40);
    const tail = Math.max(110, jd*0.34);
    ground(o,x,lead);
    ground(o,x+lead+g1,isle);
    ground(o,x+lead+g1+isle+g2,tail);
    coinAt(o,x+lead+g1+isle/2, GY-100, c.rng);
    return lead+g1+isle+g2+tail;
  },

  /* floating platform to land on. sides kill. */
  airPlat(o,x,c){
    const jd = jumpDist(c.spd);
    const lead = Math.max(110, jd*0.34);
    const pw = Math.max(90, jd*c.rng.range(0.32,0.5));
    const ph = c.rng.range(78, 112);
    const tail = Math.max(120, jd*0.4);
    ground(o,x,lead+pw+tail);
    block(o,x+lead,GY-ph,pw,16);
    // something worth going up there for
    if (c.rng.chance(0.55)) coinAt(o,x+lead+pw/2, GY-ph-40, c.rng);
    // low threat under the platform so the top route matters
    if (c.hard && c.rng.chance(0.6)) spike(o,x+lead+pw*0.4,GY,1);
    return lead+pw+tail;
  },

  /* stepped ground at different heights */
  steps(o,x,c){
    const jd = jumpDist(c.spd);
    const n = c.rng.int(2,3);
    const stepW = Math.max(96, jd*0.30);
    const lead = Math.max(80, jd*0.24);
    ground(o,x,lead);
    let cx = x+lead, h = 0;
    for (let i=0;i<n;i++){
      h += c.rng.range(38,62);
      h = Math.min(h, jumpH()-24);
      ground(o,cx,stepW,GY-h);
      if (i===n-1 && c.rng.chance(0.5)) coinAt(o,cx+stepW/2, GY-h-52, c.rng);
      cx += stepW;
    }
    // drop back down, spikes in the pit below
    const pit = Math.max(100, jd*0.32);
    const spikeStart = cx + Math.max(70, pit*0.5);
    if (c.hard) for (let s=0;s<2;s++) spike(o,spikeStart+s*SPIKE_W,GY,1);
    ground(o,cx,pit+Math.max(110,jd*0.34));
    return (cx+pit+Math.max(110,jd*0.34))-x;
  },

  /* GD-style floating staircase with a spike bed underneath */
  stairSpikes(o,x,c){
    const jd = jumpDist(c.spd);
    const lead = Math.max(100, jd*0.28);
    const stepW = Math.max(84, jd*0.26);
    const n = 3;
    const bedW = stepW*n;
    ground(o,x,lead+bedW+Math.max(130,jd*0.42));
    let cx = x+lead, h = 58;
    for (let i=0;i<n;i++){
      block(o,cx,GY-h,stepW,16);
      cx += stepW; h = Math.min(h+42, jumpH()+96);
    }
    // spike bed under the staircase — falling costs the run
    for (let sx=x+lead+6; sx<cx-SPIKE_W; sx+=SPIKE_W) spike(o,sx,GY,1);
    if (c.rng.chance(0.5)) coinAt(o,cx-stepW/2, GY-h-30, c.rng);
    return (cx+Math.max(130,jd*0.42))-x;
  },

  /* overhead block — must crouch */
  ceiling(o,x,c){
    const jd = jumpDist(c.spd);
    const lead = Math.max(110, jd*0.34);
    const cw = c.rng.range(90, Math.max(130, jd*0.42));
    const tail = Math.max(110, jd*0.34);
    ground(o,x,lead+cw+tail);
    block(o,x+lead,GY-140,cw,102,'ceil');   // bottom edge sits 38px over the floor
    if (c.rng.chance(0.3)) coinAt(o,x+lead+cw/2, GY-20, c.rng);
    if (c.hard && c.rng.chance(0.4)) spike(o,x+lead-SPIKE_W-14,GY,1);
    return lead+cw+tail;
  },

  /* square that slides up and down */
  movers(o,x,c){
    const jd = jumpDist(c.spd);
    const n = c.hard ? c.rng.int(1,2) : 1;
    const spacing = Math.max(150, jd*0.5);
    const lead = Math.max(110, jd*0.34);
    ground(o,x,lead+spacing*n+Math.max(110,jd*0.34));
    for (let i=0;i<n;i++){
      const cycleDist = 420;                      // constant in world-space → speed-independent timing
      o.hazards.push({type:'mover',x:x+lead+i*spacing,y:GY-100,w:36,h:36,
        amp:c.rng.range(52,78), cycle:cycleDist, phase:c.rng.range(0,1), base:GY-96});
    }
    if (c.rng.chance(0.35)) coinAt(o,x+lead+spacing*n*0.5, GY-40, c.rng);
    return lead+spacing*n+Math.max(110,jd*0.34);
  },

  /* raised platform with a spike on each shoulder */
  spikeBridge(o,x,c){
    const jd = jumpDist(c.spd);
    const lead = Math.max(110, jd*0.32);
    const pw = Math.max(120, jd*0.46);
    const ph = c.rng.range(56,88);
    ground(o,x,lead);
    ground(o,x+lead,pw,GY-ph);
    spike(o,x+lead+4,GY-ph,1);
    spike(o,x+lead+pw-SPIKE_W-4,GY-ph,1);
    if (c.rng.chance(0.4)) coinAt(o,x+lead+pw/2, GY-ph-46, c.rng);
    const tail = Math.max(120, jd*0.38);
    ground(o,x+lead+pw,tail);
    return lead+pw+tail;
  },

  /* sticky gum on the floor (Chewing-gum world) */
  gumField(o,x,c){
    const jd = jumpDist(c.spd);
    const lead = Math.max(110, jd*0.32);
    const n = c.rng.int(1,3);
    const step = Math.max(130, jd*0.42);
    ground(o,x,lead+step*n+Math.max(110,jd*0.34));
    for(let i=0;i<n;i++){
      o.hazards.push({type:'gum',x:x+lead+i*step,y:GY-14,w:c.rng.range(40,72),h:14,t:c.rng.range(0,6)});
    }
    if (c.rng.chance(0.35)) coinAt(o,x+lead+step*n*0.5, GY-100, c.rng);
    return lead+step*n+Math.max(110,jd*0.34);
  },
};

/* which patterns are legal, and how likely, at a given speed */
function patternWeights(c){
  const w = { flat:1.2, spikes:5, gap:4, airPlat:3, steps:2.6, ceiling:2.4, spikeBridge:2.4 };
  if (c.spd >= 1.10) { w.movers = 2.2; }
  if (c.spd >= 1.20) { w.doubleGap = 2.2; w.stairSpikes = 2.4; }
  if (c.spd >= 1.45) { w.flat = .5; w.spikes = 6; w.stairSpikes = 3.2; w.doubleGap = 3; }
  if (c.world === 'gum') { w.gumField = 5; w.movers = 0; }
  if (c.rules.ceilings) w.ceiling += 5;
  if (c.rules.gaps) { w.gap += 4; w.doubleGap = (w.doubleGap||0)+3; }
  if (c.noDouble) { w.doubleGap = 0; }
  return w;
}

/* pairs that read as unfair back-to-back */
const BAD_PAIRS = {
  gap:['ceiling','stairSpikes'],
  doubleGap:['ceiling','stairSpikes','gap'],
  airPlat:['ceiling'],
  stairSpikes:['ceiling','gap','doubleGap'],
  steps:['ceiling'],
  ceiling:['ceiling'],
  movers:['movers'],
};

const Gen = {
  rng:null, cursor:0, last:'flat', out:null,

  reset(seed, startX){
    this.rng = makeRNG(seed>>>0);
    this.cursor = startX;
    this.last = 'flat';
  },

  /* run flat ground up to x (used for world-switch breathers) */
  runFlat(out, toX){
    if (toX <= this.cursor) return;
    const last = out.solids[out.solids.length-1];
    // extend the previous slab rather than stacking hundreds of one-frame slivers
    if (last && last.kind==='ground' && last.y===GY && Math.abs(last.x+last.w-this.cursor) < 0.5)
      last.w = toX - last.x;
    else ground(out, this.cursor, toX-this.cursor);
    this.cursor = toX;
    this.last = 'flat';
  },

  /* emit patterns until the cursor is past `toX` */
  fill(out, toX, c){
    let guard = 0;
    while (this.cursor < toX && guard++ < 60){
      const jd = jumpDist(c.spd);
      const weights = patternWeights(c);
      const banned = BAD_PAIRS[this.last] || [];
      banned.forEach(b => { if (weights[b] !== undefined) weights[b] = 0; });
      let key = this.rng.weighted(weights);
      if (!PATTERNS[key]) key = 'flat';

      const ctx = Object.assign({}, c, { rng:this.rng, hard:c.spd>=1.35 });
      const w = PATTERNS[key](out, this.cursor, ctx);
      this.cursor += w;

      // recovery run, longer after the punishing stuff
      const heavy = ['stairSpikes','doubleGap','movers','steps'].includes(key);
      const rec = Math.max(70, jd*(heavy?0.34:0.18));
      ground(out, this.cursor, rec);
      this.cursor += rec;
      this.last = key;
    }
  },

};
