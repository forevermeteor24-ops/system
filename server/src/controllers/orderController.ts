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
      address, // 前端传来的地址对象，可能只有 detail
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

    const price = product.price;
    const totalPrice = price * quantity;

    // 1. 获取用户在数据库中存的地址信息（包含经纬度）
    const user = await User.findById(userId).select('address');
    
    // 2. 提取经纬度 (如果数据库里也没有，就只能是 null 了)
    const userLng = user?.address?.lng || null;
    const userLat = user?.address?.lat || null;

    // 如果不仅前端没传，数据库里也没存，最好报错提示用户去完善个人信息
    if (userLng === null || userLat === null) {
      // 这里的逻辑看你需求：是直接报错，还是允许创建无坐标订单？
      // 为了地图功能正常，建议报错或给个默认值
      // return res.status(400).json({ error: "您的账户地址未设置经纬度，请先去个人中心完善地址信息。" });
    }

    // 创建订单
    const order = await OrderModel.create({
      title,
      price,
      totalPrice,
      quantity,
      address: {
        detail: address.detail,
        // ⭐ 修正点：优先使用前端传的坐标（如果有），否则使用数据库里查到的用户坐标
        lng: address.lng || userLng, 
        lat: address.lat || userLat,
      },
      // 这个 userLocation 可能是冗余的，看你其他地方用不用，
      // 地图组件主要看的是上面的 address.lng/lat
      userLocation: { 
        lng: address.lng || userLng,
        lat: address.lat || userLat,
      },
      merchantId,
      userId,
      productId,
      status: "待发货",
      routePoints: [],
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
    // 强制断言 req.user 存在，或者使用你自定义的类型
    const actor = (req as any).user;
    if (!actor) return res.status(401).json({ error: "未登录" });

    // 1. 初始化过滤条件（保留原有的权限控制）
    const filter: any = {};
    if (actor.role === "merchant") filter.merchantId = actor.userId;
    else if (actor.role === "user") filter.userId = actor.userId;

    // 状态筛选功能
    const statusParam = req.query.status as string;
    if (statusParam) {
      filter.status = statusParam;
    }

    /** -----------------------
     *  ⭐ 新增：配送范围筛选 (Region Filter)
     *  接收前端参数：region = 'inside' | 'outside'
     ------------------------ */
    const regionParam = req.query.region as string; 
    
    // 只有商家且传递了筛选参数时才执行
    if (actor.role === "merchant" && (regionParam === "inside" || regionParam === "outside")) {
      // 查出商家的配送范围配置
      const merchant = await User.findById(actor.userId);
      
      // 只有当商家确实设置了 deliveryZone 时才生效
      if (merchant && merchant.deliveryZone && merchant.deliveryZone.coordinates.length > 0) {
        
        // 定义“在范围内”的查询条件
        const geoQuery = {
          $geoWithin: {
            $geometry: merchant.deliveryZone
          }
        };

        if (regionParam === "inside") {
          // 筛选：只看范围内的
          filter.location = geoQuery;
        } else {
          // 筛选：只看范围外的 (逻辑：位置存在 且 不在范围内)
          filter.location = { 
            $not: geoQuery,
            $exists: true // 排除掉那些完全没有坐标的老订单
          };
        }
      }
    }
    // -----------------------

    // 排序功能
    const sortParam = req.query.sort as string;
    const sortMap: any = {
      created_desc: { createdAt: -1 },
      created_asc: { createdAt: 1 },
      price_desc: { price: -1 },
      price_asc: { price: 1 },
    };
    const sortRule = sortMap[sortParam] || { createdAt: -1 }; 

    // 执行查询
    const list = await OrderModel.find(filter).sort(sortRule);

    /** -----------------------
     *  ⭐ 原有逻辑保持不变：列表页被动结算 (自动修复僵尸订单)
     *  遍历查出来的列表，如果发现有超时未完成的，自动修正
     ------------------------ */
    const now = new Date();
    const updates: Promise<any>[] = [];

    for (const order of list) {
      // 判断条件：状态是配送中 + 有ETA + 当前时间已超过ETA
      if (order.status === '配送中' && order.eta && now > new Date(order.eta)) {
        order.status = '已送达'; // 修改内存中的状态，保证返回给前端的是最新的
        updates.push(order.save()); // 将数据库写入操作放入队列
      }
    }

    // 如果有需要更新的订单，并行写入数据库
    if (updates.length > 0) {
      await Promise.allSettled(updates); 
    }

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

    // 2. 构建查询构建器
    let query;

    // 保持你原有的权限逻辑不变
    if (actor.role === "merchant") {
      query = OrderModel.findOne({ _id: id, merchantId: actor.userId });
    } 
    else if (actor.role === "user") {
      query = OrderModel.findOne({ _id: id, userId: actor.userId });
    } 
    else {
      query = OrderModel.findById(id);
    }

    // 3. 追加 populate
    query.populate("userId", "username phone");
    query.populate("merchantId", "username phone"); 

    // 4. 执行查询
    const order = await query.exec();

    if (!order) {
      return res.status(404).json({ error: "Order not found 或无权限" });
    }

    /** -----------------------
     *  ⭐ 新增：详情页被动结算
     *  如果查出来的这个订单是“配送中”但已超时，立刻修正并保存
     ------------------------ */
    const isOverdue = order.status === '配送中' && 
                      order.eta && 
                      new Date() > new Date(order.eta);

    if (isOverdue) {
      console.log(`[系统自动修复] 订单 ${id} 已超时，自动变更为已送达`);
      order.status = '已送达';
      // 可选：如果想清理历史轨迹数据节省空间，可加 order.trackState = undefined;
      await order.save();
    }

    return res.json(order);

  } catch (err: any) {
    console.error("getOrder error:", err);
    return res.status(500).json({ error: "获取订单失败" });
  }
}
// --- 辅助函数：确保商家有坐标 ---
// 如果数据库里有，直接返回；如果没有，调API查并存入数据库
async function ensureMerchantGeo(merchant: any) {
  let geo = { lng: merchant.address?.lng, lat: merchant.address?.lat };

  // 如果坐标缺失，进行补全
  if (!geo.lng || !geo.lat) {
    if (!merchant.address?.detail) {
      throw new Error("商家发货地址不完整，无法计算坐标");
    }
    // 调用地图 API
    const newGeo = await geocodeAddress(merchant.address.detail);
    
    // 更新数据库 (以免下次还要查)
    merchant.address.lng = newGeo.lng;
    merchant.address.lat = newGeo.lat;
    await merchant.save();
    
    geo = newGeo;
  }
  return geo;
}

// --- 核心逻辑：只负责算路和更新订单 ---
// 参数变更：不再接收整个 merchant 对象，而是接收明确的 ID 和 坐标
async function coreShipLogic(orderId: string, merchantId: string, merchantGeo: { lat: number, lng: number }) {
  const order = await OrderModel.findById(orderId);
  if (!order) throw new Error(`订单不存在`);
  
  if (order.status !== '待发货') {
    throw new Error(`订单状态不正确 (${order.status})`);
  }
  // 校验归属权
  if (order.merchantId.toString() !== merchantId.toString()) {
    throw new Error(`订单归属权错误`);
  }

  // 1. 起点：直接用传入的商家坐标 (高效)
  const origin = merchantGeo;
  
  // 2. 终点：用户坐标 (如果没有则补全)
  let dest = { lng: order.address.lng, lat: order.address.lat };
  if (!dest.lng || !dest.lat) {
    const geo = await geocodeAddress(order.address.detail);
    dest = geo;
    order.address.lng = geo.lng;
    order.address.lat = geo.lat;
  }

  // 3. 规划路线
  const route = await planRoute(origin, dest);
  const points = parseRouteToPoints(route);

  // 4. 更新订单
  order.status = "配送中";
  order.routePoints = points as any; 
  await order.save();

  // 5. 启动模拟
  startTrack(orderId, points);

  return order;
}
// 接口：单个发货 (保留原有入口，但在内部调用 coreShipLogic)
// ==========================================
export const shipOrder = async (req: Request, res: Response) => {
  try {
    const actor = (req as any).user;
    const merchant = await User.findById(actor.userId);
    if (!merchant) throw new Error("商家不存在");

    // 1. 复用辅助函数，获取商家坐标
    const merchantGeo = await ensureMerchantGeo(merchant);

    // 2. 调用更新后的核心逻辑
    // 注意参数变化：传 ID 和 坐标，而不是整个 merchant
    const result = await coreShipLogic(
      req.params.id, 
      merchant._id.toString(), // <--- 关键修改
      merchantGeo
    );
    
    res.json(result);
  } catch (err: any) {
    console.error("Single ship error:", err);
    res.status(500).json({ error: err.message });
  }
};

// ==========================================
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export const batchShipOrders = async (req: Request, res: Response) => {
  try {
    const actor = (req as any).user;
    const { orderIds } = req.body;

    if (!Array.isArray(orderIds) || orderIds.length === 0) {
      return res.status(400).json({ message: '请选择订单' });
    }

    const merchant = await User.findById(actor.userId);
    if (!merchant) return res.status(404).json({ message: "商家不存在" });

    // 1. 预处理：只调用一次辅助函数，拿到坐标
    // 即使发100单，也只查1次数据库，修补1次坐标
    const merchantGeo = await ensureMerchantGeo(merchant);

    const results = { success: 0, failed: 0, errors: [] as string[] };

    // 2. 串行处理 loop
    for (const id of orderIds) {
      try {
        await coreShipLogic(
          id, 
          merchant._id.toString(), // <--- 这里也要加 .toString()
          merchantGeo
        );
        results.success++;
        // 延时防封
        await sleep(300); 
      } catch (err: any) {
        results.failed++;
        results.errors.push(err.message);
      }
    }

    res.json({
      success: true,
      message: `批量处理完成: 成功 ${results.success} / 失败 ${results.failed}`,
      details: results
    });

  } catch (error) {
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
