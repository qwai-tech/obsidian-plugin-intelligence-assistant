// Performance monitor as specified in architecture
export interface PerformanceMetric {
  count: number;
  total: number;
  min: number;
  max: number;
  average: number;
}

export class PerformanceMonitor {
  private metrics = new Map<string, PerformanceMetric>();

  startTimer(name: string): () => void {
    const startTime = performance.now();
    return () => {
      const duration = performance.now() - startTime;
      this.recordMetric(name, duration);
    };
  }

  recordMetric(name: string, value: number): void {
    if (!this.metrics.has(name)) {
      this.metrics.set(name, {
        count: 0,
        total: 0,
        min: Infinity,
        max: -Infinity,
        average: 0
      });
    }

    const metric = this.metrics.get(name)!;
    metric.count++;
    metric.total += value;
    metric.min = Math.min(metric.min, value);
    metric.max = Math.max(metric.max, value);
    metric.average = metric.total / metric.count;
  }

  getMetrics(): Record<string, PerformanceMetric> {
    return Object.fromEntries(this.metrics);
  }

  reset(): void {
    this.metrics.clear();
  }
}

// Global instance
export const performanceMonitor = new PerformanceMonitor();