import express from 'express'
import { 
    handleNotification, 
    createSubscription, 
    getUserSubscription 
} from '../controllers/subscription.controller'
import { authenticateToken } from '../middleware/jwt.middleware'

const router = express.Router()

router.post("/notification", handleNotification);
router.post("/create", authenticateToken, createSubscription);
router.get("/info", authenticateToken, getUserSubscription);

export default router;