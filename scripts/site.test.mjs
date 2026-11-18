import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';
import { projects } from '../assets/projects.js';

const root = new URL('../', import.meta.url);

test('every catalog entry points to a distinct, existing local HTML page', async () => {
    assert.equal(new Set(projects.map(p => p.path)).size, projects.length);
    assert.equal(new Set(projects.map(p => p.title)).size, projects.length);
    for (const project of projects) {
        const entry = new URL(project.path, root);
        assert.ok(entry.href.startsWith(root.href), project.title);
        assert.equal(decodeURIComponent(new URL('.', entry).pathname.split('/').filter(Boolean).at(-1)), project.folder);
        assert.ok(entry.pathname.endsWith('.html'), project.title);
        if (project.bv) assert.match(project.bv, /^BV[a-zA-Z0-9]+$/);
        await access(entry);
        const html = await readFile(entry, 'utf8');
        assert.match(html, /<meta\s+name=["']viewport["']/i, project.title);
    }
});

test('Circle level packs and their reference/verification images exist', async () => {
    const circle = new URL('Circle/', root);
    const manifest = JSON.parse(await readFile(new URL('configs/manifest.json', circle), 'utf8'));
    assert.ok(manifest.packs.length > 0);
    for (const packName of manifest.packs) {
        const pack = JSON.parse(await readFile(new URL(`configs/${packName}`, circle), 'utf8'));
        const items = Array.isArray(pack) ? pack : pack.items;
        assert.ok(items.length > 0, packName);
        for (const item of items) {
            for (const image of [item.ref, item.verify]) {
                const url = new URL(image, circle);
                assert.ok(url.href.startsWith(circle.href));
                await access(url);
            }
            assert.ok(item.target.x >= 0 && item.target.x <= 1);
            assert.ok(item.target.y >= 0 && item.target.y <= 1);
            assert.ok(item.target.radius > 0);
        }
    }
});

test('hub uses separate video and gameplay links and keeps author attribution', async () => {
    const html = await readFile(new URL('index.html', root), 'utf8');
    assert.match(html, /createElement\('article'\)/);
    assert.match(html, /href="\$\{p.path\}"/);
    assert.match(html, /https:\/\/github.com\/CS-LX\/Inhuman/);
    assert.match(html, /https:\/\/yenchiu.com\/yen-chiu-astro\/projects/);
    const notFound = await readFile(new URL('404.html', root), 'utf8');
    assert.match(notFound, /href="\/Inhuman\/"/);
});
