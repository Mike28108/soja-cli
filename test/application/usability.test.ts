import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Session } from '../../src/application/types.js';
import { editInEditor, preferredEditor } from '../../src/utils/editor.js';
import { createSetUpApp, type TestApp } from '../helpers.js';

describe('editing text in $EDITOR', () => {
  it('prefers $VISUAL, then $EDITOR, then vi', () => {
    expect(preferredEditor({ VISUAL: 'code --wait', EDITOR: 'nano' })).toBe('code --wait');
    expect(preferredEditor({ EDITOR: 'nano' })).toBe('nano');
    expect(preferredEditor({})).toBe('vi');
  });

  it('returns what was saved, with editor arguments working, and null when the editor fails', async () => {
    expect(await editInEditor('old text\nsecond line', { name: 'SOJA-1.md', editor: 'sed -i s/old/new/' })).toBe('new text\nsecond line');
    expect(await editInEditor('keep', { name: 'x.md', editor: 'false' })).toBeNull();
  });
});

describe('editing projects', () => {
  let app: TestApp & { session: Session };
  beforeEach(async () => {
    app = await createSetUpApp();
  });
  afterEach(() => app.close());

  it('renames, describes and clears, keeping the key and refusing duplicate names', async () => {
    const project = await app.services.projects.create(app.session, { name: 'EnrollBridge' });
    await app.services.projects.create(app.session, { name: 'Payments' });
    const renamed = await app.services.projects.update(app.session, project, { name: 'Enroll Bridge', description: 'Student enrollment' });
    expect(renamed).toMatchObject({ key: project.key, name: 'Enroll Bridge', description: 'Student enrollment' });
    await expect(app.services.projects.update(app.session, renamed, { name: 'payments' })).rejects.toThrow(/already exists/);
    expect((await app.services.projects.update(app.session, renamed, { description: '' })).description).toBeNull();
  });
});
