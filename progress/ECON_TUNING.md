# Economy sweep — warp bot, 4 real-min (~10 game-hr) per markup, 2026-09-26

| markup | demand | served | dayRev | dayCost | profit | cash |
|--------|--------|--------|--------|---------|--------|------|
| 1.5    | 0.93   | 5      | $53.22 | $31.99  | $21.23 | $647.22 |
| 1.9    | 0.71   | 4      | $58.74 | $28.27  | $30.47 | $668.64 |
| 2.4    | 0.43   | 3      | $46.73 | $19.86  | $26.87 | $714.92 |
| 3.0    | 0.25   | 3      | $36.43 | $18.08  | $18.35 | $692.60 |

## Findings
- Session revenue peaks at markup **1.9** ($58.74) — the classic mid-curve optimum; 3.0 starves volume.
- Cumulative **cash highest at 2.4** — fat margins + passive solar export beat raw volume.
- Demand curve `1.75 - 0.55*markup` behaves as designed: 0.93 → 0.25 across range; kicks stayed at zero (patience ample — could tighten later).
- Default **1.9 kept**: revenue optimum and gentlest on rep. 2.4 is the "efficiency baron" alt strategy.
- Bot pitfall fixed: never spam `endDayNow()` — it wipes hourly stats and re-grants goal bonuses (cash creep with served=0). Let the clock roll naturally.
- Warp (patched `performance.now` ×2.5) works; dt clamps keep physics stable.
