import { app } from "@azure/functions";
import { getSite } from "./functions/get-site.js";
import { getSites } from "./functions/get-sites.js";

app.http("getSites", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "sites",
  handler: getSites
});

app.http("getSite", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "sites/{id}",
  handler: getSite
});
