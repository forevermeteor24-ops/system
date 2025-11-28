import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

// JWT 解码后的类型
interface DecodedUser {
  userId: string;
  role: "merchant" | "user";
  iat?: number;
  exp?: number;
}

// 扩展 Express 的 Request 类型
declare global {
  namespace Express {
    interface Request {
      user?: DecodedUser;
    }
  }
}

export const auth = (roles: string[] = []) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ error: "未登录" });

    try {
      const decoded = jwt.verify(
        token,
        process.env.JWT_SECRET as string
      ) as DecodedUser;

      // 角色检查
      if (roles.length > 0 && !roles.includes(decoded.role)) {
        return res.status(403).json({ error: "无权限访问" });
      }

      req.user = decoded;
      next();
    } catch (err) {
      return res.status(401).json({ error: "无效 Token" });
    }
  };
};
