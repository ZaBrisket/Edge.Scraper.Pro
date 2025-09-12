# Robots.txt Handling

## Overview

The Edge Scraper Pro respects robots.txt by default but provides an optional toggle for development and testing purposes.

## Default Behavior

By default, the scraper will:
1. Fetch and parse the robots.txt file from the target domain
2. Check if the requested path is allowed for our user agent
3. Block the request if disallowed by robots.txt

## Toggling Robots.txt Compliance

You can disable robots.txt checking by passing `respectRobots: false` in the request body:

```json
POST /api/fetch-url?url=https://example.com/page
{
  "respectRobots": false
}
```

When `respectRobots` is set to `false`:
- A warning is logged in the server logs
- The robots.txt check is bypassed
- The request proceeds normally

## Implementation Details

### User Agent
The scraper identifies itself as:
```
EdgeScraper/1.0 (+https://github.com/ZaBrisket/Edge.Scraper.Pro)
```

### Parsing Logic
The current implementation uses a simplified robots.txt parser that:
- Supports basic Allow/Disallow directives
- Uses prefix matching (no wildcard support)
- Falls back to the `*` user agent rules
- Implements longest-match precedence between Allow/Disallow rules

### Limitations
- Does not support wildcards (`*`) or end-of-URL matching (`$`)
- Does not parse Crawl-delay directives
- Does not handle Sitemap directives

## Best Practices

1. **Always respect robots.txt in production** - Only disable for legitimate testing purposes
2. **Log bypass events** - Track when and why robots.txt was bypassed
3. **Rate limit requests** - Even when bypassing robots.txt, maintain reasonable rate limits
4. **Identify your bot** - Always use a descriptive User-Agent string

## Future Improvements

Consider implementing:
- Full wildcard support in robots.txt parsing
- Crawl-delay directive support
- Caching of robots.txt files with appropriate TTL
- More sophisticated path matching algorithms