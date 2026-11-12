import { TOP_SPEED, speedAfterAlert } from '../data/speeds.js';
import { hasVeilleeRedAlert, nextVeilleePageTick } from '../sim/veillee.js';

/** The evening changes the presentation clock, never the simulation's pace.
 * A frame can contain hundreds of minutes: check each minute so the meeting
 * and a new red alert cannot be crossed by the rest of that frame's budget. */
export class VeilleeClock {
  constructor(game) {
    this.game = game;
    this.reset();
  }

  reset() {
    this.sim = this.game.sim;
    this.seenSession = null;
    this.targetTick = null;
  }

  cancel() {
    this.targetTick = null;
  }

  current() {
    if (this.sim !== this.game.sim) this.reset();
    return this.sim.veillee;
  }

  until() {
    const state = this.current();
    if (!state?.enabled || this.sim.exodus?.result) return false;
    if (hasVeilleeRedAlert(this.sim) || this.sim.emergency) return false;
    if (state.session) {
      this.seenSession = state.session.id;
      this.game.setSpeed(0);
      this.game.ui?.m6Panels?.openVeillee?.();
      return true;
    }
    // The temporary rush must not become the player's Space/Escape speed.
    // Repeated clicks during the same advance retain the original choice too.
    const back = this.targetTick !== null || this.game.speed === 0
      ? this.game.previousSpeed : this.game.speed;
    this.game.setSpeed(TOP_SPEED);
    this.game.previousSpeed = back;
    this.targetTick = nextVeilleePageTick(this.sim);
    return true;
  }

  /** Returns true when the remainder of this frame must be discarded. */
  check() {
    const state = this.current();
    if (!state?.enabled) return false;
    if (this.sim.exodus?.result) {
      this.cancel();
      return true;
    }
    if (this.sim.emergency || hasVeilleeRedAlert(this.sim)) {
      if (this.targetTick !== null || this.sim.emergency) {
        const back = this.targetTick !== null ? this.game.previousSpeed : this.game.speed;
        this.game.setSpeed(speedAfterAlert(back));
        return true;
      }
      return false;
    }
    const session = state.session;
    // Stop at the first page, including a newly queued subject before the
    // predicted milestone. If that target lost its subject to an urgency,
    // return control there instead of silently advancing to a later evening.
    const reached = this.targetTick !== null && (session || state.lastMeetingTick >= this.targetTick);
    const unseen = session && session.id !== this.seenSession;
    // A title/opening must retain its own flow. A loaded evening is noticed
    // on the first frame after that screen has been left.
    if (this.game.m6Shell?.titleVisible || this.game.m6Shell?.opening) return false;
    if (unseen) this.seenSession = session.id;
    const automatic = unseen && session.autoOpen !== false && this.game.options?.veilleePause !== false;
    if (reached || automatic) {
      this.game.setSpeed(session ? 0 : this.game.previousSpeed);
      if (session) this.game.ui?.m6Panels?.openVeillee?.();
      return true;
    }
    return false;
  }

  step(count) {
    if (this.check()) return 0;
    let stepped = 0;
    while (stepped < count && !this.sim.exodus?.result) {
      this.sim.step(1);
      stepped += 1;
      if (this.check()) break;
    }
    return stepped;
  }
}
