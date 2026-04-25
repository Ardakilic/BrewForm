declare module 'mjml' {
  interface MjmlResult {
    html: string;
    errors: Array<{ message: string; type: string; lineNumber?: number }>;
  }

  interface MjmlOptions {
    minify?: boolean;
    beautify?: boolean;
    filePath?: string;
  }

  function mjml(mjmlString: string, options?: MjmlOptions): MjmlResult;

  export default mjml;
}