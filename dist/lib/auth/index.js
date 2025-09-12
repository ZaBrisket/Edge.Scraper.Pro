"use strict";
/**
 * Authentication and Authorization System
 * Provides JWT-based authentication with role-based access control
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = exports.ChangePasswordSchema = exports.RegisterSchema = exports.LoginSchema = exports.Permission = exports.UserRole = void 0;
exports.requireAuth = requireAuth;
exports.optionalAuth = optionalAuth;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const zod_1 = require("zod");
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
// Configuration
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';
const BCRYPT_ROUNDS = 12;
// User roles
var UserRole;
(function (UserRole) {
    UserRole["ADMIN"] = "admin";
    UserRole["USER"] = "user";
    UserRole["READONLY"] = "readonly";
})(UserRole || (exports.UserRole = UserRole = {}));
// Permission levels
var Permission;
(function (Permission) {
    Permission["READ_SCRAPING"] = "read:scraping";
    Permission["WRITE_SCRAPING"] = "write:scraping";
    Permission["READ_TARGETS"] = "read:targets";
    Permission["WRITE_TARGETS"] = "write:targets";
    Permission["READ_EXPORTS"] = "read:exports";
    Permission["WRITE_EXPORTS"] = "write:exports";
    Permission["ADMIN_USERS"] = "admin:users";
    Permission["ADMIN_SYSTEM"] = "admin:system";
})(Permission || (exports.Permission = Permission = {}));
// Role permissions mapping
const ROLE_PERMISSIONS = {
    [UserRole.ADMIN]: Object.values(Permission),
    [UserRole.USER]: [
        Permission.READ_SCRAPING,
        Permission.WRITE_SCRAPING,
        Permission.READ_TARGETS,
        Permission.WRITE_TARGETS,
        Permission.READ_EXPORTS,
        Permission.WRITE_EXPORTS,
    ],
    [UserRole.READONLY]: [Permission.READ_SCRAPING, Permission.READ_TARGETS, Permission.READ_EXPORTS],
};
// Authentication schemas
exports.LoginSchema = zod_1.z.object({
    email: zod_1.z.string().email('Invalid email format'),
    password: zod_1.z.string().min(8, 'Password must be at least 8 characters'),
});
exports.RegisterSchema = zod_1.z.object({
    email: zod_1.z.string().email('Invalid email format'),
    password: zod_1.z.string().min(8, 'Password must be at least 8 characters'),
    name: zod_1.z.string().min(2, 'Name must be at least 2 characters'),
    role: zod_1.z.nativeEnum(UserRole).optional().default(UserRole.USER),
});
exports.ChangePasswordSchema = zod_1.z.object({
    currentPassword: zod_1.z.string().min(1, 'Current password is required'),
    newPassword: zod_1.z.string().min(8, 'New password must be at least 8 characters'),
});
// Authentication service class
class AuthService {
    /**
     * Register a new user
     */
    static async register(data) {
        const validatedData = exports.RegisterSchema.parse(data);
        // Check if user already exists
        const existingUser = await prisma.user.findUnique({
            where: { email: validatedData.email },
        });
        if (existingUser) {
            throw new Error('User with this email already exists');
        }
        // Hash password
        const hashedPassword = await bcryptjs_1.default.hash(validatedData.password, BCRYPT_ROUNDS);
        // Create user
        const user = await prisma.user.create({
            data: {
                email: validatedData.email,
                name: validatedData.name,
                password: hashedPassword,
                role: validatedData.role,
            },
            select: {
                id: true,
                email: true,
                name: true,
                role: true,
                createdAt: true,
            },
        });
        return user;
    }
    /**
     * Authenticate user and return JWT token
     */
    static async login(data) {
        const validatedData = exports.LoginSchema.parse(data);
        // Find user
        const user = await prisma.user.findUnique({
            where: { email: validatedData.email },
        });
        if (!user) {
            throw new Error('Invalid email or password');
        }
        // Verify password
        const isValidPassword = await bcryptjs_1.default.compare(validatedData.password, user.password);
        if (!isValidPassword) {
            throw new Error('Invalid email or password');
        }
        // Generate JWT token
        const permissions = ROLE_PERMISSIONS[user.role] || [];
        const payload = {
            userId: user.id,
            email: user.email,
            role: user.role,
            permissions,
        };
        const token = jsonwebtoken_1.default.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
        return {
            token,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role,
                permissions,
            },
        };
    }
    /**
     * Verify JWT token and return payload
     */
    static verifyToken(token) {
        try {
            const payload = jsonwebtoken_1.default.verify(token, JWT_SECRET);
            return payload;
        }
        catch (error) {
            throw new Error('Invalid or expired token');
        }
    }
    /**
     * Check if user has specific permission
     */
    static hasPermission(userPermissions, requiredPermission) {
        return userPermissions.includes(requiredPermission);
    }
    /**
     * Check if user has any of the required permissions
     */
    static hasAnyPermission(userPermissions, requiredPermissions) {
        return requiredPermissions.some(permission => userPermissions.includes(permission));
    }
    /**
     * Check if user has all required permissions
     */
    static hasAllPermissions(userPermissions, requiredPermissions) {
        return requiredPermissions.every(permission => userPermissions.includes(permission));
    }
    /**
     * Change user password
     */
    static async changePassword(userId, data) {
        const validatedData = exports.ChangePasswordSchema.parse(data);
        // Get user
        const user = await prisma.user.findUnique({
            where: { id: userId },
        });
        if (!user) {
            throw new Error('User not found');
        }
        // Verify current password
        const isValidPassword = await bcryptjs_1.default.compare(validatedData.currentPassword, user.password);
        if (!isValidPassword) {
            throw new Error('Current password is incorrect');
        }
        // Hash new password
        const hashedPassword = await bcryptjs_1.default.hash(validatedData.newPassword, BCRYPT_ROUNDS);
        // Update password
        await prisma.user.update({
            where: { id: userId },
            data: { password: hashedPassword },
        });
        return { success: true };
    }
    /**
     * Get user by ID
     */
    static async getUserById(userId) {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                email: true,
                name: true,
                role: true,
                createdAt: true,
                updatedAt: true,
            },
        });
        if (!user) {
            throw new Error('User not found');
        }
        return user;
    }
    /**
     * Update user profile
     */
    static async updateProfile(userId, data) {
        const user = await prisma.user.update({
            where: { id: userId },
            data: {
                ...(data.name && { name: data.name }),
                ...(data.email && { email: data.email }),
            },
            select: {
                id: true,
                email: true,
                name: true,
                role: true,
                updatedAt: true,
            },
        });
        return user;
    }
}
exports.AuthService = AuthService;
// Middleware for protecting routes
function requireAuth(requiredPermissions = []) {
    return async (req, res, next) => {
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
        }
        catch (error) {
            return res.status(401).json({ error: 'Invalid or expired token' });
        }
    };
}
// Middleware for optional authentication
function optionalAuth(req, res, next) {
    try {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.substring(7);
            const payload = AuthService.verifyToken(token);
            req.user = payload;
        }
        next();
    }
    catch (error) {
        // Continue without authentication
        next();
    }
}
//# sourceMappingURL=index.js.map