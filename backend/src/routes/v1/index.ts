import { Router } from "express";
import { posEventsRouter } from "./pos/events";
import { adminPosEventsRouter } from "./admin/posEvents";
import { adminAiRouter } from "./admin/ai";

export const v1Router = Router();

v1Router.use("/pos", posEventsRouter);
v1Router.use("/admin", adminPosEventsRouter);
v1Router.use("/admin", adminAiRouter);
