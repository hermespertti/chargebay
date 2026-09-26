// SIM: mutable cross-system simulation state — the engine core handle.
// Every subsystem module receives `sim` and owns its behavior against it.
export const sim = {
  // frame
  now: 0, dt: 0,
  // bays registry (populated at boot)
  bays: [],
  // clock & market
  gameClock: 18*60+42,           // minutes, dusk
  spotPrice: 0.124,
  sellMarkup: 1.9,               // player-controlled margin: [ ] keys adjust
  // weather & events
  raining: 0,
  wxTimer: 0, coldUntil: 0, brownUntil: 0, brownCap: 500,
  vipPending: false, vipSpawned: false, nextWx: 0,
  // money
  cash: 500, day: 1, dayRev: 0, dayCost: 0, servedTotal: 0,
  revenue: 0, served: 0,
  rep: 60,                       // 0..100, arrival traffic scales with it
  techOwned: {},
  bufferOwned: false, bufferKwh: 0, bufferDraining: 0,
  solarKwh: 0, solarLast: 0,
  // telemetry
  hourStats: {}, hourArr: {}, kickedHourly: {}, arrivedTotal: 0,
  // goals
  goals: [], streak: 0,
  dayStats: {served:0, profit:0, kicks:0, vipDone:0, fast:0, kwh:0},
  // interaction bridge (bays own car state; these name who holds what)
  ready: false, grabbedBay: null, docked: false,
  // tuning constants mirrored here so subsystems can read via sim.*
  MARKUP_MIN: 1.15, MARKUP_MAX: 3.4,
  BUFFER_COST: 600, BUFFER_CAP: 200, BUFFER_RATE_KWH_MIN: 0.5,
  SOLAR_CAP_KW: 24,
  SAVE_KEY: 'chargebay_save_v1',
};
export const MARKUP_MIN = 1.15, MARKUP_MAX = 3.4;
export const BUFFER_COST = 600, BUFFER_CAP = 200, BUFFER_RATE_KWH_MIN = 0.5;
export const SOLAR_CAP_KW = 24; // rooftop array
export const SAVE_KEY = 'chargebay_save_v1';
export const sellPrice = () => sim.spotPrice * sim.sellMarkup + 0.02;
// demand elasticity: fair price (<=1.5x spot) full demand, gouging dries it up
export const demandFactor = () => Math.max(0.25, Math.min(1.35, 1.75 - 0.55*sim.sellMarkup));
export const repMult = () => 0.45 + (sim.rep/100)*1.15;   // 0.45x..1.6x arrival rate
