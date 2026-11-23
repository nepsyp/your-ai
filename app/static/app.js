const form = document.getElementById("chat-form");
const input = document.getElementById("input");
const send = document.getElementById("send");
const messages = document.getElementById("messages");
const badge = document.getElementById("mode-badge");

const history = [];

function addBubble(role, text, cls) {
  const div = document.createElement("div");
  div.className = `msg ${role}${cls ? " " + cls : ""}`;
  div.textContent = text;
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
  return div;
}

async function fetchHealth() {
  try {
    const res = await fetch("/api/health");
    const data = await res.json();
    if (data.demo_mode) {
      badge.textContent = "demo mode — no API key";
      badge.className = "badge demo";
    } else {
      badge.textContent = `live · ${data.model}`;
      badge.className = "badge live";
    }
  } catch {
    badge.textContent = "server unreachable";
  }
}

function autosize() {
  input.style.height = "auto";
  input.style.height = Math.min(input.scrollHeight, 160) + "px";
}

input.addEventListener("input", autosize);

input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    form.requestSubmit();
  }
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text || send.disabled) return;

  input.value = "";
  autosize();
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
            reply.textContent = data.error;
          } else if (data.delta) {
            full += data.delta;
            reply.textContent = full;
            messages.scrollTop = messages.scrollHeight;
          }
        } catch { /* skip malformed frame */ }
      }
    }

    if (!full && !reply.textContent) reply.textContent = "(no response)";
    if (full) history.push({ role: "assistant", content: full });
  } catch (err) {
    reply.classList.add("error");
    reply.textContent = "Network error: " + err.message;
  } finally {
    reply.classList.remove("typing");
    send.disabled = false;
    input.focus();
  }
});

fetchHealth();
input.focus();
