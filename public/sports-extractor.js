// Browser-compatible sports extractor
class SportsExtractor {
    extractContent(html, url) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        
        // Remove scripts and styles
        doc.querySelectorAll('script, style, noscript').forEach(el => el.remove());
        
        // Extract content using multiple strategies
        const selectors = [
            '#content', '#wrap', '.section_content', '#info', '#stats',
            '#div_stats', 'article', 'main', '[role="main"]', '.content'
        ];
        
        let content = '';
        for (const selector of selectors) {
            const element = doc.querySelector(selector);
            if (element && element.textContent.length > 500) {
                content = element.textContent.trim();
                break;
            }
        }
        
        // Fallback to body if no content found
        if (!content || content.length < 100) {
            content = doc.body.textContent || '';
        }
        
        return {
            content: content,
            contentLength: content.length,
            structuredData: this.extractStructuredData(doc, url)
        };
    }
    
    extractStructuredData(doc, url) {
        const data = {
            playerName: '',
            position: '',
            team: '',
            stats: {}
        };
        
        if (url && url.includes('pro-football-reference.com')) {
            // Extract player name
            const h1 = doc.querySelector('h1[itemprop="name"]') || doc.querySelector('h1');
            if (h1) data.playerName = h1.textContent.trim();
            
            // Extract position and team from meta info
            const metaInfo = doc.querySelector('div#meta') || doc.querySelector('#info');
            if (metaInfo) {
                const positionMatch = metaInfo.textContent.match(/Position:\s*([A-Z]+)/);
                if (positionMatch) data.position = positionMatch[1];
                
                const teamLinks = metaInfo.querySelectorAll('a[href*="/teams/"]');
                if (teamLinks.length > 0) {
                    data.team = teamLinks[teamLinks.length - 1].textContent.trim();
                }
            }
            
            // Extract stats from tables
            const statTables = doc.querySelectorAll('table[id*="stats"], table[id*="passing"], table[id*="rushing"], table[id*="receiving"]');
            statTables.forEach(table => {
                const headers = Array.from(table.querySelectorAll('thead th')).map(th => th.textContent.trim());
                const lastRow = table.querySelector('tbody tr:last-child');
                
                if (lastRow && headers.length > 0) {
                    const cells = Array.from(lastRow.querySelectorAll('td, th'));
                    headers.forEach((header, index) => {
                        if (cells[index] && header) {
                            const value = cells[index].textContent.trim();
                            if (value && !isNaN(parseFloat(value))) {
                                data.stats[header] = value;
                            }
                        }
                    });
                }
            });
        }
        
        return data;
    }
}

// Make available globally
window.SportsExtractor = SportsExtractor;