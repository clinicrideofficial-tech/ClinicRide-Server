import { Router } from "express";
import type { Request, Response } from "express";
import authMiddleware from "../lib/middleware";
import { prisma } from "../lib/db";
import {
  CreateBookingSchema,
  GuardianResponseSchema,
  UpdateBookingStatusSchema,
} from "../types";

const router = Router();

/**
 * POST /booking
 * Create a new booking request (Patient only)
 * 
 * Flow:
 * 1. Patient submits booking with hospital, pickup type, location (if HOME), scheduled time
 * 2. Booking is created with status REQUESTED
 * 3. System finds eligible guardians (active, verified, hospital in preferred areas)
 */
router.post("/", authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Verify user is a patient with a profile
    const patient = await prisma.patient.findFirst({
      where: { user: { id: userId, role: "PATIENT" as const } },
    });

    if (!patient) {
      return res.status(403).json({ 
        error: "Only patients with completed profiles can create bookings" 
      });
    }

    // Validate request body
    const result = CreateBookingSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        error: "Validation failed",
        details: result.error.flatten(),
      });
    }

    const { hospitalId, pickupType, pickupLat, pickupLng, pickupAddress, scheduledAt, notes, serviceIds } = result.data;

    // Verify hospital exists and is active
    const hospital = await prisma.hospital.findFirst({
      where: { id: hospitalId, isActive: true },
    });

    if (!hospital) {
      return res.status(404).json({ error: "Hospital not found or is inactive" });
    }

    // Verify services exist (if provided)
    // if (serviceIds && serviceIds.length > 0) {
    //   const services = await prisma.service.findMany({
    //     where: { id: { in: serviceIds } },
    //   });
    //   if (services.length !== serviceIds.length) {
    //     return res.status(400).json({ error: "One or more services not found" });
    //   }
    // }

    // Create the booking
    const booking = await prisma.booking.create({
      data: {
        patientId: patient.id,
        hospitalId,
        pickupType,
        pickupLat: pickupType === "HOME" ? pickupLat : null,
        pickupLng: pickupType === "HOME" ? pickupLng : null,
        pickupAddress,
        scheduledAt: new Date(scheduledAt),
        notes,
        status: "REQUESTED",
        services: serviceIds ? {
          create: serviceIds.map(serviceId => ({ serviceId }))
        } : undefined,
      },
      include: {
        hospital: true,
        services: { include: { service: true } },
      },
    });

    // Find eligible guardians
    const eligibleGuardians = await findEligibleGuardians(hospitalId);

    return res.status(201).json({
      message: "Booking request created successfully",
      booking,
      eligibleGuardiansCount: eligibleGuardians.length,
      nextStep: eligibleGuardians.length > 0 
        ? "Waiting for a guardian to accept your request" 
        : "No guardians available in your area. We'll notify you when one becomes available.",
    });
  } catch (error) {
    console.error("Create booking error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /booking/pending
 * Get pending booking requests for guardians in their preferred areas (Guardian only)
 */
router.get("/pending", authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Verify user is an approved guardian
    const guardian = await prisma.guardian.findFirst({
      where: { 
        user: { id: userId, role: "GUARDIAN" as const },
        verificationStatus: "APPROVED" as const,
      },
      include: {
        preferredHospitals: true,
      },
    });

    if (!guardian) {
      return res.status(403).json({ 
        error: "Only verified guardians can view pending requests" 
      });
    }

    // Find pending bookings where hospital city matches guardian's preferred areas
    const pendingBookings = await prisma.booking.findMany({
      where: {
        status: "REQUESTED",
        guardianId: null, // Not yet assigned
        hospitalId: {
          in: guardian.preferredHospitals.map((h: any) => h.id),
        },
      },
      include: {
        patient: {
          include: {
            user: {
              select: { fullName: true, mobile: true },
            },
          },
        },
        hospital: {
          select: { id: true, name: true, address: true, city: true },
        },
        services: { include: { service: true } },
      },
      orderBy: { scheduledAt: "asc" },
    } as any) as any[];

    return res.json({
      count: pendingBookings.length,
      bookings: pendingBookings.map((booking: any) => ({
        id: booking.id,
        patient: {
          name: booking.patient.user.fullName,
          mobile: booking.patient.user.mobile,
          age: booking.patient.age,
          gender: booking.patient.gender,
        },
        hospital: booking.hospital,
        pickupType: booking.pickupType,
        pickupLocation: booking.pickupType === "HOME" ? {
          lat: booking.pickupLat,
          lng: booking.pickupLng,
          address: booking.pickupAddress,
        } : null,
        scheduledAt: booking.scheduledAt,
        notes: booking.notes,
        services: booking.services.map((s: any) => s.service),
        createdAt: booking.createdAt,
      })),
    });
  } catch (error) {
    console.error("Get pending bookings error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /booking/respond
 * Accept or reject a booking request (Guardian only)
 */
router.post("/respond", authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Verify user is an approved guardian
    const guardian = await prisma.guardian.findFirst({
      where: { 
        user: { id: userId, role: "GUARDIAN" },
        verificationStatus: "APPROVED",
      },
    });

    if (!guardian) {
      return res.status(403).json({ 
        error: "Only verified guardians can respond to requests" 
      });
    }

    // Validate request body
    const result = GuardianResponseSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        error: "Validation failed",
        details: result.error.flatten(),
      });
    }

    const { bookingId, action } = result.data;

    if (action === "ACCEPT") {
      try {
        // Use atomic transaction with pessimistic lock to prevent race conditions
        // This ensures only one guardian can accept a booking at a time
        const updatedBooking = await prisma.$transaction(async (tx) => {
          return await tx.booking.update({
            where: { 
              id: bookingId,
              status: "REQUESTED",
              guardianId: null,
            },
            data: {
              guardianId: guardian.id,
              status: "ACCEPTED",
            },
            include: {
              patient: {
                include: {
                  user: { select: { fullName: true, mobile: true, email: true } },
                },
              },
              hospital: true,
              services: { include: { service: true } },
            },
          });
        });

        return res.json({
          message: "Booking accepted! Session will begin soon.",
          booking: updatedBooking,
          patientContact: {
            name: updatedBooking.patient.user.fullName,
            mobile: updatedBooking.patient.user.mobile,
            emergencyPhone: updatedBooking.patient.emergencyPhone,
          },
          pickupDetails: {
            type: updatedBooking.pickupType,
            hospital: updatedBooking.hospital,
            location: updatedBooking.pickupType === "HOME" ? {
              lat: updatedBooking.pickupLat,
              lng: updatedBooking.pickupLng,
              address: updatedBooking.pickupAddress,
            } : null,
            scheduledAt: updatedBooking.scheduledAt,
          },
        });
      } catch (error: any) {
        if (error.code === 'P2025') {
          return res.status(409).json({ 
            error: "Booking not found or already assigned to another guardian" 
          });
        }
        console.error("Accept booking error:", error);
        return res.status(500).json({ error: "Failed to accept booking" });
      }
    } else {
      // For REJECT action, first verify the booking exists and is in guardian's area
      const booking = await prisma.booking.findFirst({
        where: {
          id: bookingId,
          status: "REQUESTED",
          guardianId: null,
        },
        include: {
          hospital: true,
        },
      }) as any;

      const guardianWithPrefs = await prisma.guardian.findUnique({
        where: { id: guardian.id },
        include: { preferredHospitals: true },
      });

      if (!booking) {
        return res.status(404).json({ 
          error: "Booking not found or already assigned" 
        });
      }

      if (!guardianWithPrefs?.preferredHospitals.some(h => h.id === booking.hospitalId)) {
        return res.status(403).json({ 
          error: "This hospital is not in your preferred list" 
        });
      }
      // Reject - just leave it for other guardians
      // In a production system, you might track rejections to avoid showing
      // the same booking to the same guardian again
      return res.json({
        message: "Booking rejected. The request will be shown to other guardians.",
      });
    }
  } catch (error) {
    console.error("Respond to booking error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * PATCH /booking/:id/status
 * Update booking status (Guardian only - for IN_PROGRESS, COMPLETED)
 * Patient can CANCEL their own booking
 */
router.patch("/:id/status", authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    const bookingId = req.params.id as string;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Validate request body
    const result = UpdateBookingStatusSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        error: "Validation failed",
        details: result.error.flatten(),
      });
    }

    const { status } = result.data;

    // Find the booking
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        patient: { include: { user: true } },
        guardian: { include: { user: true } },
      },
    });

    if (!booking) {
      return res.status(404).json({ error: "Booking not found" });
    }

    // Authorization logic
    const isPatient = booking.patient.user.id === userId;
    const isGuardian = booking.guardian?.user.id === userId;

    // Patients can only cancel
    if (isPatient && status !== "CANCELLED") {
      return res.status(403).json({ error: "Patients can only cancel bookings" });
    }

    // Only guardian can start or complete session
    if ((status === "IN_PROGRESS" || status === "COMPLETED") && !isGuardian) {
      return res.status(403).json({ error: "Only the assigned guardian can update this status" });
    }

    // Validate status transitions
    const validTransitions: Record<string, string[]> = {
      REQUESTED: ["CANCELLED"],
      ACCEPTED: ["IN_PROGRESS", "CANCELLED"],
      IN_PROGRESS: ["COMPLETED", "CANCELLED"],
    };

    if (!validTransitions[booking.status]?.includes(status)) {
      return res.status(400).json({ 
        error: `Cannot transition from ${booking.status} to ${status}` 
      });
    }

    // Update the booking
    const updatedBooking = await prisma.booking.update({
      where: { id: bookingId },
      data: { status },
      include: {
        patient: { include: { user: { select: { fullName: true } } } },
        guardian: { include: { user: { select: { fullName: true } } } },
        hospital: true,
      },
    });

    const statusMessages: Record<string, string> = {
      IN_PROGRESS: "Session started! Safe travels.",
      COMPLETED: "Session completed successfully!",
      CANCELLED: "Booking has been cancelled.",
    };

    return res.json({
      message: statusMessages[status],
      booking: updatedBooking,
    });
  } catch (error) {
    console.error("Update booking status error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /booking/my
 * Get current user's bookings (works for both patients and guardians)
 */
router.get("/my", authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { patient: true, guardian: true },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    let bookings;

    if (user.role === "PATIENT" && user.patient) {
      bookings = await prisma.booking.findMany({
        where: { patientId: user.patient.id },
        include: {
          hospital: { select: { id: true, name: true, address: true, city: true } },
          guardian: {
            include: {
              user: { select: { fullName: true, mobile: true } },
            },
          },
          services: { include: { service: true } },
        },
        orderBy: { createdAt: "desc" },
      });
    } else if (user.role === "GUARDIAN" && user.guardian) {
      bookings = await prisma.booking.findMany({
        where: { guardianId: user.guardian.id },
        include: {
          hospital: { select: { id: true, name: true, address: true, city: true } },
          patient: {
            include: {
              user: { select: { fullName: true, mobile: true } },
            },
          },
          services: { include: { service: true } },
        },
        orderBy: { createdAt: "desc" },
      });
    } else {
      return res.status(403).json({ 
        error: "Only patients and guardians can view bookings" 
      });
    }

    return res.json({ bookings });
  } catch (error) {
    console.error("Get my bookings error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /booking/:id
 * Get a specific booking by ID
 */
router.get("/:id", authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    const bookingId = req.params.id as string;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        patient: {
          include: {
            user: { select: { id: true, fullName: true, mobile: true, email: true } },
          },
        },
        guardian: {
          include: {
            user: { select: { id: true, fullName: true, mobile: true } },
          },
        },
        hospital: true,
        services: { include: { service: true } },
        review: true,
      },
    });

    if (!booking) {
      return res.status(404).json({ error: "Booking not found" });
    }

    // Authorization: only patient, assigned guardian, or admin can view
    const isPatient = booking.patient.user.id === userId;
    const isGuardian = booking.guardian?.user.id === userId;

    if (!isPatient && !isGuardian) {
      return res.status(403).json({ error: "You don't have access to this booking" });
    }

    return res.json({ booking });
  } catch (error) {
    console.error("Get booking error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Helper function to find eligible guardians
async function findEligibleGuardians(hospitalId: string) {
  return prisma.guardian.findMany({
    where: {
      verificationStatus: "APPROVED",
      preferredHospitals: {
        some: {
          id: hospitalId,
        },
      },
    },
    include: {
      user: { select: { fullName: true } },
    },
  });
}

export default router;