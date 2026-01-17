import { PrismaClient } from './generated/prisma/client'
import { withAccelerate } from '@prisma/extension-accelerate'
import { env } from 'bun'

const acc_url = env.DATABASE_URL!

const prisma = new PrismaClient({
  accelerateUrl: acc_url,
}).$extends(withAccelerate())

console.log("Prisma client initialized", acc_url);

export { prisma }
