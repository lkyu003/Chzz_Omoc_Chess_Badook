export function createMoveAudio() {
  let context = null;

  function unlock() {
    if (!context) context = new AudioContext();
    if (context.state === "suspended") context.resume();
  }

  function play(game = "omok") {
    unlock();
    const now = context.currentTime;
    const output = context.createGain();
    output.gain.setValueAtTime(0.0001, now);
    output.gain.exponentialRampToValueAtTime(0.24, now + 0.01);
    output.gain.exponentialRampToValueAtTime(0.0001, now + 0.13);
    output.connect(context.destination);

    const body = context.createOscillator();
    body.type = "triangle";
    body.frequency.setValueAtTime(game === "chess" ? 260 : game === "janggi" ? 340 : 420, now);
    body.frequency.exponentialRampToValueAtTime(game === "chess" ? 160 : 120, now + 0.12);
    body.connect(output);
    body.start(now);
    body.stop(now + 0.14);

    const tick = context.createOscillator();
    tick.type = "square";
    tick.frequency.setValueAtTime(game === "chess" ? 900 : 1250, now);
    const tickGain = context.createGain();
    tickGain.gain.setValueAtTime(0.05, now);
    tickGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.025);
    tick.connect(tickGain);
    tickGain.connect(context.destination);
    tick.start(now);
    tick.stop(now + 0.03);
  }

  return { unlock, play };
}
