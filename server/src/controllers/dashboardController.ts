import Order from "../models/orderModel";
import { Request, Response } from "express";

// ⬇️ 辅助函数：从 req 中安全获取商家 ID
const getMerchantId = (req: Request): string | null => {
  return req.user?.userId || null;
};

// 1. 获取订单热力图数据（经纬度列表）
export async function getOrderHeatmap(req: Request, res: Response) {
  try {
    const merchantId = getMerchantId(req);
    if (!merchantId) return res.status(401).json({ error: "无法获取用户信息" });

    // ✅ 修改点：添加 merchantId 过滤条件
    const orders = await Order.find(
      { 
        merchantId: merchantId, // <--- 只查当前商家的单
        "address.lng": { $exists: true }, 
        "address.lat": { $exists: true } 
      },
      { "address.lng": 1, "address.lat": 1 }
    );

    const points = orders
      .filter(o => o.address?.lat && o.address?.lng)
      .map(o => [
        o.address.lat,  // 纬度
        o.address.lng,  // 经度
        1               // 权重
      ]);

    res.json({ points });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "获取热力图数据失败" });
  }
}

// 2. 获取配送时效（平均配送时长）
export async function getDeliveryTimeStats(req: Request, res: Response) {
  try {
    const merchantId = getMerchantId(req);
    if (!merchantId) return res.status(401).json({ error: "无法获取用户信息" });

    // ✅ 修改点：添加 merchantId 过滤条件
    const orders = await Order.find({
      merchantId: merchantId, // <--- 只查当前商家的单
      status: "已送达",
      deliveredAt: { $ne: null }
    }).select("createdAt deliveredAt");

    const durations = orders.map(o => {
        // 确保时间存在再计算
        if (o.deliveredAt && o.createdAt) {
            return new Date(o.deliveredAt).getTime() - new Date(o.createdAt).getTime();
        }
        return 0;
    }).filter(d => d > 0); // 过滤掉无效数据

    const avg = durations.length
      ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
      : 0;

    res.json({
      avgDeliveryTime: avg, // 毫秒
      count: durations.length
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "配送时效统计失败" });
  }
}

// 3. 获取异常订单（超过 ETA 未送达）
export async function getAbnormalOrders(req: Request, res: Response) {
  try {
    const merchantId = getMerchantId(req);
    if (!merchantId) return res.status(401).json({ error: "无法获取用户信息" });

    const now = Date.now();

    // ✅ 修改点：添加 merchantId 过滤条件
    const abnormal = await Order.find({
      merchantId: merchantId, // <--- 只查当前商家的单
      status: "配送中",
      eta: { $ne: null, $lt: now }
    }).select("title eta merchantId userId createdAt");

    res.json({ abnormal });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "获取异常订单失败" });
  }
}