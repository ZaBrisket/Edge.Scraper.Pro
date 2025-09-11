#!/usr/bin/env python3
"""
Simple Web Scraper for d2pbuyersguide.com using built-in libraries
Handles 404 errors and provides analysis
"""

import urllib.request
import urllib.error
import ssl
import json
import time
import os
from typing import List, Dict, Any

class SimpleD2PScraper:
    def __init__(self):
        # Create SSL context that ignores certificate verification
        self.ssl_context = ssl.create_default_context()
        self.ssl_context.check_hostname = False
        self.ssl_context.verify_mode = ssl.CERT_NONE
        
        # Create opener with custom headers
        opener = urllib.request.build_opener(urllib.request.HTTPSHandler(context=self.ssl_context))
        opener.addheaders = [
            ('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36')
        ]
        urllib.request.install_opener(opener)
    
    def test_url(self, url: str) -> Dict[str, Any]:
        """Test a single URL and return results"""
        try:
            with urllib.request.urlopen(url, timeout=15) as response:
                content = response.read().decode('utf-8', errors='ignore')
                return {
                    'url': url,
                    'status_code': response.getcode(),
                    'success': True,
                    'content_length': len(content),
                    'content_preview': content[:300] if content else "Empty response",
                    'headers': dict(response.headers)
                }
        except urllib.error.HTTPError as e:
            return {
                'url': url,
                'status_code': e.code,
                'success': False,
                'error': f"HTTP {e.code}: {e.reason}",
                'content_preview': e.read().decode('utf-8', errors='ignore')[:200] if hasattr(e, 'read') else "No content"
            }
        except Exception as e:
            return {
                'url': url,
                'success': False,
                'error': str(e),
                'content_preview': "No content"
            }
    
    def explore_site(self, base_domain: str) -> Dict[str, Any]:
        """Explore the site to find working endpoints"""
        print(f"🔍 Exploring {base_domain}...")
        
        # Test different URL patterns
        test_urls = [
            f"https://{base_domain}",
            f"http://{base_domain}",
            f"https://{base_domain}/",
            f"https://{base_domain}/index.html",
            f"https://{base_domain}/index.php",
            f"https://{base_domain}/home",
            f"https://{base_domain}/main",
            f"https://{base_domain}/products",
            f"https://{base_domain}/items",
            f"https://{base_domain}/guide",
            f"https://{base_domain}/buyers-guide",
            f"https://{base_domain}/d2p",
            f"https://{base_domain}/api",
            f"https://{base_domain}/search",
            f"https://{base_domain}/category",
            f"https://{base_domain}/filter",
            f"https://{base_domain}/all",
            f"https://{base_domain}/page/1",
            f"https://{base_domain}/page1",
            f"https://{base_domain}/p/1"
        ]
        
        results = []
        working_endpoints = []
        
        for url in test_urls:
            print(f"  Testing: {url}")
            result = self.test_url(url)
            results.append(result)
            
            if result.get('success') and result.get('status_code') == 200:
                working_endpoints.append(result)
                print(f"    ✅ SUCCESS: {result['status_code']} - {result['content_length']} bytes")
            else:
                status = result.get('status_code', 'Error')
                print(f"    ❌ FAILED: {status}")
            
            time.sleep(0.5)  # Be respectful
        
        return {
            'all_tests': results,
            'working_endpoints': working_endpoints,
            'summary': {
                'total_tested': len(results),
                'successful': len(working_endpoints),
                'failed': len(results) - len(working_endpoints)
            }
        }
    
    def scrape_original_urls(self, urls: List[str]) -> Dict[str, Any]:
        """Scrape the original URLs that failed"""
        print(f"\n🔄 Testing original URLs ({len(urls)} total)...")
        
        results = []
        successful = []
        failed = []
        
        for i, url in enumerate(urls, 1):
            print(f"  [{i:2d}/{len(urls)}] Testing: {url}")
            
            # Try both HTTP and HTTPS versions
            https_url = url.replace('http://', 'https://')
            
            # Test HTTPS first
            result = self.test_url(https_url)
            result['original_url'] = url
            results.append(result)
            
            if result.get('success') and result.get('status_code') == 200:
                successful.append(result)
                print(f"    ✅ SUCCESS: {result['status_code']} - {result['content_length']} bytes")
            else:
                failed.append(result)
                status = result.get('status_code', 'Error')
                print(f"    ❌ FAILED: {status}")
            
            time.sleep(0.5)  # Be respectful
        
        return {
            'all_results': results,
            'successful': successful,
            'failed': failed,
            'summary': {
                'total': len(results),
                'successful': len(successful),
                'failed': len(failed),
                'success_rate': f"{(len(successful)/len(results)*100):.1f}%"
            }
        }
    
    def analyze_errors(self, failed_results: List[Dict]) -> Dict[str, Any]:
        """Analyze error patterns"""
        error_counts = {}
        status_codes = {}
        
        for result in failed_results:
            error = result.get('error', 'Unknown')
            status = result.get('status_code', 'Unknown')
            
            error_counts[error] = error_counts.get(error, 0) + 1
            status_codes[status] = status_codes.get(status, 0) + 1
        
        return {
            'error_types': error_counts,
            'status_codes': status_codes,
            'total_failures': len(failed_results)
        }
    
    def generate_recommendations(self, exploration_results: Dict, scraping_results: Dict) -> List[str]:
        """Generate recommendations based on results"""
        recommendations = []
        
        # Check if any endpoints work
        if exploration_results['summary']['successful'] == 0:
            recommendations.append("❌ No working endpoints found - site may be down or completely restructured")
            recommendations.append("🌐 Consider checking if the site has moved to a different domain")
            recommendations.append("📧 Contact the site administrator for current URL structure")
        else:
            recommendations.append(f"✅ Found {exploration_results['summary']['successful']} working endpoints")
            recommendations.append("🔧 Use the working endpoints instead of the pagination URLs")
        
        # Check scraping results
        if scraping_results['summary']['successful'] == 0:
            recommendations.append("❌ All original pagination URLs failed")
            recommendations.append("🔍 The pagination structure has likely changed")
            recommendations.append("📋 Try using the working endpoints found during exploration")
        
        # Check for specific error patterns
        if scraping_results['summary']['failed'] > 0:
            error_analysis = self.analyze_errors(scraping_results['failed'])
            if error_analysis['status_codes'].get(404, 0) > 0:
                recommendations.append("🔧 404 errors confirm URL structure has changed")
            if error_analysis['status_codes'].get(403, 0) > 0:
                recommendations.append("🚫 403 errors suggest access restrictions")
        
        return recommendations

def main():
    """Main function"""
    scraper = SimpleD2PScraper()
    
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
    
    print("=" * 60)
    print("🔍 D2P Buyers Guide Scraper - Error Analysis & Fix")
    print("=" * 60)
    
    # Step 1: Explore the site
    exploration_results = scraper.explore_site("www.d2pbuyersguide.com")
    
    print(f"\n📊 Site Exploration Summary:")
    print(f"  Total endpoints tested: {exploration_results['summary']['total_tested']}")
    print(f"  Successful: {exploration_results['summary']['successful']}")
    print(f"  Failed: {exploration_results['summary']['failed']}")
    
    if exploration_results['working_endpoints']:
        print(f"\n✅ Working Endpoints Found:")
        for endpoint in exploration_results['working_endpoints']:
            print(f"  • {endpoint['url']} ({endpoint['status_code']}) - {endpoint['content_length']} bytes")
            print(f"    Preview: {endpoint['content_preview'][:100]}...")
    
    # Step 2: Test original URLs
    scraping_results = scraper.scrape_original_urls(original_urls)
    
    print(f"\n📈 Original URL Testing Results:")
    print(f"  Total URLs tested: {scraping_results['summary']['total']}")
    print(f"  Successful: {scraping_results['summary']['successful']}")
    print(f"  Failed: {scraping_results['summary']['failed']}")
    print(f"  Success rate: {scraping_results['summary']['success_rate']}")
    
    # Step 3: Analyze errors
    if scraping_results['failed']:
        error_analysis = scraper.analyze_errors(scraping_results['failed'])
        print(f"\n🔍 Error Analysis:")
        print(f"  Status codes: {error_analysis['status_codes']}")
        print(f"  Error types: {error_analysis['error_types']}")
    
    # Step 4: Generate recommendations
    recommendations = scraper.generate_recommendations(exploration_results, scraping_results)
    
    print(f"\n💡 Recommendations:")
    for i, rec in enumerate(recommendations, 1):
        print(f"  {i}. {rec}")
    
    # Save detailed results
    detailed_results = {
        'exploration_results': exploration_results,
        'scraping_results': scraping_results,
        'recommendations': recommendations,
        'timestamp': time.strftime('%Y-%m-%d %H:%M:%S')
    }
    
    # Create output directory if it doesn't exist
    output_dir = 'scraping_output'
    os.makedirs(output_dir, exist_ok=True)
    
    output_file = os.path.join(output_dir, 'detailed_analysis.json')
    try:
        with open(output_file, 'w') as f:
            json.dump(detailed_results, f, indent=2)
        print(f"\n💾 Detailed results saved to: {output_file}")
    except Exception as e:
        print(f"\n⚠️  Warning: Could not save results to file: {e}")
        print("   Results are still displayed above.")
    print("\n" + "=" * 60)
    print("🎯 CONCLUSION: The pagination URLs are not working because the site")
    print("   structure has changed. Use the working endpoints found above")
    print("   or contact the site administrator for current URL structure.")
    print("=" * 60)

if __name__ == "__main__":
    main()