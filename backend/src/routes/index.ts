import { Router } from "express";
import { v1Router } from "./v1";
import { productsRouter } from "./products";

export const apiRouter = Router();
apiRouter.use("/products", productsRouter);
apiRouter.use("/v2/products", productsRouter);
apiRouter.use("/v1", v1Router);
