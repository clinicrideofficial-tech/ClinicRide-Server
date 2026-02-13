import { prisma } from '../src/lib/db.ts';

async function main() {
  console.log('Cleaning up database...');
  // Order matters for deletion due to constraints
  await prisma.bookingService.deleteMany();
  await prisma.review.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.hospitalService.deleteMany();
  await prisma.doctor.deleteMany();
  await prisma.patient.deleteMany();
  await prisma.guardian.deleteMany();
  await prisma.hospital.deleteMany();
  await prisma.service.deleteMany();
  await prisma.authAccount.deleteMany();
  await prisma.user.deleteMany();

  console.log('Seeding data...');

  // 1. Create Services
  const services = await Promise.all([
    prisma.service.create({ data: { name: 'Wheelchair Assistance', description: 'Assistance with wheelchair' } }),
    prisma.service.create({ data: { name: 'Oxygen Support', description: 'Oxygen tank and mask support' } }),
    prisma.service.create({ data: { name: 'Bedridden Transport', description: 'Stretcher and bed-to-bed transport' } }),
    prisma.service.create({ data: { name: 'Language Translator', description: 'Assistance with local language' } }),
  ]);

  // 2. Create Hospitals
  const hospitals = await Promise.all([
    prisma.hospital.create({
      data: {
        name: 'City Care Hospital',
        address: '123 Health Ave, Ameerpet',
        city: 'Hyderabad',
        state: 'Telangana',
        latitude: 17.4375,
        longitude: 78.4482,
        phone: '040-12345678',
        email: 'info@citycare.com',
        services: {
          create: [
            { serviceId: services[0].id },
            { serviceId: services[1].id },
          ]
        }
      }
    }),
    prisma.hospital.create({
      data: {
        name: 'Apollo Health City',
        address: 'Jubilee Hills Check Post',
        city: 'Hyderabad',
        state: 'Telangana',
        latitude: 17.4255,
        longitude: 78.4115,
        phone: '040-87654321',
        email: 'apollo@jubilee.com',
        services: {
          create: [
            { serviceId: services[0].id },
            { serviceId: services[2].id },
            { serviceId: services[3].id },
          ]
        }
      }
    }),
    prisma.hospital.create({
      data: {
        name: 'Care Hospitals',
        address: 'Banjara Hills Rd No 1',
        city: 'Hyderabad',
        state: 'Telangana',
        latitude: 17.4124,
        longitude: 78.4483,
        phone: '040-11223344',
        email: 'care@banjara.com',
        services: {
          create: [
            { serviceId: services[1].id },
            { serviceId: services[3].id },
          ]
        }
      }
    }),
  ]);

  // 3. Create Users & Profiles
  
  // Patient
  const patientUser = await prisma.user.create({
    data: {
      fullName: 'Rahul Sharma',
      email: 'rahul.patient@example.com',
      mobile: '9876543210',
      role: 'PATIENT',
      patient: {
        create: {
          age: 45,
          gender: 'MALE',
          emergencyPhone: '9988776655'
        }
      }
    },
    include: { patient: true }
  });

  // Guardian (Approved)
  const approvedGuardian = await prisma.user.create({
    data: {
      fullName: 'Srinivas Rao',
      email: 'srinivas.guardian@example.com',
      mobile: '8877665544',
      role: 'GUARDIAN',
      guardian: {
        create: {
          age: 30,
          gender: 'MALE',
          locality: 'Ameerpet',
          verificationStatus: 'APPROVED',
          preferredHospitals: {
            connect: [{ id: hospitals[0].id }, { id: hospitals[2].id }]
          }
        }
      }
    },
    include: { guardian: true }
  });

  // Guardian (Pending)
  const pendingGuardian = await prisma.user.create({
    data: {
      fullName: 'Anita Reddy',
      email: 'anita.guardian@example.com',
      mobile: '7766554433',
      role: 'GUARDIAN',
      guardian: {
        create: {
          age: 28,
          gender: 'FEMALE',
          locality: 'Jubilee Hills',
          verificationStatus: 'PENDING',
          preferredHospitals: {
            connect: [{ id: hospitals[1].id }]
          }
        }
      }
    }
  });

  // Doctor
  const doctorUser = await prisma.user.create({
    data: {
      fullName: 'Dr. Vikram Seth',
      email: 'vikram.doctor@example.com',
      mobile: '6655443322',
      role: 'DOCTOR',
      doctor: {
        create: {
          qualification: 'MBBS, MD',
          experience: 12,
          hospitalName: hospitals[0].name,
          city: hospitals[0].city,
          hospitalId: hospitals[0].id
        }
      }
    }
  });

  // 4. Create some Bookings
  
  // Pending Booking
  await prisma.booking.create({
    data: {
      patientId: patientUser.patient!.id,
      hospitalId: hospitals[0].id,
      pickupType: 'HOME',
      pickupLat: 17.4447,
      pickupLng: 78.4664,
      pickupAddress: 'Block A, Legend Estates, Ameerpet',
      scheduledAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // Tomorrow
      notes: 'Please bring a wheelchair',
      status: 'REQUESTED',
      services: {
        create: [{ serviceId: services[0].id }]
      }
    }
  });

  // Accepted Booking
  await prisma.booking.create({
    data: {
      patientId: patientUser.patient!.id,
      hospitalId: hospitals[2].id,
      guardianId: approvedGuardian.guardian!.id,
      pickupType: 'HOSPITAL',
      scheduledAt: new Date(Date.now() + 5 * 60 * 60 * 1000), // In 5 hours
      status: 'ACCEPTED',
      services: {
        create: [{ serviceId: services[3].id }]
      }
    }
  });

  // Completed Booking
  await prisma.booking.create({
    data: {
      patientId: patientUser.patient!.id,
      hospitalId: hospitals[1].id,
      guardianId: approvedGuardian.guardian!.id,
      pickupType: 'HOME',
      pickupLat: 17.4300,
      pickupLng: 78.4300,
      pickupAddress: 'Srinagar Colony',
      scheduledAt: new Date(Date.now() - 48 * 60 * 60 * 1000), // 2 days ago
      status: 'COMPLETED',
      review: {
        create: {
          rating: 5,
          comment: 'Very helpful and punctual!',
          guardianId: approvedGuardian.guardian!.id
        }
      }
    }
  });

  console.log('Seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
