import { Router } from "express";
import {
  createOrder,
  getOrders,
  getOrder,
  getRoute,
  updateOrderStatus,
  shipOrder,
  deleteOrder,
} from "../controllers/orderController";

import { auth } from "../middleware/authMiddleware";

const router = Router();

/* -----------------------------
   1. 用户下单
------------------------------ */
router.post("/", auth(["user"]), createOrder);

/* -----------------------------
   2. 用户 / 商家 查看订单
------------------------------ */
router.get("/", auth(["merchant", "user"]), getOrders);
router.post("/route", auth(["merchant", "user"]), getRoute);
router.get("/:id", auth(["merchant", "user"]), getOrder);

/* -----------------------------
   3. 商家发货（自动路线 + WS）
------------------------------ */
router.put("/:id/ship", auth(["merchant"]), shipOrder);

/* -----------------------------
   4. 状态更新（用户申请退货 / 商家取消 / 已送达）
------------------------------ */
router.put("/:id/status", auth(["merchant", "user"]), updateOrderStatus);

/* -----------------------------
   5. 删除订单（双方可删）
   - 用户：可删除【已送达、商家已取消】
   - 商家：可删除【已送达、商家已取消】
------------------------------ */
router.delete("/:id", auth(["merchant", "user"]), deleteOrder);

export default router;
