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
