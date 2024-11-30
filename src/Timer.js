export class Timer {
    constructor(timeoutMs) {
      this.timeoutMs = timeoutMs;
      this.remainingMs = timeoutMs;
      this.startTime = null;
      this.isRunning = false;
    }
  
    start() {
      if (!this.isRunning) {
        this.startTime = Date.now();
        this.isRunning = true;
      }
    }
  
    stop() {
      if (this.isRunning) {
        this.remainingMs = Math.max(0, this.remainingMs - (Date.now() - this.startTime));
        this.isRunning = false;
      }
    }
  
    continue(incrementMS = 0) {
      if (!this.isRunning && this.remainingMs > 0) {
        this.remainingMs = this.remainingMs + incrementMS;
        this.startTime = Date.now();
        this.isRunning = true;
      }
    }
  
    reset(timeoutMs = null) {
      if (timeoutMs !== null) {
        this.timeoutMs = timeoutMs;
      }
      this.remainingMs = this.timeoutMs;
      this.startTime = null;
      this.isRunning = false;
    }

    reduce(ms) {
      this.remainingMs = Math.max(0, this.remainingMs - ms);
    }
  
    getRemainingTime() {
      if (this.isRunning) {
        const elapsedMs = Date.now() - this.startTime;
        return Math.max(0, this.remainingMs - elapsedMs);
      }
      return this.remainingMs;
    }
  
    getTimeString() {
      const remainingMs = this.getRemainingTime();
      const minutes = Math.floor(remainingMs / 60000);
      const seconds = Math.floor((remainingMs % 60000) / 1000);
      const ms = remainingMs % 100;
      
      return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
    }
  
    hasTimedOut() {
      return this.getRemainingTime() === 0;
    }
  }