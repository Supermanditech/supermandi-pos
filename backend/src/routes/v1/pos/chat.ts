// STG-152: POS Chat Proxy Router
// POS devices use device tokens (x-device-token) for auth, but the chat routes
// require x-user-id header (set by JWT middleware). This proxy accepts device
// token auth and sets x-user-id from the device context before forwarding to
// the chat service.

import { Router, Request, Response, NextFunction } from "express";
import { requireDeviceToken, type PosDeviceContext } from "../../../middleware/deviceToken";
import { chatRouter } from "../chat";

export const posChatRouter = Router();

interface PosRequest extends Request {
  posDevice: PosDeviceContext;
}

// Middleware: after device token auth, inject x-user-id from device context
function injectChatUserId(req: Request, _res: Response, next: NextFunction): void {
  const posReq = req as PosRequest;
  if (posReq.posDevice) {
    // Use deviceId as the user identity for chat
    req.headers["x-user-id"] = posReq.posDevice.deviceId;
    req.headers["x-actor-id"] = posReq.posDevice.deviceId;
  }
  next();
}

// Mount: /api/v1/pos/chat/* -> device token auth -> inject user-id -> chat routes
posChatRouter.use("/chat", requireDeviceToken, injectChatUserId, chatRouter);
