import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import aeRouter from "./ae";
import catalogRouter from "./catalog";
import documentiRouter from "./documenti";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(aeRouter);
router.use(catalogRouter);
router.use(documentiRouter);

export default router;
