/**
 * clara.js — Clara AI embeddable floating chat widget v2
 * ─────────────────────────────────────────────────────────────────────────────
 * Drop-in: <script src="/embed/clara.js" data-key="clr_..." async></script>
 *
 * Script-tag attributes (all optional — server config takes precedence):
 *   data-key       (required) API key starting with clr_
 *   data-position  bottom-right | bottom-left  (fallback default)
 *   data-theme     light | dark                (fallback default)
 *
 * Design is fully controlled by the assistant_config widget_* fields served
 * from GET /api/embed/config — no need to redeploy the script to change styles.
 */
(function () {
  'use strict';

  /* ── 1. Bootstrap ────────────────────────────────────────────────────────── */
  var scriptEl = document.currentScript;
  if (!scriptEl) {
    var all = document.querySelectorAll('script');
    for (var si = all.length - 1; si >= 0; si--) {
      if ((all[si].src || '').indexOf('clara.js') !== -1) { scriptEl = all[si]; break; }
    }
  }
  if (!scriptEl) return;

  var API_KEY          = (scriptEl.getAttribute('data-key') || '').trim();
  var FALLBACK_POS     = (scriptEl.getAttribute('data-position') || 'bottom-right').trim();
  var FALLBACK_THEME   = (scriptEl.getAttribute('data-theme') || 'light').trim();
  if (!API_KEY) { console.warn('[Clara] data-key attribute is required'); return; }

  var BASE_URL = (scriptEl.src || '').replace(/\/embed\/clara\.js[^]*$/, '');

  /* ── 2. Runtime state ──────────────────────────────────────────────────── */
  var cfg        = null;
  var isOpen     = false;
  var isThinking = false;
  var voiceOn    = false;
  var history    = [];
  var SESSION_ID = 'cs_' + Math.random().toString(36).slice(2, 10);
  var $panel, $toggleBtn, $msgs, $textarea, $sendBtn, $voiceBtn, $launcherLabel;

  /* ── 3. Utilities ──────────────────────────────────────────────────────── */
  function uid()     { return Math.random().toString(36).slice(2, 9); }
  function authHdr() { return { 'Authorization': 'Bearer ' + API_KEY, 'Content-Type': 'application/json' }; }
  function svg(i)    { return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">' + i + '</svg>'; }

  /* ── 4. CSS builder — driven by server config ──────────────────────────── */
  function buildCSS(c) {
    var primary  = c.primaryColour  || '#6366f1';
    var accent   = c.accentColour   || '#818cf8';
    var theme    = c.widgetTheme    || FALLBACK_THEME;
    var pos      = c.widgetPosition || FALLBACK_POS;
    var btnSize  = (c.widgetButtonSize  || 56) + 'px';
    var radius   = (c.widgetBorderRadius !== undefined ? c.widgetBorderRadius : 20) + 'px';
    var font     = c.widgetFontFamily || 'system-ui,sans-serif';
    var chatH    = (c.widgetChatHeight || 580) + 'px';

    var dark    = theme === 'dark';
    var bg      = dark ? '#1c1c2a' : '#ffffff';
    var surface = dark ? '#27273b' : '#f5f5fb';
    var txt     = dark ? '#e2e2f0' : '#1a1a2e';
    var sub     = dark ? '#9898b8' : '#6b7280';
    var bdr     = dark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.09)';
    var right   = pos !== 'bottom-left';

    return [
      '*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}',
      '#launcher{position:fixed;z-index:2147483647;bottom:24px;' + (right ? 'right:24px' : 'left:24px') +
        ';display:flex;flex-direction:column;align-items:' + (right ? 'flex-end' : 'flex-start') + ';gap:8px}',
      '#tbtn{width:' + btnSize + ';height:' + btnSize + ';border-radius:50%;background:' + primary + ';' +
        'border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;' +
        'box-shadow:0 4px 20px rgba(0,0,0,0.28);transition:transform .2s,box-shadow .2s}',
      '#tbtn:hover{transform:scale(1.08);box-shadow:0 6px 28px rgba(0,0,0,0.36)}',
      '#tbtn svg{width:calc(' + btnSize + ' * 0.46);height:calc(' + btnSize + ' * 0.46);' +
        'fill:none;stroke:#fff;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}',
      '#launcher-lbl{font-family:' + font + ';font-size:13px;font-weight:600;color:#fff;' +
        'background:' + primary + ';border-radius:20px;padding:6px 14px;cursor:pointer;' +
        'box-shadow:0 2px 10px rgba(0,0,0,0.22);transition:opacity .15s;white-space:nowrap}',
      '#launcher-lbl:hover{opacity:.88}',
      '#panel{width:380px;max-width:calc(100vw - 32px);height:' + chatH + ';max-height:calc(100dvh - 100px);' +
        'border-radius:' + radius + ';background:' + bg + ';border:1px solid ' + bdr + ';' +
        'box-shadow:0 12px 48px rgba(0,0,0,0.24);display:flex;flex-direction:column;overflow:hidden;' +
        'transform:scale(0.88) translateY(20px);opacity:0;pointer-events:none;font-family:' + font + ';' +
        'transform-origin:bottom ' + (right ? 'right' : 'left') + ';' +
        'transition:transform .28s cubic-bezier(.34,1.56,.64,1),opacity .2s}',
      '#panel.open{transform:scale(1) translateY(0);opacity:1;pointer-events:all}',
      '#hdr{padding:14px 16px;background:' + primary + ';display:flex;align-items:center;gap:11px;flex-shrink:0}',
      '#av{width:34px;height:34px;border-radius:50%;background:rgba(255,255,255,0.22);' +
        'display:flex;align-items:center;justify-content:center;flex-shrink:0;overflow:hidden}',
      '#av img{width:100%;height:100%;object-fit:cover}',
      '#av svg{width:17px;height:17px;stroke:#fff;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}',
      '#hn{font-size:14px;font-weight:600;color:#fff;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '#cbtn{width:26px;height:26px;border-radius:50%;background:rgba(255,255,255,0.18);border:none;cursor:pointer;' +
        'display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:background .15s}',
      '#cbtn:hover{background:rgba(255,255,255,0.3)}',
      '#cbtn svg{width:13px;height:13px;stroke:#fff;fill:none;stroke-width:2.5;stroke-linecap:round}',
      '#msgs{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:9px;scroll-behavior:smooth}',
      '#msgs::-webkit-scrollbar{width:4px}',
      '#msgs::-webkit-scrollbar-thumb{background:' + bdr + ';border-radius:2px}',
      '.m{max-width:84%;padding:9px 13px;border-radius:14px;font-size:13.5px;line-height:1.55;word-break:break-word;white-space:pre-wrap}',
      '.mu{align-self:flex-end;background:' + primary + ';color:#fff;border-bottom-right-radius:3px}',
      '.ma{align-self:flex-start;background:' + surface + ';color:' + txt + ';border:1px solid ' + bdr + ';border-bottom-left-radius:3px}',
      '.mt{align-self:flex-start;background:' + surface + ';border:1px solid ' + bdr + ';border-bottom-left-radius:3px;padding:12px 14px}',
      '.dots{display:inline-flex;gap:4px}',
      '.dots i{display:block;width:6px;height:6px;border-radius:50%;background:' + sub + ';animation:bounce .85s infinite}',
      '.dots i:nth-child(2){animation-delay:.15s}.dots i:nth-child(3){animation-delay:.3s}',
      '@keyframes bounce{0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-5px)}}',
      '#irow{padding:10px 12px;border-top:1px solid ' + bdr + ';display:flex;gap:7px;align-items:flex-end;flex-shrink:0;background:' + bg + '}',
      '#itxt{flex:1;border:1.5px solid ' + bdr + ';border-radius:11px;padding:8px 11px;' +
        'font-size:13.5px;background:' + surface + ';color:' + txt + ';outline:none;resize:none;' +
        'max-height:88px;min-height:36px;line-height:1.45;font-family:' + font + '}',
      '#itxt:focus{border-color:' + accent + '}',
      '#itxt::placeholder{color:' + sub + '}',
      '.ibtn{width:34px;height:34px;border-radius:50%;border:none;cursor:pointer;flex-shrink:0;' +
        'display:flex;align-items:center;justify-content:center;transition:opacity .15s,background .15s}',
      '#sbtn{background:' + primary + '}#sbtn:disabled{opacity:.4;cursor:not-allowed}',
      '#sbtn svg{width:15px;height:15px;fill:none;stroke:#fff;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}',
      '#vbtn{background:' + surface + ';border:1.5px solid ' + bdr + '}',
      '#vbtn.von{background:#ef4444;border-color:#ef4444}',
      '#vbtn svg{width:15px;height:15px;fill:none;stroke:' + sub + ';stroke-width:2;stroke-linecap:round;stroke-linejoin:round}',
      '#vbtn.von svg{stroke:#fff}',
      '#pw{text-align:center;font-size:10px;color:' + sub + ';padding:4px 0 9px;flex-shrink:0}',
      '#pw a{color:' + sub + ';text-decoration:none}#pw a:hover{text-decoration:underline}',
    ].join('\n');
  }

  /* ── 5. SVG icon strings ─────────────────────────────────────────────────── */
  var I_CHAT  = '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>';
  var I_CLOSE = '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>';
  var I_SEND  = '<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>';
  var I_MIC   = '<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>';
  var I_BOT   = '<rect x="3" y="11" width="18" height="10" rx="2"/><path d="M9 11V7a3 3 0 0 1 6 0v4"/><circle cx="9" cy="16" r="1" fill="currentColor" stroke="none"/><circle cx="15" cy="16" r="1" fill="currentColor" stroke="none"/>';
  var I_STOP  = '<rect x="6" y="6" width="12" height="12" rx="2"/>';

  /* ── 6. Message helpers ──────────────────────────────────────────────────── */
  function scrollBottom() { if ($msgs) $msgs.scrollTop = $msgs.scrollHeight; }

  function addMsg(role, text) {
    var id = 'cm-' + uid();
    var div = document.createElement('div');
    div.id = id;
    if (role === 'thinking') {
      div.className = 'm mt';
      div.innerHTML = '<div class="dots"><i></i><i></i><i></i></div>';
    } else {
      div.className = 'm ' + (role === 'user' ? 'mu' : 'ma');
      div.textContent = text || '';
    }
    $msgs.appendChild(div);
    scrollBottom();
    return id;
  }

  function setMsg(id, text) {
    var el = $msgs.querySelector('#' + id);
    if (!el) return;
    el.className = 'm ma';
    el.textContent = text;
    scrollBottom();
  }

  function addNote(text) {
    var div = document.createElement('div');
    div.style.cssText = 'font-size:11px;color:#9898b8;text-align:center;padding:2px 0';
    div.textContent = text;
    $msgs.appendChild(div);
    scrollBottom();
  }

  /* ── 7. Streaming chat ───────────────────────────────────────────────────── */
  function sendMessage() {
    if (!$textarea) return;
    var text = $textarea.value.trim();
    if (!text || isThinking) return;
    $textarea.value = '';
    $textarea.style.height = 'auto';
    history.push({ role: 'user', content: text });
    addMsg('user', text);
    isThinking = true;
    $sendBtn.disabled = true;
    if ($voiceBtn) $voiceBtn.disabled = true;
    var thinkId = addMsg('thinking', '');
    var accumulated = '';
    var started = false;

    fetch(BASE_URL + '/api/embed/chat', {
      method: 'POST',
      headers: authHdr(),
      body: JSON.stringify({ messages: history.map(function(m) { return { role: m.role, content: m.content }; }), sessionId: SESSION_ID }),
    })
    .then(function(res) {
      if (!res.ok || !res.body) {
        return res.json().then(function(d) { throw new Error(d.error || ('HTTP ' + res.status)); });
      }
      var reader = res.body.getReader();
      var decoder = new TextDecoder();
      var buffer = '';
      function pump() {
        reader.read().then(function(chunk) {
          if (chunk.done) {
            if (!started) setMsg(thinkId, '(no response)');
            history.push({ role: 'assistant', content: accumulated });
            isThinking = false; $sendBtn.disabled = false;
            if ($voiceBtn) $voiceBtn.disabled = false;
            return;
          }
          buffer += decoder.decode(chunk.value, { stream: true });
          var lines = buffer.split('\n'); buffer = lines.pop();
          lines.forEach(function(line) {
            if (!line.trim()) return;
            try {
              var evt = JSON.parse(line);
              if (evt.type === 'token' && typeof evt.payload === 'string') {
                if (!started) { setMsg(thinkId, ''); started = true; }
                accumulated += evt.payload;
                setMsg(thinkId, accumulated);
              } else if (evt.type === 'error') {
                setMsg(thinkId, '\u26a0 ' + (evt.payload || 'Error'));
                isThinking = false; $sendBtn.disabled = false;
                if ($voiceBtn) $voiceBtn.disabled = false;
              }
            } catch(e) {}
          });
          pump();
        }).catch(function(err) {
          setMsg(thinkId, '\u26a0 Connection lost: ' + (err.message || 'unknown'));
          isThinking = false; $sendBtn.disabled = false;
          if ($voiceBtn) $voiceBtn.disabled = false;
        });
      }
      pump();
    })
    .catch(function(err) {
      setMsg(thinkId, '\u26a0 ' + (err.message || 'Failed to connect'));
      isThinking = false; $sendBtn.disabled = false;
      if ($voiceBtn) $voiceBtn.disabled = false;
    });
  }

  /* ── 8. Voice session ────────────────────────────────────────────────────── */
  function toggleVoice() {
    if (!$voiceBtn) return;
    if (voiceOn) {
      voiceOn = false;
      $voiceBtn.classList.remove('von');
      $voiceBtn.setAttribute('aria-label', 'Start voice');
      $voiceBtn.innerHTML = svg(I_MIC);
      addNote('\uD83C\uDF99 Voice session ended');
      return;
    }
    $voiceBtn.disabled = true;
    fetch(BASE_URL + '/api/embed/session', { method: 'POST', headers: authHdr(), body: JSON.stringify({ sessionId: SESSION_ID }) })
    .then(function(r) { return r.json(); })
    .then(function(session) {
      $voiceBtn.disabled = false;
      if (session.error) { addNote('\u26a0 Voice unavailable: ' + session.error); return; }
      voiceOn = true;
      $voiceBtn.classList.add('von');
      $voiceBtn.setAttribute('aria-label', 'Stop voice');
      $voiceBtn.innerHTML = svg(I_STOP);
      addNote('\uD83C\uDF99 Voice ready (' + (session.provider || 'ai') + ')');
      document.dispatchEvent(new CustomEvent('clara:voiceSession', { detail: session }));
    })
    .catch(function() { $voiceBtn.disabled = false; addNote('\u26a0 Could not start voice session'); });
  }

  /* ── 9. Build Shadow DOM widget ──────────────────────────────────────────── */
  function buildWidget(c) {
    var host = document.createElement('div');
    host.id = 'clara-widget-host';
    document.body.appendChild(host);
    var shadow = host.attachShadow({ mode: 'open' });

    var style = document.createElement('style');
    style.textContent = buildCSS(c);
    shadow.appendChild(style);

    var launcher = document.createElement('div');
    launcher.id = 'launcher';
    shadow.appendChild(launcher);

    /* Panel */
    $panel = document.createElement('div');
    $panel.id = 'panel';
    $panel.setAttribute('role', 'dialog');
    $panel.setAttribute('aria-modal', 'true');
    $panel.setAttribute('aria-label', (c.assistantName || 'Clara') + ' chat');

    /* Header */
    var hdr = document.createElement('div'); hdr.id = 'hdr';
    var av  = document.createElement('div'); av.id  = 'av';
    if (c.avatarUrl) {
      var img = document.createElement('img'); img.src = c.avatarUrl; img.alt = ''; av.appendChild(img);
    } else { av.innerHTML = svg(I_BOT); }
    var hn = document.createElement('div'); hn.id = 'hn'; hn.textContent = c.assistantName || 'Clara';
    var cbtn = document.createElement('button'); cbtn.id = 'cbtn';
    cbtn.setAttribute('aria-label', 'Close chat'); cbtn.innerHTML = svg(I_CLOSE); cbtn.onclick = togglePanel;
    hdr.appendChild(av); hdr.appendChild(hn); hdr.appendChild(cbtn);
    $panel.appendChild(hdr);

    /* Messages */
    $msgs = document.createElement('div'); $msgs.id = 'msgs';
    $msgs.setAttribute('role', 'log'); $msgs.setAttribute('aria-live', 'polite');
    $panel.appendChild($msgs);
    if (c.welcomeMessage) addMsg('assistant', c.welcomeMessage);

    /* Input row */
    var irow = document.createElement('div'); irow.id = 'irow';
    $textarea = document.createElement('textarea');
    $textarea.id = 'itxt'; $textarea.placeholder = 'Ask a question\u2026'; $textarea.rows = 1;
    $textarea.setAttribute('aria-label', 'Chat message');
    $textarea.addEventListener('keydown', function(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } });
    $textarea.addEventListener('input', function() { this.style.height = 'auto'; this.style.height = Math.min(this.scrollHeight, 88) + 'px'; });
    irow.appendChild($textarea);

    if (c.voiceEnabled) {
      $voiceBtn = document.createElement('button');
      $voiceBtn.id = 'vbtn'; $voiceBtn.className = 'ibtn';
      $voiceBtn.setAttribute('aria-label', 'Start voice'); $voiceBtn.innerHTML = svg(I_MIC);
      $voiceBtn.onclick = toggleVoice;
      irow.appendChild($voiceBtn);
    }

    $sendBtn = document.createElement('button');
    $sendBtn.id = 'sbtn'; $sendBtn.className = 'ibtn';
    $sendBtn.setAttribute('aria-label', 'Send message'); $sendBtn.innerHTML = svg(I_SEND);
    $sendBtn.onclick = sendMessage;
    irow.appendChild($sendBtn);
    $panel.appendChild(irow);

    /* Branding footer */
    if (c.widgetShowBranding !== false) {
      var pw = document.createElement('div'); pw.id = 'pw';
      pw.innerHTML = 'Powered by <a href="https://clara.ai" target="_blank" rel="noopener noreferrer">Clara AI</a>';
      $panel.appendChild(pw);
    }

    launcher.appendChild($panel);

    /* Launcher label (optional text beside the FAB button) */
    if (c.widgetLauncherLabel) {
      $launcherLabel = document.createElement('div');
      $launcherLabel.id = 'launcher-lbl';
      $launcherLabel.textContent = c.widgetLauncherLabel;
      $launcherLabel.onclick = togglePanel;
      launcher.appendChild($launcherLabel);
    }

    /* Toggle FAB */
    $toggleBtn = document.createElement('button');
    $toggleBtn.id = 'tbtn'; $toggleBtn.setAttribute('aria-label', 'Open chat');
    $toggleBtn.setAttribute('aria-expanded', 'false'); $toggleBtn.setAttribute('aria-controls', 'panel');
    $toggleBtn.innerHTML = svg(I_CHAT); $toggleBtn.onclick = togglePanel;
    launcher.appendChild($toggleBtn);
  }

  /* ── 10. Toggle open/close ───────────────────────────────────────────────── */
  function togglePanel() {
    isOpen = !isOpen;
    if (isOpen) {
      $panel.classList.add('open');
      $toggleBtn.setAttribute('aria-expanded', 'true'); $toggleBtn.setAttribute('aria-label', 'Close chat');
      setTimeout(function() { if ($textarea) $textarea.focus(); }, 280);
    } else {
      $panel.classList.remove('open');
      $toggleBtn.setAttribute('aria-expanded', 'false'); $toggleBtn.setAttribute('aria-label', 'Open chat');
    }
  }

  /* ── 11. Init ────────────────────────────────────────────────────────────── */
  function init() {
    fetch(BASE_URL + '/api/embed/config', { headers: { 'Authorization': 'Bearer ' + API_KEY } })
      .then(function(r) { if (!r.ok) throw new Error('Config error (' + r.status + ')'); return r.json(); })
      .then(function(data) {
        if (data.error) throw new Error(data.error);
        cfg = data;
        buildWidget(cfg);
      })
      .catch(function(err) { console.warn('[Clara] Widget failed to initialise:', err.message || err); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  /* ── 12. Public API ──────────────────────────────────────────────────────── */
  window.ClaraWidget = {
    open:   function() { if ($panel && !isOpen) togglePanel(); },
    close:  function() { if ($panel && isOpen)  togglePanel(); },
    send:   function(text) { if ($textarea) { $textarea.value = text || ''; sendMessage(); } },
    isOpen: function() { return isOpen; },
  };

})();
