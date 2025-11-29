import { Router } from "express";
import { register, login } from "../controllers/authController";
import { getProfile, updateProfile } from "../controllers/userController";
import { auth } from "../middleware/authMiddleware";

const router = Router();

/* 用户注册 */
router.post("/register", register);

/* 用户登录 */
router.post("/login", login);

/* 获取当前用户信息 */
router.get("/me", auth(["merchant", "user"]), getProfile);

/* 更新当前用户信息 */
router.put("/me", auth(["merchant", "user"]), updateProfile);

export default router;
