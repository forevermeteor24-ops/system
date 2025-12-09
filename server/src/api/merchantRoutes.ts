import { Router } from "express";
import { getMerchants,updateDeliveryZone } from "../controllers/merchantController";
import { auth } from '../middleware/authMiddleware';

const router = Router();

router.get("/", getMerchants);
router.put("/delivery-zone", auth(), updateDeliveryZone);

export default router;
