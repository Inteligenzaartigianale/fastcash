import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import aeRouter from "./ae";
import catalogRouter from "./catalog";
import documentiRouter from "./documenti";
import chatRouter from "./chat";
import { requireDeviceToken } from "../lib/device-auth.js";

const router: IRouter = Router();

// Auth and health routes are always accessible — no device token required.
// GET /auth/status: allows unauthenticated status check (used by login polling)
// GET /auth/app-token: how the desktop obtains its first token
// POST /auth/qr/*: pairing flow — how mobile obtains its first token
router.use(healthRouter);
router.use(authRouter);

// All fiscal-operation routes require both an active ADE session AND a valid
// device/app token (issued after successful authentication or QR+PIN pairing).
router.use(requireDeviceToken, aeRouter);
router.use(requireDeviceToken, catalogRouter);
router.use(requireDeviceToken, documentiRouter);
router.use(requireDeviceToken, chatRouter);

export default router;
