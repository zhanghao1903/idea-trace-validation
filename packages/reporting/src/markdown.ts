import { fromMarkdown } from "mdast-util-from-markdown";

import { UnsafeMarkdownError } from "./errors.js";
import type { SafeInlineToken, SafeMarkdownBlock } from "./types.js";

interface MdNode {
  type: string;
  value?: string;
  url?: string;
  ordered?: boolean | null;
  children?: MdNode[];
}

const MAX_MARKDOWN_NODES = 2_000;
const MAX_MARKDOWN_DEPTH = 8;

const validateHttpsUrl = (raw: string): string => {
  if (raw.length > 2_048) {
    throw new UnsafeMarkdownError(
      "MARKDOWN_URL_TOO_LONG",
      "",
      "Link URL exceeds 2048 characters.",
    );
  }
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new UnsafeMarkdownError(
      "MARKDOWN_URL_INVALID",
      "",
      "Link URL must be absolute HTTPS.",
    );
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username !== "" ||
    parsed.password !== ""
  ) {
    throw new UnsafeMarkdownError(
      "MARKDOWN_URL_UNSAFE",
      "",
      "Link URL must be HTTPS without userinfo.",
    );
  }
  return parsed.href;
};

const childNodes = (node: MdNode): MdNode[] => node.children ?? [];

const inlineTokens = (
  nodes: readonly MdNode[],
  depth: number,
  count: { value: number },
): SafeInlineToken[] =>
  nodes.map((node): SafeInlineToken => {
    count.value += 1;
    if (count.value > MAX_MARKDOWN_NODES || depth > MAX_MARKDOWN_DEPTH) {
      throw new UnsafeMarkdownError(
        "MARKDOWN_TOO_COMPLEX",
        "",
        "Markdown complexity limit exceeded.",
      );
    }
    switch (node.type) {
      case "text":
        return { type: "text", value: node.value ?? "" };
      case "strong":
        return {
          type: "strong",
          children: inlineTokens(childNodes(node), depth + 1, count),
        };
      case "emphasis":
        return {
          type: "emphasis",
          children: inlineTokens(childNodes(node), depth + 1, count),
        };
      case "inlineCode":
        return { type: "inline_code", value: node.value ?? "" };
      case "break":
        return { type: "break" };
      case "link":
        return {
          type: "link",
          href: validateHttpsUrl(node.url ?? ""),
          children: inlineTokens(childNodes(node), depth + 1, count),
        };
      default:
        throw new UnsafeMarkdownError(
          "MARKDOWN_NODE_FORBIDDEN",
          "",
          `Markdown node ${node.type} is not allowed.`,
        );
    }
  });

const blockTokens = (
  nodes: readonly MdNode[],
  depth: number,
  count: { value: number },
): SafeMarkdownBlock[] =>
  nodes.map((node): SafeMarkdownBlock => {
    count.value += 1;
    if (count.value > MAX_MARKDOWN_NODES || depth > MAX_MARKDOWN_DEPTH) {
      throw new UnsafeMarkdownError(
        "MARKDOWN_TOO_COMPLEX",
        "",
        "Markdown complexity limit exceeded.",
      );
    }
    if (node.type === "paragraph") {
      return {
        type: "paragraph",
        children: inlineTokens(childNodes(node), depth + 1, count),
      };
    }
    if (node.type === "list") {
      return {
        type: "list",
        ordered: node.ordered === true,
        items: childNodes(node).map((item) => {
          if (item.type !== "listItem") {
            throw new UnsafeMarkdownError(
              "MARKDOWN_NODE_FORBIDDEN",
              "",
              "Only list items may appear in a Markdown list.",
            );
          }
          return blockTokens(childNodes(item), depth + 1, count);
        }),
      };
    }
    throw new UnsafeMarkdownError(
      "MARKDOWN_NODE_FORBIDDEN",
      "",
      `Markdown node ${node.type} is not allowed.`,
    );
  });

export const compileSafeMarkdown = (
  markdown: string,
): readonly SafeMarkdownBlock[] => {
  if (/\{\{|\{%|<%|\$\{/u.test(markdown)) {
    throw new UnsafeMarkdownError(
      "MARKDOWN_TEMPLATE_FORBIDDEN",
      "",
      "Template expressions are not allowed.",
    );
  }
  const root = fromMarkdown(markdown) as MdNode;
  return blockTokens(childNodes(root), 0, { value: 1 });
};
