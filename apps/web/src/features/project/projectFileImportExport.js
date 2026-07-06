import { validateProjectFile } from '../../../../../packages/shared/src/project.js';

function sanitizeFileName(name) {
  return String(name || 'project')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/gu, '_')
    .trim() || 'project';
}

export function exportProjectFile(project) {
  const normalizedProject = validateProjectFile(project);
  const blob = new Blob([JSON.stringify(normalizedProject, null, 2)], {
    type: 'application/json;charset=utf-8'
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${sanitizeFileName(normalizedProject.name)}.project.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function importProjectFile(file) {
  const text = await file.text();
  return validateProjectFile(JSON.parse(text));
}
