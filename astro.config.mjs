import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: 'https://www.casemobiliusate.com',
  trailingSlash: 'never',
  output: 'static',
  build: {
    format: 'directory',
    inlineStylesheets: 'auto',
  },
  vite: {
    plugins: [tailwindcss()],
  },
  integrations: [
    mdx(),
    sitemap({
      changefreq: 'weekly',
      priority: 0.7,
      lastmod: new Date(),
      filter: (page) => !page.includes('/draft/') && !page.includes('/admin') && !page.includes('/grazie') && !page.includes('/404'),
      serialize(item) {
        const url = item.url;
        if (url === 'https://www.casemobiliusate.com/' || url === 'https://www.casemobiliusate.com') {
          item.priority = 1.0;
          item.changefreq = 'daily';
        } else if (url.match(/\.com\/(normativa|prezzi|marche|trasporto|vivere|dove-mettere|tipologie|guide-acquisto|mappa-campeggi|strumenti)$/)) {
          item.priority = 0.9;
          item.changefreq = 'weekly';
        } else if (url.includes('/normativa/regioni/')) {
          item.priority = 0.8;
          item.changefreq = 'monthly';
        } else if (url.includes('/marche/')) {
          item.priority = 0.7;
          item.changefreq = 'monthly';
        } else if (url.match(/(privacy|affiliate-disclaimer|chi-siamo|contatti|community)/)) {
          item.priority = 0.3;
          item.changefreq = 'yearly';
        } else {
          item.priority = 0.8;
          item.changefreq = 'monthly';
        }
        return item;
      },
    }),
  ],
  prefetch: {
    prefetchAll: true,
    defaultStrategy: 'viewport',
  },
});
