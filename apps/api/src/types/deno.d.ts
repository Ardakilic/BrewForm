/**
 * Minimal Deno ambient declarations for TypeScript LSP compatibility.
 * Deno provides these natively at runtime; this file enables IDE type checking.
 */

declare namespace Deno {
  interface ServeOptions {
    port?: number;
    hostname?: string;
    signal?: AbortSignal;
  }

  interface HttpServer<A extends NetAddr = NetAddr> {
    readonly finished: Promise<void>;
    readonly addr: A;
    shutdown(): Promise<void>;
    ref(): void;
    unref(): void;
  }

  interface NetAddr {
    transport: 'tcp' | 'udp';
    hostname: string;
    port: number;
  }

  function serve(
    options: ServeOptions,
    handler: (req: Request) => Response | Promise<Response>
  ): HttpServer;
  function serve(
    handler: (req: Request) => Response | Promise<Response>
  ): HttpServer;

  function exit(code?: number): never;

  type Signal =
    | 'SIGTERM'
    | 'SIGINT'
    | 'SIGKILL'
    | 'SIGHUP'
    | 'SIGQUIT'
    | 'SIGUSR1'
    | 'SIGUSR2';

  function addSignalListener(signal: Signal, handler: () => void): void;
  function removeSignalListener(signal: Signal, handler: () => void): void;
}
