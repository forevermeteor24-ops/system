import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

// JWT 解码后的类型
interface DecodedUser {
  userId: string;
  role: "merchant" | "user" | string;  // 角色类型可以扩展更多
  iat?: number;
  exp?: number;
}

// 扩展 Express 的 Request 类型，添加 user 属性
declare global {
  namespace Express {
    interface Request {
      user?: DecodedUser; // 用户信息
    }
  }
}

// 认证中间件，处理角色权限
export const auth = (roles: string[] = []) => {
  return (req: Request, res: Response, next: NextFunction) => {
    // 获取 Authorization 头部并提取 Token
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ error: "未登录" });

    try {
      // 使用 JWT 验证并解码 Token
      const decoded = jwt.verify(
        token,
        process.env.JWT_SECRET as string
      ) as DecodedUser;

      // 角色权限检查：如果没有指定角色或角色不匹配，则拒绝访问
      if (roles.length > 0 && !roles.includes(decoded.role)) {
        return res.status(403).json({ error: "无权限访问" });
      }

      // 将解码后的用户信息附加到请求对象上
      req.user = decoded;

      // 继续执行后续的中间件或路由处理函数
      next();
    } catch (err) {
      console.error("JWT 验证失败:", err);
      return res.status(401).json({ error: "无效 Token" });
    }
  };
};
