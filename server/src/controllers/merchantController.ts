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
