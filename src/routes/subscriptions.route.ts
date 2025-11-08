import express from 'express'
import { 
    handleNotification, 
    createSubscription, 
    getUserSubscription 
} from '../controllers/subscription.controller.js'
import { authenticateToken } from '../middleware/jwt.middleware.js'

const router = express.Router()

router.post("/notification", handleNotification);
router.post("/create", authenticateToken, createSubscription);
router.get("/info", authenticateToken, getUserSubscription);

export default router;