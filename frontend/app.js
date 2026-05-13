import outputs from "../amplify_outputs.json";

const form = document.querySelector("#recipe-form");
const promptInput = document.querySelector("#prompt");
const clearButton = document.querySelector("#clear-button");
const submitButton = document.querySelector("#submit-button");
const output = document.querySelector("#recipe-output");
const status = document.querySelector("#status");
const promptChips = document.querySelectorAll("[data-prompt]");
const sheetForm = document.querySelector("#sheet-form");
const sheetInput = document.querySelector("#sheet-url");
const sheetButton = document.querySelector("#sheet-button");
const sheetStatus = document.querySelector("#sheet-status");
const ingredientList = document.querySelector("#ingredient-list");
const recommendations = document.querySelector("#recommendations");
const dishList = document.querySelector("#dish-list");

const emptyStateHtml =
  '<div class="empty-state"><p class="empty-title">Ready for the brief.</p><p class="placeholder">Add a dish, ingredients, timing, or style and ChefCraft will build the recipe.</p></div>';

const DISH_LIBRARY = [
  {
    title: "Pasta Aglio e Olio",
    tags: ["pasta", "spaghetti", "garlic", "olive oil", "parsley", "chili", "lemon", "parmesan"],
  },
  {
    title: "Creamy Mushroom Risotto",
    tags: ["rice", "arborio", "mushroom", "onion", "shallot", "stock", "parmesan", "butter", "white wine"],
  },
  {
    title: "Chicken Thighs with Pan Sauce",
    tags: ["chicken", "chicken thigh", "garlic", "shallot", "butter", "stock", "lemon", "thyme", "white wine"],
  },
  {
    title: "Scallops with White Wine Sauce",
    tags: ["scallop", "scallops", "butter", "white wine", "shallot", "garlic", "lemon", "parsley"],
  },
  {
    title: "Tomato Basil Pasta",
    tags: ["pasta", "tomato", "basil", "garlic", "olive oil", "parmesan", "mozzarella"],
  },
  {
    title: "Vegetable Stir-Fry",
    tags: ["broccoli", "pepper", "bell pepper", "carrot", "snap pea", "soy sauce", "ginger", "garlic", "rice"],
  },
  {
    title: "Egg Fried Rice",
    tags: ["rice", "egg", "eggs", "soy sauce", "scallion", "peas", "carrot", "sesame oil", "garlic"],
  },
  {
    title: "Shakshuka",
    tags: ["egg", "eggs", "tomato", "pepper", "onion", "garlic", "cumin", "paprika", "feta"],
  },
  {
    title: "Salmon with Lemon Herb Butter",
    tags: ["salmon", "butter", "lemon", "dill", "parsley", "garlic", "potato", "asparagus"],
  },
  {
    title: "Steak with Chimichurri",
    tags: ["steak", "beef", "parsley", "cilantro", "garlic", "vinegar", "olive oil", "chili"],
  },
  {
    title: "Lentil Soup",
    tags: ["lentils", "lentil", "carrot", "celery", "onion", "garlic", "tomato", "stock", "cumin"],
  },
  {
    title: "Chickpea Curry",
    tags: ["chickpea", "chickpeas", "onion", "garlic", "ginger", "tomato", "coconut milk", "rice", "cilantro"],
  },
  {
    title: "Greek Salad Bowl",
    tags: ["cucumber", "tomato", "feta", "olive", "red onion", "lemon", "olive oil", "oregano"],
  },
  {
    title: "Frittata",
    tags: ["egg", "eggs", "cheese", "spinach", "mushroom", "onion", "potato", "herbs"],
  },
];

const setStatus = (text) => {
  status.textContent = text;
};

const apiConfig = outputs.custom?.API ? Object.values(outputs.custom.API)[0] : null;
const apiEndpoint = apiConfig?.endpoint || "";

const getApiUrl = (path) => {
  if (!apiEndpoint) {
    throw new Error("Amplify API endpoint is not configured yet.");
  }

  return new URL(path, apiEndpoint.endsWith("/") ? apiEndpoint : `${apiEndpoint}/`).toString();
};

const getRecipeApiUrl = () => {
  return getApiUrl("recipe");
};

const getIngredientsApiUrl = (sheetUrl) => {
  const url = new URL(getApiUrl("ingredients"));
  url.searchParams.set("sheet", sheetUrl);
  return url.toString();
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

const normalize = (value) => value.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

const ingredientMatchesTag = (ingredient, tag) => {
  const cleanIngredient = normalize(ingredient);
  const cleanTag = normalize(tag);
  return cleanIngredient === cleanTag || cleanIngredient.includes(cleanTag) || cleanTag.includes(cleanIngredient);
};

const getRecommendations = (ingredients) =>
  DISH_LIBRARY.map((dish) => {
    const matches = dish.tags.filter((tag) =>
      ingredients.some((ingredient) => ingredientMatchesTag(ingredient, tag)),
    );
    return { ...dish, matches: [...new Set(matches)] };
  })
    .filter((dish) => dish.matches.length >= 2)
    .sort((a, b) => b.matches.length - a.matches.length)
    .slice(0, 6);

const renderIngredients = (ingredients) => {
  ingredientList.innerHTML = ingredients
    .slice(0, 24)
    .map((ingredient) => `<span class="ingredient-pill">${escapeHtml(ingredient)}</span>`)
    .join("");
};

const renderRecommendations = (dishes, ingredients) => {
  if (!dishes.length) {
    recommendations.hidden = true;
    dishList.innerHTML = "";
    return;
  }

  recommendations.hidden = false;
  dishList.innerHTML = dishes
    .map(
      (dish) => `
        <button class="dish-card" type="button" data-dish="${escapeHtml(dish.title)}">
          <span class="dish-title">${escapeHtml(dish.title)}</span>
          <span class="dish-match">${escapeHtml(dish.matches.slice(0, 4).join(", "))}</span>
        </button>
      `,
    )
    .join("");

  dishList.querySelectorAll("[data-dish]").forEach((button) => {
    button.addEventListener("click", () => {
      const dish = button.dataset.dish || "";
      const usefulIngredients = ingredients.slice(0, 18).join(", ");
      promptInput.value = `${dish}, using ingredients I have: ${usefulIngredients}. Keep it practical for a home cook.`;
      promptInput.focus();
    });
  });
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
  output.innerHTML = emptyStateHtml;
  setStatus("Ready");
  promptInput.focus();
});

promptChips.forEach((chip) => {
  chip.addEventListener("click", () => {
    promptInput.value = chip.dataset.prompt || "";
    promptInput.focus();
  });
});

sheetForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const sheetUrl = sheetInput.value.trim();
  if (!sheetUrl) {
    sheetInput.focus();
    return;
  }

  sheetButton.disabled = true;
  sheetStatus.textContent = "Loading ingredients...";

  try {
    const response = await fetch(getIngredientsApiUrl(sheetUrl));
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Could not load the sheet.");
    }

    const ingredients = data.ingredients || [];
    localStorage.setItem("chefcraftSheetUrl", sheetUrl);
    renderIngredients(ingredients);
    renderRecommendations(getRecommendations(ingredients), ingredients);
    sheetStatus.textContent = ingredients.length
      ? `Loaded ${ingredients.length} ingredients.`
      : "No ingredients found. Add an Ingredient column or put ingredients in the first column.";
  } catch (error) {
    ingredientList.innerHTML = "";
    recommendations.hidden = true;
    sheetStatus.textContent = error.message;
  } finally {
    sheetButton.disabled = false;
  }
});

const savedSheetUrl = localStorage.getItem("chefcraftSheetUrl");
if (savedSheetUrl) {
  sheetInput.value = savedSheetUrl;
}
