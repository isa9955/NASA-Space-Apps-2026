import { app } from "@azure/functions";
import { getSite } from "./functions/get-site.js";

app.http("getSite", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "sites/{id}",
  handler: getSite
});
