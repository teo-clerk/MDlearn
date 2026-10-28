// :::html runner (inside a sandboxed iframe: opaque origin, no network by CSP, no access to the Studio page).
// On `init` it replaces this page with the author's HTML behind a small prelude: the Studio's colours and
// fonts as CSS variables, and `window.mdlearn` (theme, reducedMotion, done(), resize()). The prelude reports
// the content height, a heartbeat (a frozen page is noticed by the Studio) and uncaught errors.
(function () {
  'use strict'
  var started = false
  function esc(s) { return String(s).replace(/</g, '\\u003c') }
  function vars(theme) {
    var out = []
    for (var k in theme.vars) if (/^--[a-z0-9-]+$/.test(k) && /^[^;{}<>]*$/.test(theme.vars[k])) out.push(k + ':' + theme.vars[k])
    return ':root{' + out.join(';') + ';color-scheme:' + (theme.dark ? 'dark' : 'light') + '}'
  }
  function bridge(m) {
    return [
      '(function(){',
      'var post=function(x){try{parent.postMessage(x,"*")}catch(e){}};',
      'var theme=' + esc(JSON.stringify(m.theme)) + ';',
      'window.mdlearn={theme:theme,reducedMotion:' + (m.reducedMotion ? 'true' : 'false') + ',',
      'done:function(r){var s=r&&typeof r==="object"?r:{score:Number(r)};post({type:"done",score:Number(s.score)||0,total:s.total==null?null:Number(s.total)})},',
      'resize:function(){post({type:"size",height:Math.ceil(document.documentElement.scrollHeight)})}};',
      'addEventListener("error",function(e){post({type:"error",message:String(e.message||"Script error")})});',
      'addEventListener("unhandledrejection",function(e){post({type:"error",message:String(e.reason&&e.reason.message||e.reason||"Promise rejected")})});',
      'addEventListener("message",function(e){if(e.source!==parent)return;var d=e.data||{};if(d.type==="theme"&&d.theme){mdlearn.theme=d.theme;var st=document.getElementById("mdlearn-theme");if(st)st.textContent=d.css;dispatchEvent(new CustomEvent("mdlearn-theme",{detail:d.theme}))}});',
      'setInterval(function(){post({type:"heartbeat"})},500);',
      'var ro=new ResizeObserver(function(){mdlearn.resize()});',
      'addEventListener("DOMContentLoaded",function(){ro.observe(document.documentElement);mdlearn.resize();post({type:"ready"})});',
      '})();',
    ].join('\n')
  }
  addEventListener('message', function (e) {
    if (e.source !== parent || started) return
    var m = e.data || {}
    if (m.type !== 'init' || typeof m.code !== 'string' || !m.theme) return
    started = true
    var base = 'html,body{margin:0;background:transparent;color:var(--text);font:15px/1.55 var(--font-ui,system-ui,sans-serif)}*{box-sizing:border-box}body{padding:2px}button{font:inherit}'
    var head = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<style id="mdlearn-theme">' + vars(m.theme) + '</style><style>' + base + '</style><script>' + bridge(m) + '<\/script></head><body>'
    document.open()
    document.write(head + m.code + '</body></html>')
    document.close()
  })
  parent.postMessage({ type: 'loaded' }, '*')
})()
