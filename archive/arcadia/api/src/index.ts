import { app } from "@azure/functions";
import { getRegion } from "./functions/get-region.js";
import { getSite } from "./functions/get-site.js";
import { getSites } from "./functions/get-sites.js";
import { getRoute } from "./functions/get-route.js";
import { getStarts } from "./functions/get-starts.js";
import { getMissionContextResponse } from "./functions/get-mission-context.js";

app.http("getRegion", { methods: ["GET"], authLevel: "anonymous", route: "regions/deuteronilus", handler: getRegion });

app.http("getStarts", { methods: ["GET"], authLevel: "anonymous", route: "starts", handler: getStarts });
app.http("getMissionContext", { methods: ["GET"], authLevel: "anonymous", route: "mission-context", handler: getMissionContextResponse });

app.http("getRoute", {
  methods: ["GET"], authLevel: "anonymous", route: "routes", handler: getRoute
});

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
