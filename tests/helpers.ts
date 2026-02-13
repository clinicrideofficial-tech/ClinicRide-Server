import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || 'secret';

export const generateTestToken = (userId: string) => {
  return jwt.sign({ id: userId }, JWT_SECRET, { expiresIn: '1h' });
};

export const mockUser = {
  id: 'test-user-id',
  fullName: 'Test User',
  email: 'test@example.com',
  role: 'PATIENT',
};
