import { Router } from "express";
import { getOrderHeatmap, getDeliveryTimeStats, getAbnormalOrders } from "../controllers/dashboardController";
import { auth } from "../middleware/authMiddleware";

const router = Router();

// 需要登录才能访问
router.get("/heatmap", auth, getOrderHeatmap);
router.get("/delivery-stats", auth, getDeliveryTimeStats);
router.get("/abnormal-orders", auth, getAbnormalOrders);

export default router;
