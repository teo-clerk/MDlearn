// Apply the saved theme and accent before the first paint (external file: the page CSP allows no inline scripts).
try { var t = localStorage.getItem('mdl-theme'); if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t } catch (e) {}
try {
  var v = JSON.parse(localStorage.getItem('mdl-accent-vars') || '{}')
  for (var k in v) if (/^--[a-z-]+-[ld]$/.test(k) && typeof v[k] === 'string') document.documentElement.style.setProperty(k, v[k])
} catch (e) {}
