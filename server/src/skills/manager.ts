import fs from 'node:fs';
import path from 'node:path';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { PROJECT_ROOT, loadConfig, saveConfig } from '../config.js';

const execAsync = promisify(exec);

export interface SkillInfo {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  content: string;
  filename: string;
  isFolder: boolean;
}

const SKILLS_DIR = path.join(PROJECT_ROOT, 'skills');

function ensureSkillsDir() {
  if (!fs.existsSync(SKILLS_DIR)) {
    fs.mkdirSync(SKILLS_DIR, { recursive: true });
  }
}

function parseSkillContent(raw: string, fallbackId: string): { name: string; description: string; body: string } {
  let name = fallbackId;
  let description = 'Custom skill';
  let body = raw;

  // Check YAML frontmatter: --- ... ---
  const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (fmMatch) {
    const yaml = fmMatch[1];
    body = fmMatch[2].trim();

    const nameMatch = yaml.match(/^name:\s*(.+)$/m);
    if (nameMatch) name = nameMatch[1].trim().replace(/^['"]|['"]$/g, '');

    const descMatch = yaml.match(/^description:\s*(.+)$/m);
    if (descMatch) description = descMatch[1].trim().replace(/^['"]|['"]$/g, '');
  } else {
    // Check first Markdown heading
    const h1Match = raw.match(/^#\s+(.+)$/m);
    if (h1Match) {
      name = h1Match[1].trim();
    }
    // Check first non-heading paragraph for description
    const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
    if (lines.length > 0) {
      description = lines[0].slice(0, 160);
    }
  }

  return { name, description, body };
}

export function listSkills(): SkillInfo[] {
  ensureSkillsDir();
  const { config } = loadConfig();
  const disabled = new Set(config.disabledSkills || []);
  const entries = fs.readdirSync(SKILLS_DIR, { withFileTypes: true });
  const skills: SkillInfo[] = [];

  for (const entry of entries) {
    const fullPath = path.join(SKILLS_DIR, entry.name);
    if (entry.isFile() && entry.name.endsWith('.md')) {
      const id = path.basename(entry.name, '.md');
      try {
        const raw = fs.readFileSync(fullPath, 'utf8');
        const parsed = parseSkillContent(raw, id);
        skills.push({
          id,
          name: parsed.name,
          description: parsed.description,
          content: parsed.body,
          filename: entry.name,
          isFolder: false,
          enabled: !disabled.has(id),
        });
      } catch (err) {
        console.warn(`[Skills] Failed to read ${entry.name}:`, err);
      }
    } else if (entry.isDirectory()) {
      const id = entry.name;
      // Search for SKILL.md or any .md inside folder
      try {
        const subFiles = fs.readdirSync(fullPath);
        const mdFile = subFiles.find((f) => f.toLowerCase() === 'skill.md') || subFiles.find((f) => f.endsWith('.md'));
        if (mdFile) {
          const raw = fs.readFileSync(path.join(fullPath, mdFile), 'utf8');
          const parsed = parseSkillContent(raw, id);
          skills.push({
            id,
            name: parsed.name,
            description: parsed.description,
            content: parsed.body,
            filename: mdFile,
            isFolder: true,
            enabled: !disabled.has(id),
          });
        }
      } catch (err) {
        console.warn(`[Skills] Failed to read folder ${entry.name}:`, err);
      }
    }
  }

  return skills.sort((a, b) => a.name.localeCompare(b.name));
}

export function toggleSkill(id: string, enabled: boolean): void {
  const { config } = loadConfig();
  const current = new Set(config.disabledSkills || []);
  if (enabled) {
    current.delete(id);
  } else {
    current.add(id);
  }
  config.disabledSkills = Array.from(current);
  saveConfig(config);
}

export function deleteSkill(id: string): void {
  ensureSkillsDir();
  const safeId = id.toLowerCase().replace(/[^a-z0-9_-]/g, '-').replace(/^-+|-+$/g, '');
  if (!safeId) return;

  const realSkillsDir = fs.realpathSync(SKILLS_DIR);
  const mdPath = path.resolve(realSkillsDir, `${safeId}.md`);
  const folderPath = path.resolve(realSkillsDir, safeId);

  // Safety containment check
  if (!mdPath.startsWith(realSkillsDir) || !folderPath.startsWith(realSkillsDir)) {
    return;
  }

  if (fs.existsSync(mdPath)) {
    fs.unlinkSync(mdPath);
  } else if (fs.existsSync(folderPath)) {
    fs.rmSync(folderPath, { recursive: true, force: true });
  }

  // Remove from disabled list if present
  toggleSkill(safeId, true);
}

export function saveSkillMd(id: string, content: string): SkillInfo {
  ensureSkillsDir();
  const safeId = id.toLowerCase().replace(/[^a-z0-9_-]/g, '-').replace(/^-+|-+$/g, '') || `skill-${Date.now()}`;
  const filePath = path.join(SKILLS_DIR, `${safeId}.md`);
  fs.writeFileSync(filePath, content, 'utf8');

  const parsed = parseSkillContent(content, safeId);
  return {
    id: safeId,
    name: parsed.name,
    description: parsed.description,
    content: parsed.body,
    filename: `${safeId}.md`,
    isFolder: false,
    enabled: true,
  };
}

export async function installSkillZip(buffer: Buffer, originalFilename: string): Promise<SkillInfo> {
  ensureSkillsDir();
  const baseName = path.basename(originalFilename, path.extname(originalFilename));
  const safeId = baseName.toLowerCase().replace(/[^a-z0-9_-]/g, '-').replace(/^-+|-+$/g, '') || `skill-${Date.now()}`;
  const targetDir = path.join(SKILLS_DIR, safeId);

  if (fs.existsSync(targetDir)) {
    fs.rmSync(targetDir, { recursive: true, force: true });
  }
  fs.mkdirSync(targetDir, { recursive: true });

  const tempZipPath = path.join(SKILLS_DIR, `temp_${Date.now()}_${safeId}.zip`);
  fs.writeFileSync(tempZipPath, buffer);

  try {
    // Use native Windows tar or PowerShell Expand-Archive
    if (process.platform === 'win32') {
      try {
        await execAsync(`tar -xf "${tempZipPath}" -C "${targetDir}"`);
      } catch {
        await execAsync(`powershell -NoProfile -Command "Expand-Archive -Path '${tempZipPath}' -DestinationPath '${targetDir}' -Force"`);
      }
    } else {
      await execAsync(`unzip -o "${tempZipPath}" -d "${targetDir}"`);
    }
  } finally {
    if (fs.existsSync(tempZipPath)) {
      try {
        fs.unlinkSync(tempZipPath);
      } catch {
        // ignore
      }
    }
  }

  // Find installed skill
  const subFiles = fs.readdirSync(targetDir);
  const mdFile = subFiles.find((f) => f.toLowerCase() === 'skill.md') || subFiles.find((f) => f.endsWith('.md')) || 'SKILL.md';
  const mdFullPath = path.join(targetDir, mdFile);

  let raw = '';
  if (fs.existsSync(mdFullPath)) {
    raw = fs.readFileSync(mdFullPath, 'utf8');
  }

  const parsed = parseSkillContent(raw, safeId);
  return {
    id: safeId,
    name: parsed.name,
    description: parsed.description,
    content: parsed.body,
    filename: mdFile,
    isFolder: true,
    enabled: true,
  };
}

export function getActiveSkillsPrompt(): string {
  const all = listSkills();
  const active = all.filter((s) => s.enabled);
  if (active.length === 0) return '';

  const blocks = active.map((s) => {
    return `### Skill: ${s.name}\n${s.description ? s.description + '\n' : ''}${s.content}`;
  });

  return `\n\n[Active Skills Instructions]:\n${blocks.join('\n\n---\n\n')}\n`;
}
