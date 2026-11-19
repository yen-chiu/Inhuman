import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const html = readFileSync(new URL('../FOCUS/FOCUS.html', import.meta.url), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
function game() {
    const timeouts = new Map();
    const intervals = new Map();
    let nextId = 0;
    class Element {
        style = {}; dataset = {}; children = []; textContent = ''; innerText = '';
        classList = { add() {}, remove() {} };
        setAttribute() {} addEventListener() {}
        appendChild(child) { this.children.push(child); }
        querySelector() { return new Element(); }
    }
    const elements = new Map();
    const context = vm.createContext({
        document: { getElementById(id) { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); }, createElement: () => new Element() },
        window: { location: { href: '' } },
        Image: class { set src(value) { queueMicrotask(() => this.onload()); } },
        setTimeout(callback) { const id = ++nextId; timeouts.set(id, callback); return id; }, clearTimeout: id => timeouts.delete(id),
        setInterval(callback) { const id = ++nextId; intervals.set(id, callback); return id; }, clearInterval: id => intervals.delete(id)
    });
    vm.runInContext(script, context);
    return { context, elements, timeouts, intervals, run: code => vm.runInContext(code, context) };
}

test('FOCUS images exist and gameplay does not expose editor/author/game branding', () => {
    for (const match of script.matchAll(/'(images\/[^']+)'/g)) {
        assert.ok(existsSync(new URL('../FOCUS/' + match[1], import.meta.url)), match[1]);
    }
    assert.doesNotMatch(html, /alert\(|地狱级|我也想做|github\.com|<title>FOCUS/);
});

test('correct selection reaches the Rickroll; wrong selection retries inside the page', async () => {
    const g = game();
    await g.run('initGame()');
    g.run('startPhase3(); cellsData.forEach(c => c.isSelected = c.isTarget); checkResult()');
    assert.equal(g.elements.get('verification-status').dataset.state, 'success');
    [...g.timeouts.values()].forEach(callback => callback());
    assert.equal(g.context.window.location.href, 'https://www.bilibili.com/video/BV1UT42167xb/');
    g.context.window.location.href = '';
    await g.run('initGame()');
    g.run('startPhase3(); checkResult()');
    assert.equal(g.elements.get('verification-status').dataset.state, 'error');
    assert.equal(g.context.window.location.href, '');
});

test('refresh cancels pending shuffle and result callbacks', async () => {
    const g = game();
    await g.run('initGame()');
    g.run('startPhase2()');
    assert.equal(g.timeouts.size, 1);
    await g.run('initGame()');
    assert.equal(g.timeouts.size, 0);
    g.run('startPhase3(); checkResult()');
    assert.equal(g.timeouts.size, 1);
    await g.run('initGame()');
    assert.equal(g.timeouts.size, 0);
    assert.equal(g.context.window.location.href, '');
});
