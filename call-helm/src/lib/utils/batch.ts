// Batch processing utilities to prevent memory leaks in bulk operations

interface BatchConfig {
  batchSize: number
  delayBetweenBatches?: number // Milliseconds
  maxConcurrency?: number
  onBatchComplete?: (batchIndex: number, results: any[]) => void
  onBatchError?: (batchIndex: number, error: Error) => void
}

/**
 * Process items in batches to prevent memory exhaustion
 */
export async function processBatch<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  config: BatchConfig
): Promise<{ successes: R[], failures: Array<{ item: T, error: Error }> }> {
  const {
    batchSize,
    delayBetweenBatches = 0,
    maxConcurrency = 5,
    onBatchComplete,
    onBatchError
  } = config

  const successes: R[] = []
  const failures: Array<{ item: T, error: Error }> = []

  // Split items into batches
  const batches: T[][] = []
  for (let i = 0; i < items.length; i += batchSize) {
    batches.push(items.slice(i, i + batchSize))
  }

  // Process each batch
  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex]
    
    try {
      // Process batch with limited concurrency
      const batchResults = await processWithConcurrency(
        batch,
        processor,
        maxConcurrency
      )

      // Collect results
      batchResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          successes.push(result.value)
        } else {
          failures.push({
            item: batch[index],
            error: result.reason
          })
        }
      })

      // Callback for batch completion
      if (onBatchComplete) {
        onBatchComplete(batchIndex, batchResults)
      }

      // Delay between batches to avoid overwhelming the system
      if (delayBetweenBatches > 0 && batchIndex < batches.length - 1) {
        await delay(delayBetweenBatches)
      }

      // Force garbage collection hint (V8 will decide when to actually collect)
      if (global.gc) {
        global.gc()
      }

    } catch (error) {
      // Handle batch-level errors
      if (onBatchError) {
        onBatchError(batchIndex, error as Error)
      }
      
      // Add all items from failed batch to failures
      batch.forEach(item => {
        failures.push({
          item,
          error: error as Error
        })
      })
    }
  }

  return { successes, failures }
}

/**
 * Process items with limited concurrency
 */
async function processWithConcurrency<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  maxConcurrency: number
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = []
  
  // Wrapper to track promise completion
  interface TrackedPromise {
    promise: Promise<void>
    done: boolean
  }
  
  const executing: TrackedPromise[] = []

  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    
    // Create a tracked promise wrapper
    const tracked: TrackedPromise = { promise: Promise.resolve(), done: false }
    
    tracked.promise = processor(item)
      .then(value => {
        results[i] = { status: 'fulfilled', value }
        tracked.done = true
      })
      .catch(reason => {
        results[i] = { status: 'rejected', reason }
        tracked.done = true
      })

    executing.push(tracked)

    // Limit concurrency
    if (executing.length >= maxConcurrency) {
      await Promise.race(executing.map(t => t.promise))
      // Remove completed promises
      const stillExecuting = executing.filter(t => !t.done)
      executing.length = 0
      executing.push(...stillExecuting)
    }
  }

  // Wait for remaining promises
  await Promise.all(executing.map(t => t.promise))

  return results
}

/**
 * Utility to delay execution
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Stream-based batch processor for very large datasets
 */
export class BatchStream<T, R> {
  private buffer: T[] = []
  private processing = false
  private destroyed = false

  constructor(
    private processor: (items: T[]) => Promise<R[]>,
    private config: {
      batchSize: number
      flushInterval?: number // Auto-flush after X milliseconds
      highWaterMark?: number // Max items to buffer
    }
  ) {
    // Set up auto-flush if configured
    if (config.flushInterval) {
      setInterval(() => {
        if (this.buffer.length > 0 && !this.processing) {
          this.flush()
        }
      }, config.flushInterval)
    }
  }

  /**
   * Add items to the buffer
   */
  async write(items: T | T[]): Promise<void> {
    if (this.destroyed) {
      throw new Error('BatchStream has been destroyed')
    }

    const itemArray = Array.isArray(items) ? items : [items]
    this.buffer.push(...itemArray)

    // Check if we should flush
    if (this.buffer.length >= this.config.batchSize) {
      await this.flush()
    }

    // Prevent buffer overflow
    if (this.config.highWaterMark && this.buffer.length > this.config.highWaterMark) {
      throw new Error(`Buffer overflow: ${this.buffer.length} items exceeds high water mark`)
    }
  }

  /**
   * Process buffered items
   */
  async flush(): Promise<R[]> {
    if (this.processing || this.buffer.length === 0) {
      return []
    }

    this.processing = true
    const batch = this.buffer.splice(0, this.config.batchSize)
    
    try {
      const results = await this.processor(batch)
      return results
    } finally {
      this.processing = false
    }
  }

  /**
   * Process remaining items and clean up
   */
  async end(): Promise<void> {
    while (this.buffer.length > 0) {
      await this.flush()
    }
    this.destroy()
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.destroyed = true
    this.buffer = []
  }
}

/**
 * Chunked array processor to handle very large arrays
 */
export function* chunkArray<T>(array: T[], chunkSize: number): Generator<T[], void, unknown> {
  for (let i = 0; i < array.length; i += chunkSize) {
    yield array.slice(i, i + chunkSize)
  }
}

/**
 * Memory-efficient map operation for large arrays
 */
export async function mapInBatches<T, R>(
  items: T[],
  mapper: (item: T) => Promise<R>,
  batchSize: number = 100
): Promise<R[]> {
  const results: R[] = []
  
  for (const chunk of chunkArray(items, batchSize)) {
    const chunkResults = await Promise.all(chunk.map(mapper))
    results.push(...chunkResults)
    
    // Allow event loop to process other tasks
    await delay(0)
  }
  
  return results
}

/**
 * Memory-efficient filter operation for large arrays
 */
export async function filterInBatches<T>(
  items: T[],
  predicate: (item: T) => Promise<boolean>,
  batchSize: number = 100
): Promise<T[]> {
  const results: T[] = []
  
  for (const chunk of chunkArray(items, batchSize)) {
    const predicateResults = await Promise.all(chunk.map(predicate))
    const filtered = chunk.filter((_, index) => predicateResults[index])
    results.push(...filtered)
    
    // Allow event loop to process other tasks
    await delay(0)
  }
  
  return results
}

/**
 * Memory-efficient reduce operation for large arrays
 */
export async function reduceInBatches<T, R>(
  items: T[],
  reducer: (acc: R, item: T) => Promise<R>,
  initialValue: R,
  batchSize: number = 100
): Promise<R> {
  let accumulator = initialValue
  
  for (const chunk of chunkArray(items, batchSize)) {
    for (const item of chunk) {
      accumulator = await reducer(accumulator, item)
    }
    
    // Allow event loop to process other tasks
    await delay(0)
  }
  
  return accumulator
}