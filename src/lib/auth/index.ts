/**
 * Authentication and Authorization System
 * Provides JWT-based authentication with role-based access control
 */

import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Configuration
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';
const BCRYPT_ROUNDS = 12;

// User roles
export enum UserRole {
  ADMIN = 'admin',
  USER = 'user',
  READONLY = 'readonly'
}

// Permission levels
export enum Permission {
  READ_SCRAPING = 'read:scraping',
  WRITE_SCRAPING = 'write:scraping',
  READ_TARGETS = 'read:targets',
  WRITE_TARGETS = 'write:targets',
  READ_EXPORTS = 'read:exports',
  WRITE_EXPORTS = 'write:exports',
  ADMIN_USERS = 'admin:users',
  ADMIN_SYSTEM = 'admin:system'
}

// Role permissions mapping
const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  [UserRole.ADMIN]: Object.values(Permission),
  [UserRole.USER]: [
    Permission.READ_SCRAPING,
    Permission.WRITE_SCRAPING,
    Permission.READ_TARGETS,
    Permission.WRITE_TARGETS,
    Permission.READ_EXPORTS,
    Permission.WRITE_EXPORTS
  ],
  [UserRole.READONLY]: [
    Permission.READ_SCRAPING,
    Permission.READ_TARGETS,
    Permission.READ_EXPORTS
  ]
};

// JWT payload interface
export interface JWTPayload {
  userId: string;
  email: string;
  role: UserRole;
  permissions: Permission[];
  iat: number;
  exp: number;
}

// Authentication schemas
export const LoginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(8, 'Password must be at least 8 characters')
});

export const RegisterSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(2, 'Name must be at least 2 characters'),
  role: z.nativeEnum(UserRole).optional().default(UserRole.USER)
});

export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters')
});

// Authentication service class
export class AuthService {
  /**
   * Register a new user
   */
  static async register(data: z.infer<typeof RegisterSchema>) {
    const validatedData = RegisterSchema.parse(data);
    
    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: validatedData.email }
    });
    
    if (existingUser) {
      throw new Error('User with this email already exists');
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(validatedData.password, BCRYPT_ROUNDS);
    
    // Create user
    const user = await prisma.user.create({
      data: {
        email: validatedData.email,
        name: validatedData.name,
        password: hashedPassword,
        role: validatedData.role
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true
      }
    });
    
    return user;
  }
  
  /**
   * Authenticate user and return JWT token
   */
  static async login(data: z.infer<typeof LoginSchema>) {
    const validatedData = LoginSchema.parse(data);
    
    // Find user
    const user = await prisma.user.findUnique({
      where: { email: validatedData.email }
    });
    
    if (!user) {
      throw new Error('Invalid email or password');
    }
    
    // Verify password
    const isValidPassword = await bcrypt.compare(validatedData.password, user.password);
    if (!isValidPassword) {
      throw new Error('Invalid email or password');
    }
    
    // Generate JWT token
    const permissions = ROLE_PERMISSIONS[user.role as UserRole] || [];
    const payload: Omit<JWTPayload, 'iat' | 'exp'> = {
      userId: user.id,
      email: user.email,
      role: user.role as UserRole,
      permissions
    };
    
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions);
    
    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        permissions
      }
    };
  }
  
  /**
   * Verify JWT token and return payload
   */
  static verifyToken(token: string): JWTPayload {
    try {
      const payload = jwt.verify(token, JWT_SECRET) as JWTPayload;
      return payload;
    } catch (error) {
      throw new Error('Invalid or expired token');
    }
  }
  
  /**
   * Check if user has specific permission
   */
  static hasPermission(userPermissions: Permission[], requiredPermission: Permission): boolean {
    return userPermissions.includes(requiredPermission);
  }
  
  /**
   * Check if user has any of the required permissions
   */
  static hasAnyPermission(userPermissions: Permission[], requiredPermissions: Permission[]): boolean {
    return requiredPermissions.some(permission => userPermissions.includes(permission));
  }
  
  /**
   * Check if user has all required permissions
   */
  static hasAllPermissions(userPermissions: Permission[], requiredPermissions: Permission[]): boolean {
    return requiredPermissions.every(permission => userPermissions.includes(permission));
  }
  
  /**
   * Change user password
   */
  static async changePassword(userId: string, data: z.infer<typeof ChangePasswordSchema>) {
    const validatedData = ChangePasswordSchema.parse(data);
    
    // Get user
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });
    
    if (!user) {
      throw new Error('User not found');
    }
    
    // Verify current password
    const isValidPassword = await bcrypt.compare(validatedData.currentPassword, user.password);
    if (!isValidPassword) {
      throw new Error('Current password is incorrect');
    }
    
    // Hash new password
    const hashedPassword = await bcrypt.hash(validatedData.newPassword, BCRYPT_ROUNDS);
    
    // Update password
    await prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword }
    });
    
    return { success: true };
  }
  
  /**
   * Get user by ID
   */
  static async getUserById(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
        updatedAt: true
      }
    });
    
    if (!user) {
      throw new Error('User not found');
    }
    
    return user;
  }
  
  /**
   * Update user profile
   */
  static async updateProfile(userId: string, data: { name?: string; email?: string }) {
    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.email && { email: data.email })
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        updatedAt: true
      }
    });
    
    return user;
  }
}

// Middleware for protecting routes
export function requireAuth(requiredPermissions: Permission[] = []) {
  return async (req: any, res: any, next: any) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authorization token required' });
      }
      
      const token = authHeader.substring(7);
      const payload = AuthService.verifyToken(token);
      
      // Check permissions
      if (requiredPermissions.length > 0) {
        const hasRequiredPermissions = AuthService.hasAllPermissions(payload.permissions, requiredPermissions);
        if (!hasRequiredPermissions) {
          return res.status(403).json({ error: 'Insufficient permissions' });
        }
      }
      
      // Add user info to request
      req.user = payload;
      next();
    } catch (error) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
  };
}

// Middleware for optional authentication
export function optionalAuth(req: any, res: any, next: any) {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const payload = AuthService.verifyToken(token);
      req.user = payload;
    }
    next();
  } catch (error) {
    // Continue without authentication
    next();
  }
}