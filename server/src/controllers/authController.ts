import { Request, Response } from "express";
import User from "../models/userModel";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

export const register = async (req: Request, res: Response) => {
  try {
    let { username, password, role, address } = req.body;

    // 检查必填
    if (!username || !password || !role) {
      return res.status(400).json({ error: "缺少 username / password / role" });
    }

    // 用户名是否重复
    const exist = await User.findOne({ username });
    if (exist) return res.status(400).json({ error: "用户名已存在" });

    // ⭐ address 可能是字符串，需要格式化
    if (typeof address === "string") {
      address = {
        detail: address,
        lng: null,
        lat: null,
      };
    }

    // 如果是商家，必须有地址 detail（否则发货无法解析）
    if (role === "merchant") {
      if (!address?.detail) {
        return res.status(400).json({ error: "商家必须填写地址" });
      }
    }

    // 加密密码
    const hashed = await bcrypt.hash(password, 10);

    // 创建用户
    await User.create({
      username,
      password: hashed,
      role,
      address, // ⭐ 现在一定是 {detail, lng, lat}
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

    // 查找用户
    const user = await User.findOne({ username });
    if (!user) return res.status(400).json({ error: "账号不存在" });

    // 校验密码
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(400).json({ error: "密码错误" });

    // 🚨 核心逻辑：验证角色是否匹配当前端（非常重要）
    if (user.role !== role) {
      return res.status(403).json({
        error: `账号类型不允许在此端登录（该账号属于 ${user.role}）`,
      });
    }

    // 生成 token
    const token = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET as string,
      { expiresIn: "7d" }
    );

    res.json({
      token,
      role: user.role,
    });
  } catch (err) {
    console.error("login error:", err);
    res.status(500).json({ error: "登录失败" });
  }
};
