declare module 'marked' {
  export interface MarkedOptions {
    breaks?: boolean;
    gfm?: boolean;
    sanitize?: boolean;
    smartLists?: boolean;
    smartypants?: boolean;
  }

  interface MarkedFunction {
    (src: string): string;
    setOptions(options: MarkedOptions): void;
  }

  export const marked: MarkedFunction;
}
