// Debug script for JSON parsing issue
const testJsonObjects = `[
  {
    "url": "https://www.pro-football-reference.com/players/M/MahoPa00.htm",
    "title": "Patrick Mahomes"
  },
  {
    "url": "https://www.pro-football-reference.com/players/B/BradTo00.htm",
    "title": "Tom Brady"
  }
]`;

console.log('Testing JSON parsing...');
console.log('Input:', testJsonObjects);

try {
    const data = JSON.parse(testJsonObjects);
    console.log('Parsed data:', data);
    console.log('Is array:', Array.isArray(data));
    console.log('Length:', data.length);
    console.log('Every item has url:', data.every(item => typeof item === 'object' && item.url));
    
    if (Array.isArray(data) && data.length > 0 && data.every(item => typeof item === 'object' && item.url)) {
        console.log('Condition passed - extracting URLs...');
        const urls = data
            .map(item => item.url)
            .filter(url => typeof url === 'string');
        console.log('Extracted URLs:', urls);
        
        // Test URL validation
        const isValidUrl = (string) => {
            try {
                const url = new URL(string);
                return ['http:', 'https:'].includes(url.protocol);
            } catch {
                return false;
            }
        };
        
        const validUrls = urls.filter(url => isValidUrl(url));
        console.log('Valid URLs:', validUrls);
    } else {
        console.log('Condition failed');
    }
} catch (error) {
    console.log('JSON parse error:', error.message);
}