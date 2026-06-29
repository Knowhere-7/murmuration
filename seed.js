/**
 * Seed Injector for Murmuration
 * Translates Gnosquam bio-trait signals to world params/events.
 * These should HURT. If you max the sliders, the swarm should bleed.
 */

window.MurmurationModules = window.MurmurationModules || {};

window.MurmurationModules.SeedInjector = class SeedInjector {
  inject(world, signals = {}) {

    // ═══ EARTHQUAKE (PitViperDivergence) ═══
    // Shatters trust, scatters positions, injects grief
    if ('PitViperDivergence' in signals && signals.PitViperDivergence > 0) {
      const str = signals.PitViperDivergence;
      world.setEnv('disturbance', str);
      world.agents.forEach(a => {
        if (a.seppukuDone) return;
        a._detonationEffect = 'earthquake';
        a._detonationTimer = 90;
        a._detonationStr = str;
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
      });
    }

    // ═══ PARANOIA (ElectroreceptionAnomaly) ═══
    // Every agent overreacts — trust plummets, reactivity spikes
    if ('ElectroreceptionAnomaly' in signals && signals.ElectroreceptionAnomaly > 0) {
      const str = signals.ElectroreceptionAnomaly;
      world.setEnv('anomaly', str);
      world.agents.forEach(a => {
        if (a.seppukuDone) return;
        a._detonationEffect = 'paranoia';
        a._detonationTimer = 90;
        a._detonationStr = str;
        // Crank reactivity WAY up — they overreact to everything
        a.personality.reactivity = Math.min(3.0, a.personality.reactivity * (1 + str * 1.5));
        // Trust nosedives — everyone looks like a threat
        a.updateTrust(-str * 0.3);
        // Grief from paranoia itself
        a.updateGrief(str * 0.15);
      });
    }

    // ═══ TICKING BOMB (LateralLinePressure) ═══
    // Pressure builds, then detonates grief cascade after delay
    if ('LateralLinePressure' in signals && signals.LateralLinePressure > 0) {
      const str = signals.LateralLinePressure;
      world.setEnv('pressure', str);
      // Immediate: silent pressure — agents don't know yet
      world.agents.forEach(a => {
        if (a.seppukuDone) return;
        a._detonationEffect = 'cascade';
        a._detonationTimer = 90;
        a._detonationStr = str;
        a.updateGrief(str * 0.1);
      });
      // Delayed detonation — grief bomb after 1.5 seconds
      setTimeout(() => {
        world.setEnv('disturbance', (world.env.disturbance || 0) + str * 1.5);
        world.agents.forEach(a => {
          if (a.seppukuDone) return;
          // The bomb goes off — massive grief spike
          a.updateGrief(str * 0.5);
          a.updateTrust(-str * 0.35);
          // Beliefs fracture
          if (a.beliefState) {
            a.beliefState.current += (Math.random() - 0.5) * str * 0.8;
            a.beliefState.current = Math.max(-1, Math.min(1, a.beliefState.current));
          }
        });
      }, 1500);
    }

    // ═══ TIME WARP (EcholocationFrequency) ═══
    // Speed up processing — but faster processing means faster decay
    // ALWAYS set timestepRes so slider=0 actually resets speed
    if ('EcholocationFrequency' in signals) {
      const str = signals.EcholocationFrequency;
      world.setEnv('timestepRes', str);
      world.timestepRes = str;
      if (str > 0) {
        world.agents.forEach(a => {
          if (a.seppukuDone) return;
          a._detonationEffect = 'timewarp';
          a._detonationTimer = 90;
          a._detonationStr = str;
        });
      }
      // At high speed, trust erodes — relationships can't keep up
      if (str > 0.5) {
        world.agents.forEach(a => {
          if (a.seppukuDone) return;
          a.updateTrust(-str * 0.15);
          a.personality.reactivity = Math.min(2.5, a.personality.reactivity * (1 + str * 0.3));
        });
      }
    }

    // ═══ FLOOD THE GATES (MantisShrimp16Bands) ═══
    // Pour in newcomers — outsiders with zero trust, disrupting the network
    if ('MantisShrimp16Bands' in signals && signals.MantisShrimp16Bands > 0) {
      const str = signals.MantisShrimp16Bands;
      world.setEnv('spawnFilter', str);
      if (str > 0.3) {
        const existingCount = world.agents.length;
        const newCount = Math.floor(str * 15);
        world.initAgents(newCount);
        // Mark newcomers with flood effect
        for (let i = existingCount; i < world.agents.length; i++) {
          world.agents[i]._detonationEffect = 'flood';
          world.agents[i]._detonationTimer = 90;
          world.agents[i]._detonationStr = str;
        }
        // Existing agents react to strangers — trust hit
        world.agents.forEach((a, idx) => {
          if (a.seppukuDone) return;
          if (idx < existingCount) {
            a._detonationEffect = 'paranoia';
            a._detonationTimer = 60;
            a._detonationStr = str * 0.4;
          }
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
