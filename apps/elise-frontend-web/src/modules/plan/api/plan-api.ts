import { createServerFn } from "@tanstack/react-start";
import { engineJson } from "#/lib/engine-client";
import { engineAuth } from "#/modules/auth/server/session";
import { PlanDetailsSchema, PlanOffersSchema } from "../schemas";

export const fetchPlan = createServerFn({ method: "GET" }).handler(async () => engineJson(PlanDetailsSchema, "/usage/plan", {}, await engineAuth()));

export const fetchPlanOffers = createServerFn({ method: "GET" }).handler(async () => engineJson(PlanOffersSchema, "/usage/plan/offers", {}, await engineAuth()));
