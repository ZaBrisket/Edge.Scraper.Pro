const DescriptionStandardizer = require('../public/description-standardizer.js');

describe('DescriptionStandardizer', () => {
  describe('standardize', () => {
    it('should generate concise descriptions under 30 words', () => {
      const input = {
        companyName: 'Acme Insurance Brokers Inc.',
        description: 'Acme Insurance Brokers is a leading provider of innovative insurance solutions with over 50 years of experience serving businesses nationwide.',
        specialties: 'commercial property, casualty insurance, workers compensation, cyber liability',
        industries: 'Insurance',
        endMarkets: 'Manufacturing, Healthcare'
      };
      
      const result = DescriptionStandardizer.standardize(input);
      const wordCount = result.split(/\s+/).length;
      
      expect(wordCount).toBeLessThanOrEqual(30);
      expect(result).toContain('Acme Insurance Brokers');
      expect(result).not.toContain('leading');
      expect(result).not.toContain('innovative');
      expect(result).not.toContain('50 years');
    });
    
    it('should preserve industry acronyms', () => {
      const input = {
        companyName: 'Tech Solutions LLC',
        description: 'We provide SaaS and API solutions',
        specialties: 'CRM, ERP, HCM platforms'
      };
      
      const result = DescriptionStandardizer.standardize(input);
      
      expect(result).toMatch(/\bSaaS\b/);
      expect(result).toMatch(/\bAPI\b/);
      expect(result).toMatch(/\bCRM\b/);
      expect(result).toMatch(/\bERP\b/);
    });
    
    it('should handle empty descriptions gracefully', () => {
      const input = {
        companyName: 'Unknown Corp',
        description: '',
        specialties: '',
        industries: 'Technology'
      };
      
      const result = DescriptionStandardizer.standardize(input);
      
      expect(result).toContain('Unknown Corp');
      expect(result).toContain('technology');
      expect(result.endsWith('.')).toBe(true);
    });
    
    it('should extract and use specialties when description is vague', () => {
      const input = {
        companyName: 'Service Pro',
        description: 'A company that provides various services to clients',
        specialties: 'cloud migration, DevOps consulting, infrastructure automation',
        industries: 'Technology'
      };
      
      const result = DescriptionStandardizer.standardize(input);
      
      expect(result).toContain('cloud migration');
      expect(result.split(/\s+/).length).toBeLessThanOrEqual(30);
    });
  });
  
  describe('cleanText', () => {
    it('should remove marketing fluff', () => {
      const input = 'We are the leading, innovative, world-class provider of cutting-edge solutions';
      const result = DescriptionStandardizer.cleanText(input);
      
      expect(result).not.toContain('leading');
      expect(result).not.toContain('innovative');
      expect(result).not.toContain('world-class');
      expect(result).not.toContain('cutting-edge');
    });
  });
  
  describe('extractCompanyName', () => {
    it('should clean company suffixes', () => {
      const result = DescriptionStandardizer.extractCompanyName(
        'Acme Solutions, Inc.',
        '',
        '',
        ''
      );
      
      expect(result).toBe('Acme Solutions');
    });
    
    it('should prefer informal name when available', () => {
      const result = DescriptionStandardizer.extractCompanyName(
        'Acme Solutions International Corporation',
        'Acme',
        '',
        ''
      );
      
      expect(result).toBe('Acme');
    });
    
    it('should derive from domain when name not available', () => {
      const result = DescriptionStandardizer.extractCompanyName(
        '',
        '',
        'https://acme-solutions.com',
        ''
      );
      
      expect(result).toBe('Acme Solutions');
    });
  });

  describe('deterministic behavior', () => {
    it('should produce identical results for same input', () => {
      const input = {
        companyName: 'Test Corp',
        description: 'A test company that provides software solutions',
        specialties: 'web development, mobile apps',
        industries: 'Technology'
      };
      
      // Run standardization multiple times
      const results = [];
      for (let i = 0; i < 5; i++) {
        results.push(DescriptionStandardizer.standardize(input));
      }
      
      // All results should be identical
      const allIdentical = results.every(result => result === results[0]);
      expect(allIdentical).toBe(true);
      expect(results[0]).toBeDefined();
      expect(results[0].length).toBeGreaterThan(0);
    });
    
    it('should produce different results for different inputs', () => {
      const input1 = {
        companyName: 'Tech Corp',
        description: 'Software development',
        specialties: 'web apps'
      };
      
      const input2 = {
        companyName: 'Build Corp',
        description: 'Construction services',
        specialties: 'general contracting'
      };
      
      const result1 = DescriptionStandardizer.standardize(input1);
      const result2 = DescriptionStandardizer.standardize(input2);
      
      expect(result1).not.toBe(result2);
      expect(result1).toBeDefined();
      expect(result2).toBeDefined();
    });
  });
});