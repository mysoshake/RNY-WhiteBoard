// main_s.js

// --- グローバル変数 ---
const mathPlaceholders   = new Map(); // DOMContentLoaded内でクリア/使用
const rawCodeSnippets    = new Map(); // コードスニペット保存用 Map を追加

let rawCodeSnippetIndex  = 0;         // コードスニペット用インデックス
let currentMagicPrefix = "rny_answer::";
const BASE_COOLDOWN_MS = 1000; //デフォルトのクールダウン時間(1秒),
let cooldown_ms = BASE_COOLDOWN_MS;
let gateVisibilityModes = { problem: 'hide', wait: 'hide' }; // #STコマンドによって変更される

// =======================================================================
// 1. インタラクション関数 (変更なし)
// =======================================================================

/**
 * HTMLエスケープ用ヘルパー関数
 */
function escapeHtml(unsafeText)
{
    if (typeof unsafeText !== 'string') {
        return '';
    }
    const div = document.createElement('div');
    div.textContent = unsafeText;
    return div.innerHTML;
}

// ページ全体のコンテンツ表示状態を更新する関数
function updateContentVisibility()
{
    console.log("--- 表示状態の更新を開始 ---");

    let masterShowAll = false;
    let stopShowing = false;      // これ以降の要素を非表示にするかどうかのフラグ
    let unsolvedGateHeader = null; // 未解決だったゲートのヘッダー要素を一時的に保持

    const allElements = document.querySelectorAll('#output > *');

    allElements.forEach(element =>
    {
        // --- 1. グローバルな表示設定の処理 ---

        // #ST コマンドによって挿入されたマーカーを処理
        if (element.matches('.visibility-marker'))
        {
            masterShowAll = (element.dataset.mode === 'show');
            element.style.display = 'none'; // マーカー自体は常に非表示
            return;
        }

        // 全表示モードが有効な場合は、以降の処理をスキップして表示
        if (masterShowAll)
        {
            element.style.display = '';
            return;
        }

        // --- 2. 表示/非表示の決定 ---

        // 表示停止フラグが立っている場合、要素を非表示にして処理を終了
        if (stopShowing)
        {
            element.style.display = 'none';
            return;
        }

        // この時点では表示対象なので、表示状態にする
        element.style.display = '';

        // --- 3. 次の要素から非表示にするかどうかの判定 ---

        // 直前のループで未解決ゲートが見つかっていた場合、現在の要素がそのコンテナかどうかを判定
        if (unsolvedGateHeader && element === unsolvedGateHeader.nextElementSibling)
        {
            // この要素は未解決ゲートのコンテナ。これを表示した後、次の要素から非表示にする
            stopShowing = true;
            unsolvedGateHeader = null; // 判定が終わったのでリセット
        }

        // 現在の要素がゲートのヘッダー（タイトル）かどうかをチェック
        if (element.matches('h2.problem, h2.wait-gate-title'))
        {
            const gateHeader = element;
            const gateContainer = gateHeader.nextElementSibling;
            
            let isSolved = true; // デフォルトは「解決済み」

            const gateType = gateHeader.matches('.problem') ? 'problem' : 'wait';
            const currentMode = gateVisibilityModes[gateType];

            // 'hide' モードの場合のみ、解決状態をチェック
            if (currentMode === 'hide' && gateContainer)
            {
                const problemIdMatch = gateHeader.textContent.match(/問題 (\d+):/);
                const gateId = (gateType === 'problem' && problemIdMatch) ? problemIdMatch[1] : gateHeader.dataset.waitId;
                
                let checkButton = null;
                if (gateId)
                {
                    if (gateType === 'problem')
                    {
                        checkButton = gateContainer.querySelector(`button[data-problem-id="${gateId}"][onclick="checkProblemAnswer(this)"]`);
                    }
                    else if (gateType === 'wait')
                    {
                        checkButton = gateContainer.querySelector(`button[data-wait-id="${gateId}"][onclick="checkWaitCondition(this)"]`);
                    }
                }
                
                // ボタンが存在し、かつ無効化されていない（＝クリック可能）なら「未解決」
                if (checkButton && !checkButton.disabled)
                {
                    isSolved = false;
                }
            }
            
            // ゲートが未解決だった場合、そのヘッダー情報を次のループのために保持しておく
            if (!isSolved)
            {
                unsolvedGateHeader = gateHeader;
            }
        }
    });
    console.log("\n--- 表示状態の更新を終了 ---");
}

function checkWaitCondition(buttonElement)
{
    const waitId = buttonElement.dataset.waitId;
    const encodedPasswordsStr = buttonElement.dataset.password;
    const resultDisplayElement = document.getElementById(`wait-result-${waitId}`);
    let conditionMet = false;

    if (encodedPasswordsStr === "")
    {
        conditionMet = true;
    }
    else
    {
        const userInputElement = document.getElementById(`wait-input-${waitId}`);
        if (!userInputElement)
        {
            console.error(`Wait input for ID ${waitId} not found.`);
            if (resultDisplayElement)
            {
                resultDisplayElement.textContent = "エラーが発生しました。";
                resultDisplayElement.className = 'wait-gate-result result-incorrect';
            }
            return;
        }

        const userEnteredPassword = userInputElement.value;
        if (userEnteredPassword === "")
        {
            if (resultDisplayElement)
            {
                resultDisplayElement.textContent = "パスワードを入力してください。";
                resultDisplayElement.className = 'wait-gate-result result-empty';
            }
            return;
        }

        // 修正点: ユーザーの入力にプレフィックスを付けてからエンコード
        const prefixedPassword = currentMagicPrefix + userEnteredPassword;
        let encodedUserPassword = '';
        try
        {
            encodedUserPassword = btoa(unescape(encodeURIComponent(prefixedPassword)));
        }
        catch(e)
        {
            console.error("Base64エンコードに失敗:", userEnteredPassword, e);
        }

        const correctEncodedPasswords = encodedPasswordsStr.split(',').map(pass => pass.trim());

        if (correctEncodedPasswords.includes(encodedUserPassword))
        {
            conditionMet = true;
        }
        else
        {
            if (resultDisplayElement)
            {
                resultDisplayElement.textContent = "パスワードが違います。";
                resultDisplayElement.className = 'wait-gate-result result-incorrect';
            }
        }
    }

    if (conditionMet)
    {
        if (resultDisplayElement)
        {
            resultDisplayElement.textContent = "解除されました。";
            resultDisplayElement.className = 'wait-gate-result result-correct';
        }
        
        buttonElement.disabled = true;
        const inputElement = document.getElementById(`wait-input-${waitId}`);
        if (inputElement)
        {
            inputElement.disabled = true;
        }
        saveProgress();
        updateContentVisibility();
    }
}

function handleProblemInputEnter(event)
{
    if (event.key === 'Enter' || event.keyCode === 13)
        {
        event.preventDefault();
        const inputElement = event.target;
        const buttonElement = inputElement.nextElementSibling; // 「解除」ボタン
        if (buttonElement && buttonElement.tagName === 'BUTTON' && !buttonElement.disabled)
        {
            checkProblemAnswer(buttonElement);
        }
    }
}

function handleWaitInputEnter(event)
{
    if (event.key === 'Enter' || event.keyCode === 13)
    {
        event.preventDefault();
        const inputElement = event.target;
        const buttonElement = inputElement.nextElementSibling; // 「解除」ボタン
        if (buttonElement && buttonElement.tagName === 'BUTTON' && !buttonElement.disabled)
        {
            checkWaitCondition(buttonElement);
        }
    }
}
// 問題スキップ用関数
function skipProblem(buttonElement)
{   
    const currentCooldown = parseInt(buttonElement.dataset.cooldown, 10) || BASE_COOLDOWN_MS;
    const cooldownInSeconds = Math.floor(currentCooldown / 1000);
    
    const confMessage = () => {
        if(cooldownInSeconds < 1.0)
        {
            return `本当にこの問題をスキップしますか？`;
        }
        return `本当にこの問題をスキップしますか？\n（次にスキップ可能になるまで約${cooldownInSeconds}秒かかります）`;
    };
    if (!window.confirm(confMessage()))
    {
        return;
    }
    incrementSkipCount();

    const problemId = buttonElement.dataset.problemId;
    const userInputElement = document.getElementById(`problem-input-${problemId}`);
    const resultDisplayElement = document.getElementById(`problem-result-${problemId}`);
    const checkButton = document.querySelector(`button[data-problem-id="${problemId}"][onclick="checkProblemAnswer(this)"]`);

    if (!resultDisplayElement || !checkButton) { return; }

    const encodedAnswersString = checkButton.dataset.answers;
    if (encodedAnswersString)
    {
        const firstEncodedAnswer = encodedAnswersString.split(',')[0].trim();
        if (userInputElement)
        {
            try
            {
                const decodedWithPrefix = decodeURIComponent(escape(atob(firstEncodedAnswer)));
                if (decodedWithPrefix.startsWith(currentMagicPrefix))
                {
                    userInputElement.value = decodedWithPrefix.substring(currentMagicPrefix.length);
                }
                else
                {
                    userInputElement.value = decodedWithPrefix; // 古いデータ用のフォールバック
                }
            }
            catch (e)
            {
                console.error("Base64デコードに失敗:", firstEncodedAnswer, e);
                userInputElement.value = "答えの表示に失敗";
            }
        }
    }
    
    resultDisplayElement.textContent = "この問題はスキップしました。";
    resultDisplayElement.className = 'problem-result result-skipped'; 
    
    if (userInputElement) userInputElement.disabled = true;
    if (checkButton) checkButton.disabled = true;
    if (buttonElement) buttonElement.disabled = true;
    
    saveProgress();
    updateContentVisibility();
    
    const allSkipButtons = document.querySelectorAll('.skip-button');
    allSkipButtons.forEach(btn =>
    {
        btn.disabled = true;
    });

    setTimeout(() =>
    {
        document.querySelectorAll('.skip-button').forEach(btn =>
        {
            const pid = btn.dataset.problemId;
            const correspondingCheckButton = document.querySelector(`button[data-problem-id="${pid}"][onclick="checkProblemAnswer(this)"]`);
            
            if (correspondingCheckButton && !correspondingCheckButton.disabled)
            {
                btn.disabled = false;
            }
        });
        console.log(`スキップ機能のクールダウンが終了しました。`); 
    }, currentCooldown); 
}

// --- 回答判定関数 ---
function checkProblemAnswer(buttonElement)
{
    const problemId = buttonElement.dataset.problemId;
    const encodedAnswersString = buttonElement.dataset.answers;
    const userInputElement = document.getElementById(`problem-input-${problemId}`);
    const resultDisplayElement = document.getElementById(`problem-result-${problemId}`);
    if (!userInputElement || !resultDisplayElement) { return; }

    const skipButton = buttonElement.nextElementSibling;
    const userAnswer = userInputElement.value.trim();
    const prefixedUserAnswer = currentMagicPrefix + userAnswer;
    const correctEncodedAnswers = encodedAnswersString.split(',').map(ans => ans.trim());
    let encodedUserAnswer = '';
    if (userAnswer)
    {
        try
        {
            encodedUserAnswer = btoa(unescape(encodeURIComponent(prefixedUserAnswer)));
        }
        catch(e)
        {
            console.error("Base64エンコードに失敗:", userAnswer, e);
        }
    }
    
    resultDisplayElement.classList.remove('result-correct', 'result-incorrect', 'result-empty');

    if (userAnswer === "")
    {
        resultDisplayElement.textContent = "入力してください。";
        resultDisplayElement.classList.add('result-empty');
    }
    else if (correctEncodedAnswers.includes(encodedUserAnswer))
    {
        const wasAlreadySolved = buttonElement.disabled;
        resultDisplayElement.textContent = "正解！ 🎉";
        resultDisplayElement.classList.add('result-correct');
    
        if (!wasAlreadySolved)
        {
            incrementCorrectProblemsCount();
        }

        buttonElement.disabled = true;
        userInputElement.disabled = true;

        if (skipButton && skipButton.classList.contains('skip-button'))
        {
            skipButton.disabled = true;
        }
    }
    else
    {
        resultDisplayElement.textContent = "不正解です。";
        resultDisplayElement.classList.add('result-incorrect');
    }

    updateScoreDisplay();
    saveProgress();
    updateContentVisibility();
}


function initMathJax()
{
    const script = document.createElement('script');
    if (navigator.userAgent.includes("Chrome") || navigator.userAgent.includes("Firefox")) {
        script.src = "https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg.js";
    }
    else {
        script.src = "https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-chtml.js";
    }
    script.async = true;
    document.head.appendChild(script);
}


// =======================================================================
// 2. メイン処理 (ページの読み込み完了時に実行)
// =======================================================================
document.addEventListener('DOMContentLoaded', () =>
{
    const sourceElement = document.getElementById('raw-src');
    const outputElement = document.getElementById('output');
    
    if (!sourceElement)
    {
        console.error("Error : Source element with id 'raw-src' not found.");
        return;
    }
    if (!outputElement)
    {
        console.error("Error : Output element with id 'output' not found.");
        return;
    }
    
    // 1. parser.jsを呼び出して、HTMLと各種設定を取得
    const rawText = sourceElement.textContent;
    const result = parseMarkdownToHTML(rawText);
    
    // 2. parserから返された設定値でグローバル変数を更新
    gateVisibilityModes = result.visibilityModes;
    currentMagicPrefix = result.initialPrefix;
    setTotalProblemsCount(result.totalProblems);
    
    // 3. HTMLをページに描画
    outputElement.innerHTML = result.html;
    
    // 3.5. DOM構造を再構築（問題セットのグループ化、今回は未使用だが将来のため残置）
    // (現在はフラットな構造なので、このステップは実質何もしない)
    
    // 4. 最終処理
    loadProgress();
    updateScoreDisplay();
    updateContentVisibility(); 
    
    // 5. イベントリスナー登録 & 外部ライブラリ実行
    const problemInputs = outputElement.querySelectorAll('.problem-interactive input[type="text"]');
    problemInputs.forEach(input => {
        input.addEventListener('keydown', handleProblemInputEnter);
    });
    
    const waitInputs = outputElement.querySelectorAll('.wait-gate-interactive input[type="text"]');
    waitInputs.forEach(input => {
        input.addEventListener('keydown', handleWaitInputEnter);
    });
    
    const scoreCounterElement = document.getElementById('score-counter');
    if (scoreCounterElement) {
        scoreCounterElement.addEventListener('click', handleScoreAreaClick);
        if (DEBUG_MODE) console.log("OK: スコア一覧(#score-counter)にクリックイベントリスナーを登録しました。");
    }
    else
    {
        if (DEBUG_MODE) console.error("エラー: スコア一覧のHTML要素(#score-counter)が見つかりません。");
    }
    
    window.MathJax = {
        tex: {
            inlineMath: INLINE_MATH_MARKER,
            displayMath: DISPLAY_MATH_MARKER
        },
        svg: {
            fontCache: 'global'
        }
    };
    
    // --- ステップ6: MathJax と Prism の実行 ---
    // MathJaxの準備が完了するのを待つためのPromise
    initMathJax();

    if (window.MathJax && window.MathJax.startup)
    {
        window.MathJax.startup.promise
            .then(() =>
            {
                console.log("MathJax is ready. Typesetting math...");
                // MathJaxの準備ができたので、数式をレンダリングする
                return window.MathJax.typesetPromise([outputElement]);
            })
            .then(() =>
            {
                console.log("MathJax finished. Highlighting code with Prism...");
                // MathJaxの処理が終わった後にPrismを実行する
                if (typeof window.Prism !== 'undefined')
                {
                    window.Prism.highlightAllUnder(outputElement);
                }
            })
            .catch((err) =>
            {
                console.error("An error occurred during MathJax typesetting or Prism highlighting:", err);
            });
    }
    else
    {
        // MathJaxがない場合は直接Prismを実行
        console.log("MathJax library not found. Running Prism directly.");
        if (typeof window.Prism !== 'undefined')
        {
            window.Prism.highlightAllUnder(outputElement);
        }
    }
});
