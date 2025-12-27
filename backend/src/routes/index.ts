import { Router } from "express";
import { authRouter } from "./auth";
import { productsRouter } from "./products";
import { transactionsRouter } from "./transactions";
import { usersRouter } from "./users";

export const apiRouter = Router();

apiRouter.use("/auth", authRouter);
apiRouter.use("/products", productsRouter);
apiRouter.use("/transactions", transactionsRouter);
apiRouter.use("/users", usersRouter);
