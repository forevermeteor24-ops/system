import { Router } from "express";
import {
  createOrder,
  getOrders,
  getOrder,
  updateOrderStatus,
  geocodeAddress,
  planRoute,
  parseRouteToPoints,
  getRoute,
} from "../controllers/orderController";

import { startTrack } from "../ws/index";
import UserModel from "../models/userModel";
import OrderModel from "../models/orderModel";
import { auth } from "../middleware/authMiddleware";

const router = Router();

/* --------------------------
   1. 静态路由（必须最前）
--------------------------- */
router.post("/", auth(["user"]), createOrder);  // 用户下单
router.get("/", auth(["merchant", "user"]), getOrders);  // 用户 or 商家查自己的订单

/* --------------------------
   按订单获取路线
--------------------------- */
router.get("/route", auth(["merchant", "user"]), getRoute);

/* --------------------------
   自定义路线规划（测试用，可删）
--------------------------- */
router.post("/route", async (req, res) => {
  const { shopAddress, customerAddress } = req.body;

  if (!customerAddress) {
    return res.status(400).json({ error: "customerAddress missing" });
  }

  try {
    const origin = await geocodeAddress(shopAddress || "北京");
    const dest = await geocodeAddress(customerAddress);
    const path = await planRoute(origin, dest);
    const points = parseRouteToPoints(path);

    return res.json({ origin, dest, points });
  } catch (err) {
    console.error("Route error:", err);
    return res.status(500).json({ error: "Route planning failed" });
  }
});

/* --------------------------
   2. 动态路由（必须最后）
--------------------------- */
router.get("/:id", auth(["merchant", "user"]), getOrder);

/* --------------------------
   更新订单状态 + 发货自动启动轨迹（多商家版）
--------------------------- */
router.patch("/:id/status", auth(["merchant"]), async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    // 找订单
    const order = await OrderModel.findById(id);
    if (!order) {
      return res.status(404).json({ error: "订单不存在" });
    }

    // 只能操作自己的订单
    if (order.merchantId?.toString() !== req.user!.userId) {
      return res.status(403).json({ error: "不能操作其他商家的订单" });
    }

    // 更新状态
    order.status = status;
    await order.save();

    /* ⭐ 发货 → 启动配送轨迹 */
    if (status === "shipped") {
      try {
        // ① 查找商家
        const merchant = await UserModel.findById(order.merchantId);
        if (!merchant) {
          console.error("商家不存在，无法启动配送轨迹");
          return res.json(order);
        }

        // ② 商家地址作为起点
        const shopAddr = merchant.address.detail;

        // ③ 用户地址从订单中读取
        const customerAddr = order.address.detail;

        // ④ 坐标解析
        const origin = await geocodeAddress(shopAddr);
        const dest = await geocodeAddress(customerAddr);

        // ⑤ 路线规划
        const route = await planRoute(origin, dest);
        const points = parseRouteToPoints(route);

        // ⑥ 启动轨迹
        startTrack(String(order._id), points);

      } catch (err) {
        console.error("发货后轨迹启动失败:", err);
      }
    }

    return res.json(order);
  } catch (err) {
    console.error("PATCH /:id/status error:", err);
    return res.status(500).json({ error: "订单状态更新失败" });
  }
});

export default router;
