import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const html = readFileSync(new URL('../FOCUS/FOCUS.html', import.meta.url), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
function game(snapshot) {
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
    const window = Object.assign(new EventTarget(), { location: { href: '' } });
    const entries = structuredClone(snapshot?.entries ?? [null, null]);
    let historyIndex = snapshot?.index ?? 1;
    const move = step => {
        const next = historyIndex + step;
        if (next < 0 || next >= entries.length) return;
        historyIndex = next;
        if (historyIndex === 0) window.location.href = 'https://yenchiu.com/yen-chiu-astro/';
        const event = new Event('popstate');
        Object.defineProperty(event, 'state', { value: entries[historyIndex] });
        window.dispatchEvent(event);
    };
    const history = {
        get state() { return entries[historyIndex]; },
        replaceState(value) { entries[historyIndex] = structuredClone(value); },
        pushState(value) { entries.splice(historyIndex + 1); entries.push(structuredClone(value)); historyIndex++; },
        back() { move(-1); }, forward() { move(1); }
    };
    const document = Object.assign(new EventTarget(), {
        getElementById(id) { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); },
        createElement: () => new Element()
    });
    const context = vm.createContext({
        document, window, history, crypto: { randomUUID: () => 'verification-visit' },
        Image: class { set src(value) { queueMicrotask(() => this.onload()); } },
        setTimeout(callback) { const id = ++nextId; timeouts.set(id, callback); return id; }, clearTimeout: id => timeouts.delete(id),
        setInterval(callback) { const id = ++nextId; intervals.set(id, callback); return id; }, clearInterval: id => intervals.delete(id)
    });
    vm.runInContext(script, context);
    return { context, elements, timeouts, intervals, history, snapshot: () => ({ entries, index: historyIndex }), run: code => vm.runInContext(code, context), nextTimeout() {
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

test('first Back resets the challenge once; second Back naturally leaves the page', async () => {
    const g = game();
    await g.run('initGame()');
    assert.equal(g.snapshot().entries.length, 2);
    g.run('armBackGuard(); armBackGuard()');
    assert.equal(g.snapshot().entries.length, 3);
    const previousCells = g.run('cellsData');
    g.run('startPhase2()');
    assert.equal(g.timeouts.size, 1);
    g.history.back();
    assert.equal(g.snapshot().index, 1);
    assert.equal(g.timeouts.size, 0);
    assert.notEqual(g.run('cellsData'), previousCells);
    assert.equal(g.elements.get('verification-status').textContent, '验证流程已中断，请重新验证。');
    assert.equal(g.context.window.location.href, '');
    g.history.back();
    assert.equal(g.snapshot().index, 0);
    assert.equal(g.context.window.location.href, 'https://yenchiu.com/yen-chiu-astro/');
});

test('refresh does not stack guard entries or re-arm a consumed Back', async () => {
    const g = game();
    g.run('armBackGuard()');
    const refreshed = game(g.snapshot());
    refreshed.run('armBackGuard()');
    assert.equal(refreshed.snapshot().entries.length, 3);
    refreshed.history.back();
    const afterBack = game(refreshed.snapshot());
    afterBack.run('armBackGuard()');
    assert.equal(afterBack.snapshot().entries.length, 3);
    assert.equal(afterBack.run('returnWasUsed'), true);
    afterBack.history.back();
    assert.equal(afterBack.snapshot().index, 0);
});

test('Back cancels a pending Rickroll, and successful completion releases the guard', async () => {
    const g = game();
    await g.run('initGame()');
    g.run('armBackGuard()');
    g.run('startPhase3(); cellsData.forEach(c => c.isSelected = c.isTarget); checkResult()');
    g.nextTimeout();
    g.history.back();
    assert.equal(g.timeouts.size, 0);
    assert.equal(g.context.window.location.href, '');
    const complete = game();
    await complete.run('initGame()');
    complete.run('armBackGuard()');
    complete.run('startPhase3(); cellsData.forEach(c => c.isSelected = c.isTarget); checkResult()');
    complete.nextTimeout(); complete.nextTimeout();
    assert.equal(complete.history.state.focusReturnGuard.spent, true);
    assert.equal(complete.context.window.location.href, 'https://www.bilibili.com/video/BV1UT42167xb/');
});

test('restricted History API keeps the game usable without a navigation loop', async () => {
    const g = game();
    g.history.pushState = () => { throw new Error('History unavailable'); };
    assert.doesNotThrow(() => g.run('armBackGuard()'));
    await g.run('initGame()');
    assert.equal(g.run('returnWasUsed'), true);
    assert.equal(g.run('phase'), 1);
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
