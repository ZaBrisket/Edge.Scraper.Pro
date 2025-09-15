# Company Description Standardization Engine

## Overview

The Description Standardization Engine transforms verbose, marketing-heavy company descriptions into concise, factual summaries optimized for M&A target analysis.

## Features

- **Automatic Standardization**: Converts descriptions to ≤30 words
- **Industry Detection**: Identifies company sector from content
- **Smart Verb Selection**: Uses appropriate action verbs based on business type
- **Acronym Preservation**: Maintains industry-standard abbreviations
- **Marketing Removal**: Strips superlatives and vague claims
- **Fallback Logic**: Handles missing or incomplete data gracefully

## Configuration

The standardizer can be toggled on/off via the UI checkbox or by setting:

```javascript
CONFIG.ENABLE_DESCRIPTION_STANDARDIZATION = true/false
```

## Processing Rules

### Information Hierarchy
1. Core function (what the company does)
2. Key offerings/services (2-3 specific items)
3. Target market (if space permits)

### Verb Taxonomy
- **Service**: provides, delivers, offers
- **Manufacturing**: manufactures, produces, develops
- **Distribution**: distributes, sells, supplies
- **Consulting**: advises, consults, guides
- **Management**: manages, operates, oversees

### Quality Filters

**Removed**:
- Superlatives (leading, innovative, premier)
- Time-based claims (established 1990, 30 years experience)
- Geographic superlatives (nationwide, global)
- Revenue indicators
- Marketing language

**Preserved**:
- Industry acronyms (SaaS, API, CRM, HVAC)
- Specific service offerings
- Target market identifiers
- Technical specifications

## API Usage

```javascript
const standardized = DescriptionStandardizer.standardize({
  companyName: 'Acme Corp',
  informalName: 'Acme',
  website: 'https://acme.com',
  description: 'Long marketing description...',
  specialties: 'service1, service2, service3',
  industries: 'Technology',
  endMarkets: 'Healthcare, Finance'
});
```

## Examples

### Input
```
"Acme Insurance Brokers is a leading provider of innovative insurance 
solutions with over 50 years of experience serving businesses nationwide. 
We are committed to excellence and dedicated to our clients."
```

### Output
```
"Acme Insurance Brokers provides commercial property, casualty insurance, 
and workers compensation for manufacturing and healthcare organizations."
```

## Performance

- Processes ~1000 companies/second
- Batch processing with progress indication
- Non-blocking UI updates
- Graceful error handling with fallbacks

## Browser Compatibility

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Descriptions too short | Check specialties/industries fields for data |
| Acronyms lowercased | Add to PRESERVE_ACRONYMS set |
| Company name missing | Ensure company name or website field populated |
| Processing slow | Reduce BATCH_SIZE constant |