export interface Logger {
  info: (message: string, ...args: any[]) => void;
  warn: (message: string, ...args: any[]) => void;
  error: (message: string, ...args: any[]) => void;
  debug: (message: string, ...args: any[]) => void;
}

export function createLogger(component: string): Logger {
  const log = (level: string, message: string, ...args: any[]) => {
    const timestamp = new Date().toISOString();
    const logMessage = {
      timestamp,
      level,
      component,
      message,
      ...(args.length > 0 && { data: args }),
    };
    
    console.log(JSON.stringify(logMessage));
  };

  return {
    info: (message: string, ...args: any[]) => log('info', message, ...args),
    warn: (message: string, ...args: any[]) => log('warn', message, ...args),
    error: (message: string, ...args: any[]) => log('error', message, ...args),
    debug: (message: string, ...args: any[]) => log('debug', message, ...args),
  };
}