import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
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
  "access-control-allow-methods": "POST,OPTIONS",
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

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  if (event.requestContext.http.method === "OPTIONS") {
    return json(204, {});
  }

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
    return json(response.status, { error: "ChefCraft could not generate that recipe." });
  }

  const recipe = extractText(data);
  if (!recipe) {
    return json(502, { error: "The model returned an empty recipe." });
  }

  return json(200, { recipe });
};

