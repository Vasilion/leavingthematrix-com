// @ts-check
import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import sitemap from '@astrojs/sitemap';
import svelte from '@astrojs/svelte';
import mdx from '@astrojs/mdx';

// https://astro.build/config
export default defineConfig({
  site: 'https://leavingthematrix.io',
  integrations: [
    tailwind({ applyBaseStyles: false }),
    sitemap(),
    svelte(),
    mdx(),
  ],
});
