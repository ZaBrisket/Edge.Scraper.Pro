/**
 * Session Persistence Manager
 * Handles checkpointing and recovery for interrupted scraping sessions
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

class SessionManager {
  constructor(options = {}) {
    this.sessionsDir = options.sessionsDir || path.join(process.cwd(), 'sessions');
    this.checkpointInterval = options.checkpointInterval || 10; // URLs
    this.sessionTTL = options.sessionTTL || 3600000; // 1 hour
    this.maxSessions = options.maxSessions || 100;

    this.currentSession = null;
    // Remove async call: this.initDirectory();
    // Directory will be created via factory method or explicitly
  }

  /**
   * Factory method to properly initialize SessionManager with directory creation
   */
  static async create(options = {}) {
    const manager = new SessionManager(options);
    await manager.initDirectory();
    return manager;
  }
  
  async initDirectory() {
    await fs.mkdir(this.sessionsDir, { recursive: true });
  }
  
  generateSessionId() {
    return `session_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  }
  
  async createSession(urls, metadata = {}) {
    const sessionId = this.generateSessionId();
    const sessionFile = path.join(this.sessionsDir, `${sessionId}.json`);
    
    const session = {
      id: sessionId,
      status: 'active',
      urls: urls,
      totalUrls: urls.length,
      processedUrls: [],
      failedUrls: [],
      currentIndex: 0,
      checkpoints: [],
      metadata: {
        ...metadata,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        expiresAt: Date.now() + this.sessionTTL
      },
      results: {
        outputFile: null,
        successCount: 0,
        failureCount: 0,
        totalTime: 0
      }
    };
    
    await fs.writeFile(sessionFile, JSON.stringify(session, null, 2));
    
    this.currentSession = session;
    console.log(`[SessionManager] Created session: ${sessionId}`);
    
    // Clean up old sessions
    await this.cleanupOldSessions();
    
    return session;
  }
  
  async loadSession(sessionId) {
    const sessionFile = path.join(this.sessionsDir, `${sessionId}.json`);
    
    try {
      const sessionData = await fs.readFile(sessionFile, 'utf8');
      const session = JSON.parse(sessionData);
      
      // Check if session is expired
      if (session.metadata.expiresAt < Date.now()) {
        throw new Error(`Session ${sessionId} has expired`);
      }
      
      this.currentSession = session;
      console.log(`[SessionManager] Loaded session: ${sessionId}`);
      console.log(`  Progress: ${session.currentIndex}/${session.totalUrls} URLs`);
      
      return session;
      
    } catch (error) {
      console.error(`[SessionManager] Failed to load session:`, error);
      throw error;
    }
  }
  
  async checkpoint(processedUrl, result, index) {
    if (!this.currentSession) {
      throw new Error('No active session');
    }
    
    const session = this.currentSession;
    
    // Update session state
    session.processedUrls.push(processedUrl);
    session.currentIndex = index + 1;
    session.metadata.updatedAt = Date.now();
    
    if (result.success) {
      session.results.successCount++;
    } else {
      session.failedUrls.push({
        url: processedUrl,
        error: result.error,
        attemptedAt: Date.now()
      });
      session.results.failureCount++;
    }
    
    // Save checkpoint at interval
    if (session.processedUrls.length % this.checkpointInterval === 0) {
      await this.saveCheckpoint();
    }
    
    return session;
  }
  
  async saveCheckpoint() {
    if (!this.currentSession) {
      throw new Error('No active session');
    }
    
    const session = this.currentSession;
    const sessionFile = path.join(this.sessionsDir, `${session.id}.json`);
    
    // Add checkpoint timestamp
    session.checkpoints.push({
      index: session.currentIndex,
      timestamp: Date.now(),
      successCount: session.results.successCount,
      failureCount: session.results.failureCount
    });
    
    // Keep only last 100 checkpoints
    if (session.checkpoints.length > 100) {
      session.checkpoints = session.checkpoints.slice(-100);
    }
    
    // Save to disk
    await fs.writeFile(sessionFile, JSON.stringify(session, null, 2));
    
    console.log(`[SessionManager] Checkpoint saved at index ${session.currentIndex}`);
  }
  
  async completeSession(outputFile) {
    if (!this.currentSession) {
      throw new Error('No active session');
    }
    
    const session = this.currentSession;
    session.status = 'complete';
    session.results.outputFile = outputFile;
    session.results.totalTime = Date.now() - session.metadata.createdAt;
    session.metadata.completedAt = Date.now();
    
    const sessionFile = path.join(this.sessionsDir, `${session.id}.json`);
    await fs.writeFile(sessionFile, JSON.stringify(session, null, 2));
    
    console.log(`[SessionManager] Session completed: ${session.id}`);
    console.log(`  Success: ${session.results.successCount}/${session.totalUrls}`);
    console.log(`  Duration: ${(session.results.totalTime / 1000).toFixed(1)}s`);
    
    return session;
  }
  
  async failSession(error) {
    if (!this.currentSession) {
      throw new Error('No active session');
    }
    
    const session = this.currentSession;
    session.status = 'failed';
    session.error = {
      message: error.message,
      stack: error.stack,
      timestamp: Date.now()
    };
    
    const sessionFile = path.join(this.sessionsDir, `${session.id}.json`);
    await fs.writeFile(sessionFile, JSON.stringify(session, null, 2));
    
    console.error(`[SessionManager] Session failed: ${session.id}`);
    
    return session;
  }
  
  async canResume(sessionId) {
    try {
      const session = await this.loadSession(sessionId);
      return (
        session.status === 'active' &&
        session.currentIndex < session.totalUrls &&
        session.metadata.expiresAt > Date.now()
      );
    } catch (error) {
      return false;
    }
  }
  
  async resume(sessionId) {
    const session = await this.loadSession(sessionId);
    
    if (session.status !== 'active') {
      throw new Error(`Cannot resume session with status: ${session.status}`);
    }
    
    console.log(`[SessionManager] Resuming from index ${session.currentIndex}`);
    
    // Return remaining URLs
    const remainingUrls = session.urls.slice(session.currentIndex);
    
    return {
      session,
      remainingUrls,
      processedCount: session.currentIndex,
      previousResults: {
        success: session.results.successCount,
        failed: session.results.failureCount
      }
    };
  }
  
  async listSessions(status = null) {
    const files = await fs.readdir(this.sessionsDir);
    const sessions = [];
    
    for (const file of files) {
      if (file.endsWith('.json')) {
        try {
          const sessionData = await fs.readFile(
            path.join(this.sessionsDir, file),
            'utf8'
          );
          const session = JSON.parse(sessionData);
          
          if (!status || session.status === status) {
            sessions.push({
              id: session.id,
              status: session.status,
              progress: `${session.currentIndex}/${session.totalUrls}`,
              createdAt: new Date(session.metadata.createdAt).toISOString(),
              updatedAt: new Date(session.metadata.updatedAt).toISOString()
            });
          }
        } catch (error) {
          // Skip invalid session files
        }
      }
    }
    
    return sessions.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  
  async cleanupOldSessions() {
    const files = await fs.readdir(this.sessionsDir);
    const sessions = [];
    
    // Load all sessions with metadata
    for (const file of files) {
      if (file.endsWith('.json')) {
        try {
          const filePath = path.join(this.sessionsDir, file);
          const stats = await fs.stat(filePath);
          const sessionData = await fs.readFile(filePath, 'utf8');
          const session = JSON.parse(sessionData);
          
          sessions.push({
            file: filePath,
            createdAt: session.metadata.createdAt,
            status: session.status,
            expired: session.metadata.expiresAt < Date.now()
          });
        } catch (error) {
          // Skip invalid files
        }
      }
    }
    
    // Sort by creation time (oldest first)
    sessions.sort((a, b) => a.createdAt - b.createdAt);
    
    // Remove expired sessions
    for (const session of sessions) {
      if (session.expired && session.status !== 'complete') {
        await fs.unlink(session.file);
        console.log(`[SessionManager] Removed expired session: ${path.basename(session.file)}`);
      }
    }
    
    // Remove oldest sessions if over limit
    if (sessions.length > this.maxSessions) {
      const toRemove = sessions.slice(0, sessions.length - this.maxSessions);
      for (const session of toRemove) {
        await fs.unlink(session.file);
        console.log(`[SessionManager] Removed old session: ${path.basename(session.file)}`);
      }
    }
  }
  
  async getSessionStats(sessionId) {
    const session = await this.loadSession(sessionId);

    const elapsed = Date.now() - session.metadata.createdAt;
    
    // Guard against division by zero
    const urlsPerSecond = session.currentIndex > 0 
      ? session.currentIndex / (elapsed / 1000) 
      : 0;
    
    const estimatedTimeRemaining = urlsPerSecond > 0
      ? ((session.totalUrls - session.currentIndex) / urlsPerSecond).toFixed(0)
      : 'N/A';

    const averageTimePerUrl = session.currentIndex > 0
      ? (elapsed / session.currentIndex).toFixed(0)
      : '0';

    const successRate = session.currentIndex > 0
      ? (session.results.successCount / session.currentIndex * 100).toFixed(1)
      : '0.0';

    return {
      sessionId: session.id,
      status: session.status,
      progress: {
        current: session.currentIndex,
        total: session.totalUrls,
        percentage: session.totalUrls > 0 
          ? (session.currentIndex / session.totalUrls * 100).toFixed(1)
          : '0.0'
      },
      performance: {
        urlsPerSecond: urlsPerSecond.toFixed(2),
        averageTimePerUrl: averageTimePerUrl,
        estimatedTimeRemaining: estimatedTimeRemaining
      },
      results: {
        success: session.results.successCount,
        failed: session.results.failureCount,
        successRate: successRate
      },
      checkpoints: session.checkpoints.length,
      lastCheckpoint: session.checkpoints[session.checkpoints.length - 1] || null
    };
  }
}

module.exports = SessionManager;