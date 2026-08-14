/**
 * Seed Injector for Murmuration
 * Translates Gnosquam bio-trait signals to world params/events.
 * These should HURT. If you max the sliders, the swarm should bleed.
 */

window.MurmurationModules = window.MurmurationModules || {};

window.MurmurationModules.SeedInjector = class SeedInjector {
  /** colony: 'A' | 'B' — scopes every effect (env + agent-level) to that
   *  colony only, so each side can be pushed down its own chaos path. */
  inject(world, signals = {}, colony = 'A') {
    const mine = a => a.colony === colony;
    // How many chaos sliders are live in this detonation — 2+ means a
    // compound storm: the sky answers with bigger, longer, colder lightning
    const activeCount = Object.keys(signals).filter(k => (signals[k] || 0) > 0).length;

    // ═══ EARTHQUAKE (PitViperDivergence) ═══
    // Shatters trust, scatters positions, injects grief
    if ('PitViperDivergence' in signals && signals.PitViperDivergence > 0) {
      const str = signals.PitViperDivergence;
      world.setEnv('disturbance', str, colony);
      world.agents.forEach(a => {
        if (a.seppukuDone || !mine(a)) return;
        // Drain trust proportional to quake strength
        a.updateTrust(-str * 0.4);
        // Inject grief — the ground is shaking
        a.updateGrief(str * 0.3);
        // Scatter positions — fling agents outward
        a.vx += (Math.random() - 0.5) * str * 8;
        a.vy += (Math.random() - 0.5) * str * 8;
        // Shake beliefs — disagreement spikes
        if (a.beliefState) {
          a.beliefState.current += (Math.random() - 0.5) * str * 0.6;
          a.beliefState.current = Math.max(-1, Math.min(1, a.beliefState.current));
        }
        if (world.markHit) world.markHit(a, '255,96,40');
      });
    }

    // ═══ PARANOIA (ElectroreceptionAnomaly) ═══
    // Every agent overreacts — trust plummets, reactivity spikes
    if ('ElectroreceptionAnomaly' in signals && signals.ElectroreceptionAnomaly > 0) {
      const str = signals.ElectroreceptionAnomaly;
      world.setEnv('anomaly', str, colony);
      world.agents.forEach(a => {
        if (a.seppukuDone || !mine(a)) return;
        // Crank reactivity WAY up — they overreact to everything
        a.personality.reactivity = Math.min(3.0, a.personality.reactivity * (1 + str * 1.5));
        // Trust nosedives — everyone looks like a threat
        a.updateTrust(-str * 0.3);
        // Grief from paranoia itself
        a.updateGrief(str * 0.15);
        if (world.markHit) world.markHit(a, '200,90,255');
      });
      // PARANOIA IS ALWAYS STATIC. Ghost, 2026-08-14: "it used to be little
      // small static looking electric shock visuals and now theres large
      // lightning bolts... the smaller, local to each agent static looking
      // shock should be for paranoia as it was."
      //
      // This read `compound: activeCount >= 2`, so any detonation carrying two
      // or more sliders upgraded paranoia to long white-blue arcs. Ghost runs
      // with several sliders up as a matter of course, so the condition was
      // effectively always true and the violet static had not been seen in a
      // long time.
      //
      // It cost information, not only character. Static is LOCAL — it crackles
      // off the individual afflicted agent (reach 34), so you can see WHO is
      // paranoid. Compound arcs jump 130 units between bodies and smear that
      // across the whole colony. The small version tells you more.
      //
      // Large bolts are now reserved for events that ARE colony-wide: the
      // world's own objection below, and FORCE EVOLVE.
      if (world.strikeLightning) world.strikeLightning(colony, str, { compound: false });
    }

    // ═══ TICKING BOMB (LateralLinePressure) ═══
    // Pressure builds, then detonates grief cascade after delay
    if ('LateralLinePressure' in signals && signals.LateralLinePressure > 0) {
      const str = signals.LateralLinePressure;
      world.setEnv('pressure', str, colony);
      // Immediate: silent pressure — agents don't know yet
      world.agents.forEach(a => {
        if (a.seppukuDone || !mine(a)) return;
        a.updateGrief(str * 0.1);
      });
      // Delayed detonation — grief bomb after 1.5 seconds
      setTimeout(() => {
        const e = world.envFor(colony);
        world.setEnv('disturbance', (e.disturbance || 0) + str * 1.5, colony);
        world.agents.forEach(a => {
          if (a.seppukuDone || !mine(a)) return;
          // The bomb goes off — massive grief spike
          a.updateGrief(str * 0.5);
          a.updateTrust(-str * 0.35);
          // Beliefs fracture
          if (a.beliefState) {
            a.beliefState.current += (Math.random() - 0.5) * str * 0.8;
            a.beliefState.current = Math.max(-1, Math.min(1, a.beliefState.current));
          }
          if (world.markHit) world.markHit(a, '255,60,40');
        });
      }, 1500);
    }

    // ═══ COGNITIVE SHARPNESS (EcholocationFrequency) ═══
    // Sharpens how intensely this colony feels its own anomaly/disturbance —
    // NOT a global speed control (that's the Simulation Speed slider now).
    if ('EcholocationFrequency' in signals) {
      const str = signals.EcholocationFrequency;
      world.setEnv('timestepRes', str, colony);
      // At high sharpness, trust erodes — relationships can't keep up
      if (str > 0.5) {
        world.agents.forEach(a => {
          if (a.seppukuDone || !mine(a)) return;
          a.updateTrust(-str * 0.15);
          // Reactivity increases with time pressure
          a.personality.reactivity = Math.min(2.5, a.personality.reactivity * (1 + str * 0.3));
        });
      }
    }

    // ═══ FLOOD THE GATES (MantisShrimp16Bands) ═══
    // Pour in newcomers — outsiders with zero trust, disrupting the network
    if ('MantisShrimp16Bands' in signals && signals.MantisShrimp16Bands > 0) {
      const str = signals.MantisShrimp16Bands;
      world.setEnv('spawnFilter', str, colony);
      if (str > 0.3) {
        const newCount = Math.floor(str * 15);
        world.spawnColonyReinforcements ? world.spawnColonyReinforcements(newCount, colony) : world.initAgents(newCount);
        // Existing agents react to strangers — trust hit
        world.agents.forEach(a => {
          if (a.seppukuDone || !mine(a)) return;
          a.updateTrust(-str * 0.1);
          a.updateGrief(str * 0.08);
        });
      }
    }

    // ═══ COMPOUND STORM ═══
    // Three or more sliders in one detonation electrifies the sky even
    // without paranoia in the mix — the world itself objects
    if (activeCount >= 3 && !(signals.ElectroreceptionAnomaly > 0) && world.strikeLightning) {
      const maxStr = Math.max(...Object.values(signals).map(v => v || 0));
      world.strikeLightning(colony, maxStr, { compound: true });
    }
  }

  // Patched from public page — not used directly
  static fromForm() {
    const signals = {};
    const inputs = ['pitviper', 'electroreception', 'lateralline', 'echolocation', 'mantisshrimp'];
    inputs.forEach(id => {
      const val = parseFloat(document.getElementById(id)?.value || 0);
      if (!isNaN(val)) {
        const key = id.charAt(0).toUpperCase() + id.slice(1).replace(/([A-Z])/g, ' $1');
        signals[key] = Math.max(0, Math.min(1, val));
      }
    });
    return signals;
  }
};
