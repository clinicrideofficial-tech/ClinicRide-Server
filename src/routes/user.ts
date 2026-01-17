import { Router } from "express";
// import authMiddleware from "../../middleware";
import { PhoneSchema } from "../types";
import { prisma } from "../db";

const router = Router()

    
router.post("/mobile",(req, res) => {
    const result = PhoneSchema.safeParse(req.body);
    if (!result.success) {
        return res.status(400).json({
            message: "Invalid phone number"
        });
    }
    const { phone } = result.data;

    const user = prisma.user.update({
        where: {
            id: req.body.userId!
        },  
        data: {
            phone
        }
    })

    return res.json({
        message: "Phone number updated successfully",
        user
    })
})

export default router