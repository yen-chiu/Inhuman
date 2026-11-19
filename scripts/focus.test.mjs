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
    return { context, elements, timeouts, intervals, run: code => vm.runInContext(code, context), nextTimeout() {
        const [id, callback] = timeouts.entries().next().value;
        timeouts.delete(id);
        return callback();
    } };
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
    assert.equal(g.elements.get('verification-status').textContent, '验证通过。');
    g.nextTimeout();
    assert.equal(g.elements.get('verification-status').textContent, '正在恢复访问…');
    assert.equal(g.context.window.location.href, '');
    g.nextTimeout();
    assert.equal(g.context.window.location.href, 'https://www.bilibili.com/video/BV1UT42167xb/');
    g.context.window.location.href = '';
    await g.run('initGame()');
    g.run('startPhase3(); checkResult()');
    assert.equal(g.elements.get('verification-status').dataset.state, 'error');
    assert.equal(g.context.window.location.href, '');
});

test('failure messages distinguish empty, missing, incorrect and mixed selections', async () => {
    const cases = [
        ['cellsData.forEach(c => c.isSelected = false)', '尚未选择任何图片'],
        ['cellsData.forEach(c => c.isSelected = c.isTarget); cellsData.find(c => c.isTarget).isSelected = false', '存在未选择的目标图片，请重新验证'],
        ['cellsData.forEach(c => c.isSelected = true)', '包含不符合要求的图片，请重新验证'],
        ['cellsData.forEach(c => c.isSelected = !c.isTarget)', '存在未选择的目标图片，且包含不符合要求的图片']
    ];
    for (const [selection, message] of cases) {
        const g = game();
        await g.run('initGame()');
        g.run('startPhase3(); ' + selection + '; checkResult()');
        assert.ok(g.elements.get('verification-status').textContent.includes(message));
        await g.nextTimeout();
        assert.equal(g.context.window.location.href, '');
        assert.equal(g.run('phase'), 1);
    }
});

test('refresh during restore cancels the pending Rickroll redirect', async () => {
    const g = game();
    await g.run('initGame()');
    g.run('startPhase3(); cellsData.forEach(c => c.isSelected = c.isTarget); checkResult()');
    g.nextTimeout();
    assert.equal(g.timeouts.size, 1);
    await g.run('initGame()');
    assert.equal(g.timeouts.size, 0);
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
