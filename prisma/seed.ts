import { PrismaClient } from '../src/generated/prisma';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Create a system user for public templates
  const systemUser = await prisma.user.upsert({
    where: { email: 'system@edgescraperpro.com' },
    update: {},
    create: {
      email: 'system@edgescraperpro.com',
      name: 'System',
    },
  });

  // Create SourceScrub v2025 mapping template
  const sourceScrubTemplate = await prisma.mappingTemplate.upsert({
    where: {
      name_version_userId: {
        name: 'SourceScrub v2025',
        version: '1.0',
        userId: systemUser.id,
      },
    },
    update: {},
    create: {
      name: 'SourceScrub v2025',
      version: '1.0',
      description: 'Default mapping template for SourceScrub data exports with common header synonyms',
      sourceHint: 'SourceScrub',
      userId: systemUser.id,
      isPublic: true,
      fieldDefs: {
        create: [
          {
            targetField: 'rank',
            sourceHeaders: ['Rank', 'rank', '#', 'Position', 'Pos'],
            transform: 'parseInt',
            required: false,
          },
          {
            targetField: 'companyName',
            sourceHeaders: [
              'Company Name',
              'Company',
              'company_name',
              'Business Name',
              'Organization',
              'Org',
              'Name',
              'Entity Name',
              'Business',
            ],
            transform: 'trim',
            required: true,
          },
          {
            targetField: 'city',
            sourceHeaders: ['City', 'city', 'Location City', 'Business City', 'Headquarters City'],
            transform: 'trim',
            required: false,
          },
          {
            targetField: 'state',
            sourceHeaders: [
              'State',
              'state',
              'Province',
              'Location State',
              'Business State',
              'Headquarters State',
              'ST',
            ],
            transform: 'trim',
            required: false,
          },
          {
            targetField: 'description',
            sourceHeaders: [
              'Description',
              'description',
              'Business Description',
              'Company Description',
              'Industry',
              'Business Type',
              'Category',
              'Services',
            ],
            transform: 'trim',
            required: false,
          },
          {
            targetField: 'estimatedRevenueMillions',
            sourceHeaders: [
              'Estimated Revenue',
              'Revenue',
              'Annual Revenue',
              'Est Revenue',
              'Est. Revenue',
              'Revenue (M)',
              'Revenue Millions',
              'Annual Sales',
              'Sales',
            ],
            transform: 'currencyToFloat',
            required: false,
          },
          {
            targetField: 'executiveName',
            sourceHeaders: [
              'Executive Name',
              'CEO',
              'CEO Name',
              'President',
              'Contact Name',
              'Key Contact',
              'Decision Maker',
              'Owner',
              'Principal',
            ],
            transform: 'trim',
            required: false,
          },
          {
            targetField: 'executiveTitle',
            sourceHeaders: [
              'Executive Title',
              'Title',
              'CEO Title',
              'Position',
              'Job Title',
              'Role',
              'Contact Title',
            ],
            transform: 'trim',
            required: false,
          },
          {
            targetField: 'logoUrl',
            sourceHeaders: ['Logo URL', 'Logo', 'Company Logo', 'Image URL', 'Brand Logo'],
            transform: 'normalizeUrl',
            required: false,
          },
        ],
      },
    },
  });

  console.log('✅ Created SourceScrub v2025 template:', sourceScrubTemplate.id);

  // Create Apollo.io mapping template
  const apolloTemplate = await prisma.mappingTemplate.upsert({
    where: {
      name_version_userId: {
        name: 'Apollo.io v2025',
        version: '1.0',
        userId: systemUser.id,
      },
    },
    update: {},
    create: {
      name: 'Apollo.io v2025',
      version: '1.0',
      description: 'Default mapping template for Apollo.io data exports',
      sourceHint: 'Apollo',
      userId: systemUser.id,
      isPublic: true,
      fieldDefs: {
        create: [
          {
            targetField: 'companyName',
            sourceHeaders: [
              'Organization Name',
              'Account Name',
              'Company',
              'Company Name',
              'organization_name',
            ],
            transform: 'trim',
            required: true,
          },
          {
            targetField: 'city',
            sourceHeaders: ['City', 'Account City', 'Organization City', 'HQ City'],
            transform: 'trim',
            required: false,
          },
          {
            targetField: 'state',
            sourceHeaders: ['State', 'Account State', 'Organization State', 'HQ State'],
            transform: 'trim',
            required: false,
          },
          {
            targetField: 'description',
            sourceHeaders: [
              'Industry',
              'Account Industry',
              'Organization Industry',
              'Business Description',
            ],
            transform: 'trim',
            required: false,
          },
          {
            targetField: 'estimatedRevenueMillions',
            sourceHeaders: [
              'Account Annual Revenue',
              'Organization Revenue',
              'Annual Revenue',
              'Revenue',
            ],
            transform: 'currencyToFloat',
            required: false,
          },
          {
            targetField: 'executiveName',
            sourceHeaders: [
              'Contact Name',
              'Person Name',
              'First Name',
              'Full Name',
              'Name',
            ],
            transform: 'trim',
            required: false,
          },
          {
            targetField: 'executiveTitle',
            sourceHeaders: ['Title', 'Person Title', 'Job Title', 'Position'],
            transform: 'trim',
            required: false,
          },
        ],
      },
    },
  });

  console.log('✅ Created Apollo.io v2025 template:', apolloTemplate.id);

  console.log('🌱 Seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });