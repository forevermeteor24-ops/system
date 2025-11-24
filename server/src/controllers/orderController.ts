import { Request, Response } from "express";
import axios from "axios";
import OrderModel from "../models/orderModel";

/**
 * 订单 CRUD
 */

export async function createOrder(req: Request, res: Response) {
  try {
    const { title, address } = req.body;
    if (!title || !address) return res.status(400).json({ error: "缺少 title 或 address" });

    const order = await OrderModel.create({ title, address, status: "pending" });
    return res.json(order);
  } catch (err: any) {
    console.error("createOrder error:", err);
    return res.status(500).json({ error: "创建订单失败" });
  }
}

export async function getOrders(req: Request, res: Response) {
  try {
    const list = await OrderModel.find().sort({ createdAt: -1 });
    return res.json(list);
  } catch (err: any) {
    console.error("getOrders error:", err);
    return res.status(500).json({ error: "获取订单列表失败" });
  }
}

export async function getOrder(req: Request, res: Response) {
  try {
    const order = await OrderModel.findById(req.params.id);
    if (!order) return res.status(404).json({ error: "Order not found" });
    return res.json(order);
  } catch (err: any) {
    console.error("getOrder error:", err);
    return res.status(500).json({ error: "获取订单失败" });
  }
}

/**
 * 更新订单状态（返回 order 给 caller）
 * 注意：返回 null 表示已在函数内返回了 HTTP 错误
 */
export async function updateOrderStatus(req: Request, res: Response) {
  try {
    const { status } = req.body;
    if (!status) {
      res.status(400).json({ error: "缺少 status 字段" });
      return null;
    }

    const order = await OrderModel.findByIdAndUpdate(req.params.id, { status }, { new: true });
    if (!order) {
      res.status(404).json({ error: "Order not found" });
      return null;
    }

    return order;
  } catch (err: any) {
    console.error("updateOrderStatus error:", err);
    res.status(500).json({ error: "更新订单状态失败" });
    return null;
  }
}

/* ==========================================
   高德相关工具：geocode, planRoute, parse
   — 保证返回结构与前端期待一致：
   { origin: {lng,lat}, dest: {...}, points: [{lng,lat}, ...] }
   ========================================== */

export async function geocodeAddress(address: string) {
  const key = process.env.AMAP_GEOCODING_KEY || process.env.AMAP_KEY;
  if (!key) throw new Error("Missing AMAP_GEOCODING_KEY in env");

  const url = `https://restapi.amap.com/v3/geocode/geo?address=${encodeURIComponent(address)}&key=${key}&output=json`;

  const r = await axios.get(url);
  const data = r.data;

  // 打印以便调试（部署环境可删除）
  console.log("geocodeAddress response:", JSON.stringify(data)?.slice(0, 500));

  if (!data || data.status !== "1" || !data.geocodes || data.geocodes.length === 0) {
    throw new Error(data?.info || "地址解析失败");
  }

  const loc = data.geocodes[0].location; // "lng,lat"
  const [lng, lat] = loc.split(",");
  return { lng: Number(lng), lat: Number(lat) };
}

export async function planRoute(origin: { lng: number; lat: number }, destination: { lng: number; lat: number }) {
  const key = process.env.AMAP_DIRECTION_KEY || process.env.AMAP_KEY;
  if (!key) throw new Error("Missing AMAP_DIRECTION_KEY in env");

  const url = `https://restapi.amap.com/v3/direction/driving?origin=${origin.lng},${origin.lat}&destination=${destination.lng},${destination.lat}&extensions=all&key=${key}&output=json`;

  const r = await axios.get(url);
  const data = r.data;

  console.log("planRoute response:", JSON.stringify(data)?.slice(0, 1000));

  if (!data || data.status !== "1" || !data.route || !data.route.paths || data.route.paths.length === 0) {
    throw new Error(data?.info || "路线规划失败");
  }

  // 返回整个 route 对象（后面解析）
  return data.route;
}

export function parseRouteToPoints(route: any) {
  const points: { lng: number; lat: number }[] = [];
  try {
    if (!route || !route.paths || route.paths.length === 0) return points;

    const steps = route.paths[0].steps || [];
    for (const step of steps) {
      if (!step.polyline) continue;
      const coords = step.polyline.split(";");
      for (const c of coords) {
        const [lng, lat] = c.split(",");
        points.push({ lng: Number(lng), lat: Number(lat) });
      }
    }
  } catch (err) {
    console.error("parseRouteToPoints error:", err);
  }
  return points;
}

/**
 * GET /api/orders/route?id=<orderId>
 * 返回 { origin, dest, points }
 */
export async function getRoute(req: Request, res: Response) {
  try {
    // 支持 GET /route?id=<orderId> 或 GET /route?shopAddress=...&customerAddress=...
    const orderId = (req.query.id as string) || undefined;
    const shopAddressQ = (req.query.shopAddress as string) || undefined;
    const customerAddressQ = (req.query.customerAddress as string) || undefined;

    if (!orderId && !(shopAddressQ && customerAddressQ)) {
      return res.status(400).json({ error: "缺少 id 或 (shopAddress & customerAddress)" });
    }

    // 如果提供 orderId，就按订单地址来规划
    if (orderId) {
      const order = await OrderModel.findById(orderId);
      if (!order) return res.status(404).json({ error: "Order not found" });

      const shopAddr = process.env.SHOP_ADDRESS || "北京市海淀区中关村大街27号";
      const origin = await geocodeAddress(shopAddr);
      const dest = await geocodeAddress(order.address);
      const route = await planRoute(origin, dest);
      const points = parseRouteToPoints(route);

      return res.json({ origin, dest, points });
    }

    // 否则使用传入的两个地址
    const origin = await geocodeAddress(shopAddressQ!);
    const dest = await geocodeAddress(customerAddressQ!);
    const route = await planRoute(origin, dest);
    const points = parseRouteToPoints(route);

    return res.json({ origin, dest, points });
  } catch (err: any) {
    console.error("GET /api/orders/route error:", err);
    return res.status(500).json({ error: err.message || "Route fetch failed" });
  }
}
