import type { FastifyPluginAsync } from 'fastify';
import { listSkills, toggleSkill, deleteSkill, saveSkillMd, installSkillZip } from '../skills/manager.js';
import { requireAdminHook } from '../auth.js';

export const skillsRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/skills
  fastify.get('/', async () => {
    return { skills: listSkills() };
  });

  // PATCH /api/skills/:id/toggle
  fastify.patch('/:id/toggle', { preHandler: requireAdminHook }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body as any) || {};
    const enabled = typeof body.enabled === 'boolean' ? body.enabled : true;
    toggleSkill(id, enabled);
    return { ok: true, skills: listSkills() };
  });

  // DELETE /api/skills/:id
  fastify.delete('/:id', { preHandler: requireAdminHook }, async (req, reply) => {
    const { id } = req.params as { id: string };
    deleteSkill(id);
    return { ok: true, skills: listSkills() };
  });

  // POST /api/skills/upload
  fastify.post('/upload', { preHandler: requireAdminHook }, async (req, reply) => {
    // If multipart
    if (req.isMultipart()) {
      const part = await req.file();
      if (!part) {
        return reply.status(400).send({ error: 'No file uploaded' });
      }

      const filename = part.filename || 'skill.md';
      const buffer = await part.toBuffer();

      if (filename.toLowerCase().endsWith('.zip')) {
        const installed = await installSkillZip(buffer, filename);
        return { ok: true, skill: installed, skills: listSkills() };
      } else if (filename.toLowerCase().endsWith('.md')) {
        const text = buffer.toString('utf8');
        const id = filename.replace(/\.md$/i, '');
        const saved = saveSkillMd(id, text);
        return { ok: true, skill: saved, skills: listSkills() };
      } else {
        return reply.status(400).send({ error: 'Only .md or .zip files are supported' });
      }
    }

    // If JSON
    const body = (req.body as any) || {};
    if (body.id && typeof body.content === 'string') {
      const saved = saveSkillMd(body.id, body.content);
      return { ok: true, skill: saved, skills: listSkills() };
    }

    return reply.status(400).send({ error: 'Invalid payload. Provide a file (.md or .zip) or JSON { id, content }' });
  });
};
