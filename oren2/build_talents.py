#!/usr/bin/env python3
"""Inject talents.css + talents.js into index.html between the TALENTS markers."""
import pathlib,re
d=pathlib.Path(__file__).parent
idx=(d/'index.html').read_text(encoding='utf-8')
css=(d/'talents.css').read_text(encoding='utf-8')
js=(d/'talents.js').read_text(encoding='utf-8')
for extra in ['arcade','reading','health','story','friend','ship','lessoncard','know','gaps','read-bank2','music2','chess','explore2','english2','think-bank','think','learn','help','topic','daylog','pday','again','shots','wire']:
    if (d/(extra+'.css')).exists(): css+='\n'+(d/(extra+'.css')).read_text(encoding='utf-8')
    if (d/(extra+'.js')).exists(): js+='\n'+(d/(extra+'.js')).read_text(encoding='utf-8')
assert '</script' not in js and '</style' not in css
# gaps-math goes into the core before WORLDS (it needs the core's own helpers)
if (d/'gaps-math.js').exists():
    gm=(d/'gaps-math.js').read_text(encoding='utf-8')
    i0,i1=idx.index('/*GAPSMATH*/'),idx.index('/*/GAPSMATH*/')
    idx=idx[:i0]+'/*GAPSMATH*/'+chr(10)+gm+chr(10)+idx[i1:]
a,b='<!--TALENTS-->','<!--/TALENTS-->'
i,j=idx.index(a),idx.index(b)
idx=idx[:i+len(a)]+'\n<style>\n'+css+'</style>\n<script>\n'+js+'\n</script>\n'+idx[j:]
(d/'index.html').write_bytes(idx.replace(chr(13),'').encode('utf-8'))
print('injected',len(css),len(js))

# standalone website copy for Cloudflare Pages (cf/public)
head=('<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8">'
 '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
 '<title>הַמַּסָּע שֶׁל אוֹרֶן</title><meta name="theme-color" content="#6aa84f">'
 '<link rel="manifest" href="/manifest.webmanifest"><link rel="icon" href="/icon-192.png">'
 '<script>window.__site=1</script>'
 '<link rel="apple-touch-icon" href="/icon-192.png"><meta name="apple-mobile-web-app-capable" content="yes">'
 '</head><body>')
pub=d/'cf'/'public'
if pub.is_dir():
    (pub/'index.html').write_bytes((head+idx+'</body></html>').replace(chr(13),'').encode('utf-8'))
    print('website copy written')
