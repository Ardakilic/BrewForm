declare module 'mjml' {
  interface MjmlResult {
    html: string;
    errors: Array<{ message: string; type: string; lineNumber?: number }>;
  }

  interface MjmlOptions {
    filePath?: string;
    fonts?: Record<string, string>;
    keepComments?: boolean;
    juiceOptions?: Record<string, unknown>;
  }

  function mjml(mjmlString: string, options?: MjmlOptions): Promise<MjmlResult>;

  export default mjml;
}
