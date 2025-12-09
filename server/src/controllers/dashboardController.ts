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

    const orders = await Order.find(
      { 
        merchantId: merchantId,
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

// ... imports ...

export async function getDeliveryTimeStats(req: Request, res: Response) {
  try {
    const merchantId = getMerchantId(req);
    if (!merchantId) return res.status(401).json({ error: "无法获取用户信息" });

    // 1. 数据清洗 (逻辑不变)
    const corruptedOrders = await Order.find({
      merchantId: merchantId,
      status: "已送达",
      $or: [{ deliveredAt: { $exists: false } }, { deliveredAt: null }]
    });

    if (corruptedOrders.length > 0) {
      const updates = corruptedOrders.map(order => {
        const fixTime = new Date(order.createdAt);
        fixTime.setHours(fixTime.getHours() + 24); // 🟢 默认修复为 24小时后送达
        order.deliveredAt = fixTime.getTime();
        return order.save();
      });
      await Promise.all(updates);
    }

    // 2. 查询数据 (查 eta)
    const orders = await Order.find({
      merchantId: merchantId, 
      status: "已送达",
      deliveredAt: { $ne: null }
    }).select("createdAt deliveredAt eta");

    // 3. 统计逻辑
    let totalDuration = 0;
    
    // 🟢 修改区间定义：[0-12h, 12-24h, 24-48h, 48h+]
    const distribution = [0, 0, 0, 0]; 
    
    let onTimeCount = 0;
    let lateCount = 0;

    const validOrders = orders.filter(o => o.createdAt && o.deliveredAt);

    validOrders.forEach(o => {
      const deliveredTime = new Date(o.deliveredAt).getTime();
      const createdTime = new Date(o.createdAt).getTime();

      // --- A. 计算柱状图分布 (按小时) ---
      const duration = deliveredTime - createdTime;
      totalDuration += duration;
      
      const hours = duration / (1000 * 60 * 60); // 🟢 转换为小时

      if (hours <= 12) distribution[0]++;      // 极速
      else if (hours <= 24) distribution[1]++; // 正常 (1天内)
      else if (hours <= 48) distribution[2]++; // 稍慢 (2天内)
      else distribution[3]++;                  // 慢 (2天以上)

      // --- B. 健康度 (超时逻辑不变，依然基于 ETA) ---
      if (o.eta && deliveredTime > new Date(o.eta).getTime()) {
        lateCount++; 
      } else {
        onTimeCount++;
      }
    });

    const avg = validOrders.length ? Math.round(totalDuration / validOrders.length) : 0;

    res.json({
      avgDeliveryTime: avg, // 依然返回毫秒，前端自己转单位
      count: validOrders.length,
      distribution: distribution,
      health: {
        onTime: onTimeCount,
        late: lateCount
      }
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "统计失败" });
  }
}
// getAbnormalOrders 保持不变，它负责提供饼图里的“红色异常”部分
export async function getAbnormalOrders(req: Request, res: Response) {
  try {
    const merchantId = getMerchantId(req);
    if (!merchantId) return res.status(401).json({ error: "无法获取用户信息" });
    const now = Date.now();
    const abnormal = await Order.find({
      merchantId: merchantId,
      status: "配送中",
      eta: { $ne: null, $lt: now }
    }).select("title eta merchantId userId createdAt");
    res.json({ abnormal });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "获取异常订单失败" });
  }
}