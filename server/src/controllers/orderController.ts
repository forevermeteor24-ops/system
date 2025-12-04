import { Request, Response } from "express";
import axios from "axios";
import OrderModel from "../models/orderModel";
import User from "../models/userModel";
import ProductModel from "../models/productModel";
import { startTrack } from "../ws";
import Order from '../models/orderModel';
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
      address,
      productId,
      merchantId: bodyMerchantId,
      userId: bodyUserId,
      quantity,
    } = req.body;

    if (!title || !address || !productId || !quantity) {
      return res.status(400).json({ error: "缺少 title、address、productId 或 quantity" });
    }

    if (typeof quantity !== "number" || quantity <= 0) {
      return res.status(400).json({ error: "quantity 必须为正数" });
    }

    const actor = (req as any).user;
    if (!actor) return res.status(401).json({ error: "未登录" });

    let merchantId: string | undefined;
    let userId: string | undefined;

    if (actor.role === "user") {
      if (!bodyMerchantId) {
        return res.status(400).json({ error: "用户下单必须提供 merchantId" });
      }
      merchantId = bodyMerchantId;
      userId = actor.userId;
    } else if (actor.role === "merchant") {
      merchantId = actor.userId;
      if (bodyUserId) userId = bodyUserId;
    } else {
      return res.status(403).json({ error: "无权限创建订单" });
    }

    const product = await ProductModel.findById(productId);
    if (!product) return res.status(404).json({ error: "商品不存在" });

    if (product.merchantId.toString() !== merchantId) {
      return res.status(403).json({ error: "商品不属于该商家" });
    }

    /** 单价 */
    const price = product.price;

    /** 总价 = 单价 * 数量 */
    const totalPrice = price * quantity;

    /** 获取用户经纬度 */
    const { lat, lng } = actor.address; // 从用户的地址中获取经纬度

    /** 创建订单 */
    const order = await OrderModel.create({
      title,
      price,        // ⭐ 单价
      totalPrice,   // ⭐ 总价（必填）
      quantity,
      address: {
        detail: address.detail,
        lng: address.lng || null,
        lat: address.lat || null,
      },
      userLocation: { // 保存用户的经纬度
        lat: lat || null,
        lng: lng || null,
      },
      status: "待发货",
      merchantId,
      userId,
      productId,
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




/** 获取订单列表（支持排序 + 状态筛选） */
export async function getOrders(req: Request, res: Response) {
  try {
    const actor = req.user;
    if (!actor) return res.status(401).json({ error: "未登录" });

    // 1. 初始化过滤条件（保留原有的权限控制）
    const filter: any = {};
    if (actor.role === "merchant") filter.merchantId = actor.userId;
    else if (actor.role === "user") filter.userId = actor.userId;

    /** -----------------------
     *  ⭐ 新增：状态筛选功能
     *  配合前端 fetchPendingOrders 中的 ?status=待发货
     ------------------------ */
    const statusParam = req.query.status as string;
    if (statusParam) {
      filter.status = statusParam;
    }

    /** -----------------------
     *  ⭐ 原有：排序功能
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

    // 执行查询
    const list = await OrderModel.find(filter).sort(sortRule);

    return res.json(list);
  } catch (err: any) {
    console.error("getOrders error:", err);
    return res.status(500).json({ error: "获取订单列表失败" });
  }
}


export async function getOrder(req: Request, res: Response) {
  try {
    // 1. 获取当前登录用户
    const actor = (req as any).user;
    if (!actor) return res.status(401).json({ error: "未登录" });

    const id = req.params.id;
    if (!id) return res.status(400).json({ error: "缺少订单 id" });

    // 2. 构建查询构建器 (Query Builder)
    // 我们先不加 await，因为后面要追加 populate
    let query;

    // 🔴 保持你原有的权限逻辑不变：
    // 如果是商家，必须同时匹配 订单ID 和 商家ID
    if (actor.role === "merchant") {
      query = OrderModel.findOne({ _id: id, merchantId: actor.userId });
    } 
    // 如果是用户，必须同时匹配 订单ID 和 用户ID
    else if (actor.role === "user") {
      query = OrderModel.findOne({ _id: id, userId: actor.userId });
    } 
    // 管理员或其他
    else {
      query = OrderModel.findById(id);
    }

    // 3. ⭐ 核心修改：追加 populate
    // 这会将 userId 字段从 "字符串ID" 填充为 "包含 username 和 phone 的对象"
    query.populate("userId", "username phone");
    query.populate("merchantId", "username phone"); 

    // 4. 执行查询
    const order = await query.exec();

    if (!order) {
      return res.status(404).json({ error: "Order not found 或无权限" });
    }

    return res.json(order);

  } catch (err: any) {
    console.error("getOrder error:", err);
    return res.status(500).json({ error: "获取订单失败" });
  }
}
// 核心发货逻辑 (公共函数)
// ==========================================
async function coreShipLogic(orderId: string, merchant: any) {
  // 1. 查订单
  const order = await OrderModel.findById(orderId);
  if (!order) throw new Error(`订单不存在`);
  
  // 2. 状态校验
  if (order.status !== '待发货') {
    throw new Error(`订单 ${order.title} 状态不正确 (${order.status})`);
  }
  if (order.merchantId.toString() !== merchant._id.toString()) {
    throw new Error(`订单 ${order.title} 归属权错误`);
  }

  // 3. 地址与坐标处理
  const shopAddress = merchant.address;
  const userAddress = order.address;

  if (!shopAddress?.detail || !userAddress?.detail) {
    throw new Error(`订单 ${order.title} 地址信息缺失`);
  }

  let origin = { lng: shopAddress.lng, lat: shopAddress.lat };
  let dest = { lng: userAddress.lng, lat: userAddress.lat };

  // 补全商家坐标
  if (!origin.lng || !origin.lat) {
    const geo = await geocodeAddress(shopAddress.detail);
    origin = geo;
    // 顺便更新商家信息，避免下次重复查
    await User.findByIdAndUpdate(merchant._id, { 'address.lng': geo.lng, 'address.lat': geo.lat });
  }

  // 补全用户坐标
  if (!dest.lng || !dest.lat) {
    const geo = await geocodeAddress(userAddress.detail);
    dest = geo;
    order.address.lng = geo.lng;
    order.address.lat = geo.lat;
  }

  // 4. 路线规划 (耗时操作)
  const route = await planRoute(origin, dest);
  const points = parseRouteToPoints(route);

  // 5. 更新数据库
  order.status = "配送中";
  order.routePoints = points as any; 
  await order.save();

  // 6. 启动模拟器
  startTrack(orderId, points);

  return order;
}

// 接口：单个发货 (保留原有入口，但在内部调用 coreShipLogic)
// ==========================================
export const shipOrder = async (req: Request, res: Response) => {
  try {
    const actor = (req as any).user;
    const merchant = await User.findById(actor.userId);
    const result = await coreShipLogic(req.params.id, merchant);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

// ==========================================
export const batchShipOrders = async (req: Request, res: Response) => {
  try {
    const actor = (req as any).user;
    const { orderIds } = req.body; // Array of strings

    if (!Array.isArray(orderIds) || orderIds.length === 0) {
      return res.status(400).json({ message: '请选择订单' });
    }

    // 获取商家信息 (只查一次)
    const merchant = await User.findById(actor.userId);
    if (!merchant) return res.status(404).json({ message: "商家不存在" });

    // 并发处理 (使用 allSettled 防止单单失败影响整体)
    const results = await Promise.allSettled(
      orderIds.map(id => coreShipLogic(id, merchant))
    );

    // 统计结果
    const successCount = results.filter(r => r.status === 'fulfilled').length;
    const errors = results
      .filter(r => r.status === 'rejected')
      .map((r: any) => r.reason.message);

    res.json({
      success: true,
      message: `处理结束: 成功 ${successCount} / 总 ${orderIds.length}`,
      details: { successCount, errors }
    });

  } catch (error) {
    console.error('Batch ship error:', error);
    res.status(500).json({ message: '批量发货系统异常' });
  }
};

/** 更新订单状态 */
export async function updateOrderStatus(req: Request, res: Response) {
  try {
    const { status } = req.body;
    const orderId = req.params.id;
    const actor = req.user!;

    const order = await OrderModel.findById(orderId);
    if (!order) return res.status(404).json({ error: "订单不存在" });

    /* ------------------------
        用户行为
    ------------------------ */
    if (actor.role === "user") {
      if (status === "用户申请退货") {
        if (!["待发货", "配送中"].includes(order.status))
          return res.status(400).json({ error: "当前状态不可申请退货" });

        order.status = "用户申请退货";
        await order.save();
        return res.json(order);
      }

      if (status === "已完成") {
        // 仅用户确认收货时可更新
        if (order.status !== "已送达")
          return res.status(400).json({ error: "只有已送达状态才能确认收货" });

        order.status = "已完成";
        await order.save();
        return res.json(order);
      }

      return res.status(403).json({ error: "用户无法更新为该状态" });
    }

    /* ------------------------
        商家行为
    ------------------------ */
    if (actor.role === "merchant") {
      if (order.merchantId.toString() !== actor.userId)
        return res.status(403).json({ error: "不能操作其他商家订单" });

      // 商家取消订单
      if (status === "商家已取消") {
        if (order.status !== "用户申请退货") {
          return res.status(400).json({ error: "只有在用户申请退货时商家才能取消订单" });
        }

        order.status = "商家已取消";
        await order.save();
        return res.json(order);
      }

      return res.status(403).json({ error: "商家不能更新为该状态" });
    }

    return res.status(403).json({ error: "无权限更新订单状态" });

  } catch (err: any) {
    console.error("updateOrderStatus error:", err);
    return res.status(500).json({ error: "状态更新失败", detail: err.message });
  }
}

/*删除订单*/
export async function deleteOrder(req: Request, res: Response) {
  try {
    const actor = req.user!;
    const orderId = req.params.id;

    const order = await OrderModel.findById(orderId);
    if (!order) return res.status(404).json({ error: "订单不存在" });

    // 只有 "已完成" 或 "商家已取消" 状态可以删除
    const canDelete = ["已完成", "商家已取消"];
    if (!canDelete.includes(order.status))
      return res.status(400).json({ error: "当前状态不可删除订单" });

    // 只能删除自己的订单
    if (actor.role === "user" && order.userId.toString() !== actor.userId) {
      return res.status(403).json({ error: "不能删除他人订单" });
    }

    if (actor.role === "merchant" && order.merchantId.toString() !== actor.userId) {
      return res.status(403).json({ error: "不能删除他人订单" });
    }

    await order.deleteOne();
    return res.json({ message: "订单已删除" });
  } catch (err: any) {
    console.error("deleteOrder error:", err);
    return res.status(500).json({ error: "删除失败", detail: err.message });
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
