/**
 * Authentication and Authorization System
 * Provides JWT-based authentication with role-based access control
 */
import { z } from 'zod';
export declare enum UserRole {
    ADMIN = "admin",
    USER = "user",
    READONLY = "readonly"
}
export declare enum Permission {
    READ_SCRAPING = "read:scraping",
    WRITE_SCRAPING = "write:scraping",
    READ_TARGETS = "read:targets",
    WRITE_TARGETS = "write:targets",
    READ_EXPORTS = "read:exports",
    WRITE_EXPORTS = "write:exports",
    ADMIN_USERS = "admin:users",
    ADMIN_SYSTEM = "admin:system"
}
export interface JWTPayload {
    userId: string;
    email: string;
    role: UserRole;
    permissions: Permission[];
    iat: number;
    exp: number;
}
export declare const LoginSchema: z.ZodObject<{
    email: z.ZodString;
    password: z.ZodString;
}, "strip", z.ZodTypeAny, {
    email: string;
    password: string;
}, {
    email: string;
    password: string;
}>;
export declare const RegisterSchema: z.ZodObject<{
    email: z.ZodString;
    password: z.ZodString;
    name: z.ZodString;
    role: z.ZodDefault<z.ZodOptional<z.ZodNativeEnum<typeof UserRole>>>;
}, "strip", z.ZodTypeAny, {
    name: string;
    email: string;
    password: string;
    role: UserRole;
}, {
    name: string;
    email: string;
    password: string;
    role?: UserRole | undefined;
}>;
export declare const ChangePasswordSchema: z.ZodObject<{
    currentPassword: z.ZodString;
    newPassword: z.ZodString;
}, "strip", z.ZodTypeAny, {
    currentPassword: string;
    newPassword: string;
}, {
    currentPassword: string;
    newPassword: string;
}>;
export declare class AuthService {
    /**
     * Register a new user
     */
    static register(data: z.infer<typeof RegisterSchema>): Promise<{
        name: string | null;
        email: string;
        id: string;
        role: string;
        createdAt: Date;
    }>;
    /**
     * Authenticate user and return JWT token
     */
    static login(data: z.infer<typeof LoginSchema>): Promise<{
        token: string;
        user: {
            id: string;
            email: string;
            name: string | null;
            role: string;
            permissions: Permission[];
        };
    }>;
    /**
     * Verify JWT token and return payload
     */
    static verifyToken(token: string): JWTPayload;
    /**
     * Check if user has specific permission
     */
    static hasPermission(userPermissions: Permission[], requiredPermission: Permission): boolean;
    /**
     * Check if user has any of the required permissions
     */
    static hasAnyPermission(userPermissions: Permission[], requiredPermissions: Permission[]): boolean;
    /**
     * Check if user has all required permissions
     */
    static hasAllPermissions(userPermissions: Permission[], requiredPermissions: Permission[]): boolean;
    /**
     * Change user password
     */
    static changePassword(userId: string, data: z.infer<typeof ChangePasswordSchema>): Promise<{
        success: boolean;
    }>;
    /**
     * Get user by ID
     */
    static getUserById(userId: string): Promise<{
        name: string | null;
        email: string;
        id: string;
        role: string;
        createdAt: Date;
        updatedAt: Date;
    }>;
    /**
     * Update user profile
     */
    static updateProfile(userId: string, data: {
        name?: string;
        email?: string;
    }): Promise<{
        name: string | null;
        email: string;
        id: string;
        role: string;
        updatedAt: Date;
    }>;
}
export declare function requireAuth(requiredPermissions?: Permission[]): (req: any, res: any, next: any) => Promise<any>;
export declare function optionalAuth(req: any, res: any, next: any): void;
//# sourceMappingURL=index.d.ts.map