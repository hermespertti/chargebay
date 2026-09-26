# Move economy functions to economy.js; rewrite main.js references to ECONOMY.*
import re, subprocess
p='src/main.js'
t=open(p).read()

# --- delete definition spans in main.js (moved into economy.js) ---
def del_func(t, name):
    pat=re.compile(r'^(function '+name+r'\b|let '+name+r'\b|const '+name+r'\b)[^\n]*$', re.M)
    m=pat.search(t)
    if not m: print('MISS func', name); return t, False
    line=m.group(0)
    # one-liner: braces balanced on the same line -> remove just that line
    if line.count('{')==line.count('}') and line.count('{')>0 or line.count('{')==0:
        return t[:m.start()]+t[m.end()+1:], True
    # multi-line: remove until first line that is exactly '}'
    j=m.end()+1
    while j<len(t):
        k=t.find('\n', j)
        seg=t[j:k]
        if seg.rstrip()=='return' or seg.rstrip()=='':
            j=k+1; continue
        if seg.rstrip()=='}' or seg.rstrip()=='};':
            return t[:m.start()]+t[k+1:], True
        j=k+1
    print('MISS end', name); return t, False

names=['repAdd','paintRep','rollGoals','bumpGoal','paintGoals','paySession','saveGame','loadGame','endDay','showDayCard','hideDayCard','showDaySummary']
for nm in names:
    t,ok=del_func(t,nm)

# rep let decls
t2=re.subn(r"^let repFlashT=0;\n", "", t, count=1, flags=re.M)
t=t2[0]; print('repFlashT decl removed:', t2[1])

# daily goals header comment cleanup
t=t.replace("// ---- daily goals + streak retention ----\n","")
t=t.replace("// ---- reputation ----\n","")

# --- rename references to ECONOMY.* ---
names2=['repAdd','paintRep','rollGoals','bumpGoal','paintGoals','paySession','saveGame','loadGame','endDay','showDayCard','hideDayCard','showDaySummary','repFlashT']
nameset=set(names2)

store=[]
def stash(m):
    store.append(m.group(0)); return '\x00%d\x00'%(len(store)-1)
masked=re.sub(r"'(?:[^'\\\n]|\\.)*'|\"(?:[^\"\\\n]|\\.)*\"|`(?:[^`\\]|\\.)*`|//[^\n]*", stash, t)

word=re.compile(r'[A-Za-z_$][\w$]*')
litp=re.compile(r'\x00\d+\x00')
KEYWORD={'return','if','else','for','while','do','typeof','instanceof','new','in','of','function','const','let','var'}

out=[]; i=0; N=len(masked); stack=[]; prev_tok=''
while i<N:
    m=word.match(masked,i)
    if m:
        w=m.group(0); b=m.end()
        is_obj = stack and stack[-1]['kind']=='{' and stack[-1]['obj']
        at_entry = is_obj and stack[-1]['at_entry']
        j=b
        while j<N and masked[j] in ' \t': j+=1
        nxt=masked[j] if j<N else ''
        if w in nameset and masked[i-1:i]!='..' and (i==0 or masked[i-1]!='.'):
            if at_entry and nxt in ',}':
                out.append(w+': ECONOMY.'+w); stack[-1]['at_entry']=False; prev_tok=':'; i=b; continue
            if at_entry and nxt=='(':
                out.append(w); stack[-1]['at_entry']=False; prev_tok='w'; i=b; continue
            if nxt==':' and not (stack and stack[-1]['has_q']):
                out.append(w); prev_tok=':'; i=b; continue
            out.append('ECONOMY.'+w)
            if is_obj: stack[-1]['at_entry']=False
            prev_tok='w'; i=b; continue
        out.append(w)
        if is_obj: stack[-1]['at_entry']=False
        prev_tok = w if w in KEYWORD else 'w'
        i=b; continue
    ml=litp.match(masked,i)
    if ml:
        out.append(ml.group(0)); i=ml.end(); prev_tok='L'; continue
    c=masked[i]
    if c=='{':
        obj = prev_tok in ('=','(','[',',',':','?','&&','||','return','=>')
        stack.append({'kind':'{','obj':obj,'at_entry':obj,'has_q':0}); out.append(c); i+=1; prev_tok='{'; continue
    if c=='(':
        stack.append({'kind':'(','obj':False,'at_entry':False,'has_q':0}); out.append(c); i+=1; prev_tok='('; continue
    if c=='[':
        stack.append({'kind':'[','obj':False,'at_entry':False,'has_q':0}); out.append(c); i+=1; prev_tok='['; continue
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
    out.append(c); i+=1
t=''.join(out)
t=re.sub(r'\x00(\d+)\x00', lambda m: store[int(m.group(1))], t)

open(p,'w').write(t)
r=subprocess.run(['node','--check','src/main.js'],capture_output=True,text=True,cwd='/home/lex/chargebay')
print('main syntax', r.returncode, r.stderr[:300])
