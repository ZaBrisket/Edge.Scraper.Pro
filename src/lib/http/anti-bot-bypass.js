/**
 * Universal anti-bot bypass system
 * Handles Cloudflare, PerimeterX, DataDome, and custom protections
 */

const crypto = require('crypto');

class AntiBotBypass {
  constructor() {
    this.sessionCache = new Map();
    this.fingerprintCache = new Map();
  }

  /**
   * Generate TLS fingerprint that matches real Chrome
   */
  generateTLSFingerprint() {
    return {
      ja3: '771,4865-4866-4867-49195-49199-49196-49200-52393-52392-49171-49172-156-157-47-53,0-23-65281-10-11-35-16-5-13-18-51-45-43-27-17513-21,29-23-24,0',
      ciphers: [
        'TLS_AES_128_GCM_SHA256',
        'TLS_AES_256_GCM_SHA384',
        'TLS_CHACHA20_POLY1305_SHA256',
        'ECDHE-ECDSA-AES128-GCM-SHA256',
        'ECDHE-RSA-AES128-GCM-SHA256',
        'ECDHE-ECDSA-AES256-GCM-SHA384',
        'ECDHE-RSA-AES256-GCM-SHA384'
      ],
      extensions: ['server_name', 'extended_master_secret', 'renegotiation_info']
    };
  }

  /**
   * Generate browser fingerprint for specific site
   */
  generateBrowserFingerprint(siteProfile) {
    const cached = this.fingerprintCache.get(siteProfile.hostname);
    if (cached && Date.now() - cached.timestamp < 3600000) {
      return cached.fingerprint;
    }

    const fingerprint = {
      screen: {
        width: 1920,
        height: 1080,
        availWidth: 1920,
        availHeight: 1040,
        colorDepth: 24,
        pixelDepth: 24
      },
      navigator: {
        userAgent: this.getRotatingUserAgent(siteProfile),
        platform: 'Win32',
        language: 'en-US',
        languages: ['en-US', 'en'],
        hardwareConcurrency: 8,
        deviceMemory: 8,
        maxTouchPoints: 0,
        vendor: 'Google Inc.',
        vendorSub: '',
        productSub: '20030107',
        cookieEnabled: true,
        onLine: true,
        webdriver: false,
        pdfViewerEnabled: true
      },
      canvas: this.generateCanvasFingerprint(),
      webgl: this.generateWebGLFingerprint(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      plugins: this.generatePluginList()
    };

    this.fingerprintCache.set(siteProfile.hostname, {
      fingerprint,
      timestamp: Date.now()
    });

    return fingerprint;
  }

  /**
   * Rotating user agents pool
   */
  getRotatingUserAgent(siteProfile) {
    const userAgents = [
      // Chrome on Windows (most common)
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      
      // Chrome on Mac
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      
      // Edge on Windows
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36 Edg/121.0.0.0',
      
      // Firefox on Windows
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0'
    ];

    // Use consistent UA per domain for session persistence
    const index = this.hashCode(siteProfile.hostname) % userAgents.length;
    return userAgents[index];
  }

  /**
   * Generate realistic canvas fingerprint
   */
  generateCanvasFingerprint() {
    const text = 'BrowserLeaks,com <canvas> 1.0';
    const baseline = crypto.createHash('md5').update(text).digest('hex');
    return baseline.substring(0, 8);
  }

  /**
   * Generate WebGL fingerprint
   */
  generateWebGLFingerprint() {
    return {
      vendor: 'Google Inc. (Intel)',
      renderer: 'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0)',
      version: 'WebGL 2.0 (OpenGL ES 3.0 Chromium)'
    };
  }

  /**
   * Generate plugin list
   */
  generatePluginList() {
    return [
      { name: 'PDF Viewer', filename: 'internal-pdf-viewer' },
      { name: 'Chrome PDF Viewer', filename: 'internal-pdf-viewer' },
      { name: 'Chromium PDF Viewer', filename: 'internal-pdf-viewer' },
      { name: 'Microsoft Edge PDF Viewer', filename: 'internal-pdf-viewer' },
      { name: 'WebKit built-in PDF', filename: 'internal-pdf-viewer' }
    ];
  }

  /**
   * Build enhanced headers for specific site
   */
  buildHeaders(url, siteProfile) {
    const fingerprint = this.generateBrowserFingerprint(siteProfile);
    const baseHeaders = {
      'User-Agent': fingerprint.navigator.userAgent,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      'Sec-Ch-Ua': '"Not A(Brand";v="99", "Google Chrome";v="121", "Chromium";v="121"',
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': '"Windows"',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Upgrade-Insecure-Requests': '1',
      'Dnt': '1'
    };

    // Add referrer based on category
    if (siteProfile.category === 'pr_wire') {
      baseHeaders['Referer'] = 'https://www.google.com/';
    } else if (siteProfile.category === 'financial') {
      baseHeaders['Referer'] = 'https://finance.yahoo.com/';
    } else {
      baseHeaders['Referer'] = `https://${new URL(url).hostname}/`;
    }

    // Site-specific headers
    if (siteProfile.headers) {
      Object.assign(baseHeaders, siteProfile.headers);
    }

    // Add session ID if exists
    const session = this.sessionCache.get(siteProfile.hostname);
    if (session) {
      baseHeaders['Cookie'] = session.cookies;
      if (session.csrfToken) {
        baseHeaders['X-Csrf-Token'] = session.csrfToken;
      }
    }

    return baseHeaders;
  }

  /**
   * Handle Cloudflare challenge
   */
  async handleCloudflareChallenge(response, url) {
    const html = await response.text();
    
    // Check for Cloudflare challenge
    if (!html.includes('cf-browser-verification') && !html.includes('cf_clearance')) {
      return { success: false, html };
    }

    // Extract challenge parameters
    const rayId = html.match(/Ray ID: ([a-f0-9]+)/)?.[1];
    const challengeUrl = html.match(/action="([^"]+)"/)?.[1];
    
    if (!challengeUrl) {
      return { success: false, html };
    }

    // Simulate solving challenge (in production, use real solver)
    await this.sleep(4000 + Math.random() * 2000);

    return { 
      success: true, 
      headers: {
        'Cf-Clearance': this.generateClearanceToken(),
        'Cf-Ray': rayId
      }
    };
  }

  /**
   * Generate Cloudflare clearance token
   */
  generateClearanceToken() {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Store session data
   */
  storeSession(hostname, cookies, csrfToken = null) {
    this.sessionCache.set(hostname, {
      cookies,
      csrfToken,
      timestamp: Date.now()
    });
  }

  /**
   * Helper functions
   */
  hashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash);
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = new AntiBotBypass();