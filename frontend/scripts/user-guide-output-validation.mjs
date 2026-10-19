function attributeValues(html, attribute) {
  return [...html.matchAll(new RegExp(`${attribute}="([^"]+)"`, "g"))].map((match) => match[1]);
}

export function validateUserGuideHtml(html, assets) {
  const ids = new Set(attributeValues(html, "id"));
  for (const source of attributeValues(html, "src")) {
    if (!source.startsWith("assets/") || !assets.has(source)) {
      throw new Error(`HTML export references a missing guide asset: ${source}`);
    }
  }
  for (const href of attributeValues(html, "href")) {
    if (href.startsWith("#") && !ids.has(href.slice(1))) {
      throw new Error(`HTML export references a missing section: ${href}`);
    }
  }
}
