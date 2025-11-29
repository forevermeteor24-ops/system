import { Request, Response } from "express";
import User from "../models/userModel";
import bcrypt from "bcryptjs";

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

    // 修改地址
    if (address?.detail) {
      updateData.address = {
        detail: address.detail,
        lng: address.lng ?? null,
        lat: address.lat ?? null,
      };
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
