/**
 * Stream Processing for memory-efficient batch handling
 * Processes URLs in chunks and writes to disk immediately
 */

const fs = require('fs').promises;
const path = require('path');
const { pipeline } = require('stream/promises');
const { Transform, Readable } = require('stream');
const crypto = require('crypto');

class StreamProcessor {
  constructor(options = {}) {
    this.chunkSize = options.chunkSize || 50;
    this.outputDir = options.outputDir || path.join(process.cwd(), 'outputs');
    this.tempDir = path.join(this.outputDir, 'temp');
    this.sessionId = options.sessionId || this.generateSessionId();
    this.scraper = options.scraper; // Reference to scraper function
    this.maxMemoryMB = options.maxMemoryMB || 200;
    this.enableGC = options.enableGC !== false;
    
    this.stats = {
      totalUrls: 0,
      processedUrls: 0,
      failedUrls: 0,
      totalChunks: 0,
      processedChunks: 0,
      bytesWritten: 0,
      startTime: Date.now(),
      peakMemoryMB: 0
    };
    
    this.initDirectories();
  }
  
  async initDirectories() {
    await fs.mkdir(this.outputDir, { recursive: true });
    await fs.mkdir(this.tempDir, { recursive: true });
  }
  
  generateSessionId() {
    return `session_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  }
  
  async processBatch(urls, options = {}) {
    this.stats.totalUrls = urls.length;
    this.stats.totalChunks = Math.ceil(urls.length / this.chunkSize);
    
    const outputFile = path.join(
      this.outputDir, 
      `${this.sessionId}_results.jsonl`
    );
    
    const metadataFile = path.join(
      this.outputDir,
      `${this.sessionId}_metadata.json`
    );
    
    console.info(`[StreamProcessor] Starting batch processing`);
    console.info(`  Session ID: ${this.sessionId}`);
    console.info(`  Total URLs: ${urls.length}`);
    console.info(`  Chunk size: ${this.chunkSize}`);
    console.info(`  Output file: ${outputFile}`);
    
    // Create write stream for results
    const writeStream = require('fs').createWriteStream(outputFile, {
      flags: 'a', // Append mode for resume capability
      encoding: 'utf8'
    });
    
    try {
      // Process URLs in chunks
      for (let i = 0; i < urls.length; i += this.chunkSize) {
        const chunkIndex = Math.floor(i / this.chunkSize);
        const chunk = urls.slice(i, Math.min(i + this.chunkSize, urls.length));
        
        console.info(`[StreamProcessor] Processing chunk ${chunkIndex + 1}/${this.stats.totalChunks}`);
        
        // Process chunk
        const chunkResults = await this.processChunk(chunk, chunkIndex);
        
        // Write results immediately
        for (const result of chunkResults) {
          const line = JSON.stringify({
            ...result,
            chunkIndex,
            timestamp: Date.now(),
            sessionId: this.sessionId
          }) + '\n';
          
          writeStream.write(line);
          this.stats.bytesWritten += Buffer.byteLength(line);
        }
        
        // Update stats
        this.stats.processedChunks++;
        this.stats.processedUrls += chunk.length;
        this.stats.failedUrls += chunkResults.filter(r => r.error).length;
        
        // Memory management
        await this.manageMemory();
        
        // Save checkpoint
        await this.saveCheckpoint(i + chunk.length, metadataFile);
        
        // Progress report
        this.reportProgress();
      }
      
      // Close write stream
      await new Promise((resolve, reject) => {
        writeStream.end((err) => err ? reject(err) : resolve());
      });
      
      // Save final metadata
      await this.saveFinalMetadata(metadataFile, outputFile);
      
      console.info(`[StreamProcessor] Batch processing complete`);
      this.reportFinalStats();
      
      return {
        success: true,
        sessionId: this.sessionId,
        outputFile,
        metadataFile,
        stats: this.stats
      };
      
    } catch (error) {
      console.error(`[StreamProcessor] Fatal error:`, error);
      
      // Try to close stream
      writeStream.destroy();
      
      // Save error state
      await this.saveErrorState(metadataFile, error);
      
      return {
        success: false,
        sessionId: this.sessionId,
        error: error.message,
        stats: this.stats
      };
    }
  }
  
  async processChunk(urls, chunkIndex) {
    const results = [];
    const chunkStartTime = Date.now();
    
    // Process URLs with concurrency control
    const concurrency = parseInt(process.env.HTTP_MAX_CONCURRENT) || 5;
    const processing = [];
    
    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      
      // Wait if we're at concurrency limit
      if (processing.length >= concurrency) {
        const finished = await Promise.race(processing);
        processing.splice(processing.indexOf(finished), 1);
      }
      
      // Start processing URL
      const promise = this.processUrl(url, chunkIndex, i)
        .then(result => {
          results.push(result);
          return result;
        });
      
      processing.push(promise);
    }
    
    // Wait for remaining URLs
    await Promise.all(processing);
    
    const chunkDuration = Date.now() - chunkStartTime;
    console.info(`  Chunk processed in ${chunkDuration}ms`);
    
    return results;
  }
  
  async processUrl(url, chunkIndex, indexInChunk) {
    const startTime = Date.now();
    
    try {
      // Call the scraper function
      const scrapedData = await this.scraper(url);
      
      // Extract only essential data to minimize memory
      const result = {
        url,
        success: true,
        title: scrapedData.title?.substring(0, 200),
        contentLength: scrapedData.content?.length || 0,
        contentPreview: scrapedData.content?.substring(0, 500),
        metadata: {
          author: scrapedData.author,
          date: scrapedData.date,
          category: scrapedData.category
        },
        processingTime: Date.now() - startTime
      };
      
      // Important: Don't store full content in memory
      return result;
      
    } catch (error) {
      return {
        url,
        success: false,
        error: {
          code: error.code || 'UNKNOWN',
          message: error.message,
          status: error.status
        },
        processingTime: Date.now() - startTime
      };
    }
  }
  
  async manageMemory() {
    const memUsage = process.memoryUsage();
    const heapUsedMB = Math.round(memUsage.heapUsed / 1048576);
    
    this.stats.peakMemoryMB = Math.max(this.stats.peakMemoryMB, heapUsedMB);
    
    console.info(`  Memory: ${heapUsedMB}MB (peak: ${this.stats.peakMemoryMB}MB)`);
    
    // Force garbage collection if available and memory is high
    if (heapUsedMB > this.maxMemoryMB && this.enableGC) {
      if (global.gc) {
        console.info(`  Triggering garbage collection...`);
        global.gc();
        
        // Check memory after GC
        const afterGC = Math.round(process.memoryUsage().heapUsed / 1048576);
        console.info(`  Memory after GC: ${afterGC}MB`);
      }
    }
    
    // If memory is still critically high, pause briefly
    if (heapUsedMB > this.maxMemoryMB * 1.5) {
      console.info(`  Memory critical, pausing for 2 seconds...`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  async saveCheckpoint(processedCount, metadataFile) {
    const checkpoint = {
      sessionId: this.sessionId,
      processedCount,
      totalCount: this.stats.totalUrls,
      processedChunks: this.stats.processedChunks,
      totalChunks: this.stats.totalChunks,
      failedUrls: this.stats.failedUrls,
      bytesWritten: this.stats.bytesWritten,
      timestamp: Date.now(),
      canResume: true
    };
    
    await fs.writeFile(
      metadataFile,
      JSON.stringify(checkpoint, null, 2)
    );
  }
  
  async saveFinalMetadata(metadataFile, outputFile) {
    const metadata = {
      sessionId: this.sessionId,
      status: 'complete',
      stats: {
        ...this.stats,
        duration: Date.now() - this.stats.startTime,
        averageTimePerUrl: (Date.now() - this.stats.startTime) / this.stats.processedUrls
      },
      outputFile,
      completedAt: new Date().toISOString()
    };
    
    await fs.writeFile(
      metadataFile,
      JSON.stringify(metadata, null, 2)
    );
  }
  
  async saveErrorState(metadataFile, error) {
    const errorState = {
      sessionId: this.sessionId,
      status: 'error',
      error: {
        message: error.message,
        stack: error.stack,
        code: error.code
      },
      stats: this.stats,
      timestamp: Date.now()
    };
    
    await fs.writeFile(
      metadataFile,
      JSON.stringify(errorState, null, 2)
    );
  }
  
  reportProgress() {
    const progress = (this.stats.processedUrls / this.stats.totalUrls * 100).toFixed(1);
    const elapsed = Date.now() - this.stats.startTime;
    const urlsPerSecond = (this.stats.processedUrls / (elapsed / 1000)).toFixed(2);
    const eta = ((this.stats.totalUrls - this.stats.processedUrls) / urlsPerSecond).toFixed(0);
    
    console.info(`  Progress: ${progress}% (${this.stats.processedUrls}/${this.stats.totalUrls})`);
    console.info(`  Speed: ${urlsPerSecond} URLs/sec`);
    console.info(`  ETA: ${eta} seconds`);
    console.info(`  Failed: ${this.stats.failedUrls}`);
  }
  
  reportFinalStats() {
    const duration = Date.now() - this.stats.startTime;
    const successRate = ((this.stats.processedUrls - this.stats.failedUrls) / 
                        this.stats.processedUrls * 100).toFixed(1);
    
    console.info('\n=== Final Statistics ===');
    console.info(`Total URLs: ${this.stats.totalUrls}`);
    console.info(`Processed: ${this.stats.processedUrls}`);
    console.info(`Failed: ${this.stats.failedUrls}`);
    console.info(`Success Rate: ${successRate}%`);
    console.info(`Duration: ${(duration / 1000).toFixed(1)} seconds`);
    console.info(`Average Speed: ${(this.stats.processedUrls / (duration / 1000)).toFixed(2)} URLs/sec`);
    console.info(`Peak Memory: ${this.stats.peakMemoryMB}MB`);
    console.info(`Data Written: ${(this.stats.bytesWritten / 1048576).toFixed(2)}MB`);
  }
  
  async resume(sessionId, urls) {
    const metadataFile = path.join(this.outputDir, `${sessionId}_metadata.json`);
    
    try {
      const metadata = JSON.parse(await fs.readFile(metadataFile, 'utf8'));
      
      if (!metadata.canResume) {
        throw new Error('Session cannot be resumed');
      }
      
      console.info(`[StreamProcessor] Resuming session ${sessionId}`);
      console.info(`  Previously processed: ${metadata.processedCount} URLs`);
      
      // Update session info
      this.sessionId = sessionId;
      this.stats.processedUrls = metadata.processedCount;
      this.stats.failedUrls = metadata.failedUrls;
      this.stats.bytesWritten = metadata.bytesWritten;
      
      // Resume from last checkpoint
      const remainingUrls = urls.slice(metadata.processedCount);
      return await this.processBatch(remainingUrls);
      
    } catch (error) {
      console.error(`[StreamProcessor] Cannot resume session:`, error);
      throw error;
    }
  }
}

module.exports = StreamProcessor;