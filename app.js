(() => {
  "use strict";

  const API_URL = "https://api.mistral.ai/v1/chat/completions";
  const STORAGE = { key: "yourai.apikey", model: "yourai.model", history: "yourai.history" };
  const SYSTEM_PROMPT =
    "You are 'your-ai', a helpful, friendly assistant. Reply in the same language the user writes in — " +
    "if they write in Bengali, reply in Bengali. Use Markdown code blocks for code.";

  const els = {
    chat: document.getElementById("chat"),
    messages: document.getElementById("messages"),
    welcome: document.getElementById("welcome"),
    input: document.getElementById("input"),
    sendBtn: document.getElementById("send-btn"),
    stopBtn: document.getElementById("stop-btn"),
    newChatBtn: document.getElementById("new-chat-btn"),
    settingsBtn: document.getElementById("settings-btn"),
    settingsModal: document.getElementById("settings-modal"),
    apiKey: document.getElementById("api-key"),
    toggleKey: document.getElementById("toggle-key"),
    settingsSave: document.getElementById("settings-save"),
    clearHistory: document.getElementById("clear-history"),
    modelSelect: document.getElementById("model-select"),
  };

  let history = [];
  let controller = null;
  let streaming = false;

  const load = (k, fallback) => {
    try { return localStorage.getItem(k) ?? fallback; } catch { return fallback; }
  };
  const save = (k, v) => {
    try { localStorage.setItem(k, v); } catch { /* storage unavailable */ }
  };

  function restore() {
    els.modelSelect.value = load(STORAGE.model, "mistral-small-latest");
    loadHistory();
    if (!load(STORAGE.key, "")) openSettings();
  }

  function loadHistory() {
    try {
      history = JSON.parse(load(STORAGE.history, "[]")) || [];
    } catch {
      history = [];
    }
    if (history.length) {
      hideWelcome();
      for (const m of history) {
        appendMessage(m.role === "user" ? "user" : "ai", m.content, { save: false });
      }
    }
  }

  function persist() {
    save(STORAGE.history, JSON.stringify(history.slice(-60)));
  }

  function hideWelcome() { els.welcome.classList.add("hidden"); }
  function showWelcome() { els.welcome.classList.remove("hidden"); }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[c]);
  }

  function formatContent(text) {
    let html = escapeHtml(text);
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_m, lang, code) =>
      `<pre><code data-lang="${lang}">${code.replace(/\n$/, "")}</code></pre>`
    );
    html = html.replace(/`([^`\n]+)`/g, "<code>$1</code>");
    html = html.replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>");
    return html;
  }

  function appendMessage(role, content, { save: doSave = true } = {}) {
    const div = document.createElement("div");
    div.className = `msg ${role}`;
    div.innerHTML = formatContent(content);
    if (doSave && role !== "error") {
      history.push({ role: role === "user" ? "user" : "assistant", content });
      persist();
    }
    els.messages.appendChild(div);
    els.chat.scrollTop = els.chat.scrollHeight;
    return div;
  }

  function openSettings() {
    els.apiKey.value = load(STORAGE.key, "");
    els.settingsModal.classList.remove("hidden");
  }

  function closeSettings() {
    els.settingsModal.classList.add("hidden");
  }

  function ensureKey() {
    const key = load(STORAGE.key, "");
    if (!key) {
      openSettings();
      appendMessage("error", "⚠️ চ্যাট শুরু করার আগে Mistral API key দিন। ফ্রি key পেতে console.mistral.ai-তে যান।");
      return null;
    }
    return key;
  }

  function setBusy(busy) {
    streaming = busy;
    els.sendBtn.classList.toggle("hidden", busy);
    els.stopBtn.classList.toggle("hidden", !busy);
    els.input.disabled = busy;
  }

  async function sendMessage(text) {
    const key = ensureKey();
    if (!key || streaming) return;

    hideWelcome();
    appendMessage("user", text);

    const aiDiv = appendMessage("ai", "", { save: false });
    aiDiv.classList.add("streaming");
    aiDiv.textContent = "";
    setBusy(true);
    controller = new AbortController();

    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: els.modelSelect.value,
          stream: true,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            ...history.slice(-20),
          ],
        }),
      });

      if (!res.ok) {
        let detail = "";
        try {
          const err = await res.json();
          detail = err.message || JSON.stringify(err);
        } catch { /* non-JSON error body */ }
        throw new Error(`API ত্রুটি (${res.status}): ${detail || res.statusText}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let full = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop();

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const data = trimmed.slice(5).trim();
          if (data === "[DONE]") continue;
          try {
            const json = JSON.parse(data);
            const delta = json.choices?.[0]?.delta?.content;
            if (delta) {
              full += delta;
              aiDiv.innerHTML = formatContent(full);
              els.chat.scrollTop = els.chat.scrollHeight;
            }
          } catch { /* skip malformed chunk */ }
        }
      }

      aiDiv.classList.remove("streaming");
      if (full) {
        history.push({ role: "assistant", content: full });
        persist();
      } else {
        aiDiv.remove();
      }
    } catch (err) {
      aiDiv.classList.remove("streaming");
      if (err.name === "AbortError") {
        if (!aiDiv.textContent) aiDiv.remove();
      } else {
        aiDiv.remove();
        appendMessage("error", `⚠️ ${err.message}\n\nচেক করুন: API key সঠিক আছে কি না, এবং ইন্টারনেট সংযোগ আছে কি না।`);
      }
    } finally {
      setBusy(false);
      controller = null;
      els.input.focus();
    }
  }

  /* ---------- Events ---------- */

  function autoResize() {
    els.input.style.height = "auto";
    els.input.style.height = Math.min(els.input.scrollHeight, 160) + "px";
  }

  els.sendBtn.addEventListener("click", () => {
    const text = els.input.value.trim();
    if (!text) return;
    els.input.value = "";
    autoResize();
    sendMessage(text);
  });

  els.input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      els.sendBtn.click();
    }
  });
  els.input.addEventListener("input", autoResize);

  els.stopBtn.addEventListener("click", () => controller?.abort());

  els.newChatBtn.addEventListener("click", () => {
    if (streaming) controller?.abort();
    history = [];
    persist();
    els.messages.innerHTML = "";
    showWelcome();
  });

  document.querySelectorAll(".suggestion").forEach((btn) =>
    btn.addEventListener("click", () => sendMessage(btn.textContent))
  );

  els.modelSelect.addEventListener("change", () => save(STORAGE.model, els.modelSelect.value));

  els.settingsBtn.addEventListener("click", openSettings);
  els.settingsSave.addEventListener("click", () => {
    const key = els.apiKey.value.trim();
    if (key) save(STORAGE.key, key);
    closeSettings();
  });
  els.toggleKey.addEventListener("click", () => {
    els.apiKey.type = els.apiKey.type === "password" ? "text" : "password";
  });
  els.clearHistory.addEventListener("click", () => {
    history = [];
    persist();
    els.messages.innerHTML = "";
    showWelcome();
    closeSettings();
  });
  els.settingsModal.addEventListener("click", (e) => {
    if (e.target === els.settingsModal) closeSettings();
  });

  restore();
})();
