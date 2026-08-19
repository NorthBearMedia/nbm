"""Canonical narration verification (rebuilt 15 Aug after container loss; same logic as 10 Aug).
Fixes the two measurement bugs that failed good takes: positional zip (31 Jul) and Scribe
returning DIGITS where scripts spell numbers out (10 Aug). Usage: verify_narration.py script scribe.json"""
import json,re,difflib,sys
ONES={0:"zero",1:"one",2:"two",3:"three",4:"four",5:"five",6:"six",7:"seven",8:"eight",9:"nine",
 10:"ten",11:"eleven",12:"twelve",13:"thirteen",14:"fourteen",15:"fifteen",16:"sixteen",
 17:"seventeen",18:"eighteen",19:"nineteen"}
TENS={2:"twenty",3:"thirty",4:"forty",5:"fifty",6:"sixty",7:"seventy",8:"eighty",9:"ninety"}
def n2w(n):
    if n<20: return ONES[n]
    if n<100:
        t,r=divmod(n,10); return TENS[t]+("" if not r else " "+ONES[r])
    if n<1000:
        h,r=divmod(n,100); return ONES[h]+" hundred"+("" if not r else " "+n2w(r))
    if n<10000:
        a,b=divmod(n,100)
        if b==0: return n2w(a)+" hundred"
        return n2w(a)+" "+(("oh "+ONES[b]) if b<10 else n2w(b))
    return str(n)
def norm(t):
    t=re.sub(r"<break[^>]*/>"," ",t).lower()
    t=re.sub(r"(\d),(\d)",r"\1\2",t)
    t=re.sub(r"\d+",lambda m:" "+n2w(int(m.group()))+" ",t)
    t=re.sub(r"[^a-z ]"," ",t)
    return re.sub(r"\s+"," ",t).strip()
def verify(script_path,scribe_path):
    d=json.load(open(scribe_path))
    w,g=norm(open(script_path).read()),norm(d["text"])
    ratio=difflib.SequenceMatcher(None,w.split(),g.split(),autojunk=False).ratio()*100
    lang,prob=d.get("language_code"),d.get("language_probability")
    sm=difflib.SequenceMatcher(None,w.split(),g.split(),autojunk=False)
    ok = lang=="eng" and prob>=0.90 and ratio>=95
    print(f"lang={lang} p={prob:.3f} similarity={ratio:.1f}%  ->  {'PASS' if ok else 'FAIL'}")
    for t,i1,i2,j1,j2 in sm.get_opcodes():
        if t!="equal": print(f"  {t}: {' '.join(w.split()[i1:i2])!r} -> {' '.join(g.split()[j1:j2])!r}")
    return ok
if __name__=="__main__": sys.exit(0 if verify(sys.argv[1],sys.argv[2]) else 1)
