# Rebuilds public/calculator.html from calculator/src/*  (run: python3 calculator/build.py)
import os
base=os.path.dirname(os.path.abspath(__file__))+'/src/'
r=lambda f:open(base+f).read()
THEME = "<script>try{var t=localStorage.getItem('theme');if(t==='dark'||t==='light')document.documentElement.setAttribute('data-theme',t)}catch(e){}addEventListener('storage',function(e){if(e.key==='theme'){var v=e.newValue;if(v==='dark'||v==='light')document.documentElement.setAttribute('data-theme',v);else document.documentElement.removeAttribute('data-theme')}})</script>"
css=r('style.css')+"""
body.embedded .side,body.embedded .bottom,body.embedded #banners,body.embedded .top .actions>button[data-act="ed-cancel"]{display:none!important}
body.embedded .main{padding:10px 4px 90px;max-width:none}body.embedded .app{min-height:0}
body.embedded .field:has(> [data-q^="customer."]){display:none}
body.embedded .stickybar{bottom:0}
#embedbar{display:flex;gap:6px;padding:8px 4px;overflow-x:auto;background:var(--bg);position:sticky;top:0;z-index:20}
#embedbar button{border:1px solid var(--line);border-radius:99px;padding:6px 14px;background:var(--card);cursor:pointer;font-weight:600;white-space:nowrap}
"""+r('embed.css')
app="\n".join(r(f) for f in ['app_a.js','app_b.js','app_c1.js','app_c2.js','stubs.js'])
html=f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><title>Quote calculator</title>
<style>{css}</style>{THEME}</head><body><div id="app"></div>
<script>{r('engine.js')}</script>
<script>{app}
{r('bridge.js')}</script></body></html>"""
open(os.path.dirname(base.rstrip('/'))+'/../public/calculator.html','w').write(html); print(len(html)//1024,'KB')

# ---- second build: the existing Settings / catalogue / wizard screens ----
app2="\n".join(r(f) for f in ['app_a.js','app_b.js','app_c1.js','app_c2.js','app_d1.js','app_d2.js'])
css2=css+"body.embedded .top{display:none}body.embedded .tabs{position:sticky;top:0;z-index:10;background:var(--bg)}"
html2=f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><title>Products & Pricing</title>
<style>{css2}</style>{THEME}<style>{r('pricing-theme.css')}</style></head><body><div id="app"></div>
<script>{r('engine.js')}</script><script>{r('seed.js')}</script>
<script>{app2}
{r('bridge_pricing.js')}</script></body></html>"""
open(os.path.dirname(base.rstrip('/'))+'/../public/pricing.html','w').write(html2); print(len(html2)//1024,'KB pricing')
