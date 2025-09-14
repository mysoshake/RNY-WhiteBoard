// state.js

// --- 定数 ---
const STORAGE_KEY_PREFIX = 'ProgramRnyKey_';
const SCORE_CLICK_THRESHOLD = 7;
const DISPLAY_MATH_MARKER = [['$$', '$$'], ['\\[', '\\]'], ['\\begin{equation}', '\\end{equation}']];
const INLINE_MATH_MARKER = [['$', '$'], ['\\(', '\\)'], ['@eq{', '}']];

// --- 状態変数 (モジュール内スコープ) ---
let scoreAreaClickCount = 0;
let correctProblemsCount = 0;
let totalProblemsCount = 0;
let skipCount = 0;
let isSidebarVisible = true;

function getStorageKey() {
    const pathname = window.location.pathname;
    // URLのパスからファイル名部分を抽出 (例: "/path/to/page.html" -> "page.html")
    const filename = pathname.substring(pathname.lastIndexOf('/') + 1);
    // ファイル名が空の場合 (例: ルートディレクトリにアクセスした場合) は 'index' を使う
    const baseKey = filename || 'index';
    return `${STORAGE_KEY_PREFIX}${baseKey}`; // プレフィックス + ファイル名
}

function getSidebarVisibility()
{
    return isSidebarVisible;
}

function toggleSidebarVisibility()
{
    isSidebarVisible = !isSidebarVisible;
}

// --- 状態変数アクセサ/更新関数 ---
function getCorrectProblemsCount() {
    return correctProblemsCount;
}

function getTotalProblemsCount() {
    return totalProblemsCount;
}

function incrementCorrectProblemsCount() {
    correctProblemsCount++;
    updateScoreDisplay(); // スコア変更時に表示も更新
    // saveProgress(); // saveProgress はUIの状態も読むので、呼び出し側で適切なタイミングで呼ぶことが多い
}

function setTotalProblemsCount(newTotal) {
    totalProblemsCount = newTotal;
    updateScoreDisplay();
}

function getSolvedAnswers()
{
    const solvedItems = [];
    
    const gateContainers = document.querySelectorAll('.problem-container, .wait-gate-container');
    gateContainers.forEach(container =>
    {
        // 問題のゲート
        const problemId = container.dataset.problemBlockId;
        if (problemId)
        {
            // 対応する判定ボタンを取得
            const checkButton = container.querySelector(`button[data-problem-id="${problemId}"][onclick="checkProblemAnswer(this)"]`);

            // ボタンが無効化（disabled）されていれば「解決済み」とみなす
            if (checkButton && checkButton.disabled)
            {
                if (DEBUG_MODE) console.log(`[SOLVED] dataset=`, checkButton.dataset);
                
                const answerTexts = checkButton.dataset.answers.split(',').map((ans) => {
                    const raw_answer = decodeURIComponent(escape(atob(ans).trim())).slice(currentMagicPrefix.length);
                    // const raw_answer = atob(ans).slice(currentMagicPrefix.length);
                    return raw_answer;
                });
                if (DEBUG_MODE) console.log(`[SOLVED] ansText=`, answerTexts);
            
                solvedItems.push({
                    id: `問題-${problemId}`,
                    ans: answerTexts
                });
            }
        }
        
        // 待機のゲート
        const waitId = container.dataset.waitBlockId;
        if (waitId)
        {
            // 対応する解除ボタンを取得
            const checkButton = container.querySelector(`button[data-wait-id="${waitId}"][onclick="checkWaitCondition(this)"]`);

            // ボタンが無効化されていれば「解決済み」とみなす
            if (checkButton && checkButton.disabled)
            {
                // 待機ゲートには明確な「答え」がないため、タイトルを表示
                const answerTexts = checkButton.dataset.password.split(',').map((ans) =>
                    decodeURIComponent(escape(atob(ans).trim())).slice(currentMagicPrefix.length));
                
                if (DEBUG_MODE) console.log(`[SOLVED] `, checkButton.dataset);
                if (DEBUG_MODE) console.log(`[SOLVED] answerText=${answerTexts}`);
                
                solvedItems.push({
                    id: `待機-${waitId}`,
                    ans: answerTexts
                });
            }
        }
    });

    return solvedItems;
}
function resetScoreAndProblems() {
    correctProblemsCount = 0;
    totalProblemsCount = 0; // 全問題数もリセットする場合
    scoreAreaClickCount = 0;
    skipCount = 0;
    isSidebarVisible = true;
    updateScoreDisplay();
}

function getSkipCount() {
    return skipCount;
}

function incrementSkipCount() {
    skipCount++;
}

// --- UI更新 ---
// この関数はDOM要素にアクセスするため、DOM構築後に呼び出す必要があります。
// state.js 外部からも使えるように しておきます。
function updateScoreDisplay() {
    const correctSpan = document.getElementById('correct-answers-count');
    const totalSpan = document.getElementById('total-problems-count');
    if (correctSpan) correctSpan.textContent = correctProblemsCount;
    if (totalSpan) totalSpan.textContent = totalProblemsCount;
}

// --- 進行状況の保存・読み込み ---
// これらの関数はDOM要素にアクセスします。
function saveProgress() {
    const problemStates = {};
    for (let i = 1; i <= totalProblemsCount; i++) {
        const problemId = i.toString();
        const inputEl = document.getElementById(`problem-input-${problemId}`);
        const buttonEl = document.querySelector(`button[data-problem-id="${problemId}"]`);
        const resultEl = document.getElementById(`problem-result-${problemId}`);
        if (inputEl && buttonEl && resultEl) {
            problemStates[problemId] = {
                solved: buttonEl.disabled,
                lastAnswer: inputEl.value,
                resultText: resultEl.textContent,
                resultClass: resultEl.className.replace('problem-result', '').trim()
            };
        }
    }

    const waitStates = {};
    document.querySelectorAll('.wait-gate-interactive button[data-wait-id]').forEach(buttonEl => {
        const waitId = buttonEl.dataset.waitId;
        const inputEl = document.getElementById(`wait-input-${waitId}`);
        const resultEl = document.getElementById(`wait-result-${waitId}`);
        waitStates[waitId] = {
            unlocked: buttonEl.disabled,
            lastInput: inputEl ? inputEl.value : "",
            resultText: resultEl ? resultEl.textContent : "",
            resultClass: resultEl ? resultEl.className.replace('wait-gate-result', '').trim() : ""
        };
    });

    const revealedSectionsData = {};
    document.querySelectorAll('.revealable-section.revealed').forEach(sectionEl => {
        revealedSectionsData[sectionEl.id] = true;
    });

    const appData = {
        correctProblemsCount: correctProblemsCount,
        totalProblemsCount: totalProblemsCount,
        skipCount: skipCount,
        problemStates: problemStates,
        waitStates: waitStates,
        revealedSections: revealedSectionsData,
        isSidebarVisible: isSidebarVisible
    };
    try {
        localStorage.setItem(getStorageKey(), JSON.stringify(appData));
    } catch (e) {
        console.error("ローカルストレージへの保存に失敗しました:", e);
    }
}

function loadProgress()
{
    const savedDataString = localStorage.getItem(getStorageKey());
    if (!savedDataString) {
        correctProblemsCount = 0; // 状態変数も初期化
        skipCount = 0;
        // totalProblemsCount は通常、コンテンツ解析時に設定されるので、ここでは0のまま
        updateScoreDisplay();
        return;
    }
    try {
        const appData = JSON.parse(savedDataString);
        correctProblemsCount = appData.correctProblemsCount || 0;
        // totalProblemsCount は通常、HTMLの解析時に決定されるため、
        // ここでは読み込まないか、読み込んでも後で上書きされることを想定します。
        // もし保存された値を使いたいなら:
        // totalProblemsCount = appData.totalProblemsCount || 0;
        skipCount = appData.skipCount || 0;

        if (appData.problemStates) {
            for (const problemId in appData.problemStates) {
                const state = appData.problemStates[problemId];
                const inputEl = document.getElementById(`problem-input-${problemId}`);
                const buttonEl = document.querySelector(`button[data-problem-id="${problemId}"]`);
                const skipButtonEl = document.querySelector(`.problem-interactive button.skip-button[data-problem-id="${problemId}"]`);
                const resultEl = document.getElementById(`problem-result-${problemId}`);
                if (inputEl)
                {
                    inputEl.value = state.lastAnswer || '';
                }
                if(state.solved)
                {
                    if (inputEl) inputEl.disabled = true;
                    if (skipButtonEl) skipButtonEl.disabled = true;
                    if (buttonEl) buttonEl.disabled = true;
                }
                if (resultEl) {
                    resultEl.textContent = state.resultText || '';
                    resultEl.className = 'problem-result';
                    if (state.resultClass) {
                        state.resultClass.split(' ').forEach(cls => { if(cls) resultEl.classList.add(cls); });
                    }
                }
            }
        }
        if (appData.waitStates) {
            for (const waitId in appData.waitStates) {
                const state = appData.waitStates[waitId];
                const buttonEl = document.querySelector(`.wait-gate-interactive button[data-wait-id="${waitId}"]`);
                const inputEl = document.getElementById(`wait-input-${waitId}`);
                const resultEl = document.getElementById(`wait-result-${waitId}`);
                if (inputEl && typeof state.lastInput === 'string') {
                    inputEl.value = state.lastInput;
                    if (state.unlocked) inputEl.disabled = true;
                } else if (inputEl && state.unlocked) {
                    inputEl.disabled = true;
                }
                if (buttonEl && state.unlocked) buttonEl.disabled = true;
                if (resultEl) {
                    resultEl.textContent = state.resultText || '';
                    resultEl.className = 'wait-gate-result';
                    if (state.resultClass) {
                        state.resultClass.split(' ').forEach(cls => { if(cls) resultEl.classList.add(cls); });
                    }
                }
            }
        }
        if (appData.revealedSections) {
            for (const sectionId in appData.revealedSections) {
                if (appData.revealedSections[sectionId]) {
                    const sectionEl = document.getElementById(sectionId);
                    if (sectionEl) sectionEl.classList.add('revealed');
                }
            }
        }
        updateScoreDisplay(); // 最後に表示を更新
    } catch (e) {
        console.error("ローカルストレージからの読み込みまたは解析に失敗しました:", e);
        correctProblemsCount = 0;
        skipCount = 0;
        isSidebarVisible = appData.isSidebarVisible !== false;
        solvedAnswers = [];
        updateScoreDisplay();
    }
}

// --- ローカルストレージ削除関連 ---
function clearLocalStorageAndReload() {
    try {
        localStorage.removeItem(getStorageKey());
        console.log(`LocalStorage key "${getStorageKey()}" が削除されました。`);
        resetScoreAndProblems(); // 状態変数をリセット
        alert("学習データが削除されました。ページをリロードします。");
        location.reload();
    } catch (e) {
        console.error("ローカルストレージの削除に失敗しました:", e);
        alert("データの削除に失敗しました。");
    }
}

function displayClearStorageConfirmation() {
    const footerElement = document.querySelector('footer');
    if (!footerElement) {
        console.error("フッター要素が見つかりません。");
        return;
    }
    const existingConfirmArea = document.getElementById('clear-storage-confirm-area');
    if (existingConfirmArea) existingConfirmArea.remove();

    const confirmDiv = document.createElement('div');
    confirmDiv.id = 'clear-storage-confirm-area';
    confirmDiv.innerHTML = `
        <p>ローカルストレージに保存されている学習データを削除しますか？<br>この操作は元に戻せません。</p>
        <button id="execute-clear-storage">はい、削除する</button>
        <button id="cancel-clear-storage">いいえ、キャンセル</button>
    `;
    footerElement.appendChild(confirmDiv);

    document.getElementById('execute-clear-storage').addEventListener('click', clearLocalStorageAndReload);
    document.getElementById('cancel-clear-storage').addEventListener('click', () => {
        confirmDiv.remove();
        scoreAreaClickCount = 0; // カウントリセット
    });
}

function handleScoreAreaClick() {
    scoreAreaClickCount++;
    if (scoreAreaClickCount >= SCORE_CLICK_THRESHOLD) {
        displayClearStorageConfirmation();
        scoreAreaClickCount = 0;
    }
}