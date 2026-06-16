export const baseUrl = "";

export async function parseJsonResponse(response) {
  const raw = await response.text();
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(
      "Server returned an invalid response. Make sure the backend server (python main.py) is running on port 5000."
    );
  }
}

export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const base64 = result.includes(",") ? result.split(",")[1] : result;
      resolve(base64);
    };
    reader.onerror = () => reject(new Error("Could not read the PDF file"));
    reader.readAsDataURL(file);
  });
}

export function escapeHtml(text) {
  if (typeof text !== "string") return text;
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function formatInline(text) {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
}

export function markdownToHtml(markdown) {
  if (!markdown) return "";
  const lines = markdown.split(/\r?\n/);
  const html = [];
  let listType = null;
  let inCode = false;
  let codeLines = [];

  function closeList() {
    if (listType) {
      html.push(`</${listType}>`);
      listType = null;
    }
  }

  lines.forEach((line) => {
    if (line.trim().startsWith("```")) {
      if (inCode) {
        html.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
        codeLines = [];
        inCode = false;
      } else {
        closeList();
        inCode = true;
      }
      return;
    }

    if (inCode) {
      codeLines.push(line);
      return;
    }

    const heading = line.match(/^#{1,3}\s+(.+)$/);
    if (heading) {
      closeList();
      html.push(`<h3>${formatInline(heading[1])}</h3>`);
      return;
    }

    const ordered = line.match(/^\d+\.\s+(.+)$/);
    if (ordered) {
      if (listType !== "ol") {
        closeList();
        html.push("<ol>");
        listType = "ol";
      }
      html.push(`<li>${formatInline(ordered[1])}</li>`);
      return;
    }

    const unordered = line.match(/^[-*]\s+(.+)$/);
    if (unordered) {
      if (listType !== "ul") {
        closeList();
        html.push("<ul>");
        listType = "ul";
      }
      html.push(`<li>${formatInline(unordered[1])}</li>`);
      return;
    }

    if (!line.trim()) {
      closeList();
      return;
    }

    closeList();
    html.push(`<p>${formatInline(line)}</p>`);
  });

  closeList();
  if (inCode) {
    html.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
  }
  return html.join("");
}
