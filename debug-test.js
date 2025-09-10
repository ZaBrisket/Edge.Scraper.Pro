// Debug the test case
const testFiles = {
    jsonObjects: `[
  {
    "url": "https://www.pro-football-reference.com/players/M/MahoPa00.htm",
    "title": "Patrick Mahomes"
  },
  {
    "url": "https://www.pro-football-reference.com/players/B/BradTo00.htm",
    "title": "Tom Brady"
  }
]`
};

// File parsing logic
class FileParser {
    extractUrlsFromJson(content) {
        try {
            const data = JSON.parse(content);
            let urls = [];

            if (Array.isArray(data)) {
                // Check if it's an array of strings or objects
                if (data.length > 0 && data.every(item => typeof item === 'object' && item.url)) {
                    // Array of objects with URL property
                    urls = data
                        .map(item => item.url)
                        .filter(url => typeof url === 'string' && this.isValidUrl(url));
                } else {
                    // Simple array format (strings)
                    urls = data.filter(item => typeof item === 'string' && this.isValidUrl(item));
                }
            } else if (data.urls && Array.isArray(data.urls)) {
                urls = data.urls.filter(url => typeof url === 'string' && this.isValidUrl(url));
            }

            return urls;
        } catch (error) {
            throw new Error('Invalid JSON format');
        }
    }

    isValidUrl(string) {
        try {
            const url = new URL(string);
            return ['http:', 'https:'].includes(url.protocol);
        } catch {
            return false;
        }
    }
}

const parser = new FileParser();
const urls = parser.extractUrlsFromJson(testFiles.jsonObjects);
console.log('Extracted URLs:', urls);
console.log('Count:', urls.length);