declare module 'pino-pretty' {
  interface PrettyStream {
    write(chunk: string): void;
    end(): void;
  }
  interface PrettyOptions {
    colorize?: boolean;
    translateTime?: string;
    ignore?: string;
    levelFirst?: boolean;
  }
  export function build(options?: PrettyOptions): PrettyStream;
}