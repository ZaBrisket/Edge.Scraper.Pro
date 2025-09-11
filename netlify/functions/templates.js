const { PrismaClient } = require('@prisma/client');
const { z } = require('zod');

const prisma = new PrismaClient();

// Request schema for creating/updating templates
const TemplateRequestSchema = z.object({
  name: z.string().min(1).max(255),
  version: z.string().default('1.0'),
  description: z.string().optional(),
  sourceHint: z.string().optional(),
  fields: z.array(z.object({
    target: z.string().min(1),
    sourceHeaders: z.array(z.string()),
    transform: z.string().optional(),
    required: z.boolean().default(false),
    defaultValue: z.string().optional(),
  })),
});

exports.handler = async (event, context) => {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  // Handle preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: '',
    };
  }

  try {
    if (event.httpMethod === 'GET') {
      // Get templates with optional filtering
      const queryParams = event.queryStringParameters || {};
      const sourceHint = queryParams.sourceHint;
      
      // TODO: Add authentication to filter by user
      const userId = 'mock-user-id';

      const where = {
        OR: [
          { isPublic: true },
          { userId: userId },
        ],
      };

      if (sourceHint) {
        where.sourceHint = {
          contains: sourceHint,
          mode: 'insensitive',
        };
      }

      const templates = await prisma.mappingTemplate.findMany({
        where,
        include: {
          fieldDefs: {
            orderBy: { targetField: 'asc' },
          },
          user: {
            select: { name: true, email: true },
          },
        },
        orderBy: [
          { isPublic: 'desc' }, // Public templates first
          { name: 'asc' },
        ],
      });

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          templates: templates.map(template => ({
            id: template.id,
            name: template.name,
            version: template.version,
            description: template.description,
            sourceHint: template.sourceHint,
            isPublic: template.isPublic,
            createdAt: template.createdAt,
            updatedAt: template.updatedAt,
            author: template.user.name || template.user.email,
            fields: template.fieldDefs.map(field => ({
              id: field.id,
              target: field.targetField,
              sourceHeaders: field.sourceHeaders,
              transform: field.transform,
              required: field.required,
              defaultValue: field.defaultValue,
            })),
          })),
        }),
      };
    } else if (event.httpMethod === 'POST') {
      // Create or update template
      const body = JSON.parse(event.body || '{}');
      const validatedData = TemplateRequestSchema.parse(body);
      
      // TODO: Add authentication
      const userId = 'mock-user-id';

      // Check if template already exists
      const existingTemplate = await prisma.mappingTemplate.findUnique({
        where: {
          name_version_userId: {
            name: validatedData.name,
            version: validatedData.version,
            userId: userId,
          },
        },
      });

      let template;

      if (existingTemplate) {
        // Update existing template
        template = await prisma.mappingTemplate.update({
          where: { id: existingTemplate.id },
          data: {
            description: validatedData.description,
            sourceHint: validatedData.sourceHint,
            fieldDefs: {
              deleteMany: {}, // Clear existing field definitions
              create: validatedData.fields.map(field => ({
                targetField: field.target,
                sourceHeaders: field.sourceHeaders,
                transform: field.transform,
                required: field.required,
                defaultValue: field.defaultValue,
              })),
            },
          },
          include: {
            fieldDefs: true,
          },
        });
      } else {
        // Create new template
        template = await prisma.mappingTemplate.create({
          data: {
            name: validatedData.name,
            version: validatedData.version,
            description: validatedData.description,
            sourceHint: validatedData.sourceHint,
            userId: userId,
            isPublic: false, // User templates are private by default
            fieldDefs: {
              create: validatedData.fields.map(field => ({
                targetField: field.target,
                sourceHeaders: field.sourceHeaders,
                transform: field.transform,
                required: field.required,
                defaultValue: field.defaultValue,
              })),
            },
          },
          include: {
            fieldDefs: true,
          },
        });
      }

      return {
        statusCode: existingTemplate ? 200 : 201,
        headers,
        body: JSON.stringify({
          id: template.id,
          name: template.name,
          version: template.version,
          description: template.description,
          sourceHint: template.sourceHint,
          isPublic: template.isPublic,
          createdAt: template.createdAt,
          updatedAt: template.updatedAt,
          fields: template.fieldDefs.map(field => ({
            id: field.id,
            target: field.targetField,
            sourceHeaders: field.sourceHeaders,
            transform: field.transform,
            required: field.required,
            defaultValue: field.defaultValue,
          })),
        }),
      };
    } else {
      return {
        statusCode: 405,
        headers,
        body: JSON.stringify({
          error: {
            code: 'method_not_allowed',
            message: 'Only GET and POST methods are allowed',
          },
        }),
      };
    }
  } catch (error) {
    console.error('Templates API error:', error);

    if (error.name === 'ZodError') {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: {
            code: 'validation_error',
            message: 'Invalid request data',
            details: error.errors,
          },
        }),
      };
    }

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: {
          code: 'internal_server_error',
          message: 'Templates API request failed',
        },
      }),
    };
  } finally {
    await prisma.$disconnect();
  }
};