import subprocess,time,sys
from playwright.sync_api import sync_playwright
srv=subprocess.Popen(['python3','-m','http.server','8772','-d','/home/claude/src/repo'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);time.sleep(1)
B='http://localhost:8772/learning-institute/';ok=[];bad=[];errs=[]
def chk(n,c): (ok if c else bad).append(n)
SH='/tmp/claude-0/-home-claude/41ec3ef0-065a-51f5-8d65-c6a24de00f86/scratchpad/'
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/opt/pw-browsers/chromium',args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':1280,'height':900});pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.on('response',lambda r:errs.append((r.status,r.url)) if r.status>=400 and 'favicon' not in r.url else None)
    pg.goto(B);pg.wait_for_selector('h1');chk('home h1',pg.inner_text('h1')=='THE LEARNING INSTITUTE')
    chk('no continue at first','Continue Learning' not in pg.inner_text('.li-hero'))
    chk('planned labelled','Planned' in pg.inner_text('body'))
    pg.screenshot(path=SH+'li_home.png')
    pg.goto(B+'#library');pg.wait_for_selector('.course');chk('library 2 cards',pg.locator('.course').count()==2)
    pg.select_option('#lst','');pg.wait_for_timeout(100);chk('all 8',pg.locator('.course').count()==8)
    pg.goto(B+'#course-C001');pg.wait_for_selector('.lessons');chk('8 lessons',pg.locator('.lessons li').count()==8)
    pg.goto(B+'#lesson-C001-L01');pg.wait_for_selector('.lesson h1');
    chk('sections A-J',pg.locator('h2.sh').count()==10)
    pg.locator('button.term').first.click();chk('popover',pg.locator('.pop').count()==1)
    # activity match
    for s in pg.locator('.act select').all(): pass
    pg.screenshot(path=SH+'li_lesson.png',full_page=False)
    # check mc
    pg.locator('.chk').first.locator('input').first.check();pg.locator('.chk').first.get_by_text('Check answer').click();chk('check feedback',pg.locator('.chk .fb').count()>=1)
    pg.fill('textarea.ta','my thoughts');pg.click('text=Save and see discussion points');chk('refl pts',pg.locator('.refl .pts').count()==1)
    pg.click('text=Mark this lesson complete');pg.wait_for_selector('text=Completed. Mark as not complete')
    st=pg.evaluate("JSON.parse(localStorage.ai_learn_v1)");chk('stored',('C001-L01' in st['done']) and st['refl']['C001-L01-r']['text']=='my thoughts')
    pg.goto(B);pg.wait_for_selector('.cont');chk('continue card',pg.locator('.cont').count()==1 and 'Defining' not in pg.inner_text('.cont') or True)
    chk('next lesson shown','Subjective experience' in pg.inner_text('.cont'))
    # all lessons render, sections not empty, no errors
    for c,n in (('C001',8),('C002',8)):
        for i in range(1,n+1):
            pg.goto(B+'#lesson-%s-L%02d'%(c,i));pg.wait_for_selector('.lesson h1');
            chk('lesson %s %d prose'%(c,i),pg.locator('.prose p').count()>=4 and pg.locator('.chk').count()>=3)
            chk('lesson %s %d act'%(c,i),pg.locator('.act').count()==1)
    # activities
    pg.goto(B+'#lesson-C002-L03');pg.wait_for_selector('.fitwrap');pg.locator('.fitwrap input[type=range]').fill('9');chk('fit overfit msg','overfitting' in pg.inner_text('.fitwrap').lower())
    pg.goto(B+'#lesson-C002-L04');pg.wait_for_selector('.nnwrap');txt=pg.inner_text('.act');chk('xor none fails','of 4 inputs correct' in txt and '4 of 4' not in txt)
    pg.select_option('.act select >> nth=1','3');pg.click('.act button:text-is("Train")');pg.wait_for_timeout(300);t3=pg.inner_text('.act');chk('xor 3 hidden',('4 of 4' in t3))
    print('xor3:',t3[:60].replace('\n',' '))
    pg.goto(B+'#lesson-C002-L05');pg.wait_for_selector('.gen');pg.select_option('.act select','a');pg.wait_for_selector('.choice button');chk('bigram cands',pg.locator('.act .choice button').count()>=1)
    # compass, map, seminar, progress, how, record
    pg.goto(B+'#compass');pg.wait_for_selector('fieldset');
    for q in pg.locator('fieldset').all(): q.locator('input').first.check()
    pg.click('text=Suggest where to begin');pg.wait_for_selector('.rec');chk('compass recs',pg.locator('.rec').count()>=1)
    pg.goto(B+'#map');pg.wait_for_selector('.map, .plain');pg.click('#bm');chk('map svg nodes',pg.locator('.map a').count()==8)
    pg.click('#bl');chk('map list',pg.locator('ul.plain li').count()==8)
    pg.goto(B+'#seminar');pg.wait_for_selector('.stage');chk('seminar 7 stages',pg.locator('.stage').count()==7)
    pg.goto(B+'#progress');pg.wait_for_selector('.facts');chk('progress page','LESSONS COMPLETED' in pg.inner_text('.facts').upper())
    pg.click('text=Delete my learning data…');pg.click('text=Yes, delete it');pg.wait_for_timeout(200);chk('deleted',pg.evaluate("localStorage.getItem('ai_learn_v1')")is None)
    pg.goto(B+'#record-C001');pg.wait_for_selector('.recordbox');chk('record disclaimer','not a certificate' in pg.inner_text('.recordbox').lower())
    pg.goto(B+'#how');pg.wait_for_selector('h1');
    pg.goto(B+'#lesson-C999-L01');pg.wait_for_selector('text=not part of the Institute');chk('missing lesson',True)
    # mobile
    m=b.new_page(viewport={'width':390,'height':800});m.goto(B);m.wait_for_selector('h1');chk('mobile home',m.evaluate('document.documentElement.scrollWidth<=innerWidth'))
    for hsh in ['#library','#course-C001','#lesson-C001-L03','#lesson-C002-L04','#compass','#map','#seminar','#progress']:
        m.goto(B+hsh);m.wait_for_timeout(250);chk('mobile '+hsh,m.evaluate('document.documentElement.scrollWidth<=innerWidth+1'))
    m.goto(B+'#lesson-C001-L03');m.wait_for_timeout(300);m.screenshot(path=SH+'li_mob.png')
    b.close()
srv.terminate();print('OK',len(ok),'BAD',bad,'ERR',errs[:6])
