const test = require('node:test');
const assert = require('node:assert/strict');
const go = require('../go.js');
Object.assign(globalThis, go);

const { I18N, formatPoints } = require('../lang.js');
const app = require('../app.js');

function fromDiagram(rows, toMove = go.GO_BLACK) {
    const size = rows.length;
    const g = go.goCreate(size);
    rows.forEach((row, y) => [...row].forEach((ch, x) => {
        g.board[y * size + x] = ch === 'X' ? go.GO_BLACK : ch === 'O' ? go.GO_WHITE : go.GO_EMPTY;
    }));
    return { ...g, toMove };
}

test('all languages have complete dictionaries with required keys', () => {
    const languages = ['de', 'en', 'pl'];
    const requiredKeys = [
        'btnPass', 'btnScoreDone', 'btnUndo', 'btnResign', 'btnExplain', 'btnNewGame',
        'labelOpponent', 'labelBoard', 'labelLang', 'diffEasy', 'diffMedium',
        'confirmReset', 'confirmResign', 'confirmYes', 'confirmNo',
        'illegalMove', 'aiThinking', 'turnBlack', 'turnWhite',
        'winnerBlack', 'winnerWhite', 'resignedBlack', 'resignedWhite',
        'explainNoMove', 'explainPassHuman', 'explainPassAi',
        'explainApparentSuicide', 'explainCapture', 'explainMoveGroup', 'explainMoveSingle', 'explainKo',
        'stoneWord', 'libertyWord', 'subjectHuman', 'subjectAi',
        'verbPlayHuman', 'verbPlayAi', 'verbCapHuman', 'verbCapAi'
    ];

    for (const lang of languages) {
        assert.ok(I18N[lang], `Dictionary for ${lang} must exist`);
        for (const key of requiredKeys) {
            assert.ok(I18N[lang][key] !== undefined, `Key ${key} missing in ${lang}`);
        }
    }
});

test('Polish pluralization rules for stones and liberties', () => {
    const pl = I18N.pl;

    // Stones (kamień, kamienie, kamieni)
    assert.equal(pl.stoneWord(1), 'kamień');
    assert.equal(pl.stoneWord(2), 'kamienie');
    assert.equal(pl.stoneWord(4), 'kamienie');
    assert.equal(pl.stoneWord(5), 'kamieni');
    assert.equal(pl.stoneWord(11), 'kamieni');
    assert.equal(pl.stoneWord(12), 'kamieni');
    assert.equal(pl.stoneWord(22), 'kamienie');
    assert.equal(pl.stoneWord(25), 'kamieni');

    // Liberties (oddech, oddechy, oddechów)
    assert.equal(pl.libertyWord(1), 'oddech');
    assert.equal(pl.libertyWord(2), 'oddechy');
    assert.equal(pl.libertyWord(4), 'oddechy');
    assert.equal(pl.libertyWord(5), 'oddechów');
    assert.equal(pl.libertyWord(14), 'oddechów');
    assert.equal(pl.libertyWord(23), 'oddechy');
});

test('rule explanation in German (DE)', () => {
    const g0 = fromDiagram([
        'OOOOO',
        'OXXXO',
        'OX.XO',
        'OXXXO',
        'OOOOO',
    ], go.GO_WHITE);
    const centerIdx = 2 * 5 + 2;
    const g1 = go.goPlay(g0, centerIdx);

    const expl = app.generateExplanation(g1, g0, 'de');
    assert.match(expl, /Der Computer \(Weiß\) spielt C3 und fängt 8 Steine/);
    assert.match(expl, /Das sieht aus wie Selbstmord, ist es aber nicht/);
    assert.match(expl, /nur noch diese eine Freiheit/);
});

test('rule explanation in English (EN)', () => {
    const g0 = fromDiagram([
        'OOOOO',
        'OXXXO',
        'OX.XO',
        'OXXXO',
        'OOOOO',
    ], go.GO_WHITE);
    const centerIdx = 2 * 5 + 2;
    const g1 = go.goPlay(g0, centerIdx);

    const expl = app.generateExplanation(g1, g0, 'en');
    assert.match(expl, /The computer \(White\) plays C3 and captures 8 stones/);
    assert.match(expl, /This looks like suicide, but it is not/);
    assert.match(expl, /only this single liberty left/);
});

test('rule explanation in Polish (PL)', () => {
    const g0 = fromDiagram([
        'OOOOO',
        'OXXXO',
        'OX.XO',
        'OXXXO',
        'OOOOO',
    ], go.GO_WHITE);
    const centerIdx = 2 * 5 + 2;
    const g1 = go.goPlay(g0, centerIdx);

    const expl = app.generateExplanation(g1, g0, 'pl');
    assert.match(expl, /Komputer \(Białe\) stawia kamień na C3 i zbija 8 kamieni/);
    assert.match(expl, /Wygląda to na samobójstwo, ale nim nie jest/);
    assert.match(expl, /otaczająca grupa miała już tylko ten jeden oddech/);
    assert.match(expl, /Postawiony kamień żyje, ponieważ zbicie tworzy nowe oddechy/);
});

test('ko rule explanation in all languages', () => {
    const g0 = fromDiagram([
        '.OX.',
        'OX.X',
        '.OX.',
        '....',
    ], go.GO_WHITE);
    const g1 = go.goPlay(g0, 1 * 4 + 2);

    const de = app.generateExplanation(g1, g0, 'de');
    assert.match(de, /Ko-Regel: B3 darf im nächsten Zug nicht direkt zurückgeschlagen werden/);

    const en = app.generateExplanation(g1, g0, 'en');
    assert.match(en, /Ko rule: B3 cannot be immediately recaptured/);

    const pl = app.generateExplanation(g1, g0, 'pl');
    assert.match(pl, /Zasada ko: pole B3 nie może zostać natychmiast odbite/);
});

test('pass explanation in all languages', () => {
    const g0 = { ...go.goCreate(9), toMove: go.GO_WHITE };
    const g1 = go.goPass(g0);

    assert.match(app.generateExplanation(g1, g0, 'de'), /Der Computer \(Weiß\) hat gepasst/);
    assert.match(app.generateExplanation(g1, g0, 'en'), /The computer \(White\) passed/);
    assert.match(app.generateExplanation(g1, g0, 'pl'), /Komputer \(Białe\) spasował/);
});

test('formatPoints formats decimal numbers according to active locale', () => {
    assert.equal(formatPoints(6.5, 'de'), '6,5');
    assert.equal(formatPoints(6.5, 'en'), '6.5');
    assert.equal(formatPoints(6.5, 'pl'), '6,5');
});
