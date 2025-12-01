import Order from "../models/orderModel";
import { Request, Response } from "express";

//获取订单热力图数据（经纬度列表）
export async function getOrderHeatmap(req: Request, res: Response) {
    try {
      const orders = await Order.find(
        { "address.lng": { $exists: true }, "address.lat": { $exists: true } },
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
  

//获取配送时效（平均配送时长）
export async function getDeliveryTimeStats(req: Request, res: Response) {
    try {
      const orders = await Order.find({
        status: "已送达",
        deliveredAt: { $ne: null }
      }).select("createdAt deliveredAt");
  
      const durations = orders.map(o => o.deliveredAt! - o.createdAt.getTime());
  
      const avg = durations.length
        ? Math.round(durations.reduce((a, b) => a + b) / durations.length)
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

  //获取异常订单（超过 ETA 未送达）
  export async function getAbnormalOrders(req: Request, res: Response) {
    try {
      const now = Date.now();
  
      const abnormal = await Order.find({
        status: "配送中",
        eta: { $ne: null, $lt: now }
      }).select("title eta merchantId userId createdAt");
  
      res.json({ abnormal });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "获取异常订单失败" });
    }
  }
  
