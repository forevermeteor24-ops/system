import { Request, Response } from "express";
import User from "../models/userModel";
import bcrypt from "bcryptjs";
import { geocodeAddress } from "./orderController";

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

    const { username, phone, address, oldPassword, newPassword } = req.body;

    const updateData: any = {};
    const user = await User.findById(userId);

    if (!user) return res.status(404).json({ error: "用户不存在" });

    /* -------------------------
     ✅ 修改用户名
    --------------------------- */
    if (username) {
      const exist = await User.findOne({ username, _id: { $ne: userId } });
      if (exist) {
        return res.status(400).json({ error: "用户名已存在" });
      }
      updateData.username = username;
    }

    /* -------------------------
     ✅ 修改手机号
    --------------------------- */
    if (phone) {
      updateData.phone = phone;
    }

    /* -------------------------
     ✅ 修改地址（自动 geocode）
    --------------------------- */
    if (address?.detail) {
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
          error: "地址解析失败，请检查地址是否有效或地图配置",
        });
      }
    }

    /* -------------------------
     ✅ 修改密码：必须验证旧密码
    --------------------------- */
    if (oldPassword || newPassword) {
      if (!oldPassword || !newPassword) {
        return res.status(400).json({ error: "修改密码需要提供旧密码和新密码" });
      }

      const ok = await bcrypt.compare(oldPassword, user.password);
      if (!ok) {
        return res.status(400).json({ error: "原密码错误" });
      }

      updateData.password = await bcrypt.hash(newPassword, 10);
    }

    /* -------------------------
     ✅ 更新数据库
    --------------------------- */
    const updatedUser = await User.findByIdAndUpdate(userId, updateData, {
      new: true,
    }).select("-password");

    return res.json(updatedUser);

  } catch (err) {
    console.error("updateProfile error:", err);
    return res.status(500).json({ error: "更新失败" });
  }
}
