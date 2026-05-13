import type { APIGatewayProxyEventV2, APIGatewayProxyHandlerV2 } from "aws-lambda";
import { env } from "$amplify/env/chefcraft-recipe";

const SYSTEM_PROMPT = `You are ChefCraft, an expert recipe assistant GPT wrapper inspired by the techniques, discipline, and kitchen philosophy of world-class professional chefs such as Marco Pierre White, Gordon Ramsay, and other fine-dining chefs.

Your job is to create practical, flavorful, well-structured recipes for home cooks while applying professional chef thinking: balance, seasoning, texture, timing, mise en place, sauce work, plating, and ingredient respect.

When given a dish idea, ingredients, cuisine, dietary need, or skill level, produce a complete recipe with:

1. Recipe Name
2. Brief Chef's Note explaining the dish concept
3. Servings
4. Prep Time and Cook Time
5. Ingredients with precise quantities in metric units
6. Mise en Place checklist
7. Step-by-step method
8. Chef-level tips for flavor, texture, and timing
9. Common mistakes to avoid
10. Optional upgrades or restaurant-style finishing touches
11. Simple plating suggestion
12. Substitutions when useful

Style rules:
- Be direct, confident, and practical.
- Focus on technique, not just instructions.
- Avoid overly complicated restaurant technique in the main instruction body, but include those ideas in optional restaurant finishing touches when useful.
- Use accessible ingredients unless the user asks for fine dining.
- Explain why key steps matter.
- Write in a short narrative prose, like how Marco Pierre White instructs and talks.

When the user provides ingredients, prioritize using what they already have.
When the user gives a vague request, ask up to two useful clarifying questions, or make reasonable assumptions and proceed.
When the user asks for a healthier, cheaper, faster, or more luxurious version, adapt the recipe accordingly.

Default output format:

# [Recipe Name]

**Chef's Note:**
[Short concept]

**Serves:**
**Prep Time:**
**Cook Time:**

## Ingredients
- 

## Mise en Place
- 

## Method
1. 

## Pro Chef Tips
- 

## Common Mistakes
- 

## Optional Upgrades
- 

## Plating
[Simple plating guidance]`;

const responseHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "cache-control": "no-store",
  "content-type": "application/json",
};

const json = (statusCode: number, body: unknown) => ({
  statusCode,
  headers: responseHeaders,
  body: JSON.stringify(body),
});

const extractText = (data: {
  output_text?: string;
  output?: Array<{ content?: Array<{ text?: string }> }>;
}) => {
  if (typeof data.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }

  const chunks: string[] = [];
  for (const item of data.output || []) {
    for (const content of item.content || []) {
      if (content.text) {
        chunks.push(content.text);
      }
    }
  }

  return chunks.join("\n").trim();
};

const getOpenAIErrorMessage = (status: number, data: { error?: { code?: string; type?: string; message?: string } }) => {
  const code = data.error?.code || data.error?.type || "unknown_error";
  const message = data.error?.message || "OpenAI rejected the request.";
  return `OpenAI rejected the request (${status} ${code}): ${message}`;
};

const parseCsv = (text: string) => {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (quoted && char === '"' && next === '"') {
      value += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      quoted = !quoted;
      continue;
    }

    if (!quoted && char === ",") {
      row.push(value.trim());
      value = "";
      continue;
    }

    if (!quoted && (char === "\n" || char === "\r")) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      row.push(value.trim());
      if (row.some(Boolean)) {
        rows.push(row);
      }
      row = [];
      value = "";
      continue;
    }

    value += char;
  }

  row.push(value.trim());
  if (row.some(Boolean)) {
    rows.push(row);
  }

  return rows;
};

const toCsvUrl = (rawUrl: string) => {
  const url = new URL(rawUrl);

  if (url.hostname !== "docs.google.com") {
    throw new Error("Use a public Google Sheets URL from docs.google.com.");
  }

  if (url.pathname.includes("/pub")) {
    url.pathname = url.pathname.replace(/\/pubhtml$/, "/pub");
    url.searchParams.set("output", "csv");
    return url.toString();
  }

  const id = url.pathname.match(/\/spreadsheets\/d\/([^/]+)/)?.[1];
  if (!id) {
    throw new Error("Use a valid Google Sheets URL.");
  }

  const gid = url.hash.match(/gid=(\d+)/)?.[1] || url.searchParams.get("gid") || "0";
  return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`;
};

const getIngredientsFromSheet = async (sheetUrl: string) => {
  const csvUrl = toCsvUrl(sheetUrl);
  const response = await fetch(csvUrl);

  if (!response.ok) {
    throw new Error("Could not read the sheet. Make sure it is shared publicly or published as CSV.");
  }

  const csv = await response.text();
  if (csv.length > 100_000) {
    throw new Error("The sheet is too large. Keep this to a simple ingredient list.");
  }

  const rows = parseCsv(csv);
  if (!rows.length) {
    return [];
  }

  const headers = rows[0].map((header) => header.toLowerCase());
  const ingredientColumn = headers.findIndex((header) =>
    ["ingredient", "ingredients", "item", "name", "food"].includes(header),
  );
  const startRow = ingredientColumn >= 0 ? 1 : 0;
  const columnIndex = ingredientColumn >= 0 ? ingredientColumn : 0;

  return [...new Set(
    rows
      .slice(startRow)
      .map((row) => row[columnIndex]?.trim())
      .filter((ingredient): ingredient is string => Boolean(ingredient && ingredient.length <= 80)),
  )].slice(0, 80);
};

const handleIngredients = async (event: APIGatewayProxyEventV2) => {
  const sheetUrl = String(event.queryStringParameters?.sheet || "").trim();
  if (!sheetUrl) {
    return json(400, { error: "Add a Google Sheet URL." });
  }

  if (sheetUrl.length > 800) {
    return json(400, { error: "Google Sheet URL is too long." });
  }

  try {
    const ingredients = await getIngredientsFromSheet(sheetUrl);
    return json(200, { ingredients });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load ingredients.";
    return json(400, { error: message });
  }
};

const handleRecipe = async (event: APIGatewayProxyEventV2) => {
  if (event.requestContext.http.method !== "POST") {
    return json(405, { error: "Use POST." });
  }

  let body: { prompt?: unknown };
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "Request body must be valid JSON." });
  }

  const prompt = String(body.prompt || "").trim();
  if (prompt.length < 3) {
    return json(400, { error: "Give ChefCraft a dish, ingredient list, or cooking goal." });
  }

  if (prompt.length > 2000) {
    return json(400, { error: "Keep the request under 2000 characters." });
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: env.OPENAI_MODEL || "gpt-5-mini",
      input: [
        { role: "developer", content: SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
      max_output_tokens: 2200,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    console.error("OpenAI error", data);
    return json(response.status, { error: getOpenAIErrorMessage(response.status, data) });
  }

  const recipe = extractText(data);
  if (!recipe) {
    return json(502, { error: "The model returned an empty recipe." });
  }

  return json(200, { recipe });
};

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  if (event.requestContext.http.method === "OPTIONS") {
    return json(204, {});
  }

  if (event.rawPath.endsWith("/ingredients")) {
    return handleIngredients(event);
  }

  if (event.rawPath.endsWith("/recipe")) {
    return handleRecipe(event);
  }

  return json(404, { error: "Not found." });
};
