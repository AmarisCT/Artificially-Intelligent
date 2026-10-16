import subprocess,time,json
from playwright.sync_api import sync_playwright
srv=subprocess.Popen(['python3','-m','http.server','8774','-d','/home/claude/src/repo'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);time.sleep(1)
B='http://localhost:8774/learning-institute/'
JS='''()=>{
const out={noname:[],dup:[],h1:document.querySelectorAll('h1').length,skips:[],lowc:[],main:!!document.querySelector('main')};
const name=e=>{ if(e.getAttribute('aria-label'))return 1; if(e.getAttribute('aria-labelledby'))return 1; if(e.id&&document.querySelector('label[for="'+e.id+'"]'))return 1; if(e.closest('label'))return 1; if((e.innerText||'').trim())return 1; if(e.getAttribute('title'))return 1; const sv=e.querySelector('title'); return sv?1:0};
document.querySelectorAll('button,a[href],input:not([type=hidden]),select,textarea').forEach(e=>{if(!name(e)&&e.offsetParent!==null)out.noname.push(e.outerHTML.slice(0,80))});
const ids={};document.querySelectorAll('[id]').forEach(e=>{if(ids[e.id])out.dup.push(e.id);ids[e.id]=1});
let last=0;document.querySelectorAll('h1,h2,h3,h4').forEach(h=>{const n=+h.tagName[1];if(last&&n>last+1)out.skips.push(h.tagName+':'+h.innerText.slice(0,30));last=n});
const lum=c=>{const a=c.match(/[\\d.]+/g).map(Number);const f=v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4)};return .2126*f(a[0])+.7152*f(a[1])+.0722*f(a[2])};
const bg=e=>{while(e){const c=getComputedStyle(e).backgroundColor;const m=c.match(/[\\d.]+/g);if(m&&(m.length<4||+m[3]>0.5))return c;e=e.parentElement}return 'rgb(10,13,14)'};
const seen=new Set();
document.querySelectorAll('p,li,a,button,span,label,h1,h2,h3,td,th,legend,summary,div').forEach(e=>{ if(!e.childNodes.length)return; const t=[...e.childNodes].filter(n=>n.nodeType===3&&n.textContent.trim()).length; if(!t||e.offsetParent===null)return; const cs=getComputedStyle(e); const fg=cs.color,b=bg(e); const L1=lum(fg),L2=lum(b); const r=(Math.max(L1,L2)+.05)/(Math.min(L1,L2)+.05); const big=parseFloat(cs.fontSize)>=24||(parseFloat(cs.fontSize)>=18.66&&+cs.fontWeight>=700); if(r<(big?3:4.5)){const k=fg+b;if(!seen.has(k)){seen.add(k);out.lowc.push([r.toFixed(2),fg,b,(e.innerText||'').slice(0,30)])}}});
return out}'''
pages=['','#library','#course-C001','#course-C003','#lesson-C001-L01','#lesson-C001-L06','#lesson-C002-L03','#lesson-C002-L04','#lesson-C002-L05','#compass','#map','#seminar','#progress','#how','courses/introduction-to-consciousness/01-defining-consciousness/']
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/opt/pw-browsers/chromium',args=['--no-sandbox']);pg=b.new_page(viewport={'width':1280,'height':900})
    for u in pages:
        pg.goto(B+u);pg.wait_for_timeout(500);r=pg.evaluate(JS)
        print(u or 'home','| h1',r['h1'],'main',r['main'],'noname',r['noname'][:2],'dupids',r['dup'][:3],'skips',r['skips'][:3],'lowcontrast',r['lowc'][:4])
    # keyboard: term popover
    pg.goto(B+'#lesson-C001-L01');pg.wait_for_selector('button.term');pg.focus('button.term');pg.keyboard.press('Enter');print('pop open',pg.locator('.pop').count());pg.keyboard.press('Escape');print('pop closed',pg.locator('.pop').count(),'focus on term',pg.evaluate("document.activeElement.className"))
    # tab order sanity: count of tab stops until end of first 40
    pg.goto(B+'#compass');pg.wait_for_selector('fieldset');pg.keyboard.press('Tab')
    seq=[]
    for i in range(12): seq.append(pg.evaluate("document.activeElement.tagName+':'+(document.activeElement.innerText||document.activeElement.name||'').slice(0,18)"));pg.keyboard.press('Tab')
    print(seq)
    # reduced motion + 200% zoom reflow check (320px width)
    m=b.new_page(viewport={'width':320,'height':700});
    for u in ['','#lesson-C002-L04','#map','#compass']:
        m.goto(B+u);m.wait_for_timeout(300);print('320px',u or 'home',m.evaluate('document.documentElement.scrollWidth<=innerWidth+1'))
    b.close()
srv.terminate()
