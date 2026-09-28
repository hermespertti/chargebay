# ⚡ ChargeBay

A browser EV fast-charging forecourt simulator. Dusk, rain on wet asphalt, spot prices
pulsing with the grid — park the cars, jam the connector into the port, and squeeze profit
out of every kWh before the customer loses patience.

**Play:** https://hermespertti.github.io/chargebay/

![og cover](og-cover.jpg)

## The loop

- Cars roll into your bays. Grab the connector (E), aim at the car's charge port, dock —
  charging starts. Full battery = paid and gone.
- **Spot price** drifts with a live market curve. You set **your price** (`[` `]`) —
  gouge and demand dries up, undersell and you're a charity.
- Each driver has a **patience timer**. Let it run out and they storm off: rep down, and
  reputation is your arrival rate.
- **Daily goals**, profit streaks, tips from polite drivers.

## Events

| Event | Effect |
|---|---|
| 🌧️ Rain | wet paint, mirror reflections, lens droplets, thunder |
| 🌫️ Fog bank | arrival suppression — drivers can't find the lot |
| 🥵 Heatwave | grid price spike, solar array pumps +25% |
| 🧊 Cold snap | chemistry slows (battery heater tech negates) |
| ❄️ Snowfall | icy hands — the connector can slip off on dock |
| ⚠️ Brownout | grid kW cap, newest chargers throttle |
| 👑 VIP | stranded supercar, rescue fee ×1.5 |
| 🚛 **Convoy** | 3 big-rigs (150 kWh each) demand service — all served = +$250 bonus |

## Tech & upgrades

Battery heater pads, smart inverters (+12% efficiency), advertising network (+25% traffic),
VIP priority lane, bay tier upgrades (150→350→600 kW), battery buffer (charge cheap,
discharge dear), extra bays.

## Segments

Sedan · Taxi · SUV · Delivery van · Retro classic · **Supercar VIP** · **Big-rig hauler** —
each with its own pack size, patience, and fee multiplier.

## Controls

- **Desktop:** WASD move · mouse look · E grab/dock/unplug · R pause/resume · U upgrade bay ·
  N unlock bay · B buy buffer · T tech menu · [ ] price · P save · M mute · G graphics quality
- **Mobile:** virtual joystick + E / ⚡ / 🔊 touch buttons

## Engine

No game framework — plain three.js with a tick architecture:

```
loop(t){ requestAnimationFrame(loop); game.tick(dt); renderer.render(scene,camera); }
```

`src/sim.js` holds the mutable cross-system state; subsystem modules
(`weather`, `economy`, `bays`, `vehicles`, `player`, `interaction`, `shop`, `quality`,
`cable`, `audio`, `atmosphere`, `world`, `assets`, `textures`, `config`) each expose a
`tick(dt)` against it. All audio is synthesized at runtime (WebAudio) — including thunder
and the truck air-horn. No external assets beyond vendored three.js.

## Dev / QA

```
npm install           # puppeteer-core only
node tools/soak.mjs        # 31-check runtime regression suite
node tools/errprobe.mjs    # boot + console-error probe
node tools/playrun.mjs 4 6 # full economic playthrough (4 days, warp 6)
node tools/cap_pass.mjs    # 4-state visual regression captures
node tools/mobilepass.mjs  # 5-viewport mobile layout audit
node tools/kicksweep.mjs   # patience/kick verification
node tools/econsweep.mjs   # markup sweep vs demand elasticity
node tools/convoyPay.mjs   # convoy event end-to-end
node tools/truck_build.py  # (Blender 5.x) rebuild big-rig GLB
node tools/scenery_build.py# (Blender 5.x) rebuild scenery GLB
```

`progress/` archives tuning sweeps and verification reports.
