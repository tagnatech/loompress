type BrandLinkTag = {
  rel: string;
  href: string;
  sizes?: string;
  type?: string;
};

type BrandMetaTag = {
  content: string;
  name: string;
};

const DEFAULT_BRAND_LINKS: BrandLinkTag[] = [
  { rel: 'apple-touch-icon', sizes: '57x57', href: '/apple-icon-57x57.png' },
  { rel: 'apple-touch-icon', sizes: '60x60', href: '/apple-icon-60x60.png' },
  { rel: 'apple-touch-icon', sizes: '72x72', href: '/apple-icon-72x72.png' },
  { rel: 'apple-touch-icon', sizes: '76x76', href: '/apple-icon-76x76.png' },
  { rel: 'apple-touch-icon', sizes: '114x114', href: '/apple-icon-114x114.png' },
  { rel: 'apple-touch-icon', sizes: '120x120', href: '/apple-icon-120x120.png' },
  { rel: 'apple-touch-icon', sizes: '144x144', href: '/apple-icon-144x144.png' },
  { rel: 'apple-touch-icon', sizes: '152x152', href: '/apple-icon-152x152.png' },
  { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-icon-180x180.png' },
  { rel: 'icon', type: 'image/png', sizes: '192x192', href: '/android-icon-192x192.png' },
  { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-32x32.png' },
  { rel: 'icon', type: 'image/png', sizes: '96x96', href: '/favicon-96x96.png' },
  { rel: 'icon', type: 'image/png', sizes: '16x16', href: '/favicon-16x16.png' },
  { rel: 'shortcut icon', href: '/favicon.ico' },
  { rel: 'manifest', href: '/manifest.json' },
];

const DEFAULT_BRAND_META: BrandMetaTag[] = [
  { name: 'msapplication-TileColor', content: '#ffffff' },
  { name: 'msapplication-TileImage', content: '/ms-icon-144x144.png' },
  { name: 'msapplication-config', content: '/browserconfig.xml' },
  { name: 'theme-color', content: '#ffffff' },
];

function escapeAttribute(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function renderLinkTag(tag: BrandLinkTag): string {
  const attributes = [
    ['rel', tag.rel],
    ['type', tag.type],
    ['sizes', tag.sizes],
    ['href', tag.href],
  ]
    .filter(([, value]) => typeof value === 'string' && value.length > 0)
    .map(([key, value]) => `${key}="${escapeAttribute(value as string)}"`);

  return `<link ${attributes.join(' ')}>`;
}

function renderMetaTag(tag: BrandMetaTag): string {
  return `<meta name="${escapeAttribute(tag.name)}" content="${escapeAttribute(tag.content)}">`;
}

export function getBrandHeadHtml(logoUrl: string | null | undefined): string {
  const normalized = logoUrl?.trim();
  if (normalized) {
    const escapedUrl = escapeAttribute(normalized);
    return [
      `<link rel="icon" href="${escapedUrl}">`,
      `<link rel="apple-touch-icon" href="${escapedUrl}">`,
      '<meta name="theme-color" content="#ffffff">',
    ].join('\n');
  }

  return [
    ...DEFAULT_BRAND_LINKS.map(renderLinkTag),
    ...DEFAULT_BRAND_META.map(renderMetaTag),
  ].join('\n');
}
