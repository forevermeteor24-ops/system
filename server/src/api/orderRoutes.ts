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
import { TrackPlayer } from "../simulator/trackPlayer";
import { getWss } from "../ws";

const router = Router();

/* --------------------------
   1. 静态路由（必须最前）
--------------------------- */
router.post("/", createOrder);
router.get("/", getOrders);

/* 路线接口（必须在 /:id 前面，避免被当成 id） */
// GET /api/orders/route?id=<orderId>
router.get("/route", getRoute);

// POST /api/orders/route  (自定义 shop/customer 地址)
// 自定义路线规划
router.post("/route", async (req, res) => {
  // Cloudflare 可能丢 body，这里做兼容处理
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
    return res.status(500).json({
      error: err.message || "Route planning failed",
    });
  }
});


/* --------------------------
   2. 动态路由（必须最后）
--------------------------- */
router.get("/:id", getOrder);

router.patch("/:id/status", async (req, res) => {
  try {
    const order = await updateOrderStatus(req, res);
    if (!order) return;

    const wss = getWss();

    // 广播订单状态更新（供前端监听）
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

    // 发货后自动计算路线并启动轨迹推送
    if (order.status === "shipped") {
      try {
        const shopAddr = process.env.SHOP_ADDRESS || "北京市海淀区中关村大街27号";
        const origin = await geocodeAddress(shopAddr);
        const dest = await geocodeAddress(order.address);
        const route = await planRoute(origin, dest);
        const points = parseRouteToPoints(route);

        const player = new TrackPlayer(String(order._id), getWss()!);
        player.startWithPoints(points);
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
