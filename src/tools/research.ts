/**
 * Research Tools - Web scraping, markdown conversion, and content research
 * Provides tools for gathering and processing web content
 */

import type { Tool } from './index.js';
import { promises as fs } from 'fs';
import path from 'path';
import dns from 'dns';
import { promisify } from 'util';

// Lazy load dependencies
let cheerio: typeof import('cheerio') | null = null;
let puppeteer: typeof import('puppeteer') | null = null;
let marked: typeof import('marked') | null = null;
let TurndownService: typeof import('turndown') | null = null;

async function getCheerio() {
  if (!cheerio) {
    cheerio = await import('cheerio');
  }
  return cheerio;
}

async function getPuppeteer() {
  if (!puppeteer) {
    puppeteer = await import('puppeteer');
  }
  return puppeteer;
}

async function getMarked() {
  if (!marked) {
    marked = await import('marked');
  }
  return marked;
}

async function getTurndown() {
  if (!TurndownService) {
    const mod = await import('turndown');
    TurndownService = mod.default;
  }
  return TurndownService;
}

const dnsResolve = promisify(dns.resolve);
const dnsResolve4 = promisify(dns.resolve4);
const dnsResolve6 = promisify(dns.resolve6);
const dnsResolveMx = promisify(dns.resolveMx);
const dnsResolveTxt = promisify(dns.resolveTxt);
const dnsResolveNs = promisify(dns.resolveNs);
const dnsResolveCname = promisify(dns.resolveCname);

export const researchTools: Tool[] = [
  {
    name: 'web_scrape',
    description: 'Scrape webpage content and extract elements using CSS selectors',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'URL to scrape',
        },
        selectors: {
          type: 'object',
          additionalProperties: { type: 'string' },
          description: 'Named CSS selectors to extract (e.g., {"title": "h1", "links": "a"})',
        },
        extract: {
          type: 'string',
          enum: ['text', 'html', 'attr'],
          description: 'What to extract from elements. Default: text',
        },
        attribute: {
          type: 'string',
          description: 'Attribute name when extract is "attr" (e.g., "href")',
        },
        waitFor: {
          type: 'string',
          description: 'CSS selector to wait for before scraping (for dynamic pages)',
        },
        timeout: {
          type: 'number',
          description: 'Timeout in milliseconds. Default: 30000',
        },
        useBrowser: {
          type: 'boolean',
          description: 'Use headless browser for JavaScript-rendered pages. Default: false',
        },
      },
      required: ['url'],
    },
    handler: async ({ url, selectors, extract = 'text', attribute, waitFor, timeout = 30000, useBrowser = false }) => {
      try {
        let html: string;

        if (useBrowser) {
          // Use Puppeteer for JavaScript-rendered content
          const pptr = await getPuppeteer();
          const browser = await pptr.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
          });

          try {
            const page = await browser.newPage();
            await page.goto(url, { timeout, waitUntil: 'networkidle2' });

            if (waitFor) {
              await page.waitForSelector(waitFor, { timeout });
            }

            html = await page.content();
          } finally {
            await browser.close();
          }
        } else {
          // Simple fetch for static pages
          const response = await fetch(url, {
            signal: AbortSignal.timeout(timeout),
            headers: {
              'User-Agent': 'Mozilla/5.0 (compatible; ABOV3-Eden/1.0)',
            },
          });

          if (!response.ok) {
            return { error: `HTTP ${response.status}: ${response.statusText}` };
          }

          html = await response.text();
        }

        const ch = await getCheerio();
        const $ = ch.load(html);

        // If no selectors, return basic page info
        if (!selectors || Object.keys(selectors).length === 0) {
          return {
            success: true,
            title: $('title').text(),
            description: $('meta[name="description"]').attr('content') || '',
            bodyText: $('body').text().slice(0, 5000),
            links: $('a[href]').map((_, el) => ({
              text: $(el).text().trim(),
              href: $(el).attr('href'),
            })).get().slice(0, 50),
          };
        }

        // Extract selected elements
        const results: Record<string, any> = {};

        for (const [name, selector] of Object.entries(selectors)) {
          const elements = $(selector as string);

          results[name] = elements.map((_, el) => {
            switch (extract) {
              case 'html':
                return $(el).html();
              case 'attr':
                return attribute ? $(el).attr(attribute) : null;
              case 'text':
              default:
                return $(el).text().trim();
            }
          }).get();

          // If single element, unwrap array
          if (results[name].length === 1) {
            results[name] = results[name][0];
          }
        }

        return {
          success: true,
          url,
          results,
        };
      } catch (error) {
        return { error: `Failed to scrape: ${error instanceof Error ? error.message : String(error)}` };
      }
    },
  },

  {
    name: 'web_screenshot',
    description: 'Capture a screenshot of a webpage',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'URL to screenshot',
        },
        output: {
          type: 'string',
          description: 'Output file path for the screenshot',
        },
        width: {
          type: 'number',
          description: 'Viewport width. Default: 1280',
        },
        height: {
          type: 'number',
          description: 'Viewport height. Default: 800',
        },
        fullPage: {
          type: 'boolean',
          description: 'Capture full page scroll. Default: false',
        },
        waitFor: {
          type: 'string',
          description: 'CSS selector to wait for before screenshot',
        },
        delay: {
          type: 'number',
          description: 'Delay in ms after page load. Default: 0',
        },
      },
      required: ['url', 'output'],
    },
    handler: async ({ url, output, width = 1280, height = 800, fullPage = false, waitFor, delay = 0 }) => {
      try {
        const pptr = await getPuppeteer();
        const outputPath = path.resolve(output);

        await fs.mkdir(path.dirname(outputPath), { recursive: true });

        const browser = await pptr.launch({
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });

        try {
          const page = await browser.newPage();
          await page.setViewport({ width, height });
          await page.goto(url, { waitUntil: 'networkidle2' });

          if (waitFor) {
            await page.waitForSelector(waitFor);
          }

          if (delay > 0) {
            await new Promise(r => setTimeout(r, delay));
          }

          await page.screenshot({
            path: outputPath,
            fullPage,
            type: outputPath.endsWith('.png') ? 'png' : 'jpeg',
          });

          return {
            success: true,
            output: outputPath,
            url,
            dimensions: fullPage ? 'full page' : `${width}x${height}`,
          };
        } finally {
          await browser.close();
        }
      } catch (error) {
        return { error: `Failed to screenshot: ${error instanceof Error ? error.message : String(error)}` };
      }
    },
  },

  {
    name: 'html_to_markdown',
    description: 'Convert HTML content to Markdown',
    inputSchema: {
      type: 'object',
      properties: {
        html: {
          type: 'string',
          description: 'HTML content or file path',
        },
        isFile: {
          type: 'boolean',
          description: 'Whether html is a file path. Default: false',
        },
        output: {
          type: 'string',
          description: 'Output file path. If not provided, returns markdown string',
        },
        headingStyle: {
          type: 'string',
          enum: ['setext', 'atx'],
          description: 'Heading style. Default: atx',
        },
        codeBlockStyle: {
          type: 'string',
          enum: ['indented', 'fenced'],
          description: 'Code block style. Default: fenced',
        },
      },
      required: ['html'],
    },
    handler: async ({ html, isFile = false, output, headingStyle = 'atx', codeBlockStyle = 'fenced' }) => {
      try {
        const Turndown = await getTurndown();

        let htmlContent = html;
        if (isFile) {
          const filePath = path.resolve(html);
          htmlContent = await fs.readFile(filePath, 'utf-8');
        }

        const turndown = new Turndown({
          headingStyle: headingStyle as 'setext' | 'atx',
          codeBlockStyle: codeBlockStyle as 'indented' | 'fenced',
        });

        const markdown = turndown.turndown(htmlContent);

        if (output) {
          const outputPath = path.resolve(output);
          await fs.mkdir(path.dirname(outputPath), { recursive: true });
          await fs.writeFile(outputPath, markdown);
          return {
            success: true,
            output: outputPath,
            length: markdown.length,
          };
        }

        return {
          success: true,
          markdown,
          length: markdown.length,
        };
      } catch (error) {
        return { error: `Failed to convert HTML to Markdown: ${error instanceof Error ? error.message : String(error)}` };
      }
    },
  },

  {
    name: 'markdown_to_html',
    description: 'Convert Markdown content to HTML',
    inputSchema: {
      type: 'object',
      properties: {
        markdown: {
          type: 'string',
          description: 'Markdown content or file path',
        },
        isFile: {
          type: 'boolean',
          description: 'Whether markdown is a file path. Default: false',
        },
        output: {
          type: 'string',
          description: 'Output file path. If not provided, returns HTML string',
        },
        wrapBody: {
          type: 'boolean',
          description: 'Wrap output in HTML document structure. Default: false',
        },
        gfm: {
          type: 'boolean',
          description: 'Enable GitHub Flavored Markdown. Default: true',
        },
      },
      required: ['markdown'],
    },
    handler: async ({ markdown, isFile = false, output, wrapBody = false, gfm = true }) => {
      try {
        const md = await getMarked();

        let markdownContent = markdown;
        if (isFile) {
          const filePath = path.resolve(markdown);
          markdownContent = await fs.readFile(filePath, 'utf-8');
        }

        md.setOptions({ gfm });
        let html = await md.parse(markdownContent);

        if (wrapBody) {
          html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
    pre { background: #f4f4f4; padding: 10px; overflow-x: auto; }
    code { background: #f4f4f4; padding: 2px 4px; }
    blockquote { border-left: 4px solid #ccc; margin: 0; padding-left: 16px; color: #666; }
  </style>
</head>
<body>
${html}
</body>
</html>`;
        }

        if (output) {
          const outputPath = path.resolve(output);
          await fs.mkdir(path.dirname(outputPath), { recursive: true });
          await fs.writeFile(outputPath, html);
          return {
            success: true,
            output: outputPath,
            length: html.length,
          };
        }

        return {
          success: true,
          html,
          length: html.length,
        };
      } catch (error) {
        return { error: `Failed to convert Markdown to HTML: ${error instanceof Error ? error.message : String(error)}` };
      }
    },
  },

  {
    name: 'url_info',
    description: 'Get information about a URL including redirects, headers, and status',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'URL to analyze',
        },
        followRedirects: {
          type: 'boolean',
          description: 'Follow redirects. Default: true',
        },
        timeout: {
          type: 'number',
          description: 'Timeout in milliseconds. Default: 10000',
        },
      },
      required: ['url'],
    },
    handler: async ({ url, followRedirects = true, timeout = 10000 }) => {
      try {
        const redirects: string[] = [];
        let currentUrl = url;
        let response: Response | null = null;

        // Follow redirects manually to track chain
        for (let i = 0; i < 10; i++) {
          response = await fetch(currentUrl, {
            method: 'HEAD',
            redirect: 'manual',
            signal: AbortSignal.timeout(timeout),
          });

          if (!followRedirects) break;

          if (response.status >= 300 && response.status < 400) {
            const location = response.headers.get('location');
            if (location) {
              redirects.push(currentUrl);
              currentUrl = new URL(location, currentUrl).href;
              continue;
            }
          }
          break;
        }

        const headers: Record<string, string> = {};
        response?.headers.forEach((value, key) => {
          headers[key] = value;
        });

        // Parse URL
        const parsed = new URL(currentUrl);

        return {
          success: true,
          originalUrl: url,
          finalUrl: currentUrl,
          redirects,
          status: response?.status,
          statusText: response?.statusText,
          headers,
          urlParts: {
            protocol: parsed.protocol,
            host: parsed.host,
            hostname: parsed.hostname,
            port: parsed.port || null,
            pathname: parsed.pathname,
            search: parsed.search || null,
            hash: parsed.hash || null,
          },
        };
      } catch (error) {
        return { error: `Failed to get URL info: ${error instanceof Error ? error.message : String(error)}` };
      }
    },
  },

  {
    name: 'dns_lookup',
    description: 'Perform DNS lookup for a domain',
    inputSchema: {
      type: 'object',
      properties: {
        domain: {
          type: 'string',
          description: 'Domain name to lookup',
        },
        recordTypes: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['A', 'AAAA', 'MX', 'TXT', 'NS', 'CNAME', 'ALL'],
          },
          description: 'Record types to query. Default: ["A", "AAAA"]',
        },
      },
      required: ['domain'],
    },
    handler: async ({ domain, recordTypes = ['A', 'AAAA'] }) => {
      try {
        const results: Record<string, any> = {};
        const types = recordTypes.includes('ALL')
          ? ['A', 'AAAA', 'MX', 'TXT', 'NS', 'CNAME']
          : recordTypes;

        for (const type of types) {
          try {
            switch (type) {
              case 'A':
                results.A = await dnsResolve4(domain);
                break;
              case 'AAAA':
                results.AAAA = await dnsResolve6(domain);
                break;
              case 'MX':
                results.MX = await dnsResolveMx(domain);
                break;
              case 'TXT':
                results.TXT = await dnsResolveTxt(domain);
                break;
              case 'NS':
                results.NS = await dnsResolveNs(domain);
                break;
              case 'CNAME':
                results.CNAME = await dnsResolveCname(domain);
                break;
            }
          } catch (err: any) {
            if (err.code !== 'ENODATA' && err.code !== 'ENOTFOUND') {
              results[type] = { error: err.message };
            }
          }
        }

        return {
          success: true,
          domain,
          records: results,
        };
      } catch (error) {
        return { error: `Failed to perform DNS lookup: ${error instanceof Error ? error.message : String(error)}` };
      }
    },
  },

  {
    name: 'rss_parse',
    description: 'Parse RSS or Atom feed from URL or content',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'URL of the RSS/Atom feed',
        },
        content: {
          type: 'string',
          description: 'Raw feed content (alternative to URL)',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of items to return. Default: 20',
        },
      },
      required: [],
    },
    handler: async ({ url, content, limit = 20 }) => {
      try {
        const ch = await getCheerio();

        let feedContent = content;
        if (url && !content) {
          const response = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ABOV3-Eden/1.0)' },
          });
          if (!response.ok) {
            return { error: `HTTP ${response.status}: ${response.statusText}` };
          }
          feedContent = await response.text();
        }

        if (!feedContent) {
          return { error: 'Either url or content is required' };
        }

        const $ = ch.load(feedContent, { xmlMode: true });

        // Detect feed type (RSS vs Atom)
        const isAtom = $('feed').length > 0;

        let feed: {
          title: string;
          description: string;
          link: string;
          items: any[];
        };

        if (isAtom) {
          // Parse Atom feed
          feed = {
            title: $('feed > title').first().text(),
            description: $('feed > subtitle').first().text(),
            link: $('feed > link[rel="alternate"]').attr('href') || $('feed > link').attr('href') || '',
            items: $('entry').slice(0, limit).map((_, el) => ({
              title: $(el).find('title').first().text(),
              link: $(el).find('link[rel="alternate"]').attr('href') || $(el).find('link').attr('href'),
              description: $(el).find('summary').text() || $(el).find('content').text(),
              pubDate: $(el).find('published').text() || $(el).find('updated').text(),
              author: $(el).find('author > name').text(),
              id: $(el).find('id').text(),
            })).get(),
          };
        } else {
          // Parse RSS feed
          feed = {
            title: $('channel > title').first().text(),
            description: $('channel > description').first().text(),
            link: $('channel > link').first().text(),
            items: $('item').slice(0, limit).map((_, el) => ({
              title: $(el).find('title').first().text(),
              link: $(el).find('link').first().text(),
              description: $(el).find('description').text(),
              pubDate: $(el).find('pubDate').text(),
              author: $(el).find('author').text() || $(el).find('dc\\:creator').text(),
              guid: $(el).find('guid').text(),
              categories: $(el).find('category').map((_, cat) => $(cat).text()).get(),
            })).get(),
          };
        }

        return {
          success: true,
          feedType: isAtom ? 'atom' : 'rss',
          feed,
          itemCount: feed.items.length,
        };
      } catch (error) {
        return { error: `Failed to parse feed: ${error instanceof Error ? error.message : String(error)}` };
      }
    },
  },

  {
    name: 'sitemap_parse',
    description: 'Parse XML sitemap from URL or content',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'URL of the sitemap',
        },
        content: {
          type: 'string',
          description: 'Raw sitemap XML content (alternative to URL)',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of URLs to return. Default: 100',
        },
      },
      required: [],
    },
    handler: async ({ url, content, limit = 100 }) => {
      try {
        const ch = await getCheerio();

        let sitemapContent = content;
        if (url && !content) {
          const response = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ABOV3-Eden/1.0)' },
          });
          if (!response.ok) {
            return { error: `HTTP ${response.status}: ${response.statusText}` };
          }
          sitemapContent = await response.text();
        }

        if (!sitemapContent) {
          return { error: 'Either url or content is required' };
        }

        const $ = ch.load(sitemapContent, { xmlMode: true });

        // Check if sitemap index
        const isSitemapIndex = $('sitemapindex').length > 0;

        if (isSitemapIndex) {
          const sitemaps = $('sitemap').slice(0, limit).map((_, el) => ({
            loc: $(el).find('loc').text(),
            lastmod: $(el).find('lastmod').text() || null,
          })).get();

          return {
            success: true,
            type: 'sitemapindex',
            sitemaps,
            count: sitemaps.length,
          };
        }

        // Regular sitemap
        const urls = $('url').slice(0, limit).map((_, el) => ({
          loc: $(el).find('loc').text(),
          lastmod: $(el).find('lastmod').text() || null,
          changefreq: $(el).find('changefreq').text() || null,
          priority: $(el).find('priority').text() || null,
        })).get();

        return {
          success: true,
          type: 'sitemap',
          urls,
          count: urls.length,
        };
      } catch (error) {
        return { error: `Failed to parse sitemap: ${error instanceof Error ? error.message : String(error)}` };
      }
    },
  },

  {
    name: 'extract_links',
    description: 'Extract all links from a webpage with optional filtering',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'URL to extract links from',
        },
        html: {
          type: 'string',
          description: 'HTML content (alternative to URL)',
        },
        filter: {
          type: 'object',
          properties: {
            sameDomain: { type: 'boolean', description: 'Only same-domain links' },
            external: { type: 'boolean', description: 'Only external links' },
            pattern: { type: 'string', description: 'URL regex pattern filter' },
            extension: { type: 'string', description: 'File extension filter (e.g., "pdf")' },
          },
          description: 'Filter options for links',
        },
        includeText: {
          type: 'boolean',
          description: 'Include link text in results. Default: true',
        },
      },
      required: [],
    },
    handler: async ({ url, html, filter, includeText = true }) => {
      try {
        const ch = await getCheerio();

        let htmlContent = html;
        let baseUrl = url;

        if (url && !html) {
          const response = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ABOV3-Eden/1.0)' },
          });
          if (!response.ok) {
            return { error: `HTTP ${response.status}: ${response.statusText}` };
          }
          htmlContent = await response.text();
          baseUrl = response.url; // Account for redirects
        }

        if (!htmlContent) {
          return { error: 'Either url or html content is required' };
        }

        const $ = ch.load(htmlContent);
        const baseDomain = baseUrl ? new URL(baseUrl).hostname : null;

        let links = $('a[href]').map((_, el) => {
          const href = $(el).attr('href');
          if (!href) return null;

          try {
            const fullUrl = baseUrl ? new URL(href, baseUrl).href : href;
            return {
              url: fullUrl,
              text: includeText ? $(el).text().trim() : undefined,
              title: $(el).attr('title') || undefined,
            };
          } catch {
            return null;
          }
        }).get().filter(Boolean);

        // Apply filters
        if (filter) {
          if (filter.sameDomain && baseDomain) {
            links = links.filter((l: any) => {
              try {
                return new URL(l.url).hostname === baseDomain;
              } catch {
                return false;
              }
            });
          }

          if (filter.external && baseDomain) {
            links = links.filter((l: any) => {
              try {
                return new URL(l.url).hostname !== baseDomain;
              } catch {
                return false;
              }
            });
          }

          if (filter.pattern) {
            const regex = new RegExp(filter.pattern);
            links = links.filter((l: any) => regex.test(l.url));
          }

          if (filter.extension) {
            const ext = filter.extension.toLowerCase();
            links = links.filter((l: any) => l.url.toLowerCase().endsWith(`.${ext}`));
          }
        }

        // Remove duplicates
        const seen = new Set();
        links = links.filter((l: any) => {
          if (seen.has(l.url)) return false;
          seen.add(l.url);
          return true;
        });

        return {
          success: true,
          links,
          count: links.length,
          baseUrl,
        };
      } catch (error) {
        return { error: `Failed to extract links: ${error instanceof Error ? error.message : String(error)}` };
      }
    },
  },

  {
    name: 'extract_metadata',
    description: 'Extract metadata (Open Graph, Twitter Cards, JSON-LD) from a webpage',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'URL to extract metadata from',
        },
        html: {
          type: 'string',
          description: 'HTML content (alternative to URL)',
        },
      },
      required: [],
    },
    handler: async ({ url, html }) => {
      try {
        const ch = await getCheerio();

        let htmlContent = html;
        if (url && !html) {
          const response = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ABOV3-Eden/1.0)' },
          });
          if (!response.ok) {
            return { error: `HTTP ${response.status}: ${response.statusText}` };
          }
          htmlContent = await response.text();
        }

        if (!htmlContent) {
          return { error: 'Either url or html content is required' };
        }

        const $ = ch.load(htmlContent);

        // Basic metadata
        const basic = {
          title: $('title').text(),
          description: $('meta[name="description"]').attr('content'),
          keywords: $('meta[name="keywords"]').attr('content'),
          author: $('meta[name="author"]').attr('content'),
          canonical: $('link[rel="canonical"]').attr('href'),
        };

        // Open Graph
        const og: Record<string, string> = {};
        $('meta[property^="og:"]').each((_, el) => {
          const property = $(el).attr('property')?.replace('og:', '');
          const content = $(el).attr('content');
          if (property && content) og[property] = content;
        });

        // Twitter Cards
        const twitter: Record<string, string> = {};
        $('meta[name^="twitter:"]').each((_, el) => {
          const name = $(el).attr('name')?.replace('twitter:', '');
          const content = $(el).attr('content');
          if (name && content) twitter[name] = content;
        });

        // JSON-LD structured data
        const jsonLd: any[] = [];
        $('script[type="application/ld+json"]').each((_, el) => {
          try {
            const data = JSON.parse($(el).html() || '');
            jsonLd.push(data);
          } catch {
            // Invalid JSON-LD
          }
        });

        // Favicons
        const favicons = $('link[rel*="icon"]').map((_, el) => ({
          rel: $(el).attr('rel'),
          href: $(el).attr('href'),
          type: $(el).attr('type'),
          sizes: $(el).attr('sizes'),
        })).get();

        return {
          success: true,
          url,
          basic,
          openGraph: Object.keys(og).length > 0 ? og : null,
          twitter: Object.keys(twitter).length > 0 ? twitter : null,
          jsonLd: jsonLd.length > 0 ? jsonLd : null,
          favicons: favicons.length > 0 ? favicons : null,
        };
      } catch (error) {
        return { error: `Failed to extract metadata: ${error instanceof Error ? error.message : String(error)}` };
      }
    },
  },
];
