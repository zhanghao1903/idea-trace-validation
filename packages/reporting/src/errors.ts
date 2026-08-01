export class UnsafeMarkdownError extends Error {
  constructor(
    readonly code: string,
    readonly pathSuffix: string,
    message: string,
  ) {
    super(message);
    this.name = "UnsafeMarkdownError";
  }
}
