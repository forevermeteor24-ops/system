import { Request, Response } from "express";
import User from "../models/userModel";
import bcrypt from "bcryptjs";
import { geocodeAddress } from "./orderController"
/** 获取当前用户信息 */
export async function getProfile(req: Request, res: Response) {
  try {
    const user = await User.findById(req.user!.userId).select("-password");
    if (!user) return res.status(404).json({ error: "用户不存在" });

    res.json(user);
  } catch (err) {
    res.status(500).json({ error: "获取失败" });
  }
}

/** 更新账号信息 */
export async function updateProfile(req: Request, res: Response) {
  try {
    const userId = req.user!.userId;

    const { username, password, address } = req.body;

    const updateData: any = {};

    // 修改用户名
    if (username) {
      const exist = await User.findOne({ username, _id: { $ne: userId } });
      if (exist) return res.status(400).json({ error: "用户名已存在" });

      updateData.username = username;
    }

    // 修改密码
    if (password) {
      updateData.password = await bcrypt.hash(password, 10);
    }

    // ⭐ 地址修改逻辑
    if (address?.detail) {
      // 解析经纬度
      try {
        const geo = await geocodeAddress(address.detail);

        updateData.address = {
          detail: address.detail,
          lng: geo.lng,
          lat: geo.lat,
        };
      } catch (err) {
        console.error("Geocode failed:", err);
        return res.status(500).json({
          error: "地址解析失败，请检查地址是否有效或地图 API KEY 配置",
        });
      }
    }

    const user = await User.findByIdAndUpdate(userId, updateData, {
      new: true,
    }).select("-password");

    return res.json(user);
  } catch (err) {
    console.error("updateProfile error:", err);
    return res.status(500).json({ error: "更新失败" });
  }
}

