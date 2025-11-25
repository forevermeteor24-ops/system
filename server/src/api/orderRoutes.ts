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

import { startTrack } from "../ws";  // ⭐ 使用统一的轨迹启动函数（重要！）
import { getWss } from "../ws";

const router = Router();

/* --------------------------
   1. 静态路由（必须最前）
--------------------------- */
router.post("/", createOrder);
router.get("/", getOrders);

/* --------------------------
   获取路线（按订单）
--------------------------- */
// GET /api/orders/route?id=<orderId>
router.get("/route", getRoute);

/* --------------------------
   自定义路线规划（POST）
--------------------------- */
router.post("/route", async (req, res) => {
  const body = req.body || {};
  const shopAddress = body.shopAddress || process.env.SHOP_ADDRESS || "北京";
  const customerAddress = body.customerAddress;

  if (!customerAddress) {
    return res.status(400).json({ error: "customerAddress missing" });
  }

  try {
    const origin = await geocodeAddress(shopAddress);
    const dest = await geocodeAddress(customerAddress);
    const path = await planRoute(origin, dest);
    const points = parseRouteToPoints(path);

    return res.json({ origin, dest, points });
  } catch (err: any) {
    console.error("Route error:", err);
    return res
      .status(500)
      .json({ error: err.message || "Route planning failed" });
  }
});

/* --------------------------
   2. 动态路由（必须最后）
--------------------------- */
router.get("/:id", getOrder);

/* 更新订单状态 + 发货自动启动轨迹 */
router.patch("/:id/status", async (req, res) => {
  try {
    const order = await updateOrderStatus(req, res);
    if (!order) return;

    const wss = getWss();

    /* 广播订单状态更新 */
    if (wss) {
      wss.clients.forEach((client: any) => {
        if (client.readyState === 1) {
          client.send(
            JSON.stringify({
              type: "order-status-updated",
              orderId: order._id,
              status: order.status,
            })
          );
        }
      });
    }

    /* 如果发货 → 自动启动轨迹推送 */
    if (order.status === "shipped") {
      try {
        const shopAddr =
          process.env.SHOP_ADDRESS || "北京市海淀区中关村大街27号";

        const origin = await geocodeAddress(shopAddr);
        const dest = await geocodeAddress(order.address);
        const route = await planRoute(origin, dest);
        const points = parseRouteToPoints(route);

        // ⭐ 使用统一入口，避免重复创建 TrackPlayer！
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
