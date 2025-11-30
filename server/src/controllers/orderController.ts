import { Request, Response } from "express";
import axios from "axios";
import OrderModel from "../models/orderModel";
import User from "../models/userModel";
import ProductModel from "../models/productModel";
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
      address,  // 前端传来的是对象：{ detail: "xxx", lng:..., lat:... }
      price,
      productId,  // 用户选择的商品ID
      merchantId: bodyMerchantId,
      userId: bodyUserId,
    } = req.body;

    // 🔍 调试：查看传入的数据
    console.log("CreateOrder Received:", { title, price, address, productId });

    // 校验必填字段
    if (!title || !address || price == null || !productId) {
      return res.status(400).json({ error: "缺少 title、address、price 或 productId" });
    }

    if (typeof price !== "number" || price <= 0)
      return res.status(400).json({ error: "price 必须是正数" });

    const actor = (req as any).user; // 获取当前用户
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

    // 查找商品，确保商品属于当前商家
    const product = await ProductModel.findById(productId);
    if (!product) {
      return res.status(404).json({ error: "商品不存在" });
    }
    if (product.merchantId.toString() !== merchantId) {
      return res.status(403).json({ error: "无法为此商品创建订单，商品不属于该商家" });
    }

    // 创建订单
    const order = await OrderModel.create({
      title,
      price: product.price,  // 使用商品的价格
      address: {
        detail: address.detail,
        lng: address.lng || null,
        lat: address.lat || null,
      },
      status: "待发货",
      merchantId,
      userId,
      productId,  // 记录商品ID
    });

    return res.status(201).json(order);
  } catch (err: any) {
    console.error("createOrder error:", err);
    return res.status(500).json({
      error: "创建订单失败",
      detail: err.message,
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
    const actor = (req as any).user;
    const orderId = req.params.id;

    console.log(`[ShipDebug] 开始发货: OrderID=${orderId}, ActorID=${actor?.userId}`);

    // 1. 查订单
    const order = await OrderModel.findById(orderId);
    if (!order) return res.status(404).json({ error: "订单不存在" });

    // 2. 权限校验
    if (order.merchantId.toString() !== actor.userId)
      return res.status(403).json({ error: "不能发货其他商家的订单" });

    // 3. 查商家地址
    const merchant = await User.findById(order.merchantId);
    if (!merchant) return res.status(404).json({ error: "商家账户不存在" });

    const shopAddrDetail = typeof merchant.address === 'object' ? merchant.address?.detail : merchant.address;
    if (!shopAddrDetail) return res.status(400).json({ error: "商家未设置店铺地址，无法规划路线" });

    const userAddrDetail = typeof order.address === 'object' ? order.address?.detail : order.address;
    if (!userAddrDetail) return res.status(400).json({ error: "用户收货地址无效" });

    console.log(`[ShipDebug] 地址解析: 店铺=[${shopAddrDetail}] -> 用户=[${userAddrDetail}]`);

    // 4. 路线规划
    let origin, dest;
    try {
      origin = await geocodeAddress(shopAddrDetail);
      dest = await geocodeAddress(userAddrDetail);
    } catch (geoError: any) {
      console.error("Geocode Error:", geoError);
      return res.status(500).json({ error: "地址解析失败，请检查地图API Key配置", detail: geoError.message });
    }

    const route = await planRoute(origin, dest);
    const points = parseRouteToPoints(route);

    // 将商家和用户的经纬度保存到数据库
    merchant.address.lng = origin.lng;
    merchant.address.lat = origin.lat;
    await merchant.save();

    order.address.lng = dest.lng;
    order.address.lat = dest.lat;
    await order.save();

    // 5. 启动模拟 & 保存状态
    startTrack(orderId, points);

    order.status = "配送中";
    await order.save();

    console.log("[ShipDebug] 发货成功！");
    return res.json(order);

  } catch (err: any) {
    console.error("shipOrder Fatal Error:", err);
    return res.status(500).json({ 
      error: "发货逻辑崩溃", 
      detail: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
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
  console.log('Route triggered');  // 确认是否进入了这个函数
  try {
    const orderId = req.query.id as string;
    console.log(`请求的订单 ID：${orderId}`);
    if (!orderId) {
      console.error("缺少订单 ID");
      return res.status(400).json({ error: "缺少订单 id" });
    }

    const actor = req.user;  // 获取用户信息
    if (!actor) {
      console.error("未登录用户尝试请求路线");
      return res.status(401).json({ error: "未登录" });
    }

    const order = await OrderModel.findById(orderId);
    if (!order) {
      console.error(`订单未找到：${orderId}`);
      return res.status(404).json({ error: "Order not found" });
    }

    console.log(`订单信息：`, order);

    // 验证是否为当前用户或商家的订单
    if (actor.role === "user" && String(order.userId) !== actor.userId) {
      console.error(`用户 ${actor.userId} 无权限访问此订单`);
      return res.status(403).json({ error: "无权限" });
    }

    if (actor.role === "merchant" && String(order.merchantId) !== actor.userId) {
      console.error(`商家 ${actor.userId} 无权限访问此订单`);
      return res.status(403).json({ error: "无权限" });
    }

    const merchant = await User.findById(order.merchantId);
    if (!merchant) {
      console.error(`商家不存在：${order.merchantId}`);
      return res.status(404).json({ error: "商家不存在" });
    }

    console.log(`商家信息：`, merchant);

    if (!merchant.address?.detail) {
      console.error("商家未填写地址");
      return res.status(400).json({ error: "商家未填写地址" });
    }

    const shopAddress = merchant.address.detail;
    const customerAddress = order.address.detail;

    console.log(`商家地址：${shopAddress}`);
    console.log(`用户地址：${customerAddress}`);

    // 解析商家和用户地址
    let origin, dest;
    try {
      console.log(`开始解析商家地址：${shopAddress}`);
      origin = await geocodeAddress(shopAddress);
      console.log(`商家地址解析成功，商家经纬度：`, origin);

      console.log(`开始解析用户地址：${customerAddress}`);
      dest = await geocodeAddress(customerAddress);
      console.log(`用户地址解析成功，用户经纬度：`, dest);
    } catch (geoError: any) {
      console.error("地址解析失败：", geoError);
      return res.status(500).json({ error: "地址解析失败，请检查地图API Key配置", detail: geoError.message });
    }

    // 规划路线
    let route;
    try {
      console.log(`开始规划路线：`, { origin, dest });
      route = await planRoute(origin, dest);
      console.log("路径规划成功：", route);
    } catch (routeError: any) {
      console.error("路径规划失败：", routeError);
      return res.status(500).json({ error: "路径规划失败", detail: routeError.message });
    }

    const points = parseRouteToPoints(route);
    console.log("解析的路径点：", points);

    // 将商家和用户的经纬度保存到数据库
    try {
      console.log("开始更新商家地址...");
      merchant.address.lng = origin.lng;
      merchant.address.lat = origin.lat;
      await merchant.save();
      console.log("商家地址更新并保存成功：", merchant.address);

      console.log("开始更新用户地址...");
      order.address.lng = dest.lng;
      order.address.lat = dest.lat;
      await order.save();
      console.log("用户地址更新并保存成功：", order.address);
    } catch (dbError: any) {
      console.error("保存地址时出错：", dbError);
      return res.status(500).json({ error: "保存地址失败", detail: dbError.message });
    }

    return res.json({
      shopAddress,
      customerAddress,
      origin,
      dest,
      points,
    });
  } catch (err: any) {
    console.error("getRoute 错误：", err);
    return res.status(500).json({ error: err.message || "路线规划失败" });
  }
}
