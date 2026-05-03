import { defineCollection, z } from 'astro:content';

const blog = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    summary: z.string(),
    category: z.enum(['nova-dev', 'market-notes', 'education', 'trade-reviews', 'announcements']),
    tags: z.array(z.string()).default([]),
    readMinutes: z.number().int().positive().default(5),
    draft: z.boolean().default(false),
    cover: z.string().optional(),
  }),
});

export const collections = { blog };
