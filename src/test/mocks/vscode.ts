/**
 * Mock VSCode API for testing purposes
 */

export interface OutputChannel {
  appendLine(value: string): void;
  show(): void;
  clear(): void;
  dispose(): void;
}

export interface MessageOptions {
  modal?: boolean;
}

export interface MessageItem {
  title: string;
}

export interface Progress<T> {
  report(value: T): void;
}

export interface CancellationToken {
  isCancellationRequested: boolean;
}

export interface ProgressOptions {
  location: number;
  title: string;
  cancellable: boolean;
}

export const ProgressLocation = {
  Notification: 15
};

export const window = {
  createOutputChannel: (name: string): OutputChannel => {
    return {
      appendLine: (value: string) => console.log(`[${name}] ${value}`),
      show: () => console.log(`[${name}] Showing output channel`),
      clear: () => console.log(`[${name}] Clearing output channel`),
      dispose: () => console.log(`[${name}] Disposing output channel`)
    };
  },
  
  showErrorMessage: async (message: string, ...items: string[]): Promise<string | undefined> => {
    console.log(`ERROR: ${message}`);
    if (items.length > 0) {
      console.log(`Available actions: ${items.join(', ')}`);
    }
    return undefined;
  },
  
  showWarningMessage: async (message: string, ...items: string[]): Promise<string | undefined> => {
    console.log(`WARNING: ${message}`);
    if (items.length > 0) {
      console.log(`Available actions: ${items.join(', ')}`);
    }
    return undefined;
  },
  
  showInformationMessage: async (message: string, ...items: string[]): Promise<string | undefined> => {
    console.log(`INFO: ${message}`);
    if (items.length > 0) {
      console.log(`Available actions: ${items.join(', ')}`);
    }
    return undefined;
  },
  
  withProgress: async <R>(
    options: ProgressOptions,
    task: (progress: Progress<{ message?: string; increment?: number }>, token: CancellationToken) => Promise<R>
  ): Promise<R> => {
    console.log(`Starting progress: ${options.title}`);
    const mockProgress = {
      report: (value: { message?: string; increment?: number }) => {
        if (value.message) {
          console.log(`Progress: ${value.message}`);
        }
        if (value.increment) {
          console.log(`Progress increment: ${value.increment}%`);
        }
      }
    };
    const mockToken = {
      isCancellationRequested: false
    };
    return await task(mockProgress, mockToken);
  }
};

export const commands = {
  executeCommand: async (command: string, ...args: any[]): Promise<any> => {
    console.log(`Executing command: ${command}`, args);
    return undefined;
  }
};

export const workspace = {
  openTextDocument: async (options: { content: string; language: string }) => {
    console.log(`Opening text document with language: ${options.language}`);
    console.log(`Content preview: ${options.content.substring(0, 100)}...`);
    return {
      uri: { fsPath: '/mock/document.txt' }
    };
  }
};

export const Uri = {
  file: (path: string) => ({ fsPath: path })
};