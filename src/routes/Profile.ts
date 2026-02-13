import { Router } from "express";
import { 
  PatientProfileSchema, 
  GuardianProfileSchema, 
  DoctorProfileSchema,
  UserUpdateSchema 
} from "../types";
import authMiddleware from "../lib/middleware";
import { prisma } from "../lib/db";

const router = Router();

// Get list of all active hospitals
router.get("/hospitals", async (req, res) => {
  try {
    const hospitals = await prisma.hospital.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        city: true,
        address: true,
      },
      orderBy: { name: "asc" },
    });
    return res.json({ hospitals });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to fetch hospitals" });
  }
});

// Get current user profile with role-specific data
router.get("/me", authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        patient: true,
        guardian: true,
        doctor: {
          include: {
            hospital: true,
          },
        },
      },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Determine profile completion status
    let profileComplete = false;
    let roleProfile: any = null;

    switch (user.role) {
      case "PATIENT":
        profileComplete = !!user.patient;
        roleProfile = user.patient;
        break;
      case "GUARDIAN":
        profileComplete = !!user.guardian;
        roleProfile = user.guardian;
        break;
      case "DOCTOR":
        profileComplete = !!user.doctor;
        roleProfile = user.doctor;
        break;
    }

    return res.json({
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        mobile: user.mobile,
        role: user.role,
        createdAt: user.createdAt,
      },
      profile: roleProfile,
      profileComplete,
      token: req.token,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Update basic user info (name, mobile)
router.patch("/me", authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const result = UserUpdateSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ 
        error: "Validation failed", 
        details: result.error.flatten() 
      });
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: result.data,
    });

    return res.json({
      message: "User updated successfully",
      user,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Create/Update Patient Profile
router.post("/patient", authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Verify user is a patient
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { patient: true },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (user.role !== "PATIENT") {
      return res.status(403).json({ error: "Only patients can create patient profiles" });
    }

    const result = PatientProfileSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ 
        error: "Validation failed", 
        details: result.error.flatten() 
      });
    }

    const { age, gender, emergencyPhone } = result.data;

    // Upsert patient profile
    const patient = await prisma.patient.upsert({
      where: { userId },
      update: { age, gender, emergencyPhone },
      create: {
        userId,
        age,
        gender,
        emergencyPhone,
      },
    });

    return res.json({
      message: user.patient ? "Patient profile updated" : "Patient profile created",
      profile: patient,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Create/Update Guardian Profile
router.post("/guardian", authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Verify user is a guardian
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { guardian: true },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (user.role !== "GUARDIAN") {
      return res.status(403).json({ error: "Only guardians can create guardian profiles" });
    }

    const result = GuardianProfileSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ 
        error: "Validation failed", 
        details: result.error.flatten() 
      });
    }

    const { age, gender, locality, preferredHospitalIds } = result.data;

    // Upsert guardian profile
    const guardian = await prisma.guardian.upsert({
      where: { userId },
      update: { 
        age, 
        gender, 
        locality, 
        preferredHospitals: {
          set: preferredHospitalIds.map(id => ({ id }))
        }
      },
      create: {
        userId,
        age,
        gender,
        locality,
        preferredHospitals: {
          connect: preferredHospitalIds.map(id => ({ id }))
        }
      },
    });

    return res.json({
      message: user.guardian ? "Guardian profile updated" : "Guardian profile created",
      profile: guardian,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Create/Update Doctor Profile
router.post("/doctor", authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Verify user is a doctor
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { doctor: true },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (user.role !== "DOCTOR") {
      return res.status(403).json({ error: "Only doctors can create doctor profiles" });
    }

    const result = DoctorProfileSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ 
        error: "Validation failed", 
        details: result.error.flatten() 
      });
    }

    const { qualification, experience, hospitalName, city, hospitalId } = result.data;

    // Verify hospital exists
    const hospital = await prisma.hospital.findUnique({
      where: { id: hospitalId },
    });

    if (!hospital) {
      return res.status(400).json({ error: "Hospital not found" });
    }

    // Upsert doctor profile
    const doctor = await prisma.doctor.upsert({
      where: { userId },
      update: { qualification, experience, hospitalName, city, hospitalId },
      create: {
        userId,
        qualification,
        experience,
        hospitalName,
        city,
        hospitalId,
      },
    });

    return res.json({
      message: user.doctor ? "Doctor profile updated" : "Doctor profile created",
      profile: doctor,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Generic profile endpoint - routes to appropriate handler based on user role
router.post("/complete", authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Redirect based on role
    switch (user.role) {
      case "PATIENT": {
        const result = PatientProfileSchema.safeParse(req.body);
        if (!result.success) {
          return res.status(400).json({ 
            error: "Validation failed", 
            details: result.error.flatten(),
            expectedFields: ["age", "gender", "emergencyPhone (optional)"]
          });
        }
        const patient = await prisma.patient.upsert({
          where: { userId },
          update: result.data,
          create: { userId, ...result.data },
        });
        return res.json({ message: "Patient profile completed", profile: patient });
      }

      case "GUARDIAN": {
        const result = GuardianProfileSchema.safeParse(req.body);
        if (!result.success) {
          return res.status(400).json({ 
            error: "Validation failed", 
            details: result.error.flatten(),
            expectedFields: ["age", "gender", "locality", "preferredHospitalIds"]
          });
        }
        const { preferredHospitalIds, ...data } = result.data;
        const guardian = await prisma.guardian.upsert({
          where: { userId },
          update: {
            ...data,
            preferredHospitals: {
              set: preferredHospitalIds.map(id => ({ id }))
            }
          },
          create: { 
            userId, 
            ...data,
            preferredHospitals: {
              connect: preferredHospitalIds.map(id => ({ id }))
            }
          },
        });
        return res.json({ message: "Guardian profile completed", profile: guardian });
      }

      case "DOCTOR": {
        const result = DoctorProfileSchema.safeParse(req.body);
        if (!result.success) {
          return res.status(400).json({ 
            error: "Validation failed", 
            details: result.error.flatten(),
            expectedFields: ["qualification", "experience", "hospitalName", "city", "hospitalId"]
          });
        }
        
        // Verify hospital exists
        const hospital = await prisma.hospital.findUnique({
          where: { id: result.data.hospitalId },
        });
        if (!hospital) {
          return res.status(400).json({ error: "Hospital not found" });
        }

        const doctor = await prisma.doctor.upsert({
          where: { userId },
          update: result.data,
          create: { userId, ...result.data },
        });
        return res.json({ message: "Doctor profile completed", profile: doctor });
      }

      default:
        return res.status(400).json({ error: "Unknown user role" });
    }
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;