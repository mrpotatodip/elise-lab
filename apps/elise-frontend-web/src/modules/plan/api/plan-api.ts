import { createServerFn } from "@tanstack/react-start";
import { engineJson, jsonPost } from "#/lib/engine-client";
import { engineAuth } from "#/modules/auth/server/session";
import { PlanChangeBodySchema, PlanChangeResultSchema, PlanCheckoutBodySchema, PlanDetailsSchema, PlanOffersSchema, PlanSessionUrlSchema } from "../schemas";

export const startPlanCheckout = createServerFn({ method: "POST" })
  .validator(PlanCheckoutBodySchema)
  .handler(async ({ data }) => engineJson(PlanSessionUrlSchema, "/usage/plan/checkout", jsonPost(JSON.stringify(data)), await engineAuth()));

export const changePlan = createServerFn({ method: "POST" })
  .validator(PlanChangeBodySchema)
  .handler(async ({ data }) => engineJson(PlanChangeResultSchema, "/usage/plan/change", jsonPost(JSON.stringify(data)), await engineAuth()));

export const openBillingPortal = createServerFn({ method: "POST" }).handler(async () => engineJson(PlanSessionUrlSchema, "/usage/plan/portal", { method: "POST" }, await engineAuth()));

export const fetchPlan = createServerFn({ method: "GET" }).handler(async () => engineJson(PlanDetailsSchema, "/usage/plan", {}, await engineAuth()));

export const fetchPlanOffers = createServerFn({ method: "GET" }).handler(async () => engineJson(PlanOffersSchema, "/usage/plan/offers", {}, await engineAuth()));
