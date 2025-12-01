import { Request, Response } from "express";
import User from "../models/userModel";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { geocodeAddress } from "./orderController"
export const register = async (req: Request, res: Response) => {
  try {
    let { username, password, role, address } = req.body;

    if (!username || !password || !role) {
      return res.status(400).json({ error: "缺少 username / password / role" });
    }

    // 用户名是否重复
    const exist = await User.findOne({ username });
    if (exist) return res.status(400).json({ error: "用户名已存在" });

    // address 可能是字符串
    if (typeof address === "string") {
      address = {
        detail: address,
        lng: null,
        lat: null,
      };
    }

    // 商家必须有地址 detail
    if (role === "merchant" && !address?.detail) {
      return res.status(400).json({ error: "商家必须填写地址" });
    }

    // ⭐ 在这里解析地址 → 得到经纬度
    if (address?.detail) {
      try {
        const geo = await geocodeAddress(address.detail);
        address.lng = geo.lng;
        address.lat = geo.lat;
      } catch (err) {
        console.error("Geocode failed:", err);
        return res.status(500).json({
          error: "地址解析失败，请检查地址是否有效或地图 API KEY 配置"
        });
      }
    }

    // 加密密码
    const hashed = await bcrypt.hash(password, 10);

    // 创建用户
    await User.create({
      username,
      password: hashed,
      role,
      address,   // ⭐ 现在已经包含 detail + lng + lat
    });

    res.json({ message: "注册成功" });
  } catch (err) {
    console.error("register error:", err);
    res.status(500).json({ error: "注册失败" });
  }
};


export const login = async (req: Request, res: Response) => {
  try {
    const { username, password, role } = req.body;

    if (!username || !password || !role) {
      return res.status(400).json({ error: "缺少参数（username, password, role）" });
    }

    // 查找对应角色的账号（避免 user 登录 merchant 端）
    const user = await User.findOne({ username, role });
    if (!user) {
      return res.status(400).json({ error: "账号不存在或角色不匹配" });
    }

    // 校验密码
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(400).json({ error: "密码错误" });

    // 生成 token
    const token = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET as string,
      { expiresIn: "7d" }
    );

    // 返回 token, role 和 userId
    res.json({
      token,
      role: user.role,
      userId: user._id,  // 返回商家ID（userId）
    });

  } catch (err) {
    console.error("login error:", err);
    res.status(500).json({ error: "登录失败" });
  }
};

