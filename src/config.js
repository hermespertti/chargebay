// GAME DESIGN CONSTANTS — extracted from main.js

const PACK_KWH = 75; // kWh per full charge

const TIERS = [ {kw:150,cost:0}, {kw:350,cost:800}, {kw:600,cost:2000} ];

const SEGMENTS = [
  { id:'sedan', name:'Sedan',      pack:75,  patience:[95,150],  fee:1.00, w:5, paint:null },
  { id:'taxi',  name:'Taxi',       pack:60,  patience:[40,65],   fee:1.12, w:4, paint:0xf2b705 },
  { id:'suv',   name:'SUV',        pack:95,  patience:[115,165], fee:0.95, w:3, paint:null },
  { id:'van',   name:'Delivery van',pack:110,patience:[160,220], fee:0.88, w:2, paint:0xdfe4ea },
  { id:'retro', name:'Retro classic',pack:40,patience:[75,110],  fee:1.35, w:1, paint:0x8a2be2 },
  { id:'super', name:'Supercar',     pack:105,patience:[45,75],  fee:1.60, w:1, paint:null },
  { id:'truck', name:'Big-rig hauler',pack:150,patience:[140,190], fee:1.15, w:2, paint:null },
];

const TECH = {
  heater:  { name:'Battery heater pads', cost:500,  rep:50,  desc:'Cold snaps no longer slow charging chemistry.', eff:'−65% cold penalty' },
  inverter:{ name:'Smart inverters',     cost:900,  rep:60,  desc:'+12% charge efficiency — cheaper sessions, more profit.', eff:'+12% efficiency' },
  ads:     { name:'Advertising network', cost:700,  rep:70,  desc:'+25% arrivals from billboards & maps apps.', eff:'+25% traffic' },
  priority:{ name:'VIP priority lane',   cost:1100, rep:80,  desc:'VIP cars always get the next free bay instantly.', eff:'VIP instant bay' },
};

const GOAL_POOL=[
  { id:'serve', make:d=>({label:'Serve '+(5+d*2)+' customers', target:5+d*2, key:'served', reward:55+d*15}), },
  { id:'profit', make:d=>({label:'Earn $'+(40+d*20)+' profit', target:40+d*20, key:'profit', reward:65+d*15}), },
  { id:'nokick', make:d=>({label:'Zero angry customers', target:1, key:'noKick', reward:85}), },
  { id:'vip', make:d=>({label:'Handle a VIP', target:1, key:'vipDone', reward:60}), },
  { id:'fast', make:d=>({label:'3 fast charges (<90s)', target:3, key:'fast', reward:70}), },
  { id:'kwh', make:d=>({label:'Deliver '+(120+d*40)+' kWh', target:120+d*40, key:'kwh', reward:60+d*10}), },
  { id:'polite', make:d=>({label:'3 happy tipped drivers', target:3, key:'polite', reward:65}), },
  { id:'taxirush', make:d=>({label:'Serve 4 taxis', target:4, key:'taxiDone', reward:75}), },
  { id:'convoy', make:d=>({label:'Serve a convoy (3 rigs)', target:3, key:'convoy', reward:150, bonus:100}), },
];

export { PACK_KWH, TIERS, SEGMENTS, TECH, GOAL_POOL };
