#!/bin/bash
# Programmatic mobile layout audit: check horizontal overflow, tiny tap targets,
# and FAB/tab-bar geometry on a list of paths.
set -u
BASE=${AUDIT_BASE:-http://localhost:3000}
check() {
  local path="$1"
  agent-browser open "$BASE$path" >/dev/null 2>&1
  for i in $(seq 1 15); do
    LEN=$(agent-browser eval "document.body.innerText.trim().length" 2>/dev/null | tr -d '"')
    [ "${LEN:-0}" -ge 100 ] 2>/dev/null && break
    sleep 2
  done
  sleep 1
  agent-browser eval "
(() => {
  const doc = document.documentElement;
  const overflowX = doc.scrollWidth - doc.clientWidth;
  // find elements that poke out of the viewport
  const wide = [];
  document.querySelectorAll('body *').forEach(el => {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && (r.right > doc.clientWidth + 2 || r.left < -2) && wide.length < 6) {
      const cs = getComputedStyle(el);
      if (cs.position !== 'fixed' || true) {
        wide.push(el.tagName + '.' + String(el.className).slice(0,40).replace(/\s+/g,'.') + ' L=' + Math.round(r.left) + ' R=' + Math.round(r.right));
      }
    }
  });
  // tab bar geometry
  const nav = document.querySelector('nav');
  let navInfo = null;
  if (nav) { const r = nav.getBoundingClientRect(); navInfo = 'navB=' + Math.round(r.bottom) + ' h=' + Math.round(r.height); }
  // FAB geometry
  let fab = null;
  const aiBtn = [...document.querySelectorAll('button')].find(b => (b.innerText||'').trim() === 'AI');
  if (aiBtn) { const r = aiBtn.getBoundingClientRect(); fab = 'fabB=' + Math.round(r.bottom) + ' fabR=' + Math.round(r.right); }
  return JSON.stringify({path: '$path', overflowX, wide, navInfo, fab, bodyLen: ${LEN:-0}});
})()
" 2>&1 | head -3
}
for p in "$@"; do check "$p"; done
