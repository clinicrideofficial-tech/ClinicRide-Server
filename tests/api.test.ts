import { test, expect, describe, mock, beforeEach } from "bun:test";
import request from "supertest";

// 1. Mock the prisma module and other modules globally for this file
mock.module("../src/lib/db", () => ({
  prisma: {
    user: {
      findUnique: mock(() => Promise.resolve(null)),
      update: mock(() => Promise.resolve({})),
      create: mock(() => Promise.resolve({})),
    },
    authAccount: {
      findUnique: mock(() => Promise.resolve(null)),
    },
    patient: {
      findFirst: mock(() => Promise.resolve(null)),
      upsert: mock(() => Promise.resolve({})),
    },
    guardian: {
      findFirst: mock(() => Promise.resolve(null)),
      findUnique: mock(() => Promise.resolve(null)),
      upsert: mock(() => Promise.resolve({})),
    },
    doctor: {
      findUnique: mock(() => Promise.resolve(null)),
      upsert: mock(() => Promise.resolve({})),
    },
    hospital: {
      findFirst: mock(() => Promise.resolve(null)),
      findUnique: mock(() => Promise.resolve(null)),
    },
    service: {
      findMany: mock(() => Promise.resolve([])),
    },
    booking: {
      create: mock(() => Promise.resolve({})),
      findMany: mock(() => Promise.resolve([])),
      findUnique: mock(() => Promise.resolve(null)),
      findFirst: mock(() => Promise.resolve(null)),
      update: mock(() => Promise.resolve({})),
    },
    $transaction: mock(async (callback) => {
        return await callback(prisma);
    }),
  },
}));

mock.module("../src/lib/oauth", () => ({
  google: {
    createAuthorizationURL: mock(() => new URL("https://accounts.google.com/o/oauth2/v2/auth")),
    validateAuthorizationCode: mock(() => Promise.resolve({
        accessToken: () => "mock-access-token"
    })),
  },
}));

// Now import app and prisma
import app from "../src/index";
import { prisma } from "../src/lib/db";
import { generateTestToken, mockUser } from "./helpers";

const mockPrisma = prisma as any;

describe("ClinicRide API Tests", () => {
    
  beforeEach(() => {
    // Reset all mocks before each test
    // mock.restore() doesn't always work for nested mock functions in Bun
    // so we manually reset the ones we care about
    jest.clearAllMocks();
  });

  describe("Auth Endpoints", () => {
    test("GET /auth/google - Redirect", async () => {
      const res = await request(app).get("/auth/google?role=PATIENT");
      expect(res.status).toBe(302);
    });

    test("GET /auth/google/callback - Missing params", async () => {
      const res = await request(app).get("/auth/google/callback");
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Missing state or code");
    });
  });

  describe("Profile Endpoints", () => {
    const token = generateTestToken(mockUser.id);

    test("GET /profile/me - Unauthorized", async () => {
      const res = await request(app).get("/profile/me");
      expect(res.status).toBe(401);
    });

    test("GET /profile/me - Success", async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        ...mockUser,
        createdAt: new Date(),
        patient: null,
        guardian: null,
        doctor: null,
      });

      const res = await request(app)
        .get("/profile/me")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.user.id).toBe(mockUser.id);
      expect(res.body.profileComplete).toBe(false);
    });

    test("PATCH /profile/me - Validation Failure", async () => {
        const res = await request(app)
          .patch("/profile/me")
          .send({ mobile: "123" }) // Too short
          .set("Authorization", `Bearer ${token}`);
  
        expect(res.status).toBe(400);
        expect(res.body.error).toBe("Validation failed");
    });

    test("POST /profile/complete - Patient Success", async () => {
        mockPrisma.user.findUnique.mockResolvedValueOnce({ ...mockUser, role: "PATIENT" });
        mockPrisma.patient.upsert.mockResolvedValueOnce({ id: "p1", age: 25 });
  
        const res = await request(app)
          .post("/profile/complete")
          .send({ age: 25, gender: "MALE" })
          .set("Authorization", `Bearer ${token}`);
  
        expect(res.status).toBe(200);
        expect(res.body.message).toBe("Patient profile completed");
    });
  });

  describe("Booking Endpoints", () => {
    const patientToken = generateTestToken("p-uid");
    const guardianToken = generateTestToken("g-uid");

    test("POST /booking - Role check failure", async () => {
      mockPrisma.patient.findFirst.mockResolvedValueOnce(null);

      const res = await request(app)
        .post("/booking")
        .send({ hospitalId: "00000000-0000-0000-0000-000000000000", pickupType: "HOSPITAL", scheduledAt: new Date().toISOString() })
        .set("Authorization", `Bearer ${patientToken}`);

      expect(res.status).toBe(403);
    });

    test("POST /booking - Validation for HOME pickup", async () => {
        mockPrisma.patient.findFirst.mockResolvedValueOnce({ id: "p1" });
  
        const res = await request(app)
          .post("/booking")
          .send({ hospitalId: "00000000-0000-0000-0000-000000000000", pickupType: "HOME", scheduledAt: new Date().toISOString() })
          .set("Authorization", `Bearer ${patientToken}`);
  
        expect(res.status).toBe(400);
        expect(res.body.details.fieldErrors).toHaveProperty("pickupLat");
    });

    test("POST /booking/respond - ACCEPT Success", async () => {
        mockPrisma.guardian.findFirst.mockResolvedValueOnce({ id: "g1", verificationStatus: "APPROVED" });
        
        mockPrisma.$transaction.mockImplementationOnce(async (callback: any) => {
            return await callback({
                booking: {
                    findFirst: mock(() => Promise.resolve({ id: "b1", hospitalId: "h1", status: "REQUESTED" })),
                    update: mock(() => Promise.resolve({ 
                        id: "b1", 
                        status: "ACCEPTED",
                        patient: { user: { fullName: "P", mobile: "123" }, emergencyPhone: "999" },
                        hospital: { name: "H" },
                        services: []
                    })),
                },
                guardian: {
                    findUnique: mock(() => Promise.resolve({ id: "g1", preferredHospitals: [{ id: "h1" }] })),
                }
            });
        });

        const res = await request(app)
          .post("/booking/respond")
          .send({ bookingId: "00000000-0000-0000-0000-000000000001", action: "ACCEPT" })
          .set("Authorization", `Bearer ${guardianToken}`);

        expect(res.status).toBe(200);
        expect(res.body.message).toContain("accepted");
    });

    test("POST /booking/respond - Already Assigned (409)", async () => {
        mockPrisma.guardian.findFirst.mockResolvedValueOnce({ id: "g1", verificationStatus: "APPROVED" });
        mockPrisma.$transaction.mockImplementationOnce(async () => {
            throw new Error("ALREADY_ASSIGNED");
        });

        const res = await request(app)
          .post("/booking/respond")
          .send({ bookingId: "00000000-0000-0000-0000-000000000001", action: "ACCEPT" })
          .set("Authorization", `Bearer ${guardianToken}`);

        expect(res.status).toBe(409);
    });

    test("PATCH /booking/:id/status - Guardian starts session", async () => {
        mockPrisma.booking.findUnique.mockResolvedValueOnce({
            id: "b1",
            status: "ACCEPTED",
            patient: { user: { id: "p-uid" } },
            guardian: { user: { id: "g-uid" } }
        });
        mockPrisma.booking.update.mockResolvedValueOnce({ id: "b1", status: "IN_PROGRESS" });

        const res = await request(app)
            .patch("/booking/b1/status")
            .send({ status: "IN_PROGRESS" })
            .set("Authorization", `Bearer ${guardianToken}`);

        expect(res.status).toBe(200);
        expect(res.body.message).toContain("started");
    });

    test("PATCH /booking/:id/status - Invalid transition", async () => {
        mockPrisma.booking.findUnique.mockResolvedValueOnce({
          id: "b1",
          status: "REQUESTED",
          patient: { user: { id: "p-uid" } },
          guardian: { user: { id: "g-uid" } }
        });
  
        const res = await request(app)
          .patch("/booking/b1/status")
          .send({ status: "COMPLETED" }) // Requested -> Completed is invalid
          .set("Authorization", `Bearer ${guardianToken}`);
  
        expect(res.status).toBe(400);
      });

    test("GET /booking/:id - Access Denied", async () => {
        mockPrisma.booking.findUnique.mockResolvedValueOnce({
            id: "b1",
            patient: { user: { id: "p-other" } },
            guardian: { user: { id: "g-other" } }
        });

        const res = await request(app)
            .get("/booking/b1")
            .set("Authorization", `Bearer ${patientToken}`); // p-uid tries to access p-other's booking

        expect(res.status).toBe(403);
    });

    test("GET /booking/my - Profile required", async () => {
        mockPrisma.user.findUnique.mockResolvedValueOnce({ 
            id: "p-uid", 
            role: "PATIENT",
            patient: null 
        });

        const res = await request(app)
            .get("/booking/my")
            .set("Authorization", `Bearer ${patientToken}`);

        expect(res.status).toBe(403);
        expect(res.body.error).toContain("Only patients and guardians");
    });
  });
});

// Helper for resetting mocks (since Bun's mock object is a bit different)
const jest = {
    clearAllMocks: () => {
        Object.values(mockPrisma).forEach((model: any) => {
            if (typeof model === 'object') {
                Object.values(model).forEach((method: any) => {
                    if (method && method.mockReset) method.mockReset();
                });
            }
        });
        mockPrisma.$transaction.mockReset();
    }
};
