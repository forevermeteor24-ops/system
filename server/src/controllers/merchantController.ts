import User from "../models/userModel";
import { Request, Response } from "express";

export async function getMerchants(req: Request, res: Response) {
  try {
    const merchants = await User.find({ role: "merchant" }).select(
      "_id username address"
    );

    return res.json(merchants);
  } catch (err) {
    console.error("getMerchants error:", err);
    return res.status(500).json({ error: "获取商家列表失败" });
  }
}
export const updateDeliveryZone = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId; 
    const { coordinates } = req.body; // Expecting [[[lng, lat], ...]]

    await User.findByIdAndUpdate(userId, {
      deliveryZone: { type: 'Polygon', coordinates }
    });

    res.json({ message: "配送范围已更新" });
  } catch (error) {
    res.status(500).json({ message: "更新失败" });
  }
};
