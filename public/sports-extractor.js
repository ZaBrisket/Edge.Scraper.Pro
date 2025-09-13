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
        // Implementation from the fixed version
        const data = {
            playerName: '',
            position: '',
            team: '',
            stats: {}
        };
        
        if (url && url.includes('pro-football-reference.com')) {
            const h1 = doc.querySelector('h1[itemprop="name"]') || doc.querySelector('h1');
            if (h1) data.playerName = h1.textContent.trim();
            
            // Extract position
            const positionEl = doc.querySelector('[data-stat="pos"]') || 
                              doc.querySelector('.pos') ||
                              doc.querySelector('[data-label="Position"]');
            if (positionEl) data.position = positionEl.textContent.trim();
            
            // Extract team
            const teamEl = doc.querySelector('[data-stat="team"]') ||
                          doc.querySelector('.team') ||
                          doc.querySelector('[data-label="Team"]');
            if (teamEl) data.team = teamEl.textContent.trim();
            
            // Extract stats from tables
            const statsTable = doc.querySelector('table#stats') || 
                              doc.querySelector('table.stats_table') ||
                              doc.querySelector('table');
            
            if (statsTable) {
                const rows = statsTable.querySelectorAll('tr');
                rows.forEach(row => {
                    const cells = row.querySelectorAll('td, th');
                    if (cells.length >= 2) {
                        const statName = cells[0].textContent.trim();
                        const statValue = cells[1].textContent.trim();
                        if (statName && statValue && statName !== 'Year') {
                            data.stats[statName] = statValue;
                        }
                    }
                });
            }
        }
        
        return data;
    }
}

window.SportsExtractor = SportsExtractor;