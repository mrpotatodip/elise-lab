import { Hono } from "hono";
import type { AppEnv } from "#/types/variables";
import changePlanAPI from "./change-plan";
import createPlanCheckoutAPI from "./create-plan-checkout";
import createPlanPortalAPI from "./create-plan-portal";
import getPlanAPI from "./get-plan";
import getPlanOffersAPI from "./get-plan-offers";

const app = new Hono<AppEnv>();

app.route("/offers", getPlanOffersAPI);
app.route("/", changePlanAPI);
app.route("/", createPlanCheckoutAPI);
app.route("/", createPlanPortalAPI);
app.route("/", getPlanAPI);

export default app;
