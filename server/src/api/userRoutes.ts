import { Router } from "express";
import { auth } from "../middleware/authMiddleware";
import { updateProfile, getProfile } from "../controllers/userController";

const router = Router();

/* 获取当前用户信息 */
router.get("/me", auth(["merchant", "user"]), getProfile);

/* 更新当前用户信息 */
router.put("/me", auth(["merchant", "user"]), updateProfile);

export default router;
