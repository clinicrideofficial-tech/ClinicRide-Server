import { Router } from "express";
import { PhoneSchema } from "../types";
import authMiddleware from "../middleware";
import { prisma } from "../db";

const router = Router()

const JWT_SECRET = process.env.JWT_SECRET || "secret";

    
router.post("/mobile",authMiddleware,async (req, res) => {
    const result = PhoneSchema.safeParse(req.body);
    if (!result.success) {
        return res.status(400).json({
            message: "Invalid phone number"
        });
    }
    const { phone, userID } = result.data;

    try {
        const user = await prisma.user.update({
        where: {
            id: userID
        },  
        data: {
            phone
        }
    });

    if(!user){
        return res.status(404).json({
            message: "User not found"
        })
        }
       
    return res.json({
        message: "Phone number updated successfully",
        user
    })

    } catch (error) {
        console.error(error);
        return res.status(500).json({
            message: "Internal server error"
        })
    }

})

router.get("/me", authMiddleware, async (req, res) => {
    try {
        const user = await prisma.user.findUnique({
            where: {
                id: req.body.user_Id
            }
        });

        if(!user){
            return res.status(404).json({
                message: "User not found"
            })
        }

        res.cookie("user", user.id, { httpOnly: true });

        return res.json({
            message: "User found",
            user
        })
    } catch (error) {
        console.error(error);
        return res.status(500).json({
            message: "Internal server error"
        })
    }
})

export default router