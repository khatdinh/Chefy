import { defineFunction, secret } from "@aws-amplify/backend";

export const recipeFunction = defineFunction({
  name: "chefcraft-recipe",
  entry: "./handler.ts",
  runtime: 20,
  timeoutSeconds: 35,
  memoryMB: 256,
  environment: {
    OPENAI_API_KEY: secret("OPENAI_API_KEY"),
    OPENAI_MODEL: process.env.OPENAI_MODEL || "gpt-5-mini",
  },
});

