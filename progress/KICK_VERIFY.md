# Patience/Kick Verification — 2026-09-26

Passive neglect sweep (`tools/kicksweep.mjs`, warp x10, 90 s wall, never docks):

| metric | result |
|---|---|
| arrivals | 18 |
| anger kicks | 15 |
| depart animations completed → bay reset | 15/15 |
| rep after 90 s neglect | 100 → 23 |
| kick wait times (s) | 63 42 173 217 50 58 104 198 164 55 96 60 |
| battery at kick | 0.09–0.57 (left uncharged) |
| console errors | none |

Wait times land inside the per-segment patience windows
(taxi 40–65, super 45–75, retro 75–110, sedan 95–150, SUV 115–165, van 160–220).

## Lessons
- Pre-tune sweeps kicked ZERO; tightened tune kicks ~83% of neglected arrivals — the threat is real now.
- Rep economy: −2.5/kick (−5 VIP) drains 100→23 in ~90 s of pure neglect across 4 bays; recovery is +1/serve, +2/goal, +3/overnight. Neglect starves arrivals via repMult — punishing but recoverable.
- All kicked cars complete the 3-stage exit and free the bay (departOK 15/15) — no state-machine leaks after the bays.js extraction.
