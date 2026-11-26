/* Shared nav + theme toggle for the mockups. */
(function () {
  var root = document.documentElement;
  try { var t = localStorage.getItem('theme'); if (t) root.setAttribute('data-theme', t); } catch (e) {}
  var pages = [['index.html', 'Home'], ['daily.html', 'Daily'], ['practice.html', 'Practice'],
               ['step.html', 'Step screen'], ['complete.html', 'Summary'], ['progress.html', 'Progress'], ['editor.html', 'Editor'], ['create.html', 'Create'], ['review.html', 'Review']];
  var here = location.pathname.split('/').pop() || 'index.html';
  var host = document.getElementById('nav');
  if (!host) return;
  var links = pages.map(function (p) {
    return '<a class="tab" href="' + p[0] + '"' + (p[0] === here ? ' aria-current="page"' : '') + '>' + p[1] + '</a>';
  }).join('');
  host.outerHTML =
    '<div class="ribbon">MOCKUP — static sketch, validation is hard-coded</div>' +
    '<nav class="nav"><div class="nav-in"><a class="brand" href="index.html">' +
    '<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="9" cy="22" r="4" fill="currentColor" style="color:var(--accent)"/>' +
    '<circle cx="24" cy="10" r="4" fill="none" stroke="currentColor" stroke-width="2.5" style="color:var(--ink)"/>' +
    '<path d="M11 17 Q14 4 20 8" fill="none" stroke="var(--arrow)" stroke-width="2.5" stroke-linecap="round"/></svg>ArrowPush</a>' +
    links + '<span class="spacer"></span><button class="iconbtn" id="themeBtn" aria-label="Toggle light or dark theme">◐ Theme</button></div></nav>';
  document.getElementById('themeBtn').addEventListener('click', function () {
    var dark = root.getAttribute('data-theme') === 'dark' ||
      (!root.getAttribute('data-theme') && matchMedia('(prefers-color-scheme: dark)').matches);
    var next = dark ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem('theme', next); } catch (e) {}
  });
})();

/* tiny tab helper: <div data-tabs> with buttons[data-tab] and panels[data-panel] */
function wireTabs(scope) {
  scope.querySelectorAll('[data-tabs]').forEach(function (g) {
    var btns = g.querySelectorAll('[data-tab]');
    btns.forEach(function (b) {
      b.addEventListener('click', function () {
        btns.forEach(function (x) { x.setAttribute('aria-selected', x === b ? 'true' : 'false'); });
        var key = b.getAttribute('data-tab');
        (g.getAttribute('data-for') ? document.querySelector(g.getAttribute('data-for')) : g.parentElement)
          .querySelectorAll('[data-panel]').forEach(function (p) { p.classList.toggle('hidden', p.getAttribute('data-panel') !== key); });
      });
    });
  });
}
wireTabs(document);
