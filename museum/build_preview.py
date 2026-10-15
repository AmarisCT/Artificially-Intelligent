#!/usr/bin/env python3
"""Packages the museum into one HTML file for private preview (data and code inlined)."""
import json,re,sys
d=json.load(open('data/museum.json'))
src=open('index.html').read();css=open('styles.css').read();js=open('app.js').read()
pre='window.__MM_DATA__='+json.dumps(d,ensure_ascii=False).replace('</','<\\/')+';'
out=src.replace('<link rel="stylesheet" href="styles.css">','<style>'+css+'</style>').replace('<script src="app.js"></script>','<script>'+pre+'\n'+js+'</script>')
out=re.sub(r'<meta name="robots"[^>]*>\n','',out)
out=out.replace('href="../"','href="https://amarisct.github.io/Artificially-Intelligent/"').replace('href="../#library"','href="https://amarisct.github.io/Artificially-Intelligent/#library"').replace('href="../theory-chamber/"','href="https://amarisct.github.io/Artificially-Intelligent/theory-chamber/"')
open(sys.argv[1],'w').write(out)
