function normalizeMarkdown(value = "") {
  return String(value || "").replace(/\r\n?/g, "\n");
}

function isFenceLine(line = "") {
  return /^```/.test(line.trim());
}

function isRuleLine(line = "") {
  return /^(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line.trim());
}

function getHeading(line = "") {
  const match = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
  if (!match) return null;
  return {
    level: match[1].length,
    value: match[2].trim(),
  };
}

function isQuoteLine(line = "") {
  return /^\s*>\s?/.test(line);
}

function getListMatch(line = "") {
  const trimmed = line.trimStart();
  const unordered = trimmed.match(/^[-+*]\s+(.+)$/);
  if (unordered) {
    return {
      ordered: false,
      value: unordered[1],
    };
  }

  const ordered = trimmed.match(/^\d+\.\s+(.+)$/);
  if (ordered) {
    return {
      ordered: true,
      value: ordered[1],
    };
  }

  return null;
}

function isBlockBoundary(line = "") {
  if (!line.trim()) return true;
  return (
    isFenceLine(line) ||
    isRuleLine(line) ||
    Boolean(getHeading(line)) ||
    isQuoteLine(line) ||
    Boolean(getListMatch(line))
  );
}

function externalLinkProps(url = "") {
  if (!/^https?:\/\//i.test(String(url || "").trim())) {
    return {};
  }
  return {
    target: "_blank",
    rel: "noreferrer",
  };
}

export function parseBlogMarkdown(content = "") {
  const lines = normalizeMarkdown(content).split("\n");
  const blocks = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] || "";

    if (!line.trim()) {
      index += 1;
      continue;
    }

    if (isFenceLine(line)) {
      const language = line.trim().slice(3).trim();
      const codeLines = [];
      index += 1;

      while (index < lines.length && !isFenceLine(lines[index] || "")) {
        codeLines.push(lines[index] || "");
        index += 1;
      }

      if (index < lines.length) index += 1;
      blocks.push({
        type: "code",
        language,
        value: codeLines.join("\n"),
      });
      continue;
    }

    if (isRuleLine(line)) {
      blocks.push({ type: "rule" });
      index += 1;
      continue;
    }

    const heading = getHeading(line);
    if (heading) {
      blocks.push({
        type: "heading",
        level: heading.level,
        value: heading.value,
      });
      index += 1;
      continue;
    }

    if (isQuoteLine(line)) {
      const quoteLines = [];
      while (index < lines.length && isQuoteLine(lines[index] || "")) {
        quoteLines.push((lines[index] || "").replace(/^\s*>\s?/, ""));
        index += 1;
      }
      blocks.push({
        type: "blockquote",
        blocks: parseBlogMarkdown(quoteLines.join("\n")),
      });
      continue;
    }

    const listMatch = getListMatch(line);
    if (listMatch) {
      const items = [];
      const ordered = listMatch.ordered;

      while (index < lines.length) {
        const item = getListMatch(lines[index] || "");
        if (!item || item.ordered !== ordered) break;

        const itemLines = [item.value];
        index += 1;

        while (
          index < lines.length &&
          (lines[index] || "").trim() &&
          !isBlockBoundary(lines[index] || "")
        ) {
          itemLines.push((lines[index] || "").trimEnd());
          index += 1;
        }

        items.push(itemLines.join("\n"));
      }

      blocks.push({
        type: ordered ? "ordered-list" : "unordered-list",
        items,
      });
      continue;
    }

    const paragraphLines = [line.trimEnd()];
    index += 1;

    while (
      index < lines.length &&
      (lines[index] || "").trim() &&
      !isBlockBoundary(lines[index] || "")
    ) {
      paragraphLines.push((lines[index] || "").trimEnd());
      index += 1;
    }

    blocks.push({
      type: "paragraph",
      value: paragraphLines.join("\n"),
    });
  }

  return blocks;
}

function renderInlineMarkdown(text = "", keyPrefix = "inline") {
  const inlineTokenPattern =
    /!\[([^\]\n]*)\]\(((?:https?:\/\/|\/)[^\s)]+)\)|\[([^\]\n]+)\]\(((?:https?:\/\/|\/)[^\s)]+)\)|`([^`\n]+)`|\*\*([^*\n]+)\*\*|__([^_\n]+)__|~~([^~\n]+)~~|\*([^*\n]+)\*|_([^_\n]+)_|(https?:\/\/[^\s<>"'`]+)|(\n)/g;
  const nodes = [];
  let cursor = 0;
  let localIndex = 0;
  let match = inlineTokenPattern.exec(text);

  while (match) {
    const start = match.index ?? 0;
    if (start > cursor) {
      nodes.push(
        <span key={`${keyPrefix}-plain-${localIndex}`}>
          {text.slice(cursor, start)}
        </span>,
      );
      localIndex += 1;
    }

    const imageAlt = match[1];
    const imageUrl = match[2];
    const linkLabel = match[3];
    const linkUrl = match[4];
    const inlineCode = match[5];
    const boldA = match[6];
    const boldB = match[7];
    const strike = match[8];
    const italicA = match[9];
    const italicB = match[10];
    const rawUrl = match[11];
    const lineBreak = match[12];
    const full = match[0] || "";

    if (imageUrl) {
      nodes.push(
        <img
          key={`${keyPrefix}-image-${localIndex}`}
          src={imageUrl}
          alt={imageAlt || ""}
          loading="lazy"
        />,
      );
    } else if (linkUrl) {
      nodes.push(
        <a
          key={`${keyPrefix}-link-${localIndex}`}
          href={linkUrl}
          {...externalLinkProps(linkUrl)}
        >
          {renderInlineMarkdown(
            linkLabel,
            `${keyPrefix}-link-label-${localIndex}`,
          )}
        </a>,
      );
    } else if (inlineCode) {
      nodes.push(
        <code key={`${keyPrefix}-code-${localIndex}`}>{inlineCode}</code>,
      );
    } else if (boldA || boldB) {
      const value = boldA || boldB;
      nodes.push(
        <strong key={`${keyPrefix}-bold-${localIndex}`}>
          {renderInlineMarkdown(value, `${keyPrefix}-bold-inner-${localIndex}`)}
        </strong>,
      );
    } else if (strike) {
      nodes.push(
        <s key={`${keyPrefix}-strike-${localIndex}`}>
          {renderInlineMarkdown(
            strike,
            `${keyPrefix}-strike-inner-${localIndex}`,
          )}
        </s>,
      );
    } else if (italicA || italicB) {
      const value = italicA || italicB;
      nodes.push(
        <em key={`${keyPrefix}-italic-${localIndex}`}>
          {renderInlineMarkdown(
            value,
            `${keyPrefix}-italic-inner-${localIndex}`,
          )}
        </em>,
      );
    } else if (rawUrl) {
      nodes.push(
        <a
          key={`${keyPrefix}-raw-link-${localIndex}`}
          href={rawUrl}
          {...externalLinkProps(rawUrl)}
        >
          {rawUrl}
        </a>,
      );
    } else if (lineBreak) {
      nodes.push(<br key={`${keyPrefix}-br-${localIndex}`} />);
    } else {
      nodes.push(<span key={`${keyPrefix}-raw-${localIndex}`}>{full}</span>);
    }

    cursor = start + full.length;
    localIndex += 1;
    match = inlineTokenPattern.exec(text);
  }

  if (cursor < text.length) {
    nodes.push(
      <span key={`${keyPrefix}-tail-${localIndex}`}>{text.slice(cursor)}</span>,
    );
  }

  return nodes;
}

function renderBlogBlock(block, keyPrefix) {
  if (!block) return null;

  if (block.type === "rule") {
    return <hr key={`${keyPrefix}-rule`} />;
  }

  if (block.type === "heading") {
    const HeadingTag = `h${Math.min(Math.max(block.level || 1, 1), 6)}`;
    return (
      <HeadingTag key={`${keyPrefix}-heading`}>
        {renderInlineMarkdown(block.value || "", `${keyPrefix}-heading-inline`)}
      </HeadingTag>
    );
  }

  if (block.type === "code") {
    return (
      <pre key={`${keyPrefix}-code`}>
        <code className={block.language ? `language-${block.language}` : undefined}>
          {block.value || ""}
        </code>
      </pre>
    );
  }

  if (block.type === "blockquote") {
    return (
      <blockquote key={`${keyPrefix}-quote`}>
        {(block.blocks || []).map((child, childIndex) =>
          renderBlogBlock(child, `${keyPrefix}-quote-${childIndex}`),
        )}
      </blockquote>
    );
  }

  if (block.type === "ordered-list" || block.type === "unordered-list") {
    const ListTag = block.type === "ordered-list" ? "ol" : "ul";
    return (
      <ListTag key={`${keyPrefix}-list`}>
        {(block.items || []).map((item, itemIndex) => (
          <li key={`${keyPrefix}-item-${itemIndex}`}>
            {renderInlineMarkdown(item || "", `${keyPrefix}-item-${itemIndex}`)}
          </li>
        ))}
      </ListTag>
    );
  }

  return (
    <p key={`${keyPrefix}-paragraph`}>
      {renderInlineMarkdown(block.value || "", `${keyPrefix}-paragraph-inline`)}
    </p>
  );
}

export function BlogMarkdown({
  content = "",
  className = "",
  emptyMessage = "",
}) {
  const blocks = parseBlogMarkdown(content);
  const classes = ["blog-markdown", className].filter(Boolean).join(" ");

  return (
    <div className={classes}>
      {blocks.length > 0 ? (
        blocks.map((block, index) => renderBlogBlock(block, `block-${index}`))
      ) : emptyMessage ? (
        <p>{emptyMessage}</p>
      ) : null}
    </div>
  );
}
