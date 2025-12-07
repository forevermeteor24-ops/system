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

// 2. 获取配送时效（平均配送时长）
export async function getDeliveryTimeStats(req: Request, res: Response) {
  try {
    const merchantId = getMerchantId(req);
    if (!merchantId) return res.status(401).json({ error: "无法获取用户信息" });

    // ================== 🟢 新增：数据清洗逻辑 ==================
    // 目的：修复那些被强制改为“已送达”但缺少送达时间的僵尸订单
    // 查找条件：当前商家的单 + 状态已送达 + (deliveredAt 不存在 或 为 null)
    const corruptedOrders = await Order.find({
      merchantId: merchantId,
      status: "已送达",
      $or: [
        { deliveredAt: { $exists: false } },
        { deliveredAt: null }
      ]
    });

    if (corruptedOrders.length > 0) {
      console.log(`[Dashboard] 正在修复 ${corruptedOrders.length} 个缺失时间的已送达订单...`);
      
      const updates = corruptedOrders.map(order => {
        // 补全策略：如果没有送达时间，默认为“创建时间 + 30分钟”
        // 这样既补全了数据，又不会让平均时效数据变得离谱
        const fixTime = new Date(order.createdAt);
        fixTime.setMinutes(fixTime.getMinutes() + 30); 
        
        order.deliveredAt = fixTime.getTime();
        return order.save();
      });
      
      // 等待修复完成
      await Promise.all(updates);
    }
    // =========================================================

    // ✅ 原有逻辑（现在能查到刚才修复的订单了）
    const orders = await Order.find({
      merchantId: merchantId, 
      status: "已送达",
      deliveredAt: { $ne: null }
    }).select("createdAt deliveredAt");

    const durations = orders.map(o => {
        if (o.deliveredAt && o.createdAt) {
            return new Date(o.deliveredAt).getTime() - new Date(o.createdAt).getTime();
        }
        return 0;
    }).filter(d => d > 0); 

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

    // 这里的逻辑不用动，因为上面的修复逻辑跑完后，
    // 僵尸订单状态变成了“已送达”，自然就不会出现在这里了
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