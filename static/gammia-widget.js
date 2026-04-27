/**
 * GammIA Chatbot Widget v2.0
 * ─────────────────────────────────────────────────────────────────────────────
 * Embed en sitio corporativo (contexto público):
 *   <script src="https://gammia-api-...run.app/static/gammia-widget.js"
 *           data-context="public">
 *   </script>
 *
 * Embed en Google Sites / Intranet (contexto interno):
 *   <script src="https://gammia-api-...run.app/static/gammia-widget.js"
 *           data-context="internal"
 *           data-secret="TU_WIDGET_SECRET">
 *   </script>
 * ─────────────────────────────────────────────────────────────────────────────
 */
(function () {
  'use strict';

  // ── Configuración desde atributos del script tag ───────────────────────────
  var scriptTag = document.currentScript || (function () {
    var scripts = document.querySelectorAll('script[data-context]');
    return scripts[scripts.length - 1];
  })();

  var API_BASE  = (scriptTag && scriptTag.getAttribute('data-api'))
    || 'https://gammia-api-1028680563477.us-central1.run.app';
  var CONTEXT   = (scriptTag && scriptTag.getAttribute('data-context')) || 'public';
  var SECRET    = (scriptTag && scriptTag.getAttribute('data-secret'))  || '';
  var POSITION  = (scriptTag && scriptTag.getAttribute('data-position')) || 'right';

  var isInternal = CONTEXT === 'internal' || CONTEXT === 'intranet';

  // ── Estado ─────────────────────────────────────────────────────────────────
  var isOpen           = false;
  var isTyping         = false;
  var sessionId        = null;
  var interactionCount = 0;
  var maxInteractions  = 10;

  // ── Markdown renderer ──────────────────────────────────────────────────────
  function renderMarkdown(text) {
    // Escapa HTML primero
    var html = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Bloques de código (``` ... ```)
    html = html.replace(/```[\w]*\n?([\s\S]*?)```/g, function(_, code) {
      return '<pre><code>' + code.trim() + '</code></pre>';
    });

    // Código inline
    html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>');

    // Encabezados
    html = html.replace(/^### (.+)$/gm, '<h4>$1</h4>');
    html = html.replace(/^## (.+)$/gm,  '<h3>$1</h3>');
    html = html.replace(/^# (.+)$/gm,   '<h3>$1</h3>');

    // Negrita + cursiva
    html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
    // Negrita
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/__(.+?)__/g,     '<strong>$1</strong>');
    // Cursiva
    html = html.replace(/\*([^\s*][^*]*?)\*/g, '<em>$1</em>');
    html = html.replace(/_([^\s_][^_]*?)_/g,   '<em>$1</em>');

    // Listas no ordenadas
    html = html.replace(/^[\-\*•] (.+)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>[\s\S]*?<\/li>)(?!\s*<li>)/g, '<ul>$1</ul>');
    html = html.replace(/(<\/li>\s*<li>)/g, '$1');
    html = html.replace(/(<li>)/g, '$1');

    // Listas ordenadas
    html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

    // Links
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener">$1</a>');

    // Párrafos con doble salto
    html = html.replace(/\n{2,}/g, '</p><p>');
    html = '<p>' + html + '</p>';
    // Saltos simples dentro de párrafos
    html = html.replace(/([^>])\n([^<])/g, '$1<br>$2');

    // Limpiar párrafos vacíos
    html = html.replace(/<p>\s*<\/p>/g, '');
    html = html.replace(/<p>(<[uo]l>)/g, '$1');
    html = html.replace(/(<\/[uo]l>)<\/p>/g, '$1');
    html = html.replace(/<p>(<h[234]>)/g, '$1');
    html = html.replace(/(<\/h[234]>)<\/p>/g, '$1');
    html = html.replace(/<p>(<pre>)/g, '$1');
    html = html.replace(/(<\/pre>)<\/p>/g, '$1');

    return html;
  }

  // ── CSS con variables CSS (default dark) ──────────────────────────────────
  function buildCSS() {
    var posBtn   = POSITION === 'left' ? 'left:20px;'  : 'right:20px;';
    var posPanel = POSITION === 'left' ? 'left:16px;'  : 'right:16px;';

    return [
      /* Widget panel — CSS custom properties scoped */
      '#gammia-widget-panel{',
        '--gp:#10B981;--gs:#064E3B;--gbg:#0B1120;',
        '--gsurf:#111827;--gsurf2:#1E293B;',
        '--gub:#10B981;--gut:#022C22;',
        '--gbb:#1E293B;--gt:#E2E8F0;--gtm:#64748B;--gbor:#1E293B;',
        "--gff:'Inter',sans-serif;--gfs:13px;",
      '}',

      /* Floating button */
      '#gammia-widget-btn{',
        'position:fixed;' + posBtn + 'bottom:20px;',
        'width:76px;height:76px;border-radius:50%;',
        'background:#fff;border:none;cursor:pointer;',
        'box-shadow:0 6px 24px rgba(0,0,0,.45);',
        'display:flex;align-items:center;justify-content:center;',
        'z-index:999998;transition:transform .2s cubic-bezier(.34,1.56,.64,1),box-shadow .2s;',
        'animation:gammia-float 3s ease-in-out infinite;',
        'padding:0;overflow:hidden;',
      '}',
      '#gammia-widget-btn:hover{transform:scale(1.12) translateY(-3px);}',
      '#gammia-widget-btn:active{transform:scale(.96);}',
      '#gammia-widget-btn img{width:100%;height:100%;object-fit:cover;transition:opacity .2s;}',
      '#gammia-widget-btn .g-btn-close{display:none;width:32px;height:32px;stroke:#6B7280;fill:none;stroke-width:2.5;stroke-linecap:round;}',
      '#gammia-widget-btn.g-btn-open img{opacity:.15;}',
      '#gammia-widget-btn.g-btn-open .g-btn-close{display:block;position:absolute;}',
      '#gammia-widget-btn.g-btn-open{animation:none;}',
      '@keyframes gammia-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}',

      /* Panel */
      '#gammia-widget-panel{',
        'position:fixed;' + posPanel + 'bottom:110px;',
        'width:370px;max-height:560px;min-height:280px;',
        'border-radius:20px;',
        'background:var(--gsurf);border:1px solid var(--gbor);',
        'box-shadow:0 20px 60px rgba(0,0,0,.5);',
        'display:flex;flex-direction:column;overflow:hidden;',
        'z-index:999997;',
        'transform:scale(.92) translateY(16px);opacity:0;pointer-events:none;',
        'transition:transform .25s cubic-bezier(.34,1.56,.64,1),opacity .2s ease;',
        'font-family:var(--gff);font-size:var(--gfs);color:var(--gt);',
      '}',
      '#gammia-widget-panel.g-open{transform:scale(1) translateY(0);opacity:1;pointer-events:all;}',
      '@media(max-width:480px){#gammia-widget-panel{width:calc(100vw - 32px);bottom:80px;}}',

      /* Resize handle */
      '.g-resize{height:7px;cursor:ns-resize;flex-shrink:0;',
        'display:flex;align-items:center;justify-content:center;',
        'background:var(--gsurf2);border-bottom:1px solid var(--gbor);}',
      '.g-resize::after{content:"";width:36px;height:3px;background:var(--gbor);border-radius:2px;transition:background .15s;}',
      '.g-resize:hover::after{background:var(--gp);}',

      /* Header */
      '.g-header{',
        'background:linear-gradient(135deg,var(--gs),var(--gp) 75%,var(--gsurf));',
        'padding:14px 16px;display:flex;align-items:center;gap:10px;',
        'border-bottom:1px solid var(--gbor);flex-shrink:0;',
      '}',
      '.g-avatar{width:40px;height:40px;border-radius:50%;background:#fff;',
        'display:flex;align-items:center;justify-content:center;',
        'flex-shrink:0;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.25);}',
      '.g-avatar img{width:100%;height:100%;object-fit:cover;}',
      '.g-avatar-letter{font-size:18px;font-weight:700;color:var(--gp);}',
      '.g-header-info{flex:1;min-width:0;}',
      '.g-header-name{font-size:14px;font-weight:700;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
      '.g-header-sub{font-size:11px;color:rgba(255,255,255,.7);margin-top:1px;}',
      '.g-status{display:flex;align-items:center;gap:5px;font-size:10px;color:#fff;font-weight:600;flex-shrink:0;}',
      '.g-dot{width:6px;height:6px;border-radius:50%;background:#fff;animation:g-blink 1.4s infinite;}',
      '@keyframes g-blink{0%,100%{opacity:1}50%{opacity:.3}}',
      '.g-close-btn{background:none;border:none;cursor:pointer;',
        'color:rgba(255,255,255,.7);padding:4px;border-radius:6px;',
        'display:flex;align-items:center;justify-content:center;',
        'transition:background .15s,color .15s;flex-shrink:0;}',
      '.g-close-btn:hover{background:rgba(255,255,255,.18);color:#fff;}',
      '.g-close-btn svg{width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;}',

      /* Interaction counter */
      '.g-counter{font-size:10px;color:var(--gtm);text-align:right;padding:3px 14px 0;flex-shrink:0;background:var(--gbg);}',
      '.g-counter.warn{color:#F59E0B;} .g-counter.danger{color:#EF4444;}',

      /* Messages */
      '.g-msgs{flex:1;overflow-y:auto;padding:12px 14px;',
        'display:flex;flex-direction:column;gap:10px;',
        'scroll-behavior:smooth;background:var(--gbg);}',
      '.g-msgs::-webkit-scrollbar{width:4px;}',
      '.g-msgs::-webkit-scrollbar-track{background:transparent;}',
      '.g-msgs::-webkit-scrollbar-thumb{background:var(--gbor);border-radius:2px;}',
      '.g-msg{display:flex;gap:8px;max-width:88%;animation:g-fadein .2s ease;}',
      '@keyframes g-fadein{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}',
      '.g-msg.user{flex-direction:row-reverse;align-self:flex-end;}',
      '.g-msg.bot{align-self:flex-start;}',

      /* Bubbles */
      '.g-bubble{padding:10px 13px;border-radius:14px;',
        'font-size:var(--gfs);line-height:1.6;max-width:100%;word-break:break-word;}',
      '.g-msg.user .g-bubble{background:var(--gub);color:var(--gut);border-bottom-right-radius:4px;}',
      '.g-msg.bot .g-bubble{background:var(--gbb);color:var(--gt);',
        'border-bottom-left-radius:4px;border:1px solid var(--gbor);}',

      /* Markdown inside bot bubbles */
      '.g-bubble p{margin:0 0 6px 0;} .g-bubble p:last-child{margin-bottom:0;}',
      '.g-bubble ul,.g-bubble ol{margin:6px 0;padding-left:18px;}',
      '.g-bubble li{margin-bottom:3px;}',
      '.g-bubble strong{font-weight:700;}',
      '.g-bubble em{font-style:italic;}',
      '.g-bubble h3,.g-bubble h4{font-weight:700;margin:8px 0 4px;font-size:1em;color:var(--gp);}',
      '.g-bubble code{background:var(--gbg);border:1px solid var(--gbor);',
        'padding:1px 5px;border-radius:4px;font-size:.88em;font-family:monospace;}',
      '.g-bubble pre{background:var(--gbg);border:1px solid var(--gbor);',
        'padding:8px 10px;border-radius:8px;overflow-x:auto;margin:6px 0;}',
      '.g-bubble pre code{background:none;border:none;padding:0;}',
      '.g-bubble a{color:var(--gp);text-decoration:underline;}',

      '.g-ts{font-size:10px;color:var(--gtm);margin-top:3px;text-align:right;}',
      '.g-msg.bot .g-ts{text-align:left;}',

      /* Typing indicator */
      '.g-typing{display:flex;align-items:center;gap:4px;',
        'padding:10px 13px;background:var(--gbb);border:1px solid var(--gbor);',
        'border-radius:14px;border-bottom-left-radius:4px;',
        'align-self:flex-start;animation:g-fadein .2s ease;}',
      '.g-typing span{width:6px;height:6px;border-radius:50%;background:var(--gtm);animation:g-bounce .9s infinite;}',
      '.g-typing span:nth-child(2){animation-delay:.15s;}',
      '.g-typing span:nth-child(3){animation-delay:.3s;}',
      '@keyframes g-bounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}',

      /* Footer */
      '.g-footer{padding:10px 12px 12px;border-top:1px solid var(--gbor);',
        'background:var(--gsurf);flex-shrink:0;}',
      '.g-input-row{display:flex;gap:8px;align-items:flex-end;}',
      '.g-input{flex:1;background:var(--gsurf2);border:1px solid var(--gbor);',
        'border-radius:12px;padding:9px 12px;',
        'font-size:var(--gfs);color:var(--gt);',
        'resize:none;max-height:100px;overflow-y:auto;',
        'outline:none;font-family:var(--gff);transition:border-color .15s;}',
      '.g-input:focus{border-color:var(--gp);}',
      '.g-input::placeholder{color:var(--gtm);}',
      '.g-input:disabled{opacity:.5;cursor:not-allowed;}',
      '.g-send{width:36px;height:36px;border-radius:10px;flex-shrink:0;',
        'background:var(--gp);border:none;cursor:pointer;',
        'display:flex;align-items:center;justify-content:center;',
        'transition:filter .15s,transform .1s;}',
      '.g-send:hover{filter:brightness(1.12);}',
      '.g-send:active{transform:scale(.95);}',
      '.g-send:disabled{background:var(--gbor);cursor:not-allowed;opacity:.6;}',
      '.g-send svg{width:16px;height:16px;fill:white;}',
      '.g-powered{text-align:center;font-size:10px;color:var(--gtm);margin-top:6px;}',
      '.g-powered a{color:var(--gp);text-decoration:none;}',
      '.g-limit-banner{font-size:11px;color:var(--gtm);text-align:center;',
        'padding:7px 10px;background:var(--gsurf2);border-radius:8px;margin-top:6px;}',
    ].join('');
  }

  // ── Inyectar estilos ───────────────────────────────────────────────────────
  var styleEl = document.createElement('style');
  styleEl.id  = 'gammia-styles';
  styleEl.textContent = buildCSS();
  document.head.appendChild(styleEl);

  // ── Construir DOM ──────────────────────────────────────────────────────────
  var AVATAR_URL = API_BASE + '/static/gammia-avatar.png?v=' + new Date().getTime();

  var ICON_SEND = '<svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>';
  var ICON_CLOSE = '<svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';

  function buildPanel() {
    var panel = document.createElement('div');
    panel.id = 'gammia-widget-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'GammIA chat');

    // Resize handle
    var rh = document.createElement('div');
    rh.className = 'g-resize';
    rh.setAttribute('title', 'Arrastrar para redimensionar');
    panel.appendChild(rh);

    // Header
    var header = document.createElement('div');
    header.className = 'g-header';
    header.innerHTML = [
      '<div class="g-avatar"><img id="g-avatar-img" src="' + AVATAR_URL + '" alt="GammIA" onerror="this.style.display=\'none\'"/></div>',
      '<div class="g-header-info">',
        '<div class="g-header-name" id="g-header-name">GammIA</div>',
        '<div class="g-header-sub"  id="g-header-sub">Asistente Virtual · Gamma Ingenieros</div>',
      '</div>',
      '<div class="g-status"><div class="g-dot"></div>En línea</div>',
      '<button class="g-close-btn" id="g-close" aria-label="Cerrar chat">' + ICON_CLOSE + '</button>',
    ].join('');
    panel.appendChild(header);

    // Interaction counter
    var counter = document.createElement('div');
    counter.className = 'g-counter';
    counter.id = 'g-counter';
    panel.appendChild(counter);

    // Messages
    var msgs = document.createElement('div');
    msgs.className = 'g-msgs';
    msgs.id = 'g-msgs';
    panel.appendChild(msgs);

    // Footer
    var footer = document.createElement('div');
    footer.className = 'g-footer';
    footer.innerHTML = [
      '<div class="g-input-row">',
        '<textarea class="g-input" id="g-input" placeholder="Escribe tu pregunta..." rows="1"',
          ' maxlength="500" aria-label="Mensaje"></textarea>',
        '<button class="g-send" id="g-send" aria-label="Enviar">' + ICON_SEND + '</button>',
      '</div>',
      '<div class="g-powered">',
        'Powered by <a href="https://gammaingenieros.com" target="_blank">Gamma Ingenieros</a> · GammIA AI',
      '</div>',
    ].join('');
    panel.appendChild(footer);

    return panel;
  }

  function buildButton() {
    var btn = document.createElement('button');
    btn.id = 'gammia-widget-btn';
    btn.setAttribute('aria-label', 'Abrir chat GammIA');
    btn.innerHTML = [
      '<img src="' + AVATAR_URL + '" alt="GammIA" onerror="this.style.display=\'none\'"/>',
      '<svg class="g-btn-close" viewBox="0 0 24 24">',
        '<line x1="18" y1="6" x2="6" y2="18"/>',
        '<line x1="6" y1="6" x2="18" y2="18"/>',
      '</svg>',
    ].join('');
    return btn;
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  function nowTime() {
    return new Date().toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
  }

  function addMessage(html, role, isMarkdown) {
    var msgs = document.getElementById('g-msgs');
    if (!msgs) return;
    var wrap = document.createElement('div');
    wrap.className = 'g-msg ' + role;
    var inner = document.createElement('div');
    var bubble = document.createElement('div');
    bubble.className = 'g-bubble';
    if (isMarkdown) {
      bubble.innerHTML = html;
    } else {
      bubble.textContent = html;
    }
    var ts = document.createElement('div');
    ts.className = 'g-ts';
    ts.textContent = nowTime();
    inner.appendChild(bubble);
    inner.appendChild(ts);
    wrap.appendChild(inner);
    msgs.appendChild(wrap);
    msgs.scrollTop = msgs.scrollHeight;
  }

  function showTyping() {
    var msgs = document.getElementById('g-msgs');
    if (!msgs) return;
    var d = document.createElement('div');
    d.id = 'g-typing';
    d.className = 'g-typing';
    d.innerHTML = '<span></span><span></span><span></span>';
    msgs.appendChild(d);
    msgs.scrollTop = msgs.scrollHeight;
  }

  function removeTyping() {
    var t = document.getElementById('g-typing');
    if (t) t.remove();
  }

  function autoResize(el) {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 100) + 'px';
  }

  function updateCounter() {
    var el = document.getElementById('g-counter');
    if (!el) return;
    var remaining = maxInteractions - interactionCount;
    if (remaining > maxInteractions * 0.5) {
      el.textContent = '';
      el.className = 'g-counter';
    } else if (remaining > 2) {
      el.textContent = remaining + ' mensajes restantes';
      el.className = 'g-counter warn';
    } else if (remaining > 0) {
      el.textContent = '⚠️ ' + remaining + ' mensaje' + (remaining === 1 ? '' : 's') + ' restante' + (remaining === 1 ? '' : 's');
      el.className = 'g-counter danger';
    } else {
      el.textContent = 'Límite de conversación alcanzado';
      el.className = 'g-counter danger';
    }
  }

  function lockInput(message) {
    var input   = document.getElementById('g-input');
    var sendBtn = document.getElementById('g-send');
    if (input)   { input.disabled = true; input.placeholder = message || 'Sesión finalizada'; }
    if (sendBtn) sendBtn.disabled = true;
    var footer = document.querySelector('.g-footer');
    if (footer) {
      var banner = document.createElement('div');
      banner.className = 'g-limit-banner';
      banner.textContent = message || 'Has alcanzado el límite de esta sesión.';
      footer.appendChild(banner);
    }
  }

  // ── Aplicar configuración desde API ───────────────────────────────────────
  function applyConfig(cfg) {
    var panel = document.getElementById('gammia-widget-panel');
    var btn   = document.getElementById('gammia-widget-btn');
    if (!panel) return;

    var varMap = {
      '--gp':    cfg.primary_color,
      '--gs':    cfg.secondary_color,
      '--gbg':   cfg.background_color,
      '--gsurf': cfg.surface_color,
      '--gsurf2':cfg.surface2_color,
      '--gub':   cfg.user_bubble_color,
      '--gbb':   cfg.bot_bubble_color,
      '--gt':    cfg.text_color,
      '--gbor':  cfg.border_color,
      '--gff':   cfg.font_family,
      '--gfs':   cfg.font_size,
    };

    Object.keys(varMap).forEach(function(k) {
      if (varMap[k]) panel.style.setProperty(k, varMap[k]);
    });

    // Contraste automático para texto en burbuja de usuario
    if (cfg.user_bubble_color) {
      var hex = cfg.user_bubble_color.replace('#', '');
      var r = parseInt(hex.substr(0,2),16);
      var g = parseInt(hex.substr(2,2),16);
      var b = parseInt(hex.substr(4,2),16);
      var lum = (0.299*r + 0.587*g + 0.114*b) / 255;
      panel.style.setProperty('--gut', lum > 0.5 ? '#111827' : '#ffffff');
    }

    // Dimensiones
    if (cfg.chat_width)  panel.style.width     = cfg.chat_width  + 'px';
    if (cfg.chat_height) panel.style.maxHeight = cfg.chat_height + 'px';

    // Título / subtítulo
    var nameEl = document.getElementById('g-header-name');
    var subEl  = document.getElementById('g-header-sub');
    if (nameEl && cfg.title)    nameEl.textContent = cfg.title;
    if (subEl  && cfg.subtitle) subEl.textContent  = cfg.subtitle;

    // Avatar
    if (cfg.avatar_url) {
      var avatarSrc = cfg.avatar_url.startsWith('http')
        ? cfg.avatar_url
        : API_BASE + cfg.avatar_url + '?v=' + new Date().getTime();
      var avatarImg = document.getElementById('g-avatar-img');
      if (avatarImg) avatarImg.src = avatarSrc;
      if (btn) {
        var btnImg = btn.querySelector('img');
        if (btnImg) btnImg.src = avatarSrc;
      }
    }

    // Límite de interacciones
    if (cfg.max_interactions) maxInteractions = cfg.max_interactions;
  }

  // ── API call ───────────────────────────────────────────────────────────────
  async function sendMessage(text) {
    if (!text.trim() || isTyping) return;
    isTyping = true;

    addMessage(text, 'user', false);
    showTyping();

    var sendBtn = document.getElementById('g-send');
    var input   = document.getElementById('g-input');
    if (sendBtn) sendBtn.disabled = true;

    try {
      var res = await fetch(API_BASE + '/api/v1/widget/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          context: CONTEXT,
          session_id: sessionId,
          widget_secret: SECRET || undefined,
          lang: 'es',
        }),
      });

      var data = await res.json();
      removeTyping();

      if (res.ok) {
        sessionId        = data.session_id;
        interactionCount = data.interaction_count || (interactionCount + 1);
        maxInteractions  = data.max_interactions  || maxInteractions;
        updateCounter();

        addMessage(renderMarkdown(data.reply), 'bot', true);

        if (data.limit_reached) {
          lockInput('Has alcanzado el límite de ' + maxInteractions + ' interacciones de esta sesión.');
        }
      } else {
        addMessage('Ocurrió un error. Por favor intenta de nuevo.', 'bot', false);
      }
    } catch (e) {
      removeTyping();
      addMessage('Sin conexión. Verifica tu internet e intenta de nuevo.', 'bot', false);
    } finally {
      isTyping = false;
      if (sendBtn && !sendBtn.disabled) sendBtn.disabled = false;
      if (input) { input.disabled = false; autoResize(input); }
    }
  }

  // ── Toggle ─────────────────────────────────────────────────────────────────
  function openChat() {
    var panel = document.getElementById('gammia-widget-panel');
    isOpen = true;
    panel.classList.add('g-open');
    setTimeout(function() {
      var inp = document.getElementById('g-input');
      if (inp && !inp.disabled) inp.focus();
    }, 250);
  }

  function closeChat() {
    var panel = document.getElementById('gammia-widget-panel');
    isOpen = false;
    panel.classList.remove('g-open');
  }

  // ── Resize handle logic ────────────────────────────────────────────────────
  function initResize(panel) {
    var rh = panel.querySelector('.g-resize');
    if (!rh) return;
    var startY = 0, startH = 0, resizing = false;

    rh.addEventListener('mousedown', function(e) {
      resizing = true;
      startY = e.clientY;
      startH = panel.offsetHeight;
      document.body.style.userSelect = 'none';
      e.preventDefault();
    });
    document.addEventListener('mousemove', function(e) {
      if (!resizing) return;
      var newH = Math.min(Math.max(startH - (e.clientY - startY), 280), 800);
      panel.style.maxHeight = newH + 'px';
    });
    document.addEventListener('mouseup', function() {
      if (resizing) { resizing = false; document.body.style.userSelect = ''; }
    });

    // Touch support
    rh.addEventListener('touchstart', function(e) {
      resizing = true;
      startY = e.touches[0].clientY;
      startH = panel.offsetHeight;
      e.preventDefault();
    }, { passive: false });
    document.addEventListener('touchmove', function(e) {
      if (!resizing) return;
      var newH = Math.min(Math.max(startH - (e.touches[0].clientY - startY), 280), 800);
      panel.style.maxHeight = newH + 'px';
    });
    document.addEventListener('touchend', function() { resizing = false; });
  }

  // ── Init ───────────────────────────────────────────────────────────────────
  function init() {
    var panel = buildPanel();
    var btn   = buildButton();
    document.body.appendChild(panel);
    document.body.appendChild(btn);

    // Inicializar resize
    initResize(panel);

    // Cargar configuración desde API (async, no bloquea)
    fetch(API_BASE + '/api/v1/widget/config')
      .then(function(r) { return r.json(); })
      .then(function(cfg) { applyConfig(cfg); })
      .catch(function() { /* usa defaults */ });

    // Saludo inicial
    setTimeout(function() {
      var welcome = isInternal
        ? '¡Hola! Soy GammIA, tu asistente de intranet. Tengo acceso a la base de conocimiento interna de Gamma Ingenieros. ¿En qué te puedo ayudar?'
        : '¡Hola! Soy GammIA, asistente virtual de Gamma Ingenieros. Puedo ayudarte con información sobre nuestros servicios de ciberseguridad. ¿Tienes alguna pregunta?';
      addMessage(welcome, 'bot', false);
    }, 400);

    // Actualizar saludo cuando llegue la config
    fetch(API_BASE + '/api/v1/widget/config')
      .then(function(r) { return r.json(); })
      .then(function(cfg) {
        // Solo reemplazar saludo si el primer mensaje aún es el único
        var msgs = document.getElementById('g-msgs');
        if (msgs && msgs.children.length === 1 && cfg) {
          var greet = isInternal ? cfg.greeting_internal : cfg.greeting_public;
          if (greet) {
            msgs.innerHTML = '';
            addMessage(greet, 'bot', false);
          }
        }
      })
      .catch(function() {});

    // Eventos del botón flotante
    btn.addEventListener('click', function() {
      if (isOpen) { closeChat(); btn.classList.remove('g-btn-open'); }
      else        { openChat();  btn.classList.add('g-btn-open'); }
    });

    document.getElementById('g-close').addEventListener('click', function() {
      closeChat();
      btn.classList.remove('g-btn-open');
    });

    var input   = document.getElementById('g-input');
    var sendBtn = document.getElementById('g-send');

    input.addEventListener('input', function() { autoResize(input); });
    input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        var msg = input.value.trim();
        if (msg) { input.value = ''; autoResize(input); sendMessage(msg); }
      }
    });
    sendBtn.addEventListener('click', function() {
      var msg = input.value.trim();
      if (msg) { input.value = ''; autoResize(input); sendMessage(msg); }
    });

    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && isOpen) {
        closeChat();
        btn.classList.remove('g-btn-open');
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
