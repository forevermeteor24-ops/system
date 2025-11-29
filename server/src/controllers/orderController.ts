import { Request, Response } from "express";
import axios from "axios";
import OrderModel from "../models/orderModel";
import User from "../models/userModel";
import { startTrack } from "../ws";
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
    const {
      title,
      address, // 前端传来的是对象：{ detail: "xxx", lng:..., lat:... }
      price,
      merchantId: bodyMerchantId,
      userId: bodyUserId,
    } = req.body;

    // 🔍 调试：看看到底传了什么进来
    console.log("CreateOrder Recieved:", { title, price, address });

    // 校验修改：防止 address 是 null 导致的报错
    if (!title || !address || price == null) {
      return res.status(400).json({ error: "缺少 title、address 或 price" });
    }

    if (typeof price !== "number" || price <= 0)
      return res.status(400).json({ error: "price 必须是正数" });

    const actor = (req as any).user; // 加上类型断言防止爆红
    if (!actor) return res.status(401).json({ error: "未登录" });

    let merchantId: string | undefined;
    let userId: string | undefined;

    /** 用户下单时必须指定商家 */
    if (actor.role === "user") {
      if (!bodyMerchantId)
        return res.status(400).json({ error: "用户下单必须提供 merchantId" });

      merchantId = bodyMerchantId;
      userId = actor.userId;
    }

    /** 商家创建订单 */
    else if (actor.role === "merchant") {
      merchantId = actor.userId;
      if (bodyUserId) userId = bodyUserId;
    } else {
      return res.status(403).json({ error: "无权限创建订单" });
    }

    /** 创建订单 */
    const order = await OrderModel.create({
      title,
      price,
      
      // ✅✅✅ 这里是修复的核心点！
      // 不要写 detail: address，而要拆包
      address: {
        // 如果前端传的是对象，取它的 detail；如果传的是字符串，直接用
        detail: typeof address === 'object' ? address.detail : address,
        
        // 读取前端传来的经纬度，而不是写死 null（万一以后有坐标呢）
        lng: address.lng || null,
        lat: address.lat || null,
      },

      status: "待发货",
      merchantId,
      userId,
    });

    return res.json(order);
  } catch (err: any) {
    console.error("createOrder error:", err);
    // 把具体错误信息返回给前端，方便 F12 查看
    return res.status(500).json({ 
      error: "创建订单失败", 
      detail: err.message 
    });
  }
}


/** 获取订单列表（支持排序） */
export async function getOrders(req: Request, res: Response) {
  try {
    const actor = req.user;
    if (!actor) return res.status(401).json({ error: "未登录" });

    const filter: any = {};
    if (actor.role === "merchant") filter.merchantId = actor.userId;
    else if (actor.role === "user") filter.userId = actor.userId;

    /** -----------------------
     *  ⭐ 新增排序功能
     *  sort = created_desc | created_asc | price_desc | price_asc
     ------------------------ */
    const sortParam = req.query.sort as string;

    const sortMap: any = {
      created_desc: { createdAt: -1 },
      created_asc: { createdAt: 1 },
      price_desc: { price: -1 },
      price_asc: { price: 1 },
    };

    const sortRule = sortMap[sortParam] || { createdAt: -1 }; // 默认按创建时间倒序

    const list = await OrderModel.find(filter).sort(sortRule);

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

/*商家发货*/
export async function shipOrder(req: Request, res: Response) {
  try {
    const actor = req.user!;
    const orderId = req.params.id;

    // 查订单
    const order = await OrderModel.findById(orderId);
    if (!order) return res.status(404).json({ error: "订单不存在" });

    // 权限
    if (order.merchantId.toString() !== actor.userId)
      return res.status(403).json({ error: "不能发货其他商家的订单" });

    // 不可重复发货
    if (order.status !== "待发货")
      return res.status(400).json({ error: "该订单不可发货" });

    // ---- 自动路线规划 ----
    const merchant = await User.findById(order.merchantId);
    const shopAddr = merchant!.address.detail;
    const userAddr = order.address.detail;

    const origin = await geocodeAddress(shopAddr);
    const dest = await geocodeAddress(userAddr);

    const route = await planRoute(origin, dest);
    const points = parseRouteToPoints(route);

    // 启动轨迹模拟
    startTrack(orderId, points);

    // 状态改为配送中
    order.status = "配送中";
    await order.save();

    return res.json(order);
  } catch (err) {
    return res.status(500).json({ error: "发货失败" });
  }
}


/** 更新订单状态 */
export async function updateOrderStatus(req: Request, res: Response) {
  try {
    const { status } = req.body;
    const orderId = req.params.id;
    const actor = req.user!;

    const order = await OrderModel.findById(orderId);
    if (!order) return res.status(404).json({ error: "订单不存在" });

    /* ------------------------
        用户行为：申请退货
    ------------------------ */
    if (actor.role === "user") {
      if (status !== "用户申请退货")
        return res.status(403).json({ error: "用户无法更新为该状态" });

      if (!["待发货", "配送中"].includes(order.status))
        return res.status(400).json({ error: "当前状态不可申请退货" });

      order.status = "用户申请退货";
      await order.save();
      return res.json(order);
    }

    /* ------------------------
        商家行为：取消订单
    ------------------------ */
    if (actor.role === "merchant") {
      if (order.merchantId.toString() !== actor.userId)
        return res.status(403).json({ error: "不能操作其他商家订单" });

      // ⛔ 你要求：商家只有在【用户申请退货】状态才能取消
      if (status === "商家已取消") {
        if (order.status !== "用户申请退货") {
          return res.status(400).json({
            error: "只有在用户申请退货时商家才能取消订单"
          });
        }

        order.status = "商家已取消";
        await order.save();
        return res.json(order);
      }

      return res.status(403).json({ error: "商家不能更新为该状态" });
    }
  } catch (err) {
    return res.status(500).json({ error: "状态更新失败" });
  }
}

/*删除订单*/
export async function deleteOrder(req: Request, res: Response) {
  try {
    const actor = req.user!;
    const orderId = req.params.id;

    const order = await OrderModel.findById(orderId);
    if (!order) return res.status(404).json({ error: "订单不存在" });

    const canDelete = ["已送达", "商家已取消"];

    if (!canDelete.includes(order.status))
      return res.status(400).json({ error: "当前状态不可删除订单" });

    // 只能删自己的
    if (
      actor.role === "user" &&
      order.userId.toString() !== actor.userId
    ) {
      return res.status(403).json({ error: "不能删除他人订单" });
    }

    if (
      actor.role === "merchant" &&
      order.merchantId.toString() !== actor.userId
    ) {
      return res.status(403).json({ error: "不能删除他人订单" });
    }

    await order.deleteOne();
    res.json({ message: "订单已删除" });
  } catch (err) {
    res.status(500).json({ error: "删除失败" });
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
