// Apply the saved theme before the first paint (external file: the page CSP allows no inline scripts).
try { var t = localStorage.getItem('mdl-theme'); if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t } catch (e) {}
