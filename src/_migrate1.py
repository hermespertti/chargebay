# Migrate main.js cross-system mutable state onto the shared `sim` object.
import re
p='src/main.js'
t=open(p).read()

decl_pats = [
  r"^let raining=0;.*$",
  r"^let wxTimer=0, coldUntil=0, brownUntil=0, brownCap=500, vipPending=false, vipSpawned=false, nextWx=0;$",
  r"^let solarKwh=0; const SOLAR_CAP_KW=24; // rooftop array$",
  r"^let solarLast=0;$",
  r"^let revenue=0, served=0;            // session$",
  r"^let cash=500, day=1, dayRev=0, dayCost=0, servedTotal=0;   // meta$",
  r"^let hourStats=\{\}; let hourArr=\{\}; let arrivedTotal=0;$",
  r"^let kickedHourly=\{\};$",
  r"^let bufferOwned=false, bufferKwh=0, bufferDraining=0;$",
  r"^let sellMarkup=1\.9;                     // player-controlled margin: \[ \] keys adjust$",
  r"^const MARKUP_MIN=1\.15, MARKUP_MAX=3\.4;$",
  r"^const sellPrice=\(\)=> spotPrice\*sellMarkup\+0\.02;$",
  r"^// demand elasticity: fair price \(<=1\.5x spot\) full demand, gouging dries it up, discounts boost it$",
  r"^const demandFactor=\(\)=> THREE\.MathUtils\.clamp\(1\.75 - 0\.55\*sellMarkup, 0\.25, 1\.35\);$",
  r"^let rep = 60;                       // 0\.\.100, arrival traffic scales with it$",
  r"^const repMult = \(\)=> 0\.45 \+ \(rep/100\)\*1\.15;   // 0\.45x\.\.1\.6x arrival rate$",
  r"^let techOwned = \{\};$",
  r"^const BUFFER_COST=600, BUFFER_CAP=200, BUFFER_RATE_KWH_MIN=0\.5; // buffer charge rate at cheap prices$",
  r"^const SAVE_KEY='chargebay_save_v1';$",
  r"^let gameClock = 18\*60\+42; // minutes, dusk$",
  r"^let spotPrice = 0\.124;$",
  r"^let goals=\[\], dayStats=\{served:0, profit:0, kicks:0, vipDone:0, fast:0, kwh:0\}, streak=0;$",
  r"^let ready=false;$",
  r"^let grabbedBay=null, docked=false;$",
]
n=0
for pat in decl_pats:
    t2,c = re.subn(pat+"\n?", "", t, count=1, flags=re.M)
    if c!=1: print('MISS decl:', pat[:70])
    else: t=t2; n+=1
print('decls removed:', n)

# explicit fix: object shorthand keys in save() / econ() / money() / hourStats() / hour keys
# pattern { cash, day, ... } and [ ... ] indexed — handle by expanding shorthand for our names.
names = ['raining','coldUntil','brownUntil','brownCap','vipPending','vipSpawned','nextWx',
 'solarKwh','solarLast','revenue','served','cash','day','dayRev','dayCost','servedTotal',
 'hourStats','hourArr','arrivedTotal','kickedHourly','bufferOwned','bufferKwh','bufferDraining',
 'sellMarkup','rep','techOwned','gameClock','spotPrice','goals','streak','dayStats','ready','grabbedBay','docked',
 'SOLAR_CAP_KW','MARKUP_MIN','MARKUP_MAX','BUFFER_COST','BUFFER_CAP','SAVE_KEY']

# protect string literals and comments with placeholders
store=[]
def stash(m):
    store.append(m.group(0)); return '\x00%d\x00'%(len(store)-1)
t=re.sub(r"'(?:[^'\\\n]|\\.)*'|\"(?:[^\"\\\n]|\\.)*\"|`(?:[^`\\]|\\.)*`|//[^\n]*", stash, t)

for nm in names:
    pat=re.compile(r'(?<![\w.$])'+nm+r'(?![\w:])')
    out=[]; i=0
    for m in pat.finditer(t):
        a,b=m.span()
        # decide by surrounding non-space chars
        k=a-1
        while k>=0 and t[k] in ' \t': k-=1
        prechar = t[k] if k>=0 else ''
        j=b
        while j<len(t) and t[j] in ' \t': j+=1
        postchar = t[j] if j<len(t) else ''
        if prechar in '{,' and postchar in ',}':      # object shorthand key -> expand
            out.append(t[i:a]); out.append(nm+': sim.'+nm); i=b
        elif postchar==':' and prechar not in '?:':     # property key in literal
            out.append(t[i:a]); out.append(t[a:b]); i=b
        elif postchar=='(' and prechar in '{,':          # method definition in object literal
            out.append(t[i:a]); out.append(t[a:b]); i=b
        else:
            out.append(t[i:a]); out.append('sim.'+nm); i=b
    out.append(t[i:])
    t=''.join(out)

# restore strings/comments
t=re.sub(r'\x00(\d+)\x00', lambda m: store[int(m.group(1))], t)

open(p,'w').write(t)
print('done; lines', t.count('\n')+1)
