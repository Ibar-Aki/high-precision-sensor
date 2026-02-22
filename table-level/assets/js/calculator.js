const LEG_POSITIONS = {
  FL: { xSign: -1, ySign: -1 },
  FR: { xSign: 1, ySign: -1 },
  BL: { xSign: -1, ySign: 1 },
  BR: { xSign: 1, ySign: 1 }
};

const LEG_ORDER = ['BL', 'BR', 'FL', 'FR'];

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function calcLegDeltaMm({
  pitchDeg,
  rollDeg,
  widthMm,
  depthMm,
  phoneX = 0,
  phoneY = -depthMm / 2
}) {
  const pitchRad = (pitchDeg * Math.PI) / 180;
  const rollRad = (rollDeg * Math.PI) / 180;

  const sx = Math.tan(rollRad);
  const sy = Math.tan(pitchRad);

  const halfW = widthMm / 2;
  const halfD = depthMm / 2;

  const delta = {};
  for (const [leg, pos] of Object.entries(LEG_POSITIONS)) {
    const x = pos.xSign * halfW;
    const y = pos.ySign * halfD;
    const heightFromPlane = sx * (x - phoneX) + sy * (y - phoneY);
    delta[leg] = -heightFromPlane;
  }

  return delta;
}

export function convertToCwOnly(deltaMmByLeg) {
  const values = Object.values(deltaMmByLeg);
  const shift = -Math.min(...values);
  const shifted = {};
  for (const [leg, delta] of Object.entries(deltaMmByLeg)) {
    shifted[leg] = delta + shift;
  }
  return shifted;
}

function toTurns(deltaMm, boltPitchMmPerRev, turnStep) {
  const rawTurns = deltaMm / boltPitchMmPerRev;
  const direction = rawTurns >= 0 ? 'CW' : 'CCW';
  const turns = Math.round(Math.abs(rawTurns) / turnStep) * turnStep;
  return { turns, direction, rawTurns };
}

export function calcAdjustmentInstructions({
  pitchDeg,
  rollDeg,
  widthMm,
  depthMm,
  boltPitchMmPerRev,
  mode = 'bidirectional',
  minTurnsToShow = 0.25,
  maxTurnsWarning = 5,
  turnStep = 0.5,
  phoneX = 0,
  phoneY = -depthMm / 2
}) {
  const safePitch = Number.isFinite(pitchDeg) ? pitchDeg : 0;
  const safeRoll = Number.isFinite(rollDeg) ? rollDeg : 0;
  const safeWidth = clamp(Number(widthMm) || 800, 300, 3000);
  const safeDepth = clamp(Number(depthMm) || 1200, 300, 3000);
  const safeBoltPitch = clamp(Number(boltPitchMmPerRev) || 1.25, 0.1, 5);

  const deltaRaw = calcLegDeltaMm({
    pitchDeg: safePitch,
    rollDeg: safeRoll,
    widthMm: safeWidth,
    depthMm: safeDepth,
    phoneX,
    phoneY
  });

  const deltaForOutput = mode === 'cw_only' ? convertToCwOnly(deltaRaw) : deltaRaw;

  const instructions = LEG_ORDER.map((leg) => {
    const deltaMm = deltaForOutput[leg];
    const converted = toTurns(deltaMm, safeBoltPitch, turnStep);
    const turns = converted.turns < minTurnsToShow ? 0 : converted.turns;
    const direction = turns === 0 ? 'CW' : converted.direction;
    return {
      leg,
      deltaMm,
      turns,
      direction,
      rawTurns: converted.rawTurns,
      needsAdjustment: turns > 0,
      warning: turns > maxTurnsWarning ? 'over_limit' : null
    };
  });

  const maxTurns = instructions.reduce((max, item) => Math.max(max, item.turns), 0);

  return {
    deltaMmByLeg: deltaForOutput,
    instructions,
    maxTurns,
    hasWarning: instructions.some((item) => item.warning !== null)
  };
}

export function isLevel(pitchDeg, rollDeg, thresholdDeg) {
  return Math.abs(pitchDeg) <= thresholdDeg && Math.abs(rollDeg) <= thresholdDeg;
}
