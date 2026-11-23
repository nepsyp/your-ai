const $ = (id) => document.getElementById(id);
const messages = $("messages");
const badge = $("mode-badge");

const history = [];
let speakReplies = false;

/* ---------- tabs ---------- */
document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active-panel"));
    tab.classList.add("active");
    $(`tab-${tab.dataset.tab}`).classList.add("active-panel");
  });
});

/* ---------- health badge ---------- */
async function fetchHealth() {
  try {
    const res = await fetch("/api/health");
    const data = await res.json();
    if (data.demo_mode) {
      badge.textContent = "demo mode — no API key";
      badge.className = "badge demo";
    } else {
      badge.textContent = `live · ${data.chat_model}`;
      badge.className = "badge live";
    }
  } catch {
    badge.textContent = "server unreachable";
  }
}

/* ---------- chat ---------- */
const input = $("input");
const send = $("send");

function addBubble(role, text, cls) {
  const div = document.createElement("div");
  div.className = `msg ${role}${cls ? " " + cls : ""}`;
  div.textContent = text;
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
  return div;
}

function autosize(el) {
  el.style.height = "auto";
  el.style.height = Math.min(el.scrollHeight, 160) + "px";
}

input.addEventListener("input", () => autosize(input));
input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    $("chat-form").requestSubmit();
  }
});

$("chat-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text || send.disabled) return;

  input.value = "";
  autosize(input);
  addBubble("user", text);
  history.push({ role: "user", content: text });

  const reply = addBubble("assistant", "", "typing");
  send.disabled = true;

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text, history: history.slice(0, -1) }),
    });

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
        if (!line.startsWith("data: ")) continue;
        const payload = line.slice(6).trim();
        if (payload === "[DONE]") continue;
        try {
          const data = JSON.parse(payload);
          if (data.error) {
            reply.classList.add("error");
            reply.textContent += data.error;
          } else if (data.delta) {
            full += data.delta;
            reply.textContent = full;
            messages.scrollTop = messages.scrollHeight;
          }
        } catch { /* skip malformed frame */ }
      }
    }

    if (!full && !reply.textContent) reply.textContent = "(no response)";
    if (full) {
      history.push({ role: "assistant", content: full });
      if (speakReplies) browserSpeak(full);
    }
  } catch (err) {
    reply.classList.add("error");
    reply.textContent = "Network error: " + err.message;
  } finally {
    reply.classList.remove("typing");
    send.disabled = false;
    input.focus();
  }
});

/* ---------- browser voice (no key needed) ---------- */
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

function startRecognition(onResult) {
  if (!SpeechRecognition) {
    alert("Speech recognition is not supported in this browser. Try Chrome or Edge.");
    return null;
  }
  const rec = new SpeechRecognition();
  rec.lang = navigator.language || "bn-BD";
  rec.interimResults = false;
  rec.maxAlternatives = 1;
  rec.onresult = (e) => onResult(e.results[0][0].transcript);
  rec.start();
  return rec;
}

let chatMic = null;
$("mic").addEventListener("click", () => {
  if (chatMic) { chatMic.stop(); return; }
  chatMic = startRecognition((text) => { input.value += text; autosize(input); });
  if (chatMic) {
    chatMic.onend = () => { chatMic = null; };
    input.focus();
  }
});

let speakMic = null;
$("voice-mic").addEventListener("click", () => {
  const status = $("voice-status");
  if (speakMic) { speakMic.stop(); return; }
  status.textContent = "listening…";
  speakMic = startRecognition((text) => {
    $("voice-text").value += ($("voice-text").value ? " " : "") + text;
    status.textContent = "done";
  });
  if (speakMic) speakMic.onend = () => { speakMic = null; };
});

function browserSpeak(text) {
  if (!window.speechSynthesis) return alert("Speech synthesis is not supported in this browser.");
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = navigator.language || "bn-BD";
  window.speechSynthesis.speak(utter);
}

$("speak-toggle").addEventListener("click", (e) => {
  speakReplies = !speakReplies;
  e.currentTarget.textContent = speakReplies ? "🔊" : "🔇";
  e.currentTarget.title = speakReplies ? "Replies are read aloud (click to stop)" : "Read replies aloud (browser)";
});

$("tts-browser").addEventListener("click", () => {
  const text = $("tts-text").value.trim();
  if (text) browserSpeak(text);
});

$("tts-server").addEventListener("click", async () => {
  const text = $("tts-text").value.trim();
  if (!text) return;
  try {
    const res = await fetch("/api/speech", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) throw new Error((await res.json()).detail || res.statusText);
    $("tts-audio").src = URL.createObjectURL(await res.blob());
    $("tts-audio").play();
  } catch (err) {
    alert(err.message);
  }
});

$("voice-upload").addEventListener("click", async () => {
  const file = $("voice-file").files[0];
  if (!file) return alert("Choose an audio file first.");
  const form = new FormData();
  form.append("file", file);
  try {
    const res = await fetch("/api/transcribe", { method: "POST", body: form });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || res.statusText);
    $("voice-text").value += ($("voice-text").value ? " " : "") + data.text;
  } catch (err) {
    alert(err.message);
  }
});

/* ---------- image ---------- */
$("image-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const prompt = $("image-prompt").value.trim();
  if (!prompt) return;
  const result = $("image-result");
  result.innerHTML = '<p class="muted">Generating…</p>';
  try {
    const res = await fetch("/api/images", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, size: $("image-size").value }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || res.statusText);
    result.innerHTML = "";
    const img = document.createElement("img");
    img.src = data.image;
    img.alt = prompt;
    result.appendChild(img);
    if (data.demo) result.appendChild(Object.assign(document.createElement("p"), { className: "muted", textContent: "Demo placeholder — set IMAGE_API_KEY for real AI art." }));
  } catch (err) {
    result.innerHTML = `<p class="error">${err.message}</p>`;
  }
});

/* ---------- video ---------- */
$("video-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const prompt = $("video-prompt").value.trim();
  if (!prompt) return;
  const result = $("video-result");
  result.innerHTML = '<p class="muted">Submitting…</p>';
  try {
    const res = await fetch("/api/videos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || res.statusText);
    pollVideo(data.id, result);
  } catch (err) {
    result.innerHTML = `<p class="error">${err.message}</p>`;
  }
});

async function pollVideo(jobId, container) {
  while (true) {
    const res = await fetch(`/api/videos/${jobId}`);
    const data = await res.json();
    if (!res.ok) { container.innerHTML = `<p class="error">${data.detail || "failed"}</p>`; return; }
    if (data.status === "completed" && data.video) {
      container.innerHTML = "";
      const video = document.createElement("video");
      video.src = data.video;
      video.controls = true;
      video.className = "full";
      container.appendChild(video);
      return;
    }
    container.innerHTML = `<p class="muted">Status: ${data.status}…</p>`;
    await new Promise((r) => setTimeout(r, 5000));
  }
}

/* ---------- translate ---------- */
$("translate-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = $("translate-text").value.trim();
  const lang = $("translate-lang").value.trim();
  if (!text || !lang) return;
  const result = $("translate-result");
  result.innerHTML = '<p class="muted">Translating…</p>';
  try {
    const res = await fetch("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, target_language: lang }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || res.statusText);
    result.innerHTML = "";
    const p = document.createElement("p");
    p.textContent = data.text;
    result.appendChild(p);
    if (data.demo) result.appendChild(Object.assign(document.createElement("p"), { className: "muted", textContent: data.detail }));
  } catch (err) {
    result.innerHTML = `<p class="error">${err.message}</p>`;
  }
});

fetchHealth();
input.focus();
