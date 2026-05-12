import outputs from "../amplify_outputs.json";

const form = document.querySelector("#recipe-form");
const promptInput = document.querySelector("#prompt");
const clearButton = document.querySelector("#clear-button");
const submitButton = document.querySelector("#submit-button");
const output = document.querySelector("#recipe-output");
const status = document.querySelector("#status");

const setStatus = (text) => {
  status.textContent = text;
};

const apiEndpoint = outputs.custom?.api?.endpoint || "";

const getRecipeApiUrl = () => {
  if (!apiEndpoint) {
    throw new Error("Amplify API endpoint is not configured yet.");
  }

  return new URL("recipe", apiEndpoint.endsWith("/") ? apiEndpoint : `${apiEndpoint}/`).toString();
};

const escapeHtml = (value) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const renderMarkdownLite = (text) => {
  const lines = escapeHtml(text).split(/\r?\n/);
  const html = [];
  let list = null;

  const closeList = () => {
    if (list) {
      html.push(`</${list}>`);
      list = null;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      closeList();
      continue;
    }

    if (line.startsWith("# ")) {
      closeList();
      html.push(`<h1>${line.slice(2)}</h1>`);
      continue;
    }

    if (line.startsWith("## ")) {
      closeList();
      html.push(`<h2>${line.slice(3)}</h2>`);
      continue;
    }

    const ordered = line.match(/^\d+\.\s+(.*)$/);
    if (ordered) {
      if (list !== "ol") {
        closeList();
        list = "ol";
        html.push("<ol>");
      }
      html.push(`<li>${ordered[1]}</li>`);
      continue;
    }

    if (line.startsWith("- ")) {
      if (list !== "ul") {
        closeList();
        list = "ul";
        html.push("<ul>");
      }
      html.push(`<li>${line.slice(2)}</li>`);
      continue;
    }

    closeList();
    html.push(`<p>${line.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")}</p>`);
  }

  closeList();
  return html.join("");
};

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const prompt = promptInput.value.trim();
  if (!prompt) {
    promptInput.focus();
    return;
  }

  submitButton.disabled = true;
  setStatus("Cooking");
  output.innerHTML = "<p class=\"placeholder\">Building the recipe with proper mise en place...</p>";

  try {
    const response = await fetch(getRecipeApiUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "The kitchen lost the ticket.");
    }

    output.innerHTML = renderMarkdownLite(data.recipe);
    setStatus("Served");
  } catch (error) {
    output.innerHTML = `<p class="error">${escapeHtml(error.message)}</p>`;
    setStatus("Needs attention");
  } finally {
    submitButton.disabled = false;
  }
});

clearButton.addEventListener("click", () => {
  promptInput.value = "";
  output.innerHTML =
    '<p class="placeholder">Your recipe will appear here. Keep the request honest and specific: time, diet, budget, ingredients, and who you are feeding.</p>';
  setStatus("Ready");
  promptInput.focus();
});
