import { test, expect } from '@playwright/test';
test('isolated two-screen fixture routes tree and canvas selection', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('save-status')).toContainText('本地已保存');
  await page.evaluate(async () => {
    const storePath = '/src/editor/store.ts', modelPath = '/src/domain/model.ts', sessionPath = '/src/io/localSession.ts';
    const { editorStore } = await import(/* @vite-ignore */ storePath);
    const { createNode } = await import(/* @vite-ignore */ modelPath);
    const { localSession } = await import(/* @vite-ignore */ sessionPath);
    localSession.stop(); // Keep the non-schema fixture out of IndexedDB.
    const state = editorStore.getState(), doc = structuredClone(state.doc);
    doc.screens[0].nodes.push(createNode('minecraft:button', 'node_a', {x: 20, y: 20}));
    const second = structuredClone(doc.screens[0]); second.id = 'screen_second'; second.nodes = [createNode('minecraft:fill', 'node_b', {x: 80, y: 60})]; doc.screens.push(second);
    // Test-only fixture: no import or persistence path accepts this invalid document.
    editorStore.setState({ doc, selected: null });
  });
  await expect(page.getByRole('button', { name: '选择 node_a' })).toBeVisible();
  await page.getByRole('button', { name: '选择 node_a' }).click();
  await page.getByLabel('当前 Screen').selectOption('screen_second');
  await expect(page.getByRole('button', { name: '选择 node_b' })).toBeVisible();
  await expect(page.getByRole('button', { name: '选择 node_a' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '选择 node_b' })).toHaveAttribute('aria-pressed', 'false');
  await page.getByLabel('当前 Screen').selectOption('screen_main');
  await expect(page.getByRole('button', { name: '选择 node_a' })).toHaveAttribute('aria-pressed', 'false');
});
