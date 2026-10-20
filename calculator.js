/* Hesap Makinesi - saf hesaplama motoru + arayüz */
(function (global) {
  'use strict';

  /* =========================
     1) HESAPLAMA MOTORU
     ========================= */

  function tokenize(source) {
    const tokens = [];
    let i = 0;
    const src = String(source);
    while (i < src.length) {
      const ch = src[i];
      if (ch === ' ') { i++; continue; }
      if ((ch >= '0' && ch <= '9') || ch === '.') {
        let num = '';
        while (i < src.length && ((src[i] >= '0' && src[i] <= '9') || src[i] === '.')) {
          num += src[i];
          i++;
        }
        if ((num.match(/\./g) || []).length > 1) throw new Error('Geçersiz sayı');
        if (num === '.') throw new Error('Geçersiz sayı');
        // Bilimsel gosterim destegi: 1e+15, 1.5e-12
        if (src[i] === 'e' || src[i] === 'E') {
          const sign = src[i + 1];
          if (sign === '+' || sign === '-') {
            // Isaret var: us rakamlari gelmezse sayi gecersizdir
            let j = i + 2;
            let digits = '';
            while (j < src.length && src[j] >= '0' && src[j] <= '9') {
              digits += src[j];
              j++;
            }
            if (digits === '') throw new Error('Geçersiz sayı');
            num += 'e' + sign + digits;
            i = j;
          } else if (sign >= '0' && sign <= '9') {
            let j = i + 1;
            let digits = '';
            while (j < src.length && src[j] >= '0' && src[j] <= '9') {
              digits += src[j];
              j++;
            }
            num += 'e' + digits;
            i = j;
          }
          // 'e' rakam veya isaretle devam etmiyorsa normal karakter gibi isleme girer
        }
        const parsed = parseFloat(num);
        if (!isFinite(parsed)) throw new Error('Geçersiz sayı');
        tokens.push({ type: 'number', value: parsed });
        continue;
      }
      if ('+-*/%'.indexOf(ch) !== -1) { tokens.push({ type: 'op', value: ch }); i++; continue; }
      if (ch === '(') { tokens.push({ type: 'lparen' }); i++; continue; }
      if (ch === ')') { tokens.push({ type: 'rparen' }); i++; continue; }
      throw new Error('Geçersiz karakter: ' + ch);
    }
    return tokens;
  }

  function evaluate(source) {
    const tokens = tokenize(source);
    if (tokens.length === 0) throw new Error('Boş ifade');
    let pos = 0;

    const peek = () => tokens[pos];
    const isValueStart = (t) => !!t && (t.type === 'number' || t.type === 'lparen');

    function parsePrimary() {
      const t = peek();
      if (!t) throw new Error('Eksik değer');
      if (t.type === 'number') { pos++; return t.value; }
      if (t.type === 'lparen') {
        pos++;
        const value = parseExpr(null);
        if (!peek() || peek().type !== 'rparen') throw new Error('Parantez kapatılmamış');
        pos++;
        return value;
      }
      throw new Error('Geçersiz ifade');
    }

    function parseUnary() {
      if (peek() && peek().type === 'op' && (peek().value === '+' || peek().value === '-')) {
        const op = tokens[pos++].value;
        const value = parseUnary();
        return op === '-' ? -value : value;
      }
      return parsePrimary();
    }

    function parseFactor(base) {
      let value = parseUnary();
      while (peek() && peek().type === 'op' && peek().value === '%') {
        if (isValueStart(tokens[pos + 1])) break; // ikili yüzde: "a % b"
        pos++;
        value = (base === null || base === undefined) ? value / 100 : (value / 100) * base;
      }
      return value;
    }

    function parseTerm(base) {
      let left = parseFactor(base);
      while (peek() && peek().type === 'op' && ['*', '/', '%'].indexOf(peek().value) !== -1) {
        const op = tokens[pos++].value;
        const right = parseFactor(null);
        if (op === '*') {
          left = left * right;
        } else if (op === '/') {
          if (right === 0) throw new Error('Sıfıra bölünemez');
          left = left / right;
        } else {
          left = (left * right) / 100; // "a % b" -> a*b/100
        }
      }
      return left;
    }

    function parseExpr(base) {
      let left = parseTerm(base);
      while (peek() && peek().type === 'op' && (peek().value === '+' || peek().value === '-')) {
        const op = tokens[pos++].value;
        const right = parseTerm(left);
        left = (op === '+') ? left + right : left - right;
      }
      return left;
    }

    const result = parseExpr(null);
    if (pos < tokens.length) throw new Error('Geçersiz ifade');
    if (!isFinite(result)) throw new Error('Sonuç tanımsız');
    return result;
  }

  function formatNumber(value) {
    if (typeof value !== 'number' || !isFinite(value)) return 'Hata';
    const rounded = Number(value.toPrecision(12));
    const abs = Math.abs(rounded);
    if (abs !== 0 && (abs >= 1e12 || abs < 1e-9)) {
      return rounded.toExponential(); // ornek: 1e+15, 1.5e-12
    }
    return String(rounded);
  }

  // Ekranda gösterim: ondalık ayırıcı olarak virgül
  function formatDisplay(text) {
    return String(text).replace(/\./g, ',');
  }

  const Engine = { tokenize, evaluate, formatNumber, formatDisplay };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Engine;
    return; // Node ortamında yalnızca motoru dışa aktar
  }

  global.CalculatorEngine = Engine;

  /* =========================
     2) ARAYÜZ
     ========================= */

  // Arayuz yalnizca gecerli bir DOM ile baglanir (orn. Node testleri)
  if (typeof document === 'undefined') return;
  if (!document.getElementById('keys')) return;

  const STORAGE_KEY = 'calculator.state.v1';
  const THEME_KEY = 'calculator.theme.v1';

  const els = {
    display: document.getElementById('display'),
    expression: document.getElementById('expression'),
    keys: document.getElementById('keys'),
    historyPanel: document.getElementById('historyPanel'),
    historyList: document.getElementById('historyList'),
    clearHistory: document.getElementById('clearHistory'),
    themeToggle: document.getElementById('themeToggle'),
    themeIcon: document.getElementById('themeIcon')
  };

  const state = {
    expression: '',
    result: '0',
    justEvaluated: false,
    history: []
  };

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        expression: state.expression, result: state.result, history: state.history
      }));
    } catch (e) { /* localStorage kapalı olabilir */ }
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      state.expression = typeof data.expression === 'string' ? data.expression : '';
      state.result = typeof data.result === 'string' ? data.result : '0';
      state.history = Array.isArray(data.history) ? data.history.slice(0, 30) : [];
    } catch (e) { /* bozuk veri */ }
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    if (els.themeIcon) els.themeIcon.textContent = theme === 'light' ? '☀' : '☾';
    try { localStorage.setItem(THEME_KEY, theme); } catch (e) { /* yoksay */ }
  }

  function initTheme() {
    let theme = null;
    try { theme = localStorage.getItem(THEME_KEY); } catch (e) { /* yoksay */ }
    if (!theme) {
      theme = (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) ? 'light' : 'dark';
    }
    applyTheme(theme);
  }

  function render() {
    els.display.textContent = Engine.formatDisplay(state.result);
    els.expression.textContent = state.expression ? Engine.formatDisplay(state.expression) : ' ';
    els.display.classList.remove('is-error');
    renderHistory();
    saveState();
  }

  function showError(message) {
    els.display.textContent = message;
    els.display.classList.add('is-error');
  }

  function renderHistory() {
    const items = state.history;
    els.historyPanel.hidden = items.length === 0;
    els.historyList.innerHTML = '';
    items.forEach((entry) => {
      const li = document.createElement('li');
      li.className = 'history__item';
      li.tabIndex = 0;

      const left = document.createElement('span');
      left.textContent = Engine.formatDisplay(entry.expression);

      const right = document.createElement('b');
      right.textContent = '= ' + Engine.formatDisplay(entry.result);

      li.appendChild(left);
      li.appendChild(right);
      li.addEventListener('click', () => {
        state.expression = entry.expression;
        state.result = entry.result;
        state.justEvaluated = true;
        render();
      });
      // Klavye ile de secilebilir (Enter / Space)
      li.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          state.expression = entry.expression;
          state.result = entry.result;
          state.justEvaluated = true;
          render();
        }
      });
      els.historyList.appendChild(li);
    });
  }

  /* ---- Girdi işlemleri ---- */

  function isOperatorChar(ch) {
    return ch === '+' || ch === '-' || ch === '*' || ch === '/' || ch === '%';
  }

  function inputDigit(digit) {
    if (state.justEvaluated) {
      state.expression = '';
      state.justEvaluated = false;
    }
    state.expression += digit;
    preview();
  }

  function inputDecimal() {
    if (state.justEvaluated) {
      state.expression = '0';
      state.justEvaluated = false;
    }
    const parts = state.expression.split(/[+\-*/%()]/);
    const current = parts[parts.length - 1];
    if (current.indexOf('.') !== -1) return;
    state.expression += (current === '' ? '0.' : '.');
    preview();
  }

  function inputOperator(op) {
    if (state.justEvaluated) {
      state.expression = state.result;
      state.justEvaluated = false;
    }
    const trimmed = state.expression.trim();
    if (trimmed === '') {
      state.expression = '0' + op;
      preview();
      return;
    }
    const last = trimmed[trimmed.length - 1];
    if (isOperatorChar(last)) {
      state.expression = trimmed.slice(0, -1) + op;
    } else {
      state.expression = trimmed + op;
    }
    preview();
  }

  function countOpenParens(text) {
    let open = 0;
    for (const ch of String(text)) {
      if (ch === '(') open++;
      else if (ch === ')') open--;
    }
    return open;
  }

  function inputParenthesis() {
    if (state.justEvaluated) { state.expression = ''; state.justEvaluated = false; }
    // Acik parantez varsa kapat, yoksa ac
    if (countOpenParens(state.expression) > 0) {
      state.expression += ')';
    } else {
      state.expression += '(';
    }
    preview();
  }

  function toggleSign() {
    if (state.justEvaluated) {
      const value = parseFloat(state.result);
      if (isFinite(value)) {
        state.result = Engine.formatNumber(-value);
        render();
      }
      return;
    }
    const trimmed = state.expression.trim();
    if (trimmed === '') {
      state.expression = '(-';
      preview();
      return;
    }
    const match = trimmed.match(/(\d*\.?\d+)$/);
    if (match) {
      state.expression = trimmed.slice(0, match.index) + '(-' + match[0] + ')';
    } else if (trimmed[trimmed.length - 1] === '(') {
      state.expression = trimmed + '-1)';
    } else {
      state.expression = trimmed + '(-1)';
    }
    preview();
  }

  function percent() {
    if (state.justEvaluated) {
      const value = parseFloat(state.result);
      if (isFinite(value)) {
        state.result = Engine.formatNumber(value / 100);
        render();
      }
      return;
    }
    const trimmed = state.expression.trim();
    if (trimmed === '') return;
    state.expression = trimmed + '%';
    preview();
  }

  function clearAll() {
    state.expression = '';
    state.result = '0';
    state.justEvaluated = false;
    render();
  }

  function backspace() {
    if (state.justEvaluated) { clearAll(); return; }
    state.expression = state.expression.slice(0, -1);
    preview();
  }

  function preview() {
    try {
      state.result = Engine.formatNumber(Engine.evaluate(state.expression));
    } catch (e) {
      // Operator ile biten ifade henuz tamamlanmamis: onceki sonucu koru
      if (!/[-+*/%]$/.test(state.expression.trim())) state.result = '0';
    }
    render();
  }

  function equals() {
    const trimmed = state.expression.trim();
    if (trimmed === '') return;
    try {
      const formatted = Engine.formatNumber(Engine.evaluate(trimmed));
      state.result = formatted;
      state.history.unshift({ expression: trimmed, result: formatted });
      state.history = state.history.slice(0, 30);
      // Ifade satiri hesaplanan ifadeyi gosterir; sonuc ise ekranda kalir
      state.expression = trimmed;
      state.justEvaluated = true;
      render();
    } catch (err) {
      showError(err.message || 'Hata');
      state.justEvaluated = false;
    }
  }

  /* ---- Olay bağlama ---- */

  function flash(button) {
    if (!button) return;
    button.classList.add('is-active');
    setTimeout(() => button.classList.remove('is-active'), 110);
  }

  function findKey(attr, value) {
    return els.keys.querySelector('[' + attr + '="' + value + '"]');
  }

  function handleButtonClick(event) {
    const button = event.target.closest('button.key');
    if (!button) return;
    flash(button);

    if (button.dataset.digit !== undefined) {
      inputDigit(button.dataset.digit);
    } else if (button.dataset.op) {
      inputOperator(button.dataset.op);
    } else if (button.dataset.action) {
      switch (button.dataset.action) {
        case 'clear': clearAll(); break;
        case 'sign': toggleSign(); break;
        case 'percent': percent(); break;
        case 'parenthesis': inputParenthesis(); break;
        case 'decimal': inputDecimal(); break;
        case 'equals': equals(); break;
        default: break;
      }
    }
  }

  function handleKeydown(event) {
    const key = event.key;

    if (key >= '0' && key <= '9') {
      inputDigit(key);
      flash(findKey('data-digit', key));
      event.preventDefault();
      return;
    }
    if (key === '.' || key === ',') {
      inputDecimal();
      flash(findKey('data-action', 'decimal'));
      event.preventDefault();
      return;
    }
    if (key === '+' || key === '-' || key === '*' || key === '/') {
      inputOperator(key);
      flash(findKey('data-op', key));
      event.preventDefault();
      return;
    }
    if (key === '%') {
      percent();
      flash(findKey('data-action', 'percent'));
      event.preventDefault();
      return;
    }
    if (key === 'Enter' || key === '=') {
      equals();
      flash(findKey('data-action', 'equals'));
      event.preventDefault();
      return;
    }
    if (key === 'Backspace') {
      backspace();
      event.preventDefault();
      return;
    }
    if (key === 'Escape' || key === 'Delete') {
      clearAll();
      flash(findKey('data-action', 'clear'));
      event.preventDefault();
      return;
    }
    if (key === '(' || key === ')') {
      if (key === '(') {
        inputParenthesis();
      } else {
        // Kapatma tusu: acik parantez varsa kapatir, yoksa yok sayilir
        if (countOpenParens(state.expression) > 0) {
          state.expression += ')';
          preview();
        }
      }
      flash(findKey('data-action', 'parenthesis'));
      event.preventDefault();
    }
  }

  function init() {
    loadState();
    initTheme();
    render();

    els.keys.addEventListener('click', handleButtonClick);
    document.addEventListener('keydown', handleKeydown);
    els.clearHistory.addEventListener('click', () => {
      state.history = [];
      render();
    });
    els.themeToggle.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme');
      applyTheme(current === 'light' ? 'dark' : 'light');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})(typeof window !== 'undefined' ? window : globalThis);
