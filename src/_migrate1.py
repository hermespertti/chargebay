# Migrate main.js cross-system state onto `sim` — v3 stack scanner.
import re
p='src/main.js'
t=open(p).read()

decl_pats = [
  r"^let raining=0\.7;.*$",
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

names = set(['raining','coldUntil','brownUntil','brownCap','vipPending','vipSpawned','nextWx',
 'solarKwh','solarLast','revenue','served','cash','day','dayRev','dayCost','servedTotal',
 'hourStats','hourArr','arrivedTotal','kickedHourly','bufferOwned','bufferKwh','bufferDraining',
 'sellMarkup','rep','techOwned','gameClock','spotPrice','goals','streak','dayStats','ready','grabbedBay','docked',
 'SOLAR_CAP_KW','MARKUP_MIN','MARKUP_MAX','BUFFER_COST','BUFFER_CAP','SAVE_KEY'])

# protect strings & comments
store=[]
def stash(m):
    store.append(m.group(0)); return '\x00%d\x00'%(len(store)-1)
masked=re.sub(r"'(?:[^'\\\n]|\\.)*'|\"(?:[^\"\\\n]|\\.)*\"|`(?:[^`\\]|\\.)*`|//[^\n]*", stash, t)

word=re.compile(r'[A-Za-z_$][\w$]*')
litp=re.compile(r'\x00\d+\x00')
KEYWORD={'return','if','else','for','while','do','typeof','instanceof','new','in','of','function','const','let','var'}

out=[]; i=0; N=len(masked)
# frame: dict(kind='{/'(/[', obj=bool, at_entry=bool, has_q=int)
stack=[]
prev_tok=''      # last significant token text (for obj detection)
while i<N:
    m=word.match(masked,i)
    ml=litp.match(masked,i) if not m else None
    if m:
        w=m.group(0); b=m.end()
        is_obj_frame = stack and stack[-1]['kind']=='{' and stack[-1]['obj']
        at_entry = is_obj_frame and stack[-1]['at_entry']
        j=b
        while j<N and masked[j] in ' \t': j+=1
        nxt=masked[j] if j<N else ''
        keep=False
        if w in names:
            pre_ok = (i==0 or masked[i-1] != '.')
            if not pre_ok: keep=True
            elif at_entry and nxt=='(': keep=True          # method def
            elif nxt==':' and not (stack and stack[-1]['has_q']): keep=True  # key
            elif at_entry and nxt in ',}':
                out.append(w+': sim.'+w)                    # shorthand expand
                stack[-1]['at_entry']=False
                prev_tok=':'
                i=b; continue
            if not keep:
                out.append('sim.'+w)
                if is_obj_frame: stack[-1]['at_entry']=False
                prev_tok='w'; i=b; continue
            else:
                out.append(w)
                if is_obj_frame and nxt=='(': stack[-1]['at_entry']=False
                elif is_obj_frame: stack[-1]['at_entry']=False
                prev_tok='w'; i=b; continue
        else:
            out.append(w)
            if is_obj_frame: stack[-1]['at_entry']=False
            if w in KEYWORD:
                if is_obj_frame: stack[-1]['at_entry']=False
                prev_tok=w
            elif prev_tok and prev_tok[-1] in '&|?:=!<>+-*/%~^':
                pass
            elif prev_tok=='w' and w in ('in','of','instanceof'):
                if is_obj_frame: stack[-1]['at_entry']=False
            i=b; continue
    if ml:
        out.append(ml.group(0)); i=ml.end(); prev_tok='L'; continue
    c=masked[i]
    if c=='{':
        obj = prev_tok in ('=','(','[',',',':','?','&&','||','return','=>')
        stack.append({'kind':'{','obj':obj,'at_entry':obj,'has_q':0})
        out.append(c); i+=1; prev_tok='{'
        continue
    if c=='(':
        stack.append({'kind':'(','obj':False,'at_entry':False,'has_q':0})
        out.append(c); i+=1; prev_tok='('; continue
    if c=='[':
        stack.append({'kind':'[','obj':False,'at_entry':False,'has_q':0})
        out.append(c); i+=1; prev_tok='['; continue
    if c in ')}]':
        if stack: stack.pop()
        out.append(c); i+=1; prev_tok=c; continue
    if c==',':
        if stack: stack[-1]['at_entry']=True
        out.append(c); i+=1; prev_tok=','; continue
    if c=='?':
        if stack: stack[-1]['has_q']+=1
        out.append(c); i+=1; prev_tok='?'; continue
    if c==':':
        if stack and stack[-1]['kind']=='{':
            if stack[-1]['has_q']>0: stack[-1]['has_q']-=1
            else: stack[-1]['at_entry']=False
        out.append(c); i+=1; prev_tok=':'; continue
    if c=='=':
        out.append(c); i+=1; prev_tok='='; continue
    out.append(c); i+=1

t=''.join(out)
t=re.sub(r'\x00(\d+)\x00', lambda m: store[int(m.group(1))], t)
open(p,'w').write(t)
print('done; lines', t.count('\n')+1)
