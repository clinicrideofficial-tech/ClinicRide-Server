import {z} from "zod";

export const PhoneSchema = z.object({
    phone: z.string().min(10).max(15),
})
