#!/usr/bin/env python3
"""Packages the archive into one HTML file for private preview. Usage: build_preview.py OUT"""
import json,re,sys,os
d=lambda n:json.load(open(f'data/{n}.json'))
D={"meta":d('meta'),"questions":d('questions')['items'],"relations":d('question-relations')['items'],"sources":d('question-sources')['items'],"history":d('history')['items']}
man=json.load(open('../research/published/manifest.json'))
for a in man['articles']: a['slug']=a['url'].rstrip('/').split('/')[-1]
ROOT="https://amarisct.github.io/Artificially-Intelligent/"
pre='window.__UA_CONFIG__='+open('config.json').read().strip()+';window.__UA_ROOT__="%s";window.__UA_DATA__=%s;window.__UA_MANIFEST__=%s;'%(ROOT,json.dumps(D,ensure_ascii=False).replace('</','<\\/'),json.dumps(man,ensure_ascii=False).replace('</','<\\/'))
src=open('index.html').read();css=open('styles.css').read();js=open('app.js').read()
out=src.replace('<link rel="stylesheet" href="styles.css">','<style>'+css+'</style>').replace('<script src="app.js"></script>','<script>'+pre+'\n'+js+'</script>')
out=re.sub(r'<meta name="robots"[^>]*>\n','',out)
out=out.replace('href="../"',f'href="{ROOT}"').replace('href="../#library"',f'href="{ROOT}#library"').replace('href="../theory-chamber/"',f'href="{ROOT}theory-chamber/"').replace('href="../#atlas"',f'href="{ROOT}#atlas"')
open(sys.argv[1],'w').write(out)
