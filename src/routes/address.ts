import { Router } from "express";
import type { Request, Response } from "express";
import authMiddleware from "../lib/middleware";
import { prisma } from "../lib/db";
import {
  CreateAddressSchema,
  UpdateAddressSchema,
} from "../lib/validation/address";

const router = Router();

/**
 * GET /address
 * Get all addresses for the authenticated patient
 */
router.get("/", authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Find patient profile
    const patient = await prisma.patient.findFirst({
      where: { user: { id: userId, role: "PATIENT" } },
    });

    if (!patient) {
      return res.status(403).json({ error: "Only patients can manage addresses" });
    }

    // Get all addresses
    const addresses = await prisma.address.findMany({
      where: { patientId: patient.id },
      orderBy: [
        { isDefault: "desc" }, // Default address first
        { createdAt: "desc" },
      ],
    });

    return res.json({ addresses });
  } catch (error) {
    console.error("Error fetching addresses:", error);
    return res.status(500).json({ error: "Failed to fetch addresses" });
  }
});

/**
 * POST /address
 * Create a new address for the authenticated patient
 */
router.post("/", authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Validate request body
    const result = CreateAddressSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        error: "Validation failed",
        details: result.error.flatten(),
      });
    }

    const data = result.data;

    // Find patient profile
    const patient = await prisma.patient.findFirst({
      where: { user: { id: userId, role: "PATIENT" } },
    });

    if (!patient) {
      return res.status(403).json({ error: "Only patients can manage addresses" });
    }

    // If this is set as default, unset other defaults
    if (data.isDefault) {
      await prisma.address.updateMany({
        where: {
          patientId: patient.id,
          isDefault: true,
        },
        data: { isDefault: false },
      });
    }

    // Create address
    const address = await prisma.address.create({
      data: {
        ...data,
        patientId: patient.id,
      },
    });

    return res.status(201).json({ address });
  } catch (error) {
    console.error("Error creating address:", error);
    return res.status(500).json({ error: "Failed to create address" });
  }
});

/**
 * PATCH /address/:id
 * Update an existing address
 */
router.patch("/:id", authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    const addressId = req.params.id;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Validate request body
    const result = UpdateAddressSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        error: "Validation failed",
        details: result.error.flatten(),
      });
    }

    const data = result.data;

    // Find patient profile
    const patient = await prisma.patient.findFirst({
      where: { user: { id: userId, role: "PATIENT" } },
    });

    if (!patient) {
      return res.status(403).json({ error: "Only patients can manage addresses" });
    }

    // Verify ownership
    const existingAddress = await prisma.address.findUnique({
      where: { id: addressId as any },
    });

    if (!existingAddress || existingAddress.patientId !== patient.id) {
      return res.status(404).json({ error: "Address not found" });
    }

    // If setting as default, unset other defaults
    if (data.isDefault) {
      await prisma.address.updateMany({
        where: {
          patientId: patient.id,
          isDefault: true,
          id: { not: addressId as any},
        },
        data: { isDefault: false },
      });
    }

    // Update address
    const updatedAddress = await prisma.address.update({
      where: { id: addressId as any },
      data,
    });

    return res.json({ address: updatedAddress });
  } catch (error) {
    console.error("Error updating address:", error);
    return res.status(500).json({ error: "Failed to update address" });
  }
});

/**
 * DELETE /address/:id
 * Delete an address
 */
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    const addressId = req.params.id;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Find patient profile
    const patient = await prisma.patient.findFirst({
      where: { user: { id: userId, role: "PATIENT" } },
    });

    if (!patient) {
      return res.status(403).json({ error: "Only patients can manage addresses" });
    }

    // Verify ownership
    const existingAddress = await prisma.address.findUnique({
      where: { id: addressId as any },
    });

    if (!existingAddress || existingAddress.patientId !== patient.id) {
      return res.status(404).json({ error: "Address not found" });
    }

    // Delete address
    await prisma.address.delete({
      where: { id: addressId as any },
    });

    return res.json({ message: "Address deleted successfully" });
  } catch (error) {
    console.error("Error deleting address:", error);
    return res.status(500).json({ error: "Failed to delete address" });
  }
});

export default router;
