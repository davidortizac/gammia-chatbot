/**
 * GammIA Chatbot Widget v1.0
 * ─────────────────────────────────────────────────────────────────────────────
 * Embed en sitio corporativo (contexto público):
 *   <script src="https://gammia-api-1028680563477.us-central1.run.app/static/gammia-widget.js"
 *           data-context="public">
 *   </script>
 *
 * Embed en Google Sites / Intranet (contexto interno):
 *   <script src="https://gammia-api-1028680563477.us-central1.run.app/static/gammia-widget.js"
 *           data-context="internal"
 *           data-secret="TU_WIDGET_SECRET">
 *   </script>
 *
 * Para Google Sites, usa "Insertar → Embed → Por código" y pega:
 *   <script src="..." data-context="internal" data-secret="..."></script>
 * ─────────────────────────────────────────────────────────────────────────────
 */
(function () {
  'use strict';

  // ── Configuración desde atributos del script tag ───────────────────────────
  const scriptTag = document.currentScript || (function () {
    const scripts = document.querySelectorAll('script[data-context]');
    return scripts[scripts.length - 1];
  })();

  const API_BASE  = (scriptTag && scriptTag.getAttribute('data-api'))
    || 'https://gammia-api-1028680563477.us-central1.run.app';
  const CONTEXT   = (scriptTag && scriptTag.getAttribute('data-context')) || 'public';
  const SECRET    = (scriptTag && scriptTag.getAttribute('data-secret'))  || '';
  const POSITION  = (scriptTag && scriptTag.getAttribute('data-position')) || 'right'; // 'left'|'right'
  const THEME     = (scriptTag && scriptTag.getAttribute('data-theme'))    || 'dark';  // 'dark'|'light'

  const isInternal = CONTEXT === 'internal' || CONTEXT === 'intranet';
  const BOT_NAME   = isInternal ? 'GammIA Intranet' : 'GammIA';
  const BOT_SUB    = isInternal ? 'Asistente Interno · Gamma Ingenieros' : 'Asistente Virtual · Gamma Ingenieros';

  // ── Paleta de colores ──────────────────────────────────────────────────────
  const palette = {
    dark: {
      bg:        '#0B1120',
      surface:   '#111827',
      surface2:  '#1E293B',
      border:    '#1E293B',
      accent:    '#10B981',
      accentDim: '#065F46',
      text:      '#E2E8F0',
      textMuted: '#64748B',
      userBg:    '#10B981',
      userText:  '#022C22',
      botBg:     '#1E293B',
      botText:   '#CBD5E1',
      inputBg:   '#1E293B',
      shadow:    'rgba(0,0,0,0.5)',
    },
    light: {
      bg:        '#F8FAFC',
      surface:   '#FFFFFF',
      surface2:  '#F1F5F9',
      border:    '#E2E8F0',
      accent:    '#059669',
      accentDim: '#D1FAE5',
      text:      '#0F172A',
      textMuted: '#94A3B8',
      userBg:    '#059669',
      userText:  '#FFFFFF',
      botBg:     '#F1F5F9',
      botText:   '#334155',
      inputBg:   '#FFFFFF',
      shadow:    'rgba(0,0,0,0.12)',
    }
  };
  const p = palette[THEME] || palette.dark;

  // ── Estado ─────────────────────────────────────────────────────────────────
  let isOpen      = false;
  let isTyping    = false;
  let sessionId   = null;
  let msgHistory  = [];

  // ── Estilos ────────────────────────────────────────────────────────────────
  const style = document.createElement('style');
  style.textContent = `
    #gammia-widget-btn {
      position: fixed;
      ${POSITION === 'left' ? 'left: 24px;' : 'right: 24px;'}
      bottom: 24px;
      width: 56px; height: 56px;
      border-radius: 50%;
      background: linear-gradient(135deg, ${p.accent}, #059669);
      border: none;
      cursor: pointer;
      box-shadow: 0 4px 20px ${p.shadow}, 0 0 0 0 ${p.accent}40;
      display: flex; align-items: center; justify-content: center;
      z-index: 999998;
      transition: transform .2s, box-shadow .2s;
      animation: gammia-pulse 2.5s infinite;
    }
    #gammia-widget-btn:hover { transform: scale(1.1); box-shadow: 0 6px 28px ${p.shadow}; }
    #gammia-widget-btn svg { width: 26px; height: 26px; fill: white; }

    @keyframes gammia-pulse {
      0%,100% { box-shadow: 0 4px 20px ${p.shadow}, 0 0 0 0 ${p.accent}60; }
      50%      { box-shadow: 0 4px 20px ${p.shadow}, 0 0 0 10px ${p.accent}00; }
    }

    #gammia-widget-panel {
      position: fixed;
      ${POSITION === 'left' ? 'left: 16px;' : 'right: 16px;'}
      bottom: 90px;
      width: 370px;
      max-height: 560px;
      border-radius: 20px;
      background: ${p.surface};
      border: 1px solid ${p.border};
      box-shadow: 0 20px 60px ${p.shadow};
      display: flex; flex-direction: column;
      overflow: hidden;
      z-index: 999997;
      transform: scale(0.92) translateY(16px);
      opacity: 0;
      pointer-events: none;
      transition: transform .25s cubic-bezier(.34,1.56,.64,1), opacity .2s ease;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }
    #gammia-widget-panel.gammia-open {
      transform: scale(1) translateY(0);
      opacity: 1;
      pointer-events: all;
    }

    @media (max-width: 480px) {
      #gammia-widget-panel { width: calc(100vw - 32px); bottom: 80px; }
    }

    .gammia-header {
      background: linear-gradient(135deg, #064E3B, ${p.accentDim}, ${p.surface});
      padding: 14px 16px;
      display: flex; align-items: center; gap: 10px;
      border-bottom: 1px solid ${p.border};
      flex-shrink: 0;
    }
    .gammia-avatar {
      width: 36px; height: 36px; border-radius: 50%;
      background: linear-gradient(135deg, ${p.accent}, #059669);
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
    }
    .gammia-avatar svg { width: 18px; height: 18px; fill: white; }
    .gammia-header-info { flex: 1; }
    .gammia-header-name { font-size: 14px; font-weight: 700; color: ${p.text}; }
    .gammia-header-sub  { font-size: 11px; color: ${p.accent}; margin-top: 1px; }
    .gammia-status {
      display: flex; align-items: center; gap: 5px;
      font-size: 10px; color: ${p.accent}; font-weight: 600;
    }
    .gammia-dot {
      width: 6px; height: 6px; border-radius: 50%; background: ${p.accent};
      animation: gammia-blink 1.4s infinite;
    }
    @keyframes gammia-blink { 0%,100%{opacity:1} 50%{opacity:.3} }

    .gammia-close-btn {
      background: none; border: none; cursor: pointer;
      color: ${p.textMuted}; padding: 4px; border-radius: 6px;
      display: flex; align-items: center; justify-content: center;
      transition: background .15s, color .15s;
    }
    .gammia-close-btn:hover { background: ${p.surface2}; color: ${p.text}; }
    .gammia-close-btn svg { width: 16px; height: 16px; stroke: currentColor; fill: none; }

    .gammia-messages {
      flex: 1; overflow-y: auto; padding: 14px;
      display: flex; flex-direction: column; gap: 10px;
      scroll-behavior: smooth;
    }
    .gammia-messages::-webkit-scrollbar { width: 4px; }
    .gammia-messages::-webkit-scrollbar-track { background: transparent; }
    .gammia-messages::-webkit-scrollbar-thumb { background: ${p.border}; border-radius: 2px; }

    .gammia-msg { display: flex; gap: 8px; max-width: 85%; animation: gammia-fadein .2s ease; }
    @keyframes gammia-fadein { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:none} }

    .gammia-msg.user  { flex-direction: row-reverse; align-self: flex-end; }
    .gammia-msg.bot   { align-self: flex-start; }

    .gammia-bubble {
      padding: 10px 13px; border-radius: 14px;
      font-size: 13px; line-height: 1.5; max-width: 100%;
      word-break: break-word; white-space: pre-wrap;
    }
    .gammia-msg.user .gammia-bubble {
      background: ${p.userBg}; color: ${p.userText};
      border-bottom-right-radius: 4px;
    }
    .gammia-msg.bot .gammia-bubble {
      background: ${p.botBg}; color: ${p.botText};
      border-bottom-left-radius: 4px;
      border: 1px solid ${p.border};
    }
    .gammia-timestamp {
      font-size: 10px; color: ${p.textMuted};
      margin-top: 3px; text-align: right;
    }
    .gammia-msg.bot .gammia-timestamp { text-align: left; }

    .gammia-typing {
      display: flex; align-items: center; gap: 4px;
      padding: 10px 13px; background: ${p.botBg};
      border: 1px solid ${p.border};
      border-radius: 14px; border-bottom-left-radius: 4px;
      align-self: flex-start; animation: gammia-fadein .2s ease;
    }
    .gammia-typing span {
      width: 6px; height: 6px; border-radius: 50%; background: ${p.textMuted};
      animation: gammia-bounce .9s infinite;
    }
    .gammia-typing span:nth-child(2) { animation-delay: .15s; }
    .gammia-typing span:nth-child(3) { animation-delay: .3s; }
    @keyframes gammia-bounce {
      0%,100%{transform:translateY(0)} 50%{transform:translateY(-5px)}
    }

    .gammia-footer {
      padding: 10px 12px 12px;
      border-top: 1px solid ${p.border};
      background: ${p.surface};
      flex-shrink: 0;
    }
    .gammia-input-row {
      display: flex; gap: 8px; align-items: flex-end;
    }
    .gammia-input {
      flex: 1;
      background: ${p.inputBg};
      border: 1px solid ${p.border};
      border-radius: 12px;
      padding: 9px 12px;
      font-size: 13px; color: ${p.text};
      resize: none; max-height: 100px; overflow-y: auto;
      outline: none; font-family: inherit;
      transition: border-color .15s;
    }
    .gammia-input:focus { border-color: ${p.accent}; }
    .gammia-input::placeholder { color: ${p.textMuted}; }

    .gammia-send-btn {
      width: 36px; height: 36px; border-radius: 10px; flex-shrink: 0;
      background: ${p.accent}; border: none; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      transition: background .15s, transform .1s;
    }
    .gammia-send-btn:hover   { background: #059669; }
    .gammia-send-btn:active  { transform: scale(.95); }
    .gammia-send-btn:disabled { background: ${p.border}; cursor: not-allowed; }
    .gammia-send-btn svg { width: 16px; height: 16px; fill: white; }

    .gammia-powered {
      text-align: center; font-size: 10px; color: ${p.textMuted};
      margin-top: 6px;
    }
    .gammia-powered a { color: ${p.accent}; text-decoration: none; }
  `;
  document.head.appendChild(style);

  // ── SVG Icons ──────────────────────────────────────────────────────────────
  const ICON_BOT  = `<svg viewBox="0 0 24 24"><path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7H3a7 7 0 0 1 7-7h1V5.73A2 2 0 0 1 10 4a2 2 0 0 1 2-2zM5 14v1a7 7 0 0 0 14 0v-1H5zm4 2h2v1H9v-1zm4 0h2v1h-2v-1z"/></svg>`;
  const ICON_SEND = `<svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>`;
  const ICON_CLOSE = `<svg viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;

  // ── DOM ────────────────────────────────────────────────────────────────────
  function buildPanel() {
    const panel = document.createElement('div');
    panel.id = 'gammia-widget-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', `${BOT_NAME} chat`);
    panel.innerHTML = `
      <div class="gammia-header">
        <div class="gammia-avatar">${ICON_BOT}</div>
        <div class="gammia-header-info">
          <div class="gammia-header-name">${BOT_NAME}</div>
          <div class="gammia-header-sub">${BOT_SUB}</div>
        </div>
        <div class="gammia-status"><div class="gammia-dot"></div>En línea</div>
        <button class="gammia-close-btn" id="gammia-close" aria-label="Cerrar chat">${ICON_CLOSE}</button>
      </div>
      <div class="gammia-messages" id="gammia-messages"></div>
      <div class="gammia-footer">
        <div class="gammia-input-row">
          <textarea class="gammia-input" id="gammia-input"
            placeholder="Escribe tu pregunta..." rows="1"
            maxlength="500" aria-label="Mensaje"></textarea>
          <button class="gammia-send-btn" id="gammia-send" aria-label="Enviar">${ICON_SEND}</button>
        </div>
        <div class="gammia-powered">
          Powered by <a href="https://gammaingenieros.com" target="_blank">Gamma Ingenieros</a> · GammIA AI
        </div>
      </div>
    `;
    return panel;
  }

  function buildButton() {
    const btn = document.createElement('button');
    btn.id = 'gammia-widget-btn';
    btn.setAttribute('aria-label', 'Abrir chat GammIA');
    btn.innerHTML = ICON_BOT;
    return btn;
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  function now() {
    return new Date().toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
  }

  function addMessage(text, role) {
    const msgs = document.getElementById('gammia-messages');
    if (!msgs) return;
    const wrap = document.createElement('div');
    wrap.className = `gammia-msg ${role}`;
    wrap.innerHTML = `
      <div>
        <div class="gammia-bubble">${text.replace(/</g,'&lt;').replace(/\n/g,'<br>')}</div>
        <div class="gammia-timestamp">${now()}</div>
      </div>`;
    msgs.appendChild(wrap);
    msgs.scrollTop = msgs.scrollHeight;
  }

  function showTyping() {
    const msgs = document.getElementById('gammia-messages');
    const d = document.createElement('div');
    d.id = 'gammia-typing';
    d.className = 'gammia-typing';
    d.innerHTML = '<span></span><span></span><span></span>';
    msgs.appendChild(d);
    msgs.scrollTop = msgs.scrollHeight;
  }

  function removeTyping() {
    const t = document.getElementById('gammia-typing');
    if (t) t.remove();
  }

  function autoResize(el) {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 100) + 'px';
  }

  // ── API Call ───────────────────────────────────────────────────────────────
  async function sendMessage(text) {
    if (!text.trim() || isTyping) return;
    isTyping = true;

    addMessage(text, 'user');
    showTyping();

    const sendBtn = document.getElementById('gammia-send');
    if (sendBtn) sendBtn.disabled = true;

    try {
      const res = await fetch(`${API_BASE}/api/v1/widget/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          context: CONTEXT,
          session_id: sessionId,
          widget_secret: SECRET || undefined,
          lang: 'es'
        })
      });

      const data = await res.json();
      removeTyping();

      if (res.ok) {
        sessionId = data.session_id;
        addMessage(data.reply, 'bot');
      } else {
        addMessage('Ocurrió un error. Por favor intenta de nuevo.', 'bot');
      }
    } catch (e) {
      removeTyping();
      addMessage('Sin conexión. Verifica tu internet e intenta de nuevo.', 'bot');
    } finally {
      isTyping = false;
      if (sendBtn) sendBtn.disabled = false;
    }
  }

  // ── Toggle ─────────────────────────────────────────────────────────────────
  function openChat() {
    const panel = document.getElementById('gammia-widget-panel');
    isOpen = true;
    panel.classList.add('gammia-open');
    setTimeout(() => {
      const input = document.getElementById('gammia-input');
      if (input) input.focus();
    }, 250);
  }

  function closeChat() {
    const panel = document.getElementById('gammia-widget-panel');
    isOpen = false;
    panel.classList.remove('gammia-open');
  }

  // ── Init ───────────────────────────────────────────────────────────────────
  function init() {
    const panel = buildPanel();
    const btn   = buildButton();
    document.body.appendChild(panel);
    document.body.appendChild(btn);

    // Welcome message
    setTimeout(() => {
      const welcome = isInternal
        ? `¡Hola! Soy GammIA, tu asistente de intranet. Tengo acceso a la base de conocimiento interna de Gamma Ingenieros. ¿En qué te puedo ayudar?`
        : `¡Hola! Soy GammIA, asistente virtual de Gamma Ingenieros. Puedo ayudarte con información sobre nuestros servicios de ciberseguridad. ¿Tienes alguna pregunta?`;
      addMessage(welcome, 'bot');
    }, 300);

    // Events
    btn.addEventListener('click', () => isOpen ? closeChat() : openChat());
    document.getElementById('gammia-close').addEventListener('click', closeChat);

    const input = document.getElementById('gammia-input');
    const sendBtn = document.getElementById('gammia-send');

    input.addEventListener('input', () => autoResize(input));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const msg = input.value.trim();
        if (msg) { input.value = ''; autoResize(input); sendMessage(msg); }
      }
    });
    sendBtn.addEventListener('click', () => {
      const msg = input.value.trim();
      if (msg) { input.value = ''; autoResize(input); sendMessage(msg); }
    });

    // Cerrar con Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isOpen) closeChat();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
