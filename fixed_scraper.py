#!/usr/bin/env python3
"""
Fixed Web Scraper for d2pbuyersguide.com
Handles 404 errors and provides alternative approaches
"""

import requests
import time
import json
from urllib.parse import urljoin, urlparse
from typing import List, Dict, Any
import logging

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class D2PBuyersGuideScraper:
    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        })
        # Ignore SSL certificate issues
        self.session.verify = False
        # Suppress SSL warnings
        import urllib3
        urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
        
    def test_url_variations(self, base_url: str) -> Dict[str, Any]:
        """Test different URL variations to find working endpoints"""
        results = {}
        
        # Test different protocols
        protocols = ['https', 'http']
        base_domain = urlparse(base_url).netloc
        
        for protocol in protocols:
            test_url = f"{protocol}://{base_domain}"
            try:
                response = self.session.get(test_url, timeout=10)
                results[test_url] = {
                    'status_code': response.status_code,
                    'content_length': len(response.content),
                    'content_preview': response.text[:200] if response.text else "Empty response"
                }
                logger.info(f"✓ {test_url}: {response.status_code}")
            except Exception as e:
                results[test_url] = {'error': str(e)}
                logger.error(f"✗ {test_url}: {e}")
        
        return results
    
    def find_working_endpoints(self, base_domain: str) -> List[str]:
        """Try to find working endpoints on the site"""
        working_endpoints = []
        
        # Common endpoint patterns to test
        endpoints_to_test = [
            '/',
            '/index.html',
            '/index.php',
            '/home',
            '/main',
            '/products',
            '/items',
            '/guide',
            '/buyers-guide',
            '/d2p',
            '/api',
            '/api/products',
            '/api/items',
            '/search',
            '/category',
            '/categories',
            '/filter',
            '/list',
            '/all',
            '/page/1',
            '/page1',
            '/p/1',
            '/1'
        ]
        
        base_url = f"https://{base_domain}"
        
        for endpoint in endpoints_to_test:
            test_url = urljoin(base_url, endpoint)
            try:
                response = self.session.get(test_url, timeout=10)
                if response.status_code == 200:
                    working_endpoints.append({
                        'url': test_url,
                        'status_code': response.status_code,
                        'content_length': len(response.content),
                        'content_preview': response.text[:300] if response.text else "Empty response"
                    })
                    logger.info(f"✓ Found working endpoint: {test_url}")
                else:
                    logger.debug(f"✗ {test_url}: {response.status_code}")
            except Exception as e:
                logger.debug(f"✗ {test_url}: {e}")
        
        return working_endpoints
    
    def scrape_with_error_handling(self, urls: List[str]) -> Dict[str, Any]:
        """Scrape URLs with comprehensive error handling"""
        results = {
            'successful_scrapes': [],
            'failed_scrapes': [],
            'error_summary': {},
            'recommendations': []
        }
        
        for i, url in enumerate(urls, 1):
            logger.info(f"Scraping {i}/{len(urls)}: {url}")
            
            try:
                # Try HTTPS first
                https_url = url.replace('http://', 'https://')
                response = self.session.get(https_url, timeout=15)
                
                if response.status_code == 200:
                    results['successful_scrapes'].append({
                        'url': https_url,
                        'status_code': response.status_code,
                        'content_length': len(response.content),
                        'content_preview': response.text[:500] if response.text else "Empty response"
                    })
                    logger.info(f"✓ Success: {https_url}")
                else:
                    results['failed_scrapes'].append({
                        'url': https_url,
                        'status_code': response.status_code,
                        'error': f"HTTP {response.status_code}"
                    })
                    logger.warning(f"✗ Failed: {https_url} - HTTP {response.status_code}")
                    
            except requests.exceptions.RequestException as e:
                results['failed_scrapes'].append({
                    'url': url,
                    'error': str(e)
                })
                logger.error(f"✗ Error: {url} - {e}")
            
            # Be respectful - add delay between requests
            time.sleep(1)
        
        # Analyze results and provide recommendations
        results['error_summary'] = self._analyze_errors(results['failed_scrapes'])
        results['recommendations'] = self._generate_recommendations(results)
        
        return results
    
    def _analyze_errors(self, failed_scrapes: List[Dict]) -> Dict[str, Any]:
        """Analyze error patterns"""
        error_counts = {}
        status_codes = {}
        
        for failure in failed_scrapes:
            error_type = failure.get('error', 'Unknown')
            status_code = failure.get('status_code', 'Unknown')
            
            error_counts[error_type] = error_counts.get(error_type, 0) + 1
            status_codes[status_code] = status_codes.get(status_code, 0) + 1
        
        return {
            'error_types': error_counts,
            'status_codes': status_codes,
            'total_failures': len(failed_scrapes)
        }
    
    def _generate_recommendations(self, results: Dict[str, Any]) -> List[str]:
        """Generate recommendations based on scraping results"""
        recommendations = []
        
        if not results['successful_scrapes']:
            recommendations.append("❌ No successful scrapes - the site may be down or URLs are incorrect")
            recommendations.append("🔍 Try investigating the site structure manually")
            recommendations.append("🌐 Check if the site has moved to a different domain")
        
        if results['error_summary']['status_codes'].get(404, 0) > 0:
            recommendations.append("🔧 404 errors suggest URL structure has changed")
            recommendations.append("📋 Consider using a sitemap or site exploration tool")
        
        if results['error_summary']['status_codes'].get(403, 0) > 0:
            recommendations.append("🚫 403 errors suggest access restrictions")
            recommendations.append("🔑 Check if authentication is required")
        
        return recommendations
    
    def explore_site_structure(self, base_domain: str) -> Dict[str, Any]:
        """Explore the site to understand its current structure"""
        logger.info(f"Exploring site structure for {base_domain}")
        
        # Test base URL variations
        url_tests = self.test_url_variations(f"https://{base_domain}")
        
        # Find working endpoints
        working_endpoints = self.find_working_endpoints(base_domain)
        
        return {
            'base_url_tests': url_tests,
            'working_endpoints': working_endpoints,
            'exploration_summary': {
                'total_endpoints_tested': len(working_endpoints),
                'working_endpoints_found': len([ep for ep in working_endpoints if ep.get('status_code') == 200])
            }
        }

def main():
    """Main function to run the scraper"""
    scraper = D2PBuyersGuideScraper()
    
    # Original URLs that failed
    original_urls = [
        "http://www.d2pbuyersguide.com/filter/all/page/1",
        "http://www.d2pbuyersguide.com/filter/all/page/2",
        "http://www.d2pbuyersguide.com/filter/all/page/3",
        "http://www.d2pbuyersguide.com/filter/all/page/4",
        "http://www.d2pbuyersguide.com/filter/all/page/5",
        "http://www.d2pbuyersguide.com/filter/all/page/6",
        "http://www.d2pbuyersguide.com/filter/all/page/7",
        "http://www.d2pbuyersguide.com/filter/all/page/8",
        "http://www.d2pbuyersguide.com/filter/all/page/9",
        "http://www.d2pbuyersguide.com/filter/all/page/10",
        "http://www.d2pbuyersguide.com/filter/all/page/11",
        "http://www.d2pbuyersguide.com/filter/all/page/12",
        "http://www.d2pbuyersguide.com/filter/all/page/13",
        "http://www.d2pbuyersguide.com/filter/all/page/14",
        "http://www.d2pbuyersguide.com/filter/all/page/15",
        "http://www.d2pbuyersguide.com/filter/all/page/16",
        "http://www.d2pbuyersguide.com/filter/all/page/17",
        "http://www.d2pbuyersguide.com/filter/all/page/18",
        "http://www.d2pbuyersguide.com/filter/all/page/19",
        "http://www.d2pbuyersguide.com/filter/all/page/20",
        "http://www.d2pbuyersguide.com/filter/all/page/21",
        "http://www.d2pbuyersguide.com/filter/all/page/22",
        "http://www.d2pbuyersguide.com/filter/all/page/23",
        "http://www.d2pbuyersguide.com/filter/all/page/24",
        "http://www.d2pbuyersguide.com/filter/all/page/25"
    ]
    
    print("🔍 Analyzing the website structure...")
    site_analysis = scraper.explore_site_structure("www.d2pbuyersguide.com")
    
    print("\n📊 Site Analysis Results:")
    print(json.dumps(site_analysis, indent=2))
    
    print("\n🔄 Attempting to scrape original URLs with fixes...")
    scrape_results = scraper.scrape_with_error_handling(original_urls)
    
    print("\n📈 Scraping Results:")
    print(f"✅ Successful scrapes: {len(scrape_results['successful_scrapes'])}")
    print(f"❌ Failed scrapes: {len(scrape_results['failed_scrapes'])}")
    
    print("\n🔧 Error Summary:")
    print(json.dumps(scrape_results['error_summary'], indent=2))
    
    print("\n💡 Recommendations:")
    for rec in scrape_results['recommendations']:
        print(f"  {rec}")
    
    # Save results to file
    with open('/workspace/scraping_results.json', 'w') as f:
        json.dump({
            'site_analysis': site_analysis,
            'scrape_results': scrape_results
        }, f, indent=2)
    
    print(f"\n💾 Results saved to /workspace/scraping_results.json")

if __name__ == "__main__":
    main()