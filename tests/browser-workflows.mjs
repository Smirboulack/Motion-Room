// Runs against either a Computer Use tab or the small Playwright adapter below.
// All assertions read visible DOM; application state is never injected.
export async function runWorkspaceChecks(tab, { imagePath, jumpPath, name = 'Workspace browser checks' } = {}) {
  const page = tab.playwright, results = [];
  const check = (condition, message) => { if (!condition) throw new Error(message); results.push(message); };
  const value = locator => locator.evaluate(element => element.value);
  const button = name => page.getByRole('button', { name, exact: true });
  const number = async (label, amount) => { const input = page.getByLabel(label, { exact: true }); await input.fill(String(amount - 1)); await input.press('ArrowUp'); };
  const seek = async frame => {
    const slider = page.getByRole('slider', { name: 'Current frame', exact: true });
    await slider.press('Home'); for (let i = 0; i < frame; i++) await slider.press('ArrowRight');
  };
  const choose = async (name, path) => {
    const pending = page.waitForEvent('filechooser'); await button(name).click(); await (await pending).setFiles(path);
  };
  const download = async name => {
    const pending = page.waitForEvent('download', { timeout: 60000 }); await button(name).click(); return (await pending).path();
  };
  await button('New animation').click();
  const dialog = page.getByRole('dialog', { name: 'New animation', exact: true });
  await dialog.getByLabel('Name', { exact: true }).fill(name);
  await dialog.getByLabel('Duration (s)', { exact: true }).fill('2');
  await button('Create animation').click();
  await page.getByLabel('Selected joint', { exact: true }).selectOption({ label: 'head' });
  await number('Joint rotation Z', 25);
  check((await page.locator('#key-count').textContent()).includes('1 key'), 'Numeric pose editing creates one key');
  await page.locator('.pose-library-details summary').click();
  await page.getByLabel('Pose name', { exact: true }).fill('Browser head pose'); await button('Save pose to library').click();
  await button('Reset offsets').click(); await button('Apply pose').click();
  check(Math.abs(Number(await value(page.getByLabel('Joint rotation Z', { exact: true }))) - 25) < 0.01, 'Pose library restores numeric offsets');
  await page.getByText('Channels', { exact: true }).click();
  await button('Key joint').click(); await seek(10); await number('Joint rotation Z', -20);
  await button('Select all').click();
  const advanced = page.locator('#advanced-timeline');
  await page.getByLabel('Move selected keys by frames', { exact: true }).fill('5');
  await advanced.getByRole('button', { name: 'Move', exact: true }).click();
  check(await page.getByRole('button', { name: 'Whole pose key at frame 5', exact: true }).count() === 1, 'Group movement preserves relative key timing');
  await page.getByLabel('Selected key span in frames', { exact: true }).fill('20'); await button('Stretch').click();
  check(await page.getByRole('button', { name: 'Whole pose key at frame 25', exact: true }).count() === 1, 'Group stretching changes the selected span');
  await button('Copy').click(); await seek(30); await button('Paste').click();
  check(await page.getByRole('button', { name: 'Whole pose key at frame 50', exact: true }).count() === 1, 'Clipboard pastes at the playhead');
  await button('Undo').click();
  check(await page.getByRole('button', { name: 'Whole pose key at frame 50', exact: true }).count() === 0, 'Undo removes the complete pasted group');
  await button('Redo').click();
  await page.getByLabel('Timeline zoom', { exact: true }).selectOption('4');
  check(Number(await value(page.getByLabel('Timeline zoom', { exact: true }))) === 4, 'Timeline zoom is adjustable');
  await button('Fit').click();
  const splitter = page.getByRole('separator', { name: 'Resize inspector', exact: true });
  const before = Number(await splitter.getAttribute('aria-valuenow')); await splitter.press('ArrowLeft');
  check(Number(await splitter.getAttribute('aria-valuenow')) === before + 10, 'Panels resize with the keyboard');
  await page.getByRole('button', { name: 'Focus view', exact: true }).click();
  check(await button('Restore panels').isVisible(), 'Focus view can restore all panels'); await button('Restore panels').click();
  await page.getByText('Study', { exact: true }).click();
  await page.getByLabel('My notes', { exact: true }).fill('Browser regression note');
  if (imagePath) {
    await choose('Open video or image', imagePath);
    await page.locator('#media-board').waitFor({ state: 'visible' });
    check(await page.locator('#media-board img').count() === 1, 'Image reference opens on the board');
  }
  await button('Export').click();
  const projectPath = await download('Save editable project (.motionroom)');
  check(Boolean(projectPath), 'Portable project downloads'); await button('Close export').click();
  const projectsBefore = await page.locator('[data-project]').count();
  await choose('Open project file', projectPath);
  await page.locator('[data-project]').nth(projectsBefore).waitFor({ state: 'visible' });
  await page.getByRole('heading', { name, exact: true }).waitFor({ state: 'visible' });
  await page.getByText('Study', { exact: true }).click();
  check(await value(page.getByLabel('My notes', { exact: true })) === 'Browser regression note', 'Project file restores editable notes');
  if (imagePath) { await page.locator('#media-board').waitFor({ state: 'visible' }); check(await page.locator('#media-board img').count() === 1, 'Project file restores embedded reference image'); }
  await tab.reload();
  await page.getByRole('heading', { name, exact: true }).waitFor({ state: 'visible' });
  check((await page.locator('#key-count').textContent()).includes('8 keys'), 'Reload restores all pose and joint keys');
  await button('Export').click(); const glbPath = await download('Download animated character (.glb)');
  check(Boolean(glbPath), 'Baked GLB downloads');
  await button('Export').click();
  const supported = await page.getByRole('button', { name: 'Export frame-by-frame video (.webm)', exact: true }).isEnabled();
  let videoPath;
  if (supported) { videoPath = await download('Export frame-by-frame video (.webm)'); check(Boolean(videoPath), 'Frame-by-frame WebM downloads'); }
  else await button('Close export').click();
  if (videoPath) {
    await page.getByText('Study', { exact: true }).click(); await choose('Open video or image', videoPath);
    await page.locator('#media-board video').waitFor({ state: 'visible' });
    const video = await page.locator('#media-board video').evaluate(element => ({ duration: element.duration, width: element.videoWidth, height: element.videoHeight }));
    check(Math.abs(video.duration - 2) < 0.05 && video.width === 1280 && video.height === 720, 'Exported WebM decodes at the requested dimensions and exact duration');
  }
  if (jumpPath) {
    await choose('Import animation', jumpPath);
    await page.getByLabel('Animation clip', { exact: true }).waitFor({ state: 'visible' });
    await page.getByLabel('Animation clip', { exact: true }).selectOption('0');
    await page.getByText('Study', { exact: true }).click();
    await page.getByLabel('Take name', { exact: true }).fill('Takeoff browser check'); await button('Save take').click();
    await page.getByText('Pose', { exact: true }).first().click();
    await page.getByLabel('Animation clip', { exact: true }).selectOption('1');
    await page.getByText('Study', { exact: true }).click();
    const takes = page.getByLabel('Saved takes', { exact: true });
    const options = await takes.locator('option').all();
    const saved = [];
    for (const option of options) if ((await option.textContent()).includes('Takeoff browser check')) saved.push(await option.getAttribute('value'));
    await takes.selectOption(saved.at(-1)); await button('Continue this take').click();
    await page.getByText('Pose', { exact: true }).first().click();
    check(await value(page.getByLabel('Animation clip', { exact: true })) === '0', 'Saved take restores its original source clip');
    await button('Undo').click();
    check(await value(page.getByLabel('Animation clip', { exact: true })) === '1', 'Undo restores the previous source clip');
  }
  if (supported) {
    // A longer take keeps the cancellation check independent of encoder speed.
    await page.locator('#take-duration').fill('299.9'); await page.locator('#take-duration').press('ArrowUp');
    await button('Export').click(); await button('Export frame-by-frame video (.webm)').click();
    await button('Cancel export').click(); await page.locator('#export-progress-dialog').waitFor({ state: 'hidden' });
    check((await page.locator('#toast').textContent()).includes('Export cancelled'), 'Video export cancellation restores the workspace');
    check(await button('Play').isEnabled(), 'Playback is editable after cancellation');
  }
  return { results, projectPath, glbPath, videoPath };
}
