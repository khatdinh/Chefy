import { defineBackend } from "@aws-amplify/backend";
import { Stack } from "aws-cdk-lib";
import { CorsHttpMethod, HttpApi, HttpMethod } from "aws-cdk-lib/aws-apigatewayv2";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import { recipeFunction } from "./functions/recipe/resource";

const backend = defineBackend({
  recipeFunction,
});

const apiStack = backend.createStack("chefcraft-api");
const recipeIntegration = new HttpLambdaIntegration(
  "RecipeIntegration",
  backend.recipeFunction.resources.lambda,
);

const httpApi = new HttpApi(apiStack, "ChefCraftHttpApi", {
  apiName: "chefcraft-api",
  createDefaultStage: true,
  corsPreflight: {
    allowHeaders: ["content-type"],
    allowMethods: [CorsHttpMethod.POST, CorsHttpMethod.OPTIONS],
    allowOrigins: ["*"],
  },
});

httpApi.addRoutes({
  path: "/recipe",
  methods: [HttpMethod.POST],
  integration: recipeIntegration,
});

backend.addOutput({
  custom: {
    api: {
      endpoint: httpApi.url,
      region: Stack.of(httpApi).region,
      name: httpApi.httpApiName,
    },
  },
});

