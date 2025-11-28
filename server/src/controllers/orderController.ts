import { Request, Response } from "express";
import axios from "axios";
import OrderModel from "../models/orderModel";
import User from "../models/userModel";

/**
 * 创建订单
 * 订单 address 现在是对象结构：
 * {
 *   detail: string,
 *   lng: number | null,
 *   lat: number | null
 * }
 */
export async function createOrder(req: Request, res: Response) {
  try {
    const { title, address, merchantId: bodyMerchantId, userId: bodyUserId } = req.body;
    if (!title || !address) return res.status(400).json({ error: "缺少 title 或 address" });

    const actor = req.user;
    if (!actor) return res.status(401).json({ error: "未登录" });

    let merchantId: string | undefined;
    let userId: string | undefined;

    if (actor.role === "user") {
      if (!bodyMerchantId) return res.status(400).json({ error: "用户下单必须提供 merchantId" });
      merchantId = bodyMerchantId;
      userId = actor.userId;
    } else if (actor.role === "merchant") {
      merchantId = actor.userId;
      if (bodyUserId) userId = bodyUserId;
    } else {
      return res.status(403).json({ error: "无权限创建订单" });
    }

    /** ⭐ address 结构改为对象 */
    const order = await OrderModel.create({
      title,
      address: {
        detail: address,
        lng: null,
        lat: null,
      },
      status: "pending",
      merchantId,
      userId,
    });

    return res.json(order);
  } catch (err: any) {
    console.error("createOrder error:", err);
    return res.status(500).json({ error: "创建订单失败" });
  }
}

/** 获取订单列表 */
export async function getOrders(req: Request, res: Response) {
  try {
    const actor = req.user;
    if (!actor) return res.status(401).json({ error: "未登录" });

    const filter: any = {};
    if (actor.role === "merchant") filter.merchantId = actor.userId;
    else if (actor.role === "user") filter.userId = actor.userId;

    const list = await OrderModel.find(filter).sort({ createdAt: -1 });
    return res.json(list);
  } catch (err: any) {
    console.error("getOrders error:", err);
    return res.status(500).json({ error: "获取订单列表失败" });
  }
}

/** 获取单个订单 */
export async function getOrder(req: Request, res: Response) {
  try {
    const actor = req.user;
    if (!actor) return res.status(401).json({ error: "未登录" });

    const id = req.params.id;
    if (!id) return res.status(400).json({ error: "缺少订单 id" });

    let order;
    if (actor.role === "merchant")
      order = await OrderModel.findOne({ _id: id, merchantId: actor.userId });
    else if (actor.role === "user")
      order = await OrderModel.findOne({ _id: id, userId: actor.userId });
    else order = await OrderModel.findById(id);

    if (!order) return res.status(404).json({ error: "Order not found 或无权限" });
    return res.json(order);
  } catch (err: any) {
    console.error("getOrder error:", err);
    return res.status(500).json({ error: "获取订单失败" });
  }
}

/** 更新订单状态（仅商家） */
export async function updateOrderStatus(req: Request, res: Response) {
  try {
    const actor = req.user;
    if (!actor) return res.status(401).json({ error: "未登录" });

    const { status } = req.body;
    if (!status) return res.status(400).json({ error: "缺少 status 字段" });

    if (actor.role !== "merchant")
      return res.status(403).json({ error: "只有商家可以更新订单状态" });

    const order = await OrderModel.findOneAndUpdate(
      { _id: req.params.id, merchantId: actor.userId },
      { status },
      { new: true }
    );

    if (!order) return res.status(404).json({ error: "Order not found 或无权限" });
    return res.json(order);
  } catch (err: any) {
    console.error("updateOrderStatus error:", err);
    return res.status(500).json({ error: "更新订单状态失败" });
  }
}

/* -----------------------
    高德地图工具函数
----------------------- */

export async function geocodeAddress(address: string) {
  const key = process.env.AMAP_GEOCODING_KEY || process.env.AMAP_KEY;
  if (!key) throw new Error("Missing AMAP_GEOCODING_KEY");

  const url = `https://restapi.amap.com/v3/geocode/geo?address=${encodeURIComponent(
    address
  )}&key=${key}&output=json`;

  const r = await axios.get(url);
  const data = r.data;

  if (!data || data.status !== "1" || !data.geocodes?.length)
    throw new Error(data?.info || "地址解析失败");

  const [lng, lat] = data.geocodes[0].location.split(",");
  return { lng: Number(lng), lat: Number(lat) };
}

export async function planRoute(origin: any, dest: any) {
  const key = process.env.AMAP_DIRECTION_KEY || process.env.AMAP_KEY;
  if (!key) throw new Error("Missing AMAP_DIRECTION_KEY");

  const url = `https://restapi.amap.com/v3/direction/driving?origin=${origin.lng},${origin.lat}&destination=${dest.lng},${dest.lat}&extensions=all&key=${key}&output=json`;

  const r = await axios.get(url);
  const data = r.data;

  if (!data || data.status !== "1" || !data.route?.paths?.length)
    throw new Error(data?.info || "路线规划失败");

  return data.route;
}

export function parseRouteToPoints(route: any) {
  const pts: any[] = [];
  const steps = route?.paths?.[0]?.steps ?? [];
  for (const s of steps) {
    if (!s.polyline) continue;
    for (const seg of s.polyline.split(";")) {
      const [lng, lat] = seg.split(",");
      pts.push({ lng: Number(lng), lat: Number(lat) });
    }
  }
  return pts;
}

/**
 * GET /api/orders/route?id=xxx
 * 自动根据模型结构新适配：
 * 商家地址 → merchant.address.detail
 * 用户地址 → order.address.detail
 */
export async function getRoute(req: Request, res: Response) {
  try {
    const orderId = req.query.id as string;
    if (!orderId) return res.status(400).json({ error: "缺少订单 id" });

    const actor = req.user;
    if (!actor) return res.status(401).json({ error: "未登录" });

    const order = await OrderModel.findById(orderId);
    if (!order) return res.status(404).json({ error: "Order not found" });

    if (actor.role === "user" && String(order.userId) !== actor.userId)
      return res.status(403).json({ error: "无权限" });

    if (actor.role === "merchant" && String(order.merchantId) !== actor.userId)
      return res.status(403).json({ error: "无权限" });

    const merchant = await User.findById(order.merchantId);
    if (!merchant) return res.status(404).json({ error: "商家不存在" });

    if (!merchant.address?.detail)
      return res.status(400).json({ error: "商家未填写地址" });

    const shopAddress = merchant.address.detail;
    const customerAddress = order.address.detail; // ⭐ 地址结构改了这里必须改

    const origin = await geocodeAddress(shopAddress);
    const dest = await geocodeAddress(customerAddress);

    const route = await planRoute(origin, dest);
    const points = parseRouteToPoints(route);

    return res.json({
      shopAddress,
      customerAddress,
      origin,
      dest,
      points,
    });
  } catch (err: any) {
    console.error("getRoute error:", err);
    return res.status(500).json({ error: err.message || "路线规划失败" });
  }
}
